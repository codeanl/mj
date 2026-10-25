package adminusers

import (
	"context"
	"errors"
	"net/mail"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidInput   = errors.New("invalid admin user input")
	ErrSelfProtection = errors.New("administrator cannot disable or demote current account")
	ErrLastAdmin      = errors.New("at least one active administrator is required")
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) List(ctx context.Context, actorID string, input ListInput) (Page, error) {
	input.Search = strings.TrimSpace(input.Search)
	input.Role = strings.ToLower(strings.TrimSpace(input.Role))
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	if input.Page < 1 || (input.PageSize != 20 && input.PageSize != 50) || len([]rune(input.Search)) > 100 || (input.Role != "" && !validRole(input.Role)) || (input.Status != "" && !validStatus(input.Status)) {
		return Page{}, ErrInvalidInput
	}
	if accountID, ok := parseAccountID(input.Search); ok {
		input.AccountID = &accountID
	}
	page, err := service.repository.List(ctx, input)
	if err != nil {
		return Page{}, err
	}
	for index := range page.Items {
		page.Items[index].IsSelf = page.Items[index].internalID == actorID
		page.Items[index].internalID = ""
	}
	return page, nil
}

func (service *Service) Create(ctx context.Context, input CreateInput) (User, error) {
	email, username, err := normalizeIdentity(input.Email, input.Username)
	if err != nil || !validPassword(input.Password) || !validRole(input.Role) || !validStatus(input.Status) {
		return User{}, ErrInvalidInput
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	user, err := service.repository.Create(ctx, email, username, string(passwordHash), input.Role, input.Status)
	user.internalID = ""
	return user, err
}

func (service *Service) Update(ctx context.Context, actorID string, accountID int64, input UpdateInput) (User, error) {
	email, username, err := normalizeIdentity(input.Email, input.Username)
	if err != nil || accountID < 1 || !validRole(input.Role) || !validStatus(input.Status) {
		return User{}, ErrInvalidInput
	}
	target, err := service.repository.FindByAccountID(ctx, accountID)
	if err != nil {
		return User{}, err
	}
	if target.internalID == actorID && (input.Role != "admin" || input.Status != "active") {
		return User{}, ErrSelfProtection
	}
	removesActiveAdmin := target.Role == "admin" && target.Status == "active" && (input.Role != "admin" || input.Status != "active")
	if removesActiveAdmin {
		count, err := service.repository.CountActiveAdmins(ctx)
		if err != nil {
			return User{}, err
		}
		if count <= 1 {
			return User{}, ErrLastAdmin
		}
	}
	user, err := service.repository.Update(ctx, accountID, email, username, input.Role, input.Status)
	if err != nil {
		return User{}, err
	}
	user.IsSelf = user.internalID == actorID
	user.internalID = ""
	return user, nil
}

func (service *Service) ResetPassword(ctx context.Context, accountID int64, input PasswordInput) error {
	if accountID < 1 || !validPassword(input.Password) {
		return ErrInvalidInput
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return service.repository.UpdatePassword(ctx, accountID, string(passwordHash))
}

func normalizeIdentity(rawEmail, rawUsername string) (string, string, error) {
	email := strings.ToLower(strings.TrimSpace(rawEmail))
	username := strings.TrimSpace(rawUsername)
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 || utf8.RuneCountInString(username) < 2 || utf8.RuneCountInString(username) > 32 {
		return "", "", ErrInvalidInput
	}
	return email, username, nil
}

func parseAccountID(value string) (int64, bool) {
	normalized := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.ToUpper(value), "ID:"), "ID："))
	if normalized == "" || strings.IndexFunc(normalized, func(character rune) bool { return character < '0' || character > '9' }) >= 0 {
		return 0, false
	}
	accountID, err := strconv.ParseInt(normalized, 10, 64)
	return accountID, err == nil && accountID > 0
}

func validPassword(value string) bool {
	return len(value) >= 8 && len(value) <= 72
}

func validRole(value string) bool {
	return value == "user" || value == "admin"
}

func validStatus(value string) bool {
	return value == "active" || value == "disabled"
}
