package migrations_test

import (
	"context"
	"io/fs"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nicofx/real-clinic/backend/internal/audit"
	"github.com/nicofx/real-clinic/backend/internal/bootstrap"
	"github.com/nicofx/real-clinic/backend/internal/iam"
	"github.com/nicofx/real-clinic/backend/migrations"
)

func isolatedDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a PostgreSQL service with CREATEDB to run integration tests")
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal("invalid TEST_DATABASE_URL")
	}
	admin, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := "real_clinic_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, "DROP DATABASE "+quoted+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
	})
	cfg = cfg.Copy()
	cfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func migrationSource(t *testing.T) fstest.MapFS {
	t.Helper()
	source := fstest.MapFS{}
	names, err := fs.Glob(migrations.Files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		body, err := migrations.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		source[name] = &fstest.MapFile{Data: body}
	}
	return source
}

func TestMigrateSeedAndSessions(t *testing.T) {
	pool := isolatedDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := migrations.Migrate(ctx, pool); err != nil {
				t.Error(err)
			}
		}()
	}
	wait.Wait()
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := bootstrap.Seed(ctx, pool, "Synthetic-Test-Password!"); err != nil {
				t.Error(err)
			}
		}()
	}
	wait.Wait()
	if t.Failed() {
		return
	}
	var users, dokter, pasien int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM users WHERE company_id=$1), (SELECT count(*) FROM dokter WHERE company_id=$1),
		(SELECT count(*) FROM pasien WHERE company_id=$1)`, bootstrap.CompanyID).Scan(&users, &dokter, &pasien); err != nil {
		t.Fatal(err)
	}
	if users != len(bootstrap.DemoAccounts) || dokter != 2 || pasien != 3 {
		t.Fatalf("unexpected seed counts: users=%d dokter=%d pasien=%d", users, dokter, pasien)
	}
	if err := bootstrap.Seed(ctx, pool, "Different-Test-Password!"); err != nil {
		t.Fatal(err)
	}
	service := iam.NewService(pool, audit.NewService(pool), 30*time.Minute)
	if _, err := service.Authenticate(ctx, "apotek@demo.local", "Synthetic-Test-Password!"); err != nil {
		t.Fatal("seed restart reset an existing password")
	}
	admin, err := service.Authenticate(ctx, strings.ToUpper(bootstrap.SuperadminEmail), "Synthetic-Test-Password!")
	if err != nil {
		t.Fatalf("superadmin cannot login: %v", err)
	}
	if !admin.IsSuperadmin || admin.CompanyID != "" || len(admin.Roles) != 0 {
		t.Fatal("superadmin must start without a company")
	}
	if err = service.SelectCompany(ctx, admin, bootstrap.CompanyID); err != nil {
		t.Fatal(err)
	}
	selected, err := service.GetSession(ctx, admin.ID)
	if err != nil || selected.CompanyID != bootstrap.CompanyID || selected.BranchID != bootstrap.BranchID || len(selected.Roles) != len(iam.ValidRoles) {
		t.Fatalf("company selection failed: %v", err)
	}
	for _, acc := range bootstrap.DemoAccounts {
		session, err := service.Authenticate(ctx, acc.Email, "Synthetic-Test-Password!")
		if err != nil {
			t.Fatalf("%s cannot login: %v", acc.Email, err)
		}
		if len(session.Roles) != 1 || session.Roles[0] != acc.Role {
			t.Fatalf("%s has unexpected grants %v", acc.Email, session.Roles)
		}
	}
	session, err := service.Authenticate(ctx, "apotek@demo.local", "Synthetic-Test-Password!")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE user_roles SET valid_until=now() WHERE user_id=$1`, session.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.GetSession(ctx, session.ID); err == nil {
		t.Fatal("revoked role still has access")
	}
}

func TestMigrationChecksumAndRollback(t *testing.T) {
	pool := isolatedDatabase(t)
	ctx := context.Background()
	source := migrationSource(t)
	if err := migrations.Apply(ctx, pool, source); err != nil {
		t.Fatal(err)
	}
	source["900_test_column.sql"] = &fstest.MapFile{Data: []byte(`ALTER TABLE users ADD COLUMN test_column TEXT;`)}
	if err := migrations.Apply(ctx, pool, source); err != nil {
		t.Fatal(err)
	}
	source["998_rollback.sql"] = &fstest.MapFile{Data: []byte(`CREATE TABLE public.rollback_probe (id INT);`)}
	source["999_failure.sql"] = &fstest.MapFile{Data: []byte(`SELECT definitely_missing_function();`)}
	if err := migrations.Apply(ctx, pool, source); err == nil {
		t.Fatal("invalid migration succeeded")
	}
	var absent bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.rollback_probe') IS NULL`).Scan(&absent); err != nil || !absent {
		t.Fatalf("failed migration did not roll back: %v", err)
	}
	delete(source, "998_rollback.sql")
	delete(source, "999_failure.sql")
	source["001_init.sql"].Data = append(source["001_init.sql"].Data, []byte("\n-- changed")...)
	if err := migrations.Apply(ctx, pool, source); err == nil || !strings.Contains(err.Error(), "changed after") {
		t.Fatalf("checksum change not rejected: %v", err)
	}
}
