package platform

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewDBPool(cfg *Config) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.DBURL())
	if err != nil {
		return nil, fmt.Errorf("invalid database configuration; check DATABASE_URL or DB_* settings")
	}
	// CURRENT_DATE / ::date must follow clinic wall-clock time regardless of the DB server's zone.
	poolConfig.ConnConfig.RuntimeParams["timezone"] = "Asia/Jakarta"
	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return nil, fmt.Errorf("unable to create pool: %w", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("unable to ping db: %w", err)
	}
	return pool, nil
}
