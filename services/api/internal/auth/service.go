package auth

import (
	"context"
	"errors"
	"io"
	"net/mail"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"nova-creator-platform/services/api/internal/assets"
)

var (
	ErrInvalidInput       = errors.New("invalid input")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserDisabled       = errors.New("user is disabled")
	ErrInvalidAvatar      = errors.New("invalid avatar")
	ErrAvatarMissing      = errors.New("avatar does not exist")
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

func (service *Service) Register(ctx context.Context, input RegisterInput) (Result, error) {
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
	return service.issue(decorateUser(user))
}

func (service *Service) Login(ctx context.Context, input LoginInput) (Result, error) {
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
	return service.issue(decorateUser(record.User))
}

func (service *Service) CurrentUser(ctx context.Context, rawToken string) (User, error) {
	claims, err := service.tokens.Parse(rawToken)
	if err != nil {
		return User{}, err
	}
	user, err := service.repository.FindByID(ctx, claims.Subject)
	if err != nil {
		return User{}, err
	}
	if user.Status != "active" {
		return User{}, ErrUserDisabled
	}
	return decorateUser(user), nil
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

func (service *Service) issue(user User) (Result, error) {
	token, expiresIn, err := service.tokens.Issue(user)
	if err != nil {
		return Result{}, err
	}
	return Result{AccessToken: token, TokenType: "Bearer", ExpiresIn: expiresIn, User: user}, nil
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
