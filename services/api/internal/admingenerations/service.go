package admingenerations

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

var ErrInvalidInput = errors.New("invalid admin generation input")
var ErrNotFound = errors.New("generation task not found")
var ErrInvalidState = errors.New("generation task state does not allow this action")
var ErrInsufficientPoints = errors.New("insufficient points")

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) List(ctx context.Context, input ListInput) (Page, error) {
	input.Search = strings.TrimSpace(input.Search)
	if accountID, ok := parseAccountID(input.Search); ok {
		input.AccountID = &accountID
	}
	if input.Page < 1 || (input.PageSize != 20 && input.PageSize != 50) || !validStatusFilter(input.Status) || !validKindFilter(input.Kind) {
		return Page{}, ErrInvalidInput
	}
	return service.repository.List(ctx, input)
}

func (service *Service) Get(ctx context.Context, taskID string) (Task, error) {
	if _, err := uuid.Parse(taskID); err != nil {
		return Task{}, ErrInvalidInput
	}
	return service.repository.Get(ctx, taskID)
}

func (service *Service) Retry(ctx context.Context, taskID string) (ActionResult, error) {
	if _, err := uuid.Parse(taskID); err != nil {
		return ActionResult{}, ErrInvalidInput
	}
	return service.repository.Retry(ctx, taskID)
}

func (service *Service) RetryForUser(ctx context.Context, userID, taskID string) (ActionResult, error) {
	if _, err := uuid.Parse(taskID); err != nil || userID == "" {
		return ActionResult{}, ErrInvalidInput
	}
	return service.repository.RetryForUser(ctx, userID, taskID)
}

func (service *Service) Cancel(ctx context.Context, taskID string) (ActionResult, error) {
	if _, err := uuid.Parse(taskID); err != nil {
		return ActionResult{}, ErrInvalidInput
	}
	return service.repository.Cancel(ctx, taskID)
}

func (service *Service) CancelForUser(ctx context.Context, userID, taskID string) (ActionResult, error) {
	if _, err := uuid.Parse(taskID); err != nil || userID == "" {
		return ActionResult{}, ErrInvalidInput
	}
	return service.repository.CancelForUser(ctx, userID, taskID)
}

func (service *Service) Refund(ctx context.Context, taskID string) (ActionResult, error) {
	if _, err := uuid.Parse(taskID); err != nil {
		return ActionResult{}, ErrInvalidInput
	}
	return service.repository.Refund(ctx, taskID)
}

func parseAccountID(value string) (int64, bool) {
	normalized := strings.TrimLeft(strings.TrimSpace(value), "0")
	if normalized == "" && strings.Trim(value, "0") == "" && value != "" {
		normalized = "0"
	}
	accountID, err := strconv.ParseInt(normalized, 10, 64)
	return accountID, err == nil && accountID > 0
}

func validStatusFilter(value string) bool {
	return value == "" || value == "queued" || value == "running" || value == "needs_review" || value == "succeeded" || value == "failed" || value == "cancelled"
}

func validKindFilter(value string) bool {
	return value == "" || value == "image" || value == "video"
}
