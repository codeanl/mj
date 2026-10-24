package generation

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

var ErrInvalidPrompt = errors.New("invalid generation prompt")
var ErrUnsupportedOptions = errors.New("unsupported generation options")

type Service struct {
	repository *Repository
	provider   ImageProvider
	imageModel string
}

func NewService(repository *Repository, provider ImageProvider, imageModel string) *Service {
	return &Service{repository: repository, provider: provider, imageModel: imageModel}
}

func (service *Service) CreateImage(ctx context.Context, input CreateImageInput) (Task, error) {
	prompt := strings.TrimSpace(input.Prompt)
	if input.UserID == "" || utf8.RuneCountInString(prompt) < 2 || utf8.RuneCountInString(prompt) > 2000 {
		return Task{}, ErrInvalidPrompt
	}
	if !service.provider.Available() {
		return Task{}, ErrProviderUnavailable
	}
	if !supportsImageOptions(input, service.imageModel) {
		return Task{}, ErrUnsupportedOptions
	}
	return service.repository.CreateImage(ctx, input.UserID, prompt, service.imageModel)
}

func supportsImageOptions(input CreateImageInput, model string) bool {
	requestedModel := strings.TrimSpace(input.Model)
	requestedSize := strings.TrimSpace(input.Size)
	requestedQuality := strings.TrimSpace(input.Quality)
	return (requestedModel == "" || requestedModel == model) &&
		(requestedSize == "" || requestedSize == ImageSize) &&
		(requestedQuality == "" || requestedQuality == ImageQuality)
}

func (service *Service) Capabilities() Capabilities {
	return Capabilities{
		Image: GenerationCapability{
			Enabled:   service.provider.Available(),
			Models:    []Option{{Value: service.imageModel, Label: service.imageModel}},
			Sizes:     []ImageSizeOption{{Value: ImageSize, Label: "16:9", Width: ImageWidth, Height: ImageHeight}},
			Qualities: []Option{{Value: ImageQuality, Label: "2K"}},
		},
		Video: GenerationCapability{Enabled: false, Models: []Option{}, Sizes: []ImageSizeOption{}, Qualities: []Option{}},
	}
}

func (service *Service) Get(ctx context.Context, userID, taskID string) (Task, error) {
	return service.repository.Get(ctx, userID, taskID)
}
