package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidInput       = errors.New("invalid input")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserDisabled       = errors.New("user is disabled")
)

type Service struct {
	repository Repository
	tokens     TokenManager
}

func NewService(repository Repository, tokens TokenManager) *Service {
	return &Service{repository: repository, tokens: tokens}
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
	return service.issue(user)
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
	return service.issue(record.User)
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
	return user, nil
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
