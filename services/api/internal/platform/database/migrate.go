package database

import (
	"context"
	_ "embed"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/000001_init.up.sql
var initialSchema string

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if err := pool.Ping(ctx); err != nil {
		return err
	}
	_, err := pool.Exec(ctx, initialSchema)
	return err
}
