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
	users     map[string]userRecord
	sessions  map[string]Session
	deletions map[string]AccountDeletionRequest
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{users: map[string]userRecord{}, sessions: map[string]Session{}, deletions: map[string]AccountDeletionRequest{}}
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

func (repository *memoryRepository) FindRecordByID(_ context.Context, id string) (userRecord, error) {
	for _, record := range repository.users {
		if record.ID == id {
			return record, nil
		}
	}
	return userRecord{}, ErrUserMissing
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

func (repository *memoryRepository) CreateSession(_ context.Context, id, userID string, client ClientInfo, expiresAt time.Time) error {
	repository.sessions[id] = Session{ID: id, UserAgent: client.UserAgent, IPAddress: client.IPAddress, ExpiresAt: expiresAt, LastSeenAt: time.Now(), CreatedAt: time.Now()}
	return nil
}

func (repository *memoryRepository) FindSession(_ context.Context, _ string, id string) (Session, error) {
	session, exists := repository.sessions[id]
	if !exists {
		return Session{}, ErrInvalidSession
	}
	return session, nil
}

func (repository *memoryRepository) ListSessions(_ context.Context, _ string) ([]Session, error) {
	sessions := make([]Session, 0, len(repository.sessions))
	for _, session := range repository.sessions {
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func (repository *memoryRepository) RevokeSession(_ context.Context, _ string, id string) error {
	if _, exists := repository.sessions[id]; !exists {
		return ErrInvalidSession
	}
	delete(repository.sessions, id)
	return nil
}

func (repository *memoryRepository) RevokeOtherSessions(_ context.Context, _ string, currentID string) error {
	for id := range repository.sessions {
		if id != currentID {
			delete(repository.sessions, id)
		}
	}
	return nil
}

func (repository *memoryRepository) ChangePassword(_ context.Context, userID, passwordHash, currentSessionID string) error {
	for email, record := range repository.users {
		if record.ID == userID {
			record.PasswordHash = passwordHash
			repository.users[email] = record
			return repository.RevokeOtherSessions(context.Background(), userID, currentSessionID)
		}
	}
	return ErrUserMissing
}

func (repository *memoryRepository) RequestAccountDeletion(_ context.Context, userID string) (AccountDeletionRequest, error) {
	if request, exists := repository.deletions[userID]; exists {
		return request, nil
	}
	request := AccountDeletionRequest{ID: "deletion-1", Status: "pending", RequestedAt: time.Now()}
	repository.deletions[userID] = request
	return request, nil
}

func (repository *memoryRepository) GetAccountDeletionRequest(_ context.Context, userID string) (*AccountDeletionRequest, error) {
	request, exists := repository.deletions[userID]
	if !exists {
		return nil, nil
	}
	return &request, nil
}

func (repository *memoryRepository) CancelAccountDeletion(_ context.Context, userID string) error {
	if _, exists := repository.deletions[userID]; !exists {
		return ErrDeletionRequestMissing
	}
	delete(repository.deletions, userID)
	return nil
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

func TestSessionAndPasswordSecurityLifecycle(t *testing.T) {
	repository := newMemoryRepository()
	manager := NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour)
	service := NewService(repository, manager)
	registered, err := service.Register(context.Background(), RegisterInput{Email: "security@example.com", Username: "安全用户", Password: "password123"}, ClientInfo{UserAgent: "first-device", IPAddress: "127.0.0.1"})
	if err != nil {
		t.Fatal(err)
	}
	firstClaims, err := manager.Parse(registered.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Login(context.Background(), LoginInput{Email: "security@example.com", Password: "password123"}, ClientInfo{UserAgent: "second-device", IPAddress: "127.0.0.2"})
	if err != nil {
		t.Fatal(err)
	}
	secondClaims, err := manager.Parse(second.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	current := registered.User
	current.SessionID = firstClaims.SessionID
	sessions, err := service.ListSessions(context.Background(), current)
	if err != nil || len(sessions) != 2 {
		t.Fatalf("list sessions: %#v err=%v", sessions, err)
	}
	if err := service.RevokeSession(context.Background(), current, firstClaims.SessionID); !errors.Is(err, ErrCurrentSession) {
		t.Fatalf("current session must not be revoked by device management: %v", err)
	}
	if err := service.RevokeSession(context.Background(), current, secondClaims.SessionID); err != nil {
		t.Fatalf("revoke other session: %v", err)
	}
	if _, err := service.CurrentUser(context.Background(), second.AccessToken); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("revoked token must stop working immediately: %v", err)
	}

	third, err := service.Login(context.Background(), LoginInput{Email: "security@example.com", Password: "password123"})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ChangePassword(context.Background(), current, ChangePasswordInput{CurrentPassword: "wrong-password", NewPassword: "new-password123"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong current password must fail: %v", err)
	}
	if err := service.ChangePassword(context.Background(), current, ChangePasswordInput{CurrentPassword: "password123", NewPassword: "new-password123"}); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if _, err := service.Login(context.Background(), LoginInput{Email: "security@example.com", Password: "password123"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("old password must stop working: %v", err)
	}
	if _, err := service.CurrentUser(context.Background(), third.AccessToken); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("password change must revoke other sessions: %v", err)
	}
	if _, err := service.CurrentUser(context.Background(), registered.AccessToken); err != nil {
		t.Fatalf("password change must retain current session: %v", err)
	}
}

func TestAccountDeletionRequestLifecycle(t *testing.T) {
	repository := newMemoryRepository()
	service := NewService(repository, NewTokenManager("test-secret-with-enough-entropy", "test-issuer", time.Hour))
	result, err := service.Register(context.Background(), RegisterInput{Email: "delete@example.com", Username: "注销用户", Password: "password123"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.RequestAccountDeletion(context.Background(), result.User, RequestAccountDeletionInput{CurrentPassword: "wrong-password"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password must not create request: %v", err)
	}
	request, err := service.RequestAccountDeletion(context.Background(), result.User, RequestAccountDeletionInput{CurrentPassword: "password123"})
	if err != nil || request.Status != "pending" {
		t.Fatalf("request account deletion: %#v err=%v", request, err)
	}
	pending, err := service.GetAccountDeletionRequest(context.Background(), result.User)
	if err != nil || pending == nil || pending.ID != request.ID {
		t.Fatalf("get account deletion request: %#v err=%v", pending, err)
	}
	if err := service.CancelAccountDeletion(context.Background(), result.User); err != nil {
		t.Fatalf("cancel account deletion request: %v", err)
	}
	if pending, err = service.GetAccountDeletionRequest(context.Background(), result.User); err != nil || pending != nil {
		t.Fatalf("cancelled request must not remain pending: %#v err=%v", pending, err)
	}
	admin := result.User
	admin.Role = "admin"
	if _, err := service.RequestAccountDeletion(context.Background(), admin, RequestAccountDeletionInput{CurrentPassword: "password123"}); !errors.Is(err, ErrAdminDeletionForbidden) {
		t.Fatalf("administrator deletion request must fail: %v", err)
	}
}
