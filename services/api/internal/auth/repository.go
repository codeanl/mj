package auth

import (
	"context"
	"errors"
	"time"

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
	FindRecordByID(context.Context, string) (userRecord, error)
	UpdateProfile(context.Context, string, string) (User, error)
	UpdateAvatar(context.Context, string, string, string) (User, error)
	CreateSession(context.Context, string, string, ClientInfo, time.Time) error
	FindSession(context.Context, string, string) (Session, error)
	ListSessions(context.Context, string) ([]Session, error)
	RevokeSession(context.Context, string, string) error
	RevokeOtherSessions(context.Context, string, string) error
	ChangePassword(context.Context, string, string, string) error
	RequestAccountDeletion(context.Context, string) (AccountDeletionRequest, error)
	GetAccountDeletionRequest(context.Context, string) (*AccountDeletionRequest, error)
	CancelAccountDeletion(context.Context, string) error
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

func (repository *PostgresRepository) FindRecordByID(ctx context.Context, id string) (userRecord, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text,email,username,role,status,points_balance,created_at,avatar_storage_key,avatar_mime_type,avatar_updated_at,password_hash
		FROM users WHERE id=$1 LIMIT 1
	`, id)
	var record userRecord
	if err := row.Scan(&record.ID, &record.Email, &record.Username, &record.Role, &record.Status, &record.PointsBalance, &record.CreatedAt, &record.avatarStorageKey, &record.avatarMimeType, &record.avatarUpdatedAt, &record.PasswordHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return userRecord{}, ErrUserMissing
		}
		return userRecord{}, err
	}
	return record, nil
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

func (repository *PostgresRepository) CreateSession(ctx context.Context, id, userID string, client ClientInfo, expiresAt time.Time) error {
	_, err := repository.pool.Exec(ctx, `INSERT INTO user_sessions(id,user_id,user_agent,ip_address,expires_at)VALUES($1,$2,$3,$4,$5)`, id, userID, client.UserAgent, client.IPAddress, expiresAt)
	return err
}

func (repository *PostgresRepository) FindSession(ctx context.Context, userID, id string) (Session, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE user_sessions SET last_seen_at=now()
		WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()
		RETURNING id::text,user_agent,ip_address,expires_at,last_seen_at,created_at
	`, id, userID)
	var session Session
	if err := row.Scan(&session.ID, &session.UserAgent, &session.IPAddress, &session.ExpiresAt, &session.LastSeenAt, &session.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrInvalidSession
		}
		return Session{}, err
	}
	return session, nil
}

func (repository *PostgresRepository) ListSessions(ctx context.Context, userID string) ([]Session, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text,user_agent,ip_address,expires_at,last_seen_at,created_at
		FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()
		ORDER BY last_seen_at DESC,id DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := make([]Session, 0)
	for rows.Next() {
		var session Session
		if err := rows.Scan(&session.ID, &session.UserAgent, &session.IPAddress, &session.ExpiresAt, &session.LastSeenAt, &session.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (repository *PostgresRepository) RevokeSession(ctx context.Context, userID, id string) error {
	result, err := repository.pool.Exec(ctx, `UPDATE user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`, id, userID)
	if err == nil && result.RowsAffected() == 0 {
		return ErrInvalidSession
	}
	return err
}

func (repository *PostgresRepository) RevokeOtherSessions(ctx context.Context, userID, currentID string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, userID, currentID)
	return err
}

func (repository *PostgresRepository) ChangePassword(ctx context.Context, userID, passwordHash, currentSessionID string) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	result, err := tx.Exec(ctx, `UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1`, userID, passwordHash)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrUserMissing
	}
	if _, err = tx.Exec(ctx, `UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, userID, currentSessionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) RequestAccountDeletion(ctx context.Context, userID string) (AccountDeletionRequest, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO account_deletion_requests(user_id,status)
		VALUES($1,'pending')
		ON CONFLICT (user_id) WHERE status='pending' DO UPDATE SET requested_at=account_deletion_requests.requested_at
		RETURNING id::text,status,requested_at,cancelled_at
	`, userID)
	var request AccountDeletionRequest
	err := row.Scan(&request.ID, &request.Status, &request.RequestedAt, &request.CancelledAt)
	return request, err
}

func (repository *PostgresRepository) GetAccountDeletionRequest(ctx context.Context, userID string) (*AccountDeletionRequest, error) {
	row := repository.pool.QueryRow(ctx, `SELECT id::text,status,requested_at,cancelled_at FROM account_deletion_requests WHERE user_id=$1 AND status='pending' ORDER BY requested_at DESC LIMIT 1`, userID)
	var request AccountDeletionRequest
	if err := row.Scan(&request.ID, &request.Status, &request.RequestedAt, &request.CancelledAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &request, nil
}

func (repository *PostgresRepository) CancelAccountDeletion(ctx context.Context, userID string) error {
	result, err := repository.pool.Exec(ctx, `UPDATE account_deletion_requests SET status='cancelled',cancelled_at=now() WHERE user_id=$1 AND status='pending'`, userID)
	if err == nil && result.RowsAffected() == 0 {
		return ErrDeletionRequestMissing
	}
	return err
}

func scanUser(row interface{ Scan(...interface{}) error }, user *User) error {
	return row.Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.Status, &user.PointsBalance, &user.CreatedAt, &user.avatarStorageKey, &user.avatarMimeType, &user.avatarUpdatedAt)
}
