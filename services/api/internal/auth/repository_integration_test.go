package auth

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
