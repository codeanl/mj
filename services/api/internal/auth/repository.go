package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrEmailTaken  = errors.New("email is already registered")
	ErrUserMissing = errors.New("user does not exist")
)

type Repository interface {
	Create(context.Context, string, string, string) (User, error)
	FindByEmail(context.Context, string) (userRecord, error)
	FindByID(context.Context, string) (User, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Create(ctx context.Context, email, username, passwordHash string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO users (email, username, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id::text, email, username, role, status, created_at
	`, email, username, passwordHash)

	var user User
	if err := row.Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.Status, &user.CreatedAt); err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	return user, nil
}

func (repository *PostgresRepository) FindByEmail(ctx context.Context, email string) (userRecord, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, email, username, role, status, created_at, password_hash
		FROM users
		WHERE lower(email) = lower($1)
		LIMIT 1
	`, email)

	var record userRecord
	if err := row.Scan(&record.ID, &record.Email, &record.Username, &record.Role, &record.Status, &record.CreatedAt, &record.PasswordHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return userRecord{}, ErrUserMissing
		}
		return userRecord{}, err
	}
	return record, nil
}

func (repository *PostgresRepository) FindByID(ctx context.Context, id string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, email, username, role, status, created_at
		FROM users
		WHERE id = $1
		LIMIT 1
	`, id)

	var user User
	if err := row.Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.Status, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUserMissing
		}
		return User{}, err
	}
	return user, nil
}
