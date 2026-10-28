package adminaudit

import (
	"context"
	"errors"
	"strings"
)

var ErrInvalidInput = errors.New("invalid admin audit input")

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) Record(ctx context.Context, entry Entry) error {
	entry.Action = strings.TrimSpace(entry.Action)
	entry.TargetType = strings.TrimSpace(entry.TargetType)
	entry.TargetID = strings.TrimSpace(entry.TargetID)
	if entry.ActorUserID == "" || entry.Action == "" || entry.TargetType == "" || len(entry.Action) > 80 || len(entry.TargetType) > 40 || len(entry.TargetID) > 160 {
		return ErrInvalidInput
	}
	return service.repository.Record(ctx, entry)
}

func (service *Service) List(ctx context.Context, input ListInput) (Page, error) {
	input.Search = strings.TrimSpace(input.Search)
	input.Action = strings.TrimSpace(input.Action)
	if input.Page < 1 || (input.PageSize != 20 && input.PageSize != 50) || len([]rune(input.Search)) > 100 || len(input.Action) > 80 {
		return Page{}, ErrInvalidInput
	}
	return service.repository.List(ctx, input)
}

func (service *Service) Recent(ctx context.Context, limit int) ([]Item, error) {
	if limit < 1 || limit > 20 {
		return nil, ErrInvalidInput
	}
	return service.repository.Recent(ctx, limit)
}
