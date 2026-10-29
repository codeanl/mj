package generation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"nova-creator-platform/services/api/internal/modelchannels"
	"nova-creator-platform/services/api/internal/points"
)

var ErrInvalidPrompt = errors.New("invalid generation prompt")
var ErrUnsupportedOptions = errors.New("unsupported generation options")
var ErrInsufficientPoints = errors.New("insufficient points")
var ErrInvalidImageCount = errors.New("invalid image count")
var ErrInvalidReference = errors.New("invalid reference image")
var ErrInvalidVideoReference = errors.New("invalid video reference")
var ErrInvalidRequestID = errors.New("invalid generation request id")

type Service struct {
	repository *Repository
	channels   *modelchannels.Service
	points     *points.Service
}

func NewService(repository *Repository, channels *modelchannels.Service, pointsService *points.Service) *Service {
	return &Service{repository: repository, channels: channels, points: pointsService}
}

func (service *Service) CreateImage(ctx context.Context, input CreateImageInput) (ImageBatch, error) {
	if _, err := uuid.Parse(input.RequestID); err != nil {
		return ImageBatch{}, ErrInvalidRequestID
	}
	prompt := strings.TrimSpace(input.Prompt)
	if input.UserID == "" || utf8.RuneCountInString(prompt) < 2 || utf8.RuneCountInString(prompt) > 2000 {
		return ImageBatch{}, ErrInvalidPrompt
	}
	count, ok := normalizeImageCount(input.Count)
	if !ok {
		return ImageBatch{}, ErrInvalidImageCount
	}
	referenceAssetIDs, ok := normalizeReferenceAssetIDs(input.ReferenceAssetIDs)
	if !ok {
		return ImageBatch{}, ErrInvalidReference
	}
	selected, err := service.channels.ResolveImageModel(ctx, "", input.Model)
	if err != nil {
		if errors.Is(err, modelchannels.ErrChannelDisabled) {
			return ImageBatch{}, ErrProviderUnavailable
		}
		return ImageBatch{}, err
	}
	options, ok := resolveImageOptions(input, selected.UpstreamModel)
	if !ok {
		return ImageBatch{}, ErrUnsupportedOptions
	}
	options.ChannelID = selected.ChannelID
	cost, err := service.points.GenerationCost(ctx, input.Model, "image", options.Resolution)
	if err != nil {
		return ImageBatch{}, err
	}
	return service.repository.CreateImages(ctx, input.UserID, input.RequestID, prompt, options, count, referenceAssetIDs, cost)
}

func (service *Service) CreateVideo(ctx context.Context, input CreateVideoInput) (VideoBatch, error) {
	if _, err := uuid.Parse(input.RequestID); err != nil {
		return VideoBatch{}, ErrInvalidRequestID
	}
	prompt := strings.TrimSpace(input.Prompt)
	mode := strings.TrimSpace(input.Mode)
	if mode == "" {
		mode = VideoModeText
	}
	references, ok := normalizeVideoReferences(mode, input.References)
	if !ok {
		return VideoBatch{}, ErrInvalidVideoReference
	}
	promptLength := utf8.RuneCountInString(prompt)
	if input.UserID == "" || promptLength > 7000 || (mode == VideoModeText && promptLength < 2) {
		return VideoBatch{}, ErrInvalidPrompt
	}
	models, err := service.channels.PublicModels(ctx, "video")
	if err != nil {
		return VideoBatch{}, err
	}
	var selectedModel modelchannels.PublicModel
	found := false
	for _, model := range models {
		if strings.EqualFold(model.ID, input.Model) {
			found = true
			selectedModel = model
			break
		}
	}
	if !found {
		return VideoBatch{}, ErrProviderUnavailable
	}
	ratio := strings.TrimSpace(input.Size)
	if ratio == "" {
		ratio = "16:9"
	}
	resolution := strings.ToUpper(strings.TrimSpace(input.Quality))
	if resolution == "" {
		resolution = "768P"
	}
	seconds := input.DurationSeconds
	if seconds == 0 {
		seconds = 5
	}
	config := selectedModel.CapabilityConfig
	if len(config.Ratios) == 0 {
		config.Ratios = []string{"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"}
	}
	if len(config.Qualities) == 0 {
		config.Qualities = []string{"480P", "768P", "1080P", "2K", "4K"}
	}
	if config.MinDuration <= 0 {
		config.MinDuration = 4
	}
	if config.MaxDuration <= 0 {
		config.MaxDuration = 30
	}
	if len(config.Modes) > 0 && !containsFold(config.Modes, mode) {
		return VideoBatch{}, ErrUnsupportedOptions
	}
	if input.SoundEnabled && !config.SupportsSound {
		return VideoBatch{}, ErrUnsupportedOptions
	}
	if input.WatermarkEnabled && !config.SupportsWatermark {
		return VideoBatch{}, ErrUnsupportedOptions
	}
	if !containsFold(config.Ratios, ratio) || !containsFold(config.Qualities, resolution) || seconds < config.MinDuration || seconds > config.MaxDuration {
		return VideoBatch{}, ErrUnsupportedOptions
	}
	candidates, err := service.channels.ResolveCandidates(ctx, "video", input.Model)
	if err != nil || len(candidates) == 0 {
		return VideoBatch{}, ErrProviderUnavailable
	}
	cost, err := service.points.VideoGenerationCost(ctx, input.Model, resolution, seconds)
	if err != nil {
		return VideoBatch{}, err
	}
	task, remaining, err := service.repository.CreateVideo(ctx, input.UserID, input.RequestID, prompt, VideoOptions{ChannelID: candidates[0].ChannelID, Model: input.Model, Ratio: ratio, Resolution: resolution, DurationSeconds: seconds, SoundEnabled: input.SoundEnabled, WatermarkEnabled: input.WatermarkEnabled, Width: 0, Height: 0, Mode: mode}, references, cost)
	if err != nil {
		return VideoBatch{}, err
	}
	return VideoBatch{Tasks: []Task{task}, PointsRemaining: remaining}, nil
}

func (service *Service) Quote(ctx context.Context, userID string, input QuoteInput) (Quote, error) {
	if userID == "" {
		return Quote{}, ErrInvalidPrompt
	}
	balance, err := service.points.Balance(ctx, userID)
	if err != nil {
		return Quote{}, err
	}
	var unitCost float64
	quantity := 1
	summary := ""
	switch input.Type {
	case "image":
		count, ok := normalizeImageCount(input.Count)
		if !ok {
			return Quote{}, ErrInvalidImageCount
		}
		selected, resolveErr := service.channels.ResolveImageModel(ctx, "", input.Model)
		if resolveErr != nil {
			return Quote{}, ErrProviderUnavailable
		}
		options, ok := resolveImageOptions(CreateImageInput{Model: input.Model, Size: input.Size, Quality: input.Quality}, selected.UpstreamModel)
		if !ok {
			return Quote{}, ErrUnsupportedOptions
		}
		unitCost, err = service.points.GenerationCost(ctx, input.Model, "image", options.Resolution)
		if err != nil {
			return Quote{}, err
		}
		quantity = count
		summary = fmt.Sprintf("%d 张图片 × %s", count, options.Resolution)
	case "video":
		models, listErr := service.channels.PublicModels(ctx, "video")
		if listErr != nil {
			return Quote{}, listErr
		}
		var config modelchannels.ModelCapabilityConfig
		found := false
		for _, model := range models {
			if strings.EqualFold(model.ID, input.Model) {
				config = model.CapabilityConfig
				found = true
				break
			}
		}
		if !found {
			return Quote{}, ErrProviderUnavailable
		}
		ratio, resolution, seconds, mode := strings.TrimSpace(input.Size), strings.ToUpper(strings.TrimSpace(input.Quality)), input.DurationSeconds, strings.TrimSpace(input.Mode)
		if ratio == "" {
			ratio = "16:9"
		}
		if resolution == "" {
			resolution = "768P"
		}
		if seconds == 0 {
			seconds = 5
		}
		if mode == "" {
			mode = VideoModeText
		}
		if len(config.Ratios) == 0 {
			config.Ratios = []string{"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"}
		}
		if len(config.Qualities) == 0 {
			config.Qualities = []string{"480P", "768P", "1080P", "2K", "4K"}
		}
		if config.MinDuration <= 0 {
			config.MinDuration = 4
		}
		if config.MaxDuration <= 0 {
			config.MaxDuration = 30
		}
		if (len(config.Modes) > 0 && !containsFold(config.Modes, mode)) || (input.SoundEnabled && !config.SupportsSound) || (input.WatermarkEnabled && !config.SupportsWatermark) || !containsFold(config.Ratios, ratio) || !containsFold(config.Qualities, resolution) || seconds < config.MinDuration || seconds > config.MaxDuration {
			return Quote{}, ErrUnsupportedOptions
		}
		unitCost, err = service.points.VideoGenerationCost(ctx, input.Model, resolution, seconds)
		if err != nil {
			return Quote{}, err
		}
		summary = fmt.Sprintf("%d 秒视频 × %s", seconds, resolution)
	default:
		return Quote{}, ErrUnsupportedOptions
	}
	total := math.Round(unitCost*float64(quantity)*100) / 100
	remaining := math.Round((balance-total)*100) / 100
	return Quote{Type: input.Type, UnitCost: unitCost, Quantity: quantity, TotalCost: total, Balance: balance, Remaining: remaining, Affordable: remaining >= 0, PricingSummary: summary}, nil
}

func containsFold(values []string, value string) bool {
	for _, item := range values {
		if strings.EqualFold(item, value) {
			return true
		}
	}
	return false
}

func normalizeVideoReferences(mode string, values []VideoReference) ([]VideoReference, bool) {
	if mode == VideoModeText {
		return []VideoReference{}, len(values) == 0
	}
	if mode != VideoModeFrames && mode != VideoModeReference && !isSpecialVideoMode(mode) {
		return nil, false
	}
	maximum := 12
	if mode == VideoModeFrames {
		maximum = 2
	}
	if isSpecialVideoMode(mode) {
		maximum = 12
	}
	if len(values) < 1 || len(values) > maximum {
		return nil, false
	}
	result := make([]VideoReference, 0, len(values))
	seenIDs := make(map[string]struct{}, len(values))
	seenRoles := make(map[string]int)
	for _, value := range values {
		value.AssetID = strings.TrimSpace(value.AssetID)
		value.Role = strings.TrimSpace(value.Role)
		if _, err := uuid.Parse(value.AssetID); err != nil {
			return nil, false
		}
		if _, exists := seenIDs[value.AssetID]; exists {
			return nil, false
		}
		if mode == VideoModeFrames && value.Role != VideoRoleFirstFrame && value.Role != VideoRoleLastFrame {
			return nil, false
		}
		if (mode == VideoModeReference || isSpecialVideoMode(mode)) && value.Role != VideoRoleImage && value.Role != VideoRoleVideo && value.Role != VideoRoleAudio {
			return nil, false
		}
		seenIDs[value.AssetID] = struct{}{}
		seenRoles[value.Role]++
		result = append(result, value)
	}
	if mode == VideoModeFrames {
		return result, seenRoles[VideoRoleFirstFrame] <= 1 && seenRoles[VideoRoleLastFrame] <= 1
	}
	if mode == "extend" || mode == "edit" {
		return result, seenRoles[VideoRoleVideo] >= 1
	}
	if mode == "lip_sync" {
		return result, seenRoles[VideoRoleVideo] >= 1 && seenRoles[VideoRoleAudio] >= 1
	}
	if mode == "motion_transfer" {
		return result, seenRoles[VideoRoleVideo] >= 1 && seenRoles[VideoRoleImage] >= 1
	}
	return result, seenRoles[VideoRoleImage] <= 9 && seenRoles[VideoRoleVideo] <= 3 && seenRoles[VideoRoleAudio] <= 3 && seenRoles[VideoRoleAudio] < len(result)
}

func normalizeReferenceAssetIDs(values []string) ([]string, bool) {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, err := uuid.Parse(value); err != nil {
			return nil, false
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result, len(result) <= MaxReferenceImages
}

func normalizeImageCount(count int) (int, bool) {
	if count == 0 {
		return 1, true
	}
	return count, count >= 1 && count <= MaxImageCount
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

func (service *Service) Capabilities(ctx context.Context) (Capabilities, error) {
	publicModels, err := service.channels.PublicModels(ctx, "image")
	if err != nil {
		return Capabilities{}, err
	}
	models := make([]Option, 0, len(publicModels))
	for _, model := range publicModels {
		models = append(models, Option{Value: model.ID, Label: model.DisplayName})
	}
	videoModelsRaw, err := service.channels.PublicModels(ctx, "video")
	if err != nil {
		return Capabilities{}, err
	}
	videoModels := make([]Option, 0, len(videoModelsRaw))
	for _, model := range videoModelsRaw {
		videoModels = append(videoModels, Option{Value: model.ID, Label: model.DisplayName})
	}
	videoDurations := make([]Option, 0, 27)
	for seconds := 4; seconds <= 30; seconds++ {
		value := strconv.Itoa(seconds)
		videoDurations = append(videoDurations, Option{Value: value, Label: value + "秒"})
	}
	return Capabilities{
		Image: GenerationCapability{
			Enabled: len(models) > 0,
			Models:  models,
			Sizes: []ImageSizeOption{
				{Value: "1:1", Label: "1:1", Width: 2048, Height: 2048},
				{Value: "16:9", Label: "16:9", Width: 2048, Height: 1152},
				{Value: "9:16", Label: "9:16", Width: 1152, Height: 2048},
				{Value: "4:3", Label: "4:3", Width: 2048, Height: 1536},
				{Value: "3:4", Label: "3:4", Width: 1536, Height: 2048},
			},
			Qualities: []Option{{Value: "1K", Label: "1K"}, {Value: "2K", Label: "2K"}},
		},
		Video: GenerationCapability{Enabled: len(videoModels) > 0, Models: videoModels, Sizes: []ImageSizeOption{{Value: "adaptive", Label: "自适应"}, {Value: "21:9", Label: "21:9"}, {Value: "16:9", Label: "16:9"}, {Value: "4:3", Label: "4:3"}, {Value: "1:1", Label: "1:1"}, {Value: "3:4", Label: "3:4"}, {Value: "9:16", Label: "9:16"}}, Qualities: []Option{{Value: "480P", Label: "480P"}, {Value: "768P", Label: "768P"}, {Value: "1080P", Label: "1080P"}, {Value: "2K", Label: "2K"}, {Value: "4K", Label: "4K"}}, Durations: videoDurations},
	}, nil
}

func (service *Service) Get(ctx context.Context, userID, taskID string) (Task, error) {
	return service.repository.Get(ctx, userID, taskID)
}
