package auth

import (
	"context"
	"errors"
	"testing"
	"time"
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
