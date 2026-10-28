package admindashboard

import "context"

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) Get(ctx context.Context) (Dashboard, error) {
	return service.repository.Get(ctx)
}
