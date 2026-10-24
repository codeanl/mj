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
	options, ok := resolveImageOptions(input, service.imageModel)
	if !ok {
		return Task{}, ErrUnsupportedOptions
	}
	return service.repository.CreateImage(ctx, input.UserID, prompt, options)
}

func resolveImageOptions(input CreateImageInput, configuredModel string) (ImageOptions, bool) {
	requestedModel := strings.TrimSpace(input.Model)
	ratio := strings.TrimSpace(input.Size)
	resolution := strings.ToUpper(strings.TrimSpace(input.Quality))
	if requestedModel == "" {
		requestedModel = configuredModel
	}
	if ratio == "" {
		ratio = DefaultImageRatio
	}
	if resolution == "" {
		resolution = DefaultImageResolution
	}
	if requestedModel != configuredModel {
		return ImageOptions{}, false
	}
	dimensions, ok := imageDimensions[resolution][ratio]
	if !ok {
		return ImageOptions{}, false
	}
	return ImageOptions{
		Model: requestedModel, Ratio: ratio, Resolution: resolution,
		ProviderSize: dimensions.size, ProviderQuality: ProviderImageQuality,
		Width: dimensions.width, Height: dimensions.height,
	}, true
}

var imageDimensions = map[string]map[string]struct {
	size          string
	width, height int
}{
	"1K": {
		"1:1":  {size: "1024x1024", width: 1024, height: 1024},
		"16:9": {size: "1024x576", width: 1024, height: 576},
		"9:16": {size: "576x1024", width: 576, height: 1024},
		"4:3":  {size: "1024x768", width: 1024, height: 768},
		"3:4":  {size: "768x1024", width: 768, height: 1024},
	},
	"2K": {
		"1:1":  {size: "2048x2048", width: 2048, height: 2048},
		"16:9": {size: "2048x1152", width: 2048, height: 1152},
		"9:16": {size: "1152x2048", width: 1152, height: 2048},
		"4:3":  {size: "2048x1536", width: 2048, height: 1536},
		"3:4":  {size: "1536x2048", width: 1536, height: 2048},
	},
}

func (service *Service) Capabilities() Capabilities {
	return Capabilities{
		Image: GenerationCapability{
			Enabled: service.provider.Available(),
			Models:  []Option{{Value: service.imageModel, Label: service.imageModel}},
			Sizes: []ImageSizeOption{
				{Value: "1:1", Label: "1:1", Width: 2048, Height: 2048},
				{Value: "16:9", Label: "16:9", Width: 2048, Height: 1152},
				{Value: "9:16", Label: "9:16", Width: 1152, Height: 2048},
				{Value: "4:3", Label: "4:3", Width: 2048, Height: 1536},
				{Value: "3:4", Label: "3:4", Width: 1536, Height: 2048},
			},
			Qualities: []Option{{Value: "1K", Label: "1K"}, {Value: "2K", Label: "2K"}},
		},
		Video: GenerationCapability{Enabled: false, Models: []Option{}, Sizes: []ImageSizeOption{}, Qualities: []Option{}},
	}
}

func (service *Service) Get(ctx context.Context, userID, taskID string) (Task, error) {
	return service.repository.Get(ctx, userID, taskID)
}
