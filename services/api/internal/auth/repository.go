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
	UpdateProfile(context.Context, string, string) (User, error)
	UpdateAvatar(context.Context, string, string, string) (User, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Create(ctx context.Context, email, username, passwordHash string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO users (email, username, password_hash, points_balance)
		VALUES ($1, $2, $3, (SELECT initial_points FROM points_settings WHERE id = 1))
		RETURNING id::text, email, username, role, status, points_balance, created_at, avatar_storage_key, avatar_mime_type, avatar_updated_at
	`, email, username, passwordHash)

	var user User
	if err := scanUser(row, &user); err != nil {
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
		SELECT id::text, email, username, role, status, points_balance, created_at, avatar_storage_key, avatar_mime_type, avatar_updated_at, password_hash
		FROM users
		WHERE lower(email) = lower($1)
		LIMIT 1
	`, email)

	var record userRecord
	if err := row.Scan(&record.ID, &record.Email, &record.Username, &record.Role, &record.Status, &record.PointsBalance, &record.CreatedAt, &record.avatarStorageKey, &record.avatarMimeType, &record.avatarUpdatedAt, &record.PasswordHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return userRecord{}, ErrUserMissing
		}
		return userRecord{}, err
	}
	return record, nil
}

func (repository *PostgresRepository) FindByID(ctx context.Context, id string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, email, username, role, status, points_balance, created_at, avatar_storage_key, avatar_mime_type, avatar_updated_at
		FROM users
		WHERE id = $1
		LIMIT 1
	`, id)

	var user User
	if err := scanUser(row, &user); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUserMissing
		}
		return User{}, err
	}
	return user, nil
}

func (repository *PostgresRepository) UpdateProfile(ctx context.Context, id, username string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE users SET username=$2,updated_at=now() WHERE id=$1
		RETURNING id::text,email,username,role,status,points_balance,created_at,avatar_storage_key,avatar_mime_type,avatar_updated_at
	`, id, username)
	var user User
	if err := scanUser(row, &user); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUserMissing
		}
		return User{}, err
	}
	return user, nil
}

func (repository *PostgresRepository) UpdateAvatar(ctx context.Context, id, storageKey, mimeType string) (User, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE users SET avatar_storage_key=$2,avatar_mime_type=$3,avatar_updated_at=CASE WHEN $2='' THEN NULL ELSE now() END,updated_at=now() WHERE id=$1
		RETURNING id::text,email,username,role,status,points_balance,created_at,avatar_storage_key,avatar_mime_type,avatar_updated_at
	`, id, storageKey, mimeType)
	var user User
	if err := scanUser(row, &user); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUserMissing
		}
		return User{}, err
	}
	return user, nil
}

func scanUser(row interface{ Scan(...interface{}) error }, user *User) error {
	return row.Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.Status, &user.PointsBalance, &user.CreatedAt, &user.avatarStorageKey, &user.avatarMimeType, &user.avatarUpdatedAt)
}
