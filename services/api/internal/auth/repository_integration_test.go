package auth

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSecurityRepositoryRoundTrip(t *testing.T) {
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
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'security-user','old-hash')`, userID, "security-"+uuid.NewString()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) }()
	repository := NewPostgresRepository(pool)
	firstSessionID, secondSessionID := uuid.NewString(), uuid.NewString()
	expiresAt := time.Now().Add(time.Hour)
	if err := repository.CreateSession(ctx, firstSessionID, userID, ClientInfo{UserAgent: "first", IPAddress: "127.0.0.1"}, expiresAt); err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateSession(ctx, secondSessionID, userID, ClientInfo{UserAgent: "second", IPAddress: "127.0.0.2"}, expiresAt); err != nil {
		t.Fatal(err)
	}
	sessions, err := repository.ListSessions(ctx, userID)
	if err != nil || len(sessions) != 2 {
		t.Fatalf("list sessions: %#v err=%v", sessions, err)
	}
	if err := repository.ChangePassword(ctx, userID, "new-hash", firstSessionID); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if _, err := repository.FindSession(ctx, userID, secondSessionID); err != ErrInvalidSession {
		t.Fatalf("other session must be revoked: %v", err)
	}
	if _, err := repository.FindSession(ctx, userID, firstSessionID); err != nil {
		t.Fatalf("current session must remain active: %v", err)
	}
	record, err := repository.FindRecordByID(ctx, userID)
	if err != nil || record.PasswordHash != "new-hash" {
		t.Fatalf("password hash round trip: %#v err=%v", record, err)
	}
	request, err := repository.RequestAccountDeletion(ctx, userID)
	if err != nil || request.Status != "pending" {
		t.Fatalf("request deletion: %#v err=%v", request, err)
	}
	repeated, err := repository.RequestAccountDeletion(ctx, userID)
	if err != nil || repeated.ID != request.ID {
		t.Fatalf("pending deletion request must be idempotent: %#v err=%v", repeated, err)
	}
	if err := repository.CancelAccountDeletion(ctx, userID); err != nil {
		t.Fatalf("cancel deletion: %v", err)
	}
	if pending, err := repository.GetAccountDeletionRequest(ctx, userID); err != nil || pending != nil {
		t.Fatalf("cancelled request must not remain pending: %#v err=%v", pending, err)
	}
}

func TestProfileAndAvatarMetadataRoundTrip(t *testing.T) {
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
	email := "profile-" + uuid.NewString() + "@example.com"
	if _, err := pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'旧昵称','x')`, userID, email); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) }()
	repository := NewPostgresRepository(pool)
	updated, err := repository.UpdateProfile(ctx, userID, "新昵称")
	if err != nil || updated.Username != "新昵称" {
		t.Fatalf("profile update: %#v err=%v", updated, err)
	}
	updated, err = repository.UpdateAvatar(ctx, userID, "avatar-test.webp", "image/webp")
	if err != nil || updated.avatarStorageKey != "avatar-test.webp" || updated.avatarMimeType != "image/webp" || updated.avatarUpdatedAt == nil {
		t.Fatalf("avatar update: %#v err=%v", updated, err)
	}
	loaded, err := repository.FindByID(ctx, userID)
	if err != nil || loaded.Username != "新昵称" || loaded.avatarStorageKey != "avatar-test.webp" {
		t.Fatalf("profile round trip: %#v err=%v", loaded, err)
	}
}
