package auth

import (
	"context"
	"errors"
	"io"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"nova-creator-platform/services/api/internal/assets"
)

var (
	ErrInvalidInput           = errors.New("invalid input")
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrUserDisabled           = errors.New("user is disabled")
	ErrInvalidAvatar          = errors.New("invalid avatar")
	ErrAvatarMissing          = errors.New("avatar does not exist")
	ErrInvalidSession         = errors.New("invalid session")
	ErrCurrentSession         = errors.New("current session cannot be revoked")
	ErrDeletionRequestMissing = errors.New("account deletion request does not exist")
	ErrAdminDeletionForbidden = errors.New("administrator account cannot request deletion")
)

type Service struct {
	repository Repository
	tokens     TokenManager
	storage    *assets.LocalStorage
}

func NewService(repository Repository, tokens TokenManager, storage ...*assets.LocalStorage) *Service {
	service := &Service{repository: repository, tokens: tokens}
	if len(storage) > 0 {
		service.storage = storage[0]
	}
	return service
}

func (service *Service) Register(ctx context.Context, input RegisterInput, clients ...ClientInfo) (Result, error) {
	email, username, err := validateRegistration(input)
	if err != nil {
		return Result{}, err
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return Result{}, err
	}
	user, err := service.repository.Create(ctx, email, username, string(passwordHash))
	if err != nil {
		return Result{}, err
	}
	return service.issue(ctx, decorateUser(user), firstClient(clients))
}

func (service *Service) Login(ctx context.Context, input LoginInput, clients ...ClientInfo) (Result, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" || input.Password == "" {
		return Result{}, ErrInvalidCredentials
	}
	record, err := service.repository.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserMissing) {
			return Result{}, ErrInvalidCredentials
		}
		return Result{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(input.Password)) != nil {
		return Result{}, ErrInvalidCredentials
	}
	if record.Status != "active" {
		return Result{}, ErrUserDisabled
	}
	return service.issue(ctx, decorateUser(record.User), firstClient(clients))
}

func (service *Service) CurrentUser(ctx context.Context, rawToken string) (User, error) {
	claims, err := service.tokens.Parse(rawToken)
	if err != nil {
		return User{}, err
	}
	if _, err := service.repository.FindSession(ctx, claims.Subject, claims.SessionID); err != nil {
		return User{}, err
	}
	user, err := service.repository.FindByID(ctx, claims.Subject)
	if err != nil {
		return User{}, err
	}
	if user.Status != "active" {
		return User{}, ErrUserDisabled
	}
	user = decorateUser(user)
	user.SessionID = claims.SessionID
	return user, nil
}

func (service *Service) Logout(ctx context.Context, user User) error {
	return service.repository.RevokeSession(ctx, user.ID, user.SessionID)
}

func (service *Service) ListSessions(ctx context.Context, user User) ([]Session, error) {
	sessions, err := service.repository.ListSessions(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	for index := range sessions {
		sessions[index].Current = sessions[index].ID == user.SessionID
	}
	return sessions, nil
}

func (service *Service) RevokeSession(ctx context.Context, user User, sessionID string) error {
	if sessionID == "" {
		return ErrInvalidSession
	}
	if sessionID == user.SessionID {
		return ErrCurrentSession
	}
	return service.repository.RevokeSession(ctx, user.ID, sessionID)
}

func (service *Service) RevokeOtherSessions(ctx context.Context, user User) error {
	return service.repository.RevokeOtherSessions(ctx, user.ID, user.SessionID)
}

func (service *Service) ChangePassword(ctx context.Context, user User, input ChangePasswordInput) error {
	if len(input.NewPassword) < 8 || len(input.NewPassword) > 72 || input.CurrentPassword == "" {
		return ErrInvalidInput
	}
	record, err := service.repository.FindRecordByID(ctx, user.ID)
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(input.CurrentPassword)) != nil {
		return ErrInvalidCredentials
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return service.repository.ChangePassword(ctx, user.ID, string(passwordHash), user.SessionID)
}

func (service *Service) RequestAccountDeletion(ctx context.Context, user User, input RequestAccountDeletionInput) (AccountDeletionRequest, error) {
	if user.Role == "admin" {
		return AccountDeletionRequest{}, ErrAdminDeletionForbidden
	}
	record, err := service.repository.FindRecordByID(ctx, user.ID)
	if err != nil {
		return AccountDeletionRequest{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(input.CurrentPassword)) != nil {
		return AccountDeletionRequest{}, ErrInvalidCredentials
	}
	return service.repository.RequestAccountDeletion(ctx, user.ID)
}

func (service *Service) GetAccountDeletionRequest(ctx context.Context, user User) (*AccountDeletionRequest, error) {
	return service.repository.GetAccountDeletionRequest(ctx, user.ID)
}

func (service *Service) CancelAccountDeletion(ctx context.Context, user User) error {
	return service.repository.CancelAccountDeletion(ctx, user.ID)
}

func (service *Service) UpdateProfile(ctx context.Context, userID string, input ProfileInput) (User, error) {
	username := strings.TrimSpace(input.Username)
	if length := utf8.RuneCountInString(username); length < 2 || length > 32 {
		return User{}, ErrInvalidInput
	}
	user, err := service.repository.UpdateProfile(ctx, userID, username)
	if err != nil {
		return User{}, err
	}
	return decorateUser(user), nil
}

func (service *Service) UpdateAvatar(ctx context.Context, userID, mimeType string, content io.Reader) (User, error) {
	if service.storage == nil {
		return User{}, errors.New("avatar storage is unavailable")
	}
	extension := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mimeType]
	if extension == "" {
		return User{}, ErrInvalidAvatar
	}
	current, err := service.repository.FindByID(ctx, userID)
	if err != nil {
		return User{}, err
	}
	key := "avatar-" + uuid.NewString() + extension
	if err := service.storage.Save(key, content); err != nil {
		return User{}, err
	}
	user, err := service.repository.UpdateAvatar(ctx, userID, key, mimeType)
	if err != nil {
		_ = service.storage.Delete(key)
		return User{}, err
	}
	if current.avatarStorageKey != "" && current.avatarStorageKey != key {
		_ = service.storage.Delete(current.avatarStorageKey)
	}
	return decorateUser(user), nil
}

func (service *Service) RemoveAvatar(ctx context.Context, userID string) (User, error) {
	current, err := service.repository.FindByID(ctx, userID)
	if err != nil {
		return User{}, err
	}
	user, err := service.repository.UpdateAvatar(ctx, userID, "", "")
	if err != nil {
		return User{}, err
	}
	if service.storage != nil && current.avatarStorageKey != "" {
		_ = service.storage.Delete(current.avatarStorageKey)
	}
	return decorateUser(user), nil
}

func (service *Service) OpenAvatar(ctx context.Context, userID string) (Avatar, error) {
	if service.storage == nil {
		return Avatar{}, ErrAvatarMissing
	}
	user, err := service.repository.FindByID(ctx, userID)
	if err != nil || user.avatarStorageKey == "" {
		return Avatar{}, ErrAvatarMissing
	}
	content, err := service.storage.Open(user.avatarStorageKey)
	if err != nil {
		return Avatar{}, err
	}
	updatedAt := user.CreatedAt
	if user.avatarUpdatedAt != nil {
		updatedAt = *user.avatarUpdatedAt
	}
	return Avatar{ContentType: user.avatarMimeType, UpdatedAt: updatedAt, Content: content}, nil
}

func decorateUser(user User) User {
	if user.avatarStorageKey != "" {
		version := user.CreatedAt.UnixNano()
		if user.avatarUpdatedAt != nil {
			version = user.avatarUpdatedAt.UnixNano()
		}
		user.AvatarURL = "/api/v1/profile/avatar?v=" + strconv.FormatInt(version, 10)
	}
	return user
}

func (service *Service) issue(ctx context.Context, user User, client ClientInfo) (Result, error) {
	sessionID := uuid.NewString()
	token, expiresIn, err := service.tokens.Issue(user, sessionID)
	if err != nil {
		return Result{}, err
	}
	client = normalizeClient(client)
	if err := service.repository.CreateSession(ctx, sessionID, user.ID, client, time.Now().Add(time.Duration(expiresIn)*time.Second)); err != nil {
		return Result{}, err
	}
	return Result{AccessToken: token, TokenType: "Bearer", ExpiresIn: expiresIn, User: user}, nil
}

func firstClient(clients []ClientInfo) ClientInfo {
	if len(clients) == 0 {
		return ClientInfo{}
	}
	return clients[0]
}

func normalizeClient(client ClientInfo) ClientInfo {
	client.UserAgent = strings.TrimSpace(client.UserAgent)
	client.IPAddress = strings.TrimSpace(client.IPAddress)
	if len(client.UserAgent) > 500 {
		client.UserAgent = client.UserAgent[:500]
	}
	if len(client.IPAddress) > 64 {
		client.IPAddress = client.IPAddress[:64]
	}
	return client
}

func validateRegistration(input RegisterInput) (string, string, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	username := strings.TrimSpace(input.Username)
	parsedEmail, err := mail.ParseAddress(email)
	if err != nil || parsedEmail.Address != email || len(email) > 254 {
		return "", "", ErrInvalidInput
	}
	usernameLength := utf8.RuneCountInString(username)
	if usernameLength < 2 || usernameLength > 32 {
		return "", "", ErrInvalidInput
	}
	if len(input.Password) < 8 || len(input.Password) > 72 {
		return "", "", ErrInvalidInput
	}
	return email, username, nil
}
