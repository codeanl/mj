package adminusers

import (
	"context"
	"errors"
	"testing"
)

type memoryRepository struct {
	users        map[int64]User
	lastList     ListInput
	activeAdmins int64
}

func (repository *memoryRepository) List(_ context.Context, input ListInput) (Page, error) {
	repository.lastList = input
	items := make([]User, 0, len(repository.users))
	for _, user := range repository.users {
		items = append(items, user)
	}
	return Page{Items: items, Total: int64(len(items)), Page: input.Page, PageSize: input.PageSize}, nil
}

func (repository *memoryRepository) FindByAccountID(_ context.Context, accountID int64) (User, error) {
	user, ok := repository.users[accountID]
	if !ok {
		return User{}, ErrUserNotFound
	}
	return user, nil
}

func (repository *memoryRepository) Create(_ context.Context, email, username, _ string, role, status string) (User, error) {
	return User{AccountID: 3, Email: email, Username: username, Role: role, Status: status}, nil
}

func (repository *memoryRepository) Update(_ context.Context, accountID int64, email, username, role, status string) (User, error) {
	user := repository.users[accountID]
	user.Email, user.Username, user.Role, user.Status = email, username, role, status
	return user, nil
}

func (repository *memoryRepository) UpdatePassword(context.Context, int64, string) error { return nil }
func (repository *memoryRepository) CountActiveAdmins(context.Context) (int64, error) {
	return repository.activeAdmins, nil
}

func TestListRecognizesPaddedPublicAccountIDAndMarksSelf(t *testing.T) {
	repository := &memoryRepository{users: map[int64]User{1: {AccountID: 1, Username: "管理员", internalID: "actor"}}}
	page, err := NewService(repository).List(context.Background(), "actor", ListInput{Page: 1, PageSize: 20, Search: "0001"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if repository.lastList.AccountID == nil || *repository.lastList.AccountID != 1 || !page.Items[0].IsSelf || page.Items[0].internalID != "" {
		t.Fatalf("unexpected account ID query or public result: %#v %#v", repository.lastList, page.Items[0])
	}
}

func TestCurrentAdministratorCannotDisableOrDemoteSelf(t *testing.T) {
	repository := &memoryRepository{users: map[int64]User{1: {AccountID: 1, Email: "admin@example.com", Username: "管理员", Role: "admin", Status: "active", internalID: "actor"}}, activeAdmins: 1}
	service := NewService(repository)
	for _, input := range []UpdateInput{
		{Email: "admin@example.com", Username: "管理员", Role: "user", Status: "active"},
		{Email: "admin@example.com", Username: "管理员", Role: "admin", Status: "disabled"},
	} {
		if _, err := service.Update(context.Background(), "actor", 1, input); !errors.Is(err, ErrSelfProtection) {
			t.Fatalf("expected self protection, got %v", err)
		}
	}
}

func TestLastActiveAdministratorCannotBeRemoved(t *testing.T) {
	repository := &memoryRepository{users: map[int64]User{1: {AccountID: 1, Email: "admin@example.com", Username: "管理员", Role: "admin", Status: "active", internalID: "other"}}, activeAdmins: 1}
	_, err := NewService(repository).Update(context.Background(), "actor", 1, UpdateInput{Email: "admin@example.com", Username: "管理员", Role: "user", Status: "active"})
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("expected last administrator protection, got %v", err)
	}
}
