package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var Files embed.FS

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	return Apply(ctx, pool, Files)
}

func Apply(ctx context.Context, pool *pgxpool.Pool, source fs.FS) error {
	entries, err := fs.ReadDir(source, ".")
	if err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	// Keep the lock and migration history in the same transaction as the DDL.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(726341001)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS public.schema_migrations (
		name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		body, err := fs.ReadFile(source, entry.Name())
		if err != nil {
			return err
		}
		sum := sha256.Sum256(body)
		checksum := hex.EncodeToString(sum[:])
		var applied string
		err = tx.QueryRow(ctx, `SELECT checksum FROM public.schema_migrations WHERE name=$1`, entry.Name()).Scan(&applied)
		if err == nil {
			if applied != checksum {
				return fmt.Errorf("migration %s changed after it was applied; add a new migration instead", entry.Name())
			}
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if _, err = tx.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO public.schema_migrations (name, checksum) VALUES ($1,$2)`, entry.Name(), checksum); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
