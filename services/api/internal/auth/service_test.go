package auth

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"nova-creator-platform/services/api/internal/assets"
)

type memoryRepository struct {
	users map[string]userRecord
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{users: map[string]userRecord{}}
}

func (repository *memoryRepository) Create(_ context.Context, email, username, passwordHash string) (User, error) {
	if _, exists := repository.users[email]; exists {
		return User{}, ErrEmailTaken
	}
	user := User{ID: "user-1", Email: email, Username: username, Role: "user", Status: "active", CreatedAt: time.Now()}
	repository.users[email] = userRecord{User: user, PasswordHash: passwordHash}
	return user, nil
}

func (repository *memoryRepository) FindByEmail(_ context.Context, email string) (userRecord, error) {
	record, exists := repository.users[email]
	if !exists {
		return userRecord{}, ErrUserMissing
	}
	return record, nil
}

func (repository *memoryRepository) FindByID(_ context.Context, id string) (User, error) {
	for _, record := range repository.users {
		if record.ID == id {
			return record.User, nil
		}
	}
	return User{}, ErrUserMissing
}

func (repository *memoryRepository) UpdateProfile(_ context.Context, id, username string) (User, error) {
	for email, record := range repository.users {
		if record.ID == id {
			record.Username = username
			repository.users[email] = record
			return record.User, nil
		}
	}
	return User{}, ErrUserMissing
}

func (repository *memoryRepository) UpdateAvatar(_ context.Context, id, storageKey, mimeType string) (User, error) {
	for email, record := range repository.users {
		if record.ID == id {
			record.avatarStorageKey = storageKey
			record.avatarMimeType = mimeType
			repository.users[email] = record
			return record.User, nil
		}
	}
	return User{}, ErrUserMissing
}

func TestRegisterLoginAndCurrentUser(t *testing.T) {
	repository := newMemoryRepository()
	service := NewService(repository, NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour))

	registered, err := service.Register(context.Background(), RegisterInput{Email: " Creator@Example.com ", Username: "创作者", Password: "password123"})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if registered.User.Email != "creator@example.com" || registered.AccessToken == "" {
		t.Fatalf("unexpected registration result: %#v", registered)
	}

	if _, err := service.Register(context.Background(), RegisterInput{Email: "creator@example.com", Username: "另一位用户", Password: "password123"}); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("expected duplicate email error, got %v", err)
	}

	loggedIn, err := service.Login(context.Background(), LoginInput{Email: "creator@example.com", Password: "password123"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	current, err := service.CurrentUser(context.Background(), loggedIn.AccessToken)
	if err != nil {
		t.Fatalf("current user: %v", err)
	}
	if current.ID != registered.User.ID {
		t.Fatalf("expected user %q, got %q", registered.User.ID, current.ID)
	}
}

func TestRejectsInvalidRegistrationAndCredentials(t *testing.T) {
	service := NewService(newMemoryRepository(), NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour))

	if _, err := service.Register(context.Background(), RegisterInput{Email: "invalid", Username: "a", Password: "short"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid input error, got %v", err)
	}
	if _, err := service.Login(context.Background(), LoginInput{Email: "missing@example.com", Password: "password123"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected invalid credentials error, got %v", err)
	}
}

func TestRejectsTamperedToken(t *testing.T) {
	manager := NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour)
	service := NewService(newMemoryRepository(), manager)

	if _, err := service.CurrentUser(context.Background(), "not-a-token"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected invalid token error, got %v", err)
	}
}

func TestUpdateProfileValidatesAndPersistsUsername(t *testing.T) {
	repository := newMemoryRepository()
	repository.users["creator@example.com"] = userRecord{User: User{ID: "user-1", Email: "creator@example.com", Username: "旧昵称", Role: "user", Status: "active"}}
	service := NewService(repository, NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour))
	updated, err := service.UpdateProfile(context.Background(), "user-1", ProfileInput{Username: " 新昵称 "})
	if err != nil || updated.Username != "新昵称" {
		t.Fatalf("update profile: %#v err=%v", updated, err)
	}
	if _, err := service.UpdateProfile(context.Background(), "user-1", ProfileInput{Username: "a"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid profile input, got %v", err)
	}
}

func TestAvatarLifecycleUsesLocalStorage(t *testing.T) {
	repository := newMemoryRepository()
	repository.users["creator@example.com"] = userRecord{User: User{ID: "user-1", Email: "creator@example.com", Username: "创作者", Role: "user", Status: "active", CreatedAt: time.Now()}}
	storage, err := assets.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(repository, NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour), storage)
	updated, err := service.UpdateAvatar(context.Background(), "user-1", "image/png", bytes.NewReader([]byte("avatar-content")))
	if err != nil || updated.AvatarURL == "" {
		t.Fatalf("update avatar: %#v err=%v", updated, err)
	}
	avatar, err := service.OpenAvatar(context.Background(), "user-1")
	if err != nil {
		t.Fatal(err)
	}
	content, readErr := io.ReadAll(avatar.Content)
	_ = avatar.Content.Close()
	if readErr != nil || string(content) != "avatar-content" || avatar.ContentType != "image/png" {
		t.Fatalf("open avatar: content=%q type=%q err=%v", content, avatar.ContentType, readErr)
	}
	removed, err := service.RemoveAvatar(context.Background(), "user-1")
	if err != nil || removed.AvatarURL != "" {
		t.Fatalf("remove avatar: %#v err=%v", removed, err)
	}
	if _, err := service.OpenAvatar(context.Background(), "user-1"); !errors.Is(err, ErrAvatarMissing) {
		t.Fatalf("expected missing avatar, got %v", err)
	}
}
