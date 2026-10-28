package adminusers

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAdministratorPasswordResetRevokesEverySession(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	userID := uuid.NewString()
	var accountID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'reset-user','old-hash') RETURNING public_id`, userID, "reset-"+uuid.NewString()+"@example.com").Scan(&accountID); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) }()
	for _, sessionID := range []string{uuid.NewString(), uuid.NewString()} {
		if _, err := pool.Exec(ctx, `INSERT INTO user_sessions(id,user_id,expires_at)VALUES($1,$2,$3)`, sessionID, userID, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
	}
	if err := NewPostgresRepository(pool).UpdatePassword(ctx, accountID, "new-hash"); err != nil {
		t.Fatal(err)
	}
	var active int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL`, userID).Scan(&active); err != nil || active != 0 {
		t.Fatalf("all sessions must be revoked, active=%d err=%v", active, err)
	}
}
