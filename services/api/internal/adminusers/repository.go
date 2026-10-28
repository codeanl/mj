package adminusers

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUserNotFound  = errors.New("admin user not found")
	ErrEmailConflict = errors.New("admin user email already exists")
)

type Repository interface {
	List(context.Context, ListInput) (Page, error)
	FindByAccountID(context.Context, int64) (User, error)
	Create(context.Context, string, string, string, string, string) (User, error)
	Update(context.Context, int64, string, string, string, string) (User, error)
	UpdatePassword(context.Context, int64, string) error
	CountActiveAdmins(context.Context) (int64, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) List(ctx context.Context, input ListInput) (Page, error) {
	offset := (input.Page - 1) * input.PageSize
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, public_id, email, username, role, status, points_balance, created_at, updated_at, count(*) OVER()
		FROM users
		WHERE (($2::bigint IS NOT NULL AND public_id = $2::bigint)
		       OR ($2::bigint IS NULL AND ($1 = '' OR email ILIKE '%' || $1 || '%' OR username ILIKE '%' || $1 || '%')))
		  AND ($3 = '' OR role = $3)
		  AND ($4 = '' OR status = $4)
		ORDER BY created_at DESC, public_id DESC
		LIMIT $5 OFFSET $6
	`, input.Search, input.AccountID, input.Role, input.Status, input.PageSize, offset)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	items := make([]User, 0, input.PageSize)
	var total int64
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.internalID, &user.AccountID, &user.Email, &user.Username, &user.Role, &user.Status, &user.PointsBalance, &user.CreatedAt, &user.UpdatedAt, &total); err != nil {
			return Page{}, err
		}
		items = append(items, user)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	var summary Summary
	if err := repository.pool.QueryRow(ctx, `
		SELECT count(*), count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE role = 'admin'), count(*) FILTER (WHERE status = 'disabled'), coalesce(sum(points_balance), 0)
		FROM users
	`).Scan(&summary.Total, &summary.Active, &summary.Admins, &summary.Disabled, &summary.TotalPoints); err != nil {
		return Page{}, err
	}
	return Page{Items: items, Total: total, Page: input.Page, PageSize: input.PageSize, Summary: summary}, nil
}

func (repository *PostgresRepository) FindByAccountID(ctx context.Context, accountID int64) (User, error) {
	return scanUser(repository.pool.QueryRow(ctx, `
		SELECT id::text, public_id, email, username, role, status, points_balance, created_at, updated_at
		FROM users WHERE public_id = $1
	`, accountID))
}

func (repository *PostgresRepository) Create(ctx context.Context, email, username, passwordHash, role, status string) (User, error) {
	user, err := scanUser(repository.pool.QueryRow(ctx, `
		INSERT INTO users (email, username, password_hash, role, status, points_balance)
		VALUES ($1, $2, $3, $4, $5, (SELECT initial_points FROM points_settings WHERE id = 1))
		RETURNING id::text, public_id, email, username, role, status, points_balance, created_at, updated_at
	`, email, username, passwordHash, role, status))
	return user, databaseError(err)
}

func (repository *PostgresRepository) Update(ctx context.Context, accountID int64, email, username, role, status string) (User, error) {
	user, err := scanUser(repository.pool.QueryRow(ctx, `
		UPDATE users SET email = $2, username = $3, role = $4, status = $5, updated_at = now()
		WHERE public_id = $1
		RETURNING id::text, public_id, email, username, role, status, points_balance, created_at, updated_at
	`, accountID, email, username, role, status))
	return user, databaseError(err)
}

func (repository *PostgresRepository) UpdatePassword(ctx context.Context, accountID int64, passwordHash string) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID string
	if err := tx.QueryRow(ctx, `
		UPDATE users SET password_hash = $2, updated_at = now()
		WHERE public_id = $1
		RETURNING id::text
	`, accountID, passwordHash).Scan(&userID); errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	} else if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) CountActiveAdmins(ctx context.Context) (int64, error) {
	var count int64
	err := repository.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'`).Scan(&count)
	return count, err
}

type rowScanner interface {
	Scan(...interface{}) error
}

func scanUser(row rowScanner) (User, error) {
	var user User
	err := row.Scan(&user.internalID, &user.AccountID, &user.Email, &user.Username, &user.Role, &user.Status, &user.PointsBalance, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	return user, err
}

func databaseError(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" {
		return ErrEmailConflict
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	}
	return err
}
