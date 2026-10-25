package modelchannels

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	rand "math/rand/v2"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidChannel  = errors.New("invalid model channel")
	ErrInvalidModel    = errors.New("invalid channel model")
	ErrChannelDisabled = errors.New("model channel is unavailable")
)

type Service struct {
	repository *Repository
	cipher     SecretCipher
	client     *http.Client
}

func (service *Service) ResolveImageCandidates(ctx context.Context, modelID string) ([]ResolvedModel, error) {
	return service.ResolveCandidates(ctx, "image", modelID)
}
func (service *Service) ResolveCandidates(ctx context.Context, capability, modelID string) ([]ResolvedModel, error) {
	pairs, err := service.repository.ResolveModels(ctx, capability, strings.TrimSpace(modelID))
	if err != nil {
		return nil, err
	}
	resolved := make([]ResolvedModel, 0, len(pairs))
	for _, pair := range pairs {
		apiKey, err := service.cipher.Decrypt(pair.Channel.apiKeyCiphertext)
		if err != nil {
			continue
		}
		definition, _ := FindProtocolDefinition(pair.Channel.Protocol)
		advanced := normalizeAdvancedConfig(pair.Channel.AdvancedConfig, definition)
		if apiKey == "" && advanced.AuthMode != "none" {
			continue
		}
		resolved = append(resolved, ResolvedModel{ChannelID: pair.Channel.ID, BaseURL: pair.Channel.BaseURL, APIKey: apiKey, Protocol: pair.Channel.Protocol, AdvancedConfig: advanced, UpstreamModel: pair.Model.ModelID, Priority: pair.Channel.Priority, Weight: pair.Channel.Weight, MaxConcurrency: pair.Channel.MaxConcurrency, TimeoutSeconds: pair.Channel.TimeoutSeconds, PollIntervalSeconds: advanced.PollIntervalSeconds})
	}
	if len(resolved) == 0 {
		return nil, ErrChannelDisabled
	}
	minimum := resolved[0].Priority
	end, total := 0, 0
	for end < len(resolved) && resolved[end].Priority == minimum {
		total += resolved[end].Weight
		end++
	}
	if end > 1 && total > 0 {
		pick := rand.IntN(total)
		selected := 0
		for index := 0; index < end; index++ {
			pick -= resolved[index].Weight
			if pick < 0 {
				selected = index
				break
			}
		}
		resolved[0], resolved[selected] = resolved[selected], resolved[0]
	}
	return resolved, nil
}

func (service *Service) TryAcquire(ctx context.Context, channelID string) (bool, error) {
	return service.repository.TryAcquire(ctx, channelID)
}
func (service *Service) TryAcquirePinned(ctx context.Context, channelID string) (bool, error) {
	return service.repository.TryAcquirePinned(ctx, channelID)
}
func (service *Service) Release(ctx context.Context, channelID string, success bool, latencyMS int64, message string) error {
	return service.repository.Release(ctx, channelID, success, latencyMS, message)
}

func NewService(repository *Repository, cipher SecretCipher, timeout time.Duration) *Service {
	return &Service{repository: repository, cipher: cipher, client: &http.Client{Timeout: timeout}}
}

func (service *Service) List(ctx context.Context) ([]Channel, error) {
	channels, err := service.repository.List(ctx)
	if err != nil {
		return nil, err
	}
	for index := range channels {
		decorateChannel(&channels[index], service.cipher)
	}
	return channels, nil
}

func (service *Service) Create(ctx context.Context, input ChannelInput) (Channel, error) {
	input, err := normalizeChannelInput(input)
	definition, _ := FindProtocolDefinition(input.Protocol)
	if err != nil || (definition.AuthMode != "none" && strings.TrimSpace(input.APIKey) == "") {
		return Channel{}, ErrInvalidChannel
	}
	encrypted, err := service.cipher.Encrypt(strings.TrimSpace(input.APIKey))
	if err != nil {
		return Channel{}, err
	}
	channel, err := service.repository.Create(ctx, input, encrypted)
	if err == nil {
		definition, _ := FindProtocolDefinition(input.Protocol)
		for index, model := range definition.BuiltInModels {
			_, createErr := service.repository.CreateModel(ctx, channel.ID, ModelInput{ModelID: model.ID, DisplayName: model.Label, Capability: model.Capability, Enabled: true, SortOrder: index, CapabilityConfig: model.CapabilityConfig})
			if createErr != nil {
				_ = service.repository.Delete(ctx, channel.ID)
				return Channel{}, createErr
			}
		}
		channel, err = service.repository.Find(ctx, channel.ID)
	}
	decorateChannel(&channel, service.cipher)
	return channel, err
}

func (service *Service) Update(ctx context.Context, id string, input ChannelInput) (Channel, error) {
	input, err := normalizeChannelInput(input)
	if err != nil {
		return Channel{}, ErrInvalidChannel
	}
	var encrypted *string
	if input.ClearAPIKey {
		value := ""
		encrypted = &value
	} else if strings.TrimSpace(input.APIKey) != "" {
		value, err := service.cipher.Encrypt(strings.TrimSpace(input.APIKey))
		if err != nil {
			return Channel{}, err
		}
		encrypted = &value
	}
	channel, err := service.repository.Update(ctx, id, input, encrypted)
	decorateChannel(&channel, service.cipher)
	return channel, err
}

func (service *Service) Delete(ctx context.Context, id string) error {
	return service.repository.Delete(ctx, id)
}

func (service *Service) CreateModel(ctx context.Context, channelID string, input ModelInput) (Model, error) {
	input, err := normalizeModelInput(input)
	if err != nil {
		return Model{}, ErrInvalidModel
	}
	if _, err := service.repository.Find(ctx, channelID); err != nil {
		return Model{}, err
	}
	return service.repository.CreateModel(ctx, channelID, input)
}

func (service *Service) UpdateModel(ctx context.Context, channelID, id string, input ModelInput) (Model, error) {
	input, err := normalizeModelInput(input)
	if err != nil {
		return Model{}, ErrInvalidModel
	}
	return service.repository.UpdateModel(ctx, channelID, id, input)
}

func (service *Service) DeleteModel(ctx context.Context, channelID, id string) error {
	return service.repository.DeleteModel(ctx, channelID, id)
}

func (service *Service) PublicModels(ctx context.Context, capability string) ([]PublicModel, error) {
	capability = strings.ToLower(strings.TrimSpace(capability))
	if capability != "" && !validCapability(capability) {
		return nil, ErrInvalidModel
	}
	return service.repository.ListPublicModels(ctx, capability)
}

func (service *Service) ResolveImageModel(ctx context.Context, channelID, modelID string) (ResolvedModel, error) {
	return service.ResolveModel(ctx, "image", channelID, modelID)
}
func (service *Service) ResolveModel(ctx context.Context, capability, channelID, modelID string) (ResolvedModel, error) {
	channel, model, err := service.repository.ResolveModel(ctx, capability, channelID, strings.TrimSpace(modelID))
	if err != nil {
		if errors.Is(err, ErrModelNotFound) {
			return ResolvedModel{}, ErrChannelDisabled
		}
		return ResolvedModel{}, err
	}
	apiKey, err := service.cipher.Decrypt(channel.apiKeyCiphertext)
	if err != nil {
		return ResolvedModel{}, err
	}
	definition, _ := FindProtocolDefinition(channel.Protocol)
	channel.AdvancedConfig = normalizeAdvancedConfig(channel.AdvancedConfig, definition)
	if apiKey == "" && channel.AdvancedConfig.AuthMode != "none" {
		return ResolvedModel{}, ErrChannelDisabled
	}
	return ResolvedModel{ChannelID: channel.ID, BaseURL: channel.BaseURL, APIKey: apiKey, Protocol: channel.Protocol, AdvancedConfig: channel.AdvancedConfig, UpstreamModel: model.ModelID, Priority: channel.Priority, Weight: channel.Weight, MaxConcurrency: channel.MaxConcurrency, TimeoutSeconds: channel.TimeoutSeconds, PollIntervalSeconds: channel.AdvancedConfig.PollIntervalSeconds}, nil
}

func (service *Service) TestConnection(ctx context.Context, id string, persistModels bool) (ConnectionResult, error) {
	startedAt := time.Now()
	channel, err := service.repository.Find(ctx, id)
	if err != nil {
		return ConnectionResult{}, err
	}
	apiKey, err := service.cipher.Decrypt(channel.apiKeyCiphertext)
	if err != nil {
		return ConnectionResult{}, err
	}
	definition, ok := FindProtocolDefinition(channel.Protocol)
	if !ok {
		return ConnectionResult{}, ErrInvalidChannel
	}
	models := append([]BuiltInModel{}, definition.BuiltInModels...)
	if len(models) == 0 {
		models, err = service.fetchModels(ctx, channel, apiKey, definition)
	}
	if err != nil {
		message := err.Error()
		_ = service.repository.SaveTestResult(ctx, id, "failed", message)
		_ = service.repository.SaveHealthCheck(ctx, id, false, time.Since(startedAt).Milliseconds(), message)
		return ConnectionResult{Status: "failed", Message: message, DiscoveredModels: []string{}}, nil
	}
	_ = service.repository.SaveHealthCheck(ctx, id, true, time.Since(startedAt).Milliseconds(), "")
	if persistModels && len(models) > 0 {
		if err := service.repository.UpsertDiscoveredModels(ctx, id, models); err != nil {
			return ConnectionResult{}, err
		}
	}
	counts := map[string]int{}
	discovered := make([]string, 0, len(models))
	for _, model := range models {
		counts[model.Capability]++
		discovered = append(discovered, model.ID)
	}
	message := fmt.Sprintf("连接成功，发现 %d 个模型：文本 %d、图片 %d、视频 %d、音频 %d", len(models), counts["text"], counts["image"], counts["video"], counts["audio"])
	if err := service.repository.SaveTestResult(ctx, id, "success", message); err != nil {
		return ConnectionResult{}, err
	}
	return ConnectionResult{Status: "success", Message: message, DiscoveredModels: discovered}, nil
}

func (service *Service) EnsureDefault(ctx context.Context, baseURL, apiKey, modelID string) error {
	channels, err := service.repository.List(ctx)
	if err != nil || len(channels) > 0 || strings.TrimSpace(apiKey) == "" {
		return err
	}
	input, err := normalizeChannelInput(ChannelInput{Name: "默认 OpenAI 渠道", BaseURL: baseURL, Protocol: "openai", APIKey: apiKey, Enabled: true})
	if err != nil {
		return err
	}
	encrypted, err := service.cipher.Encrypt(apiKey)
	if err != nil {
		return err
	}
	channel, err := service.repository.Create(ctx, input, encrypted)
	if err != nil {
		return err
	}
	_, err = service.repository.CreateModel(ctx, channel.ID, ModelInput{ModelID: modelID, DisplayName: modelID, Capability: "image", Enabled: true, SortOrder: 0})
	return err
}

func (service *Service) fetchModels(ctx context.Context, channel Channel, apiKey string, definition ProtocolDefinition) ([]BuiltInModel, error) {
	paths := channel.AdvancedConfig.ModelCatalogPaths
	if len(paths) == 0 {
		paths = definition.ModelCatalogPaths
	}
	if len(paths) == 0 {
		return nil, errors.New("当前协议未配置模型目录，请手工添加模型")
	}
	var body []byte
	var lastStatus int
	for _, path := range paths {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, catalogURL(channel.BaseURL, path), nil)
		if err != nil {
			continue
		}
		applyAuth(request, channel.AdvancedConfig, definition, apiKey)
		response, err := service.client.Do(request)
		if err != nil {
			continue
		}
		lastStatus = response.StatusCode
		body, err = io.ReadAll(io.LimitReader(response.Body, 2<<20))
		response.Body.Close()
		if err == nil && response.StatusCode >= 200 && response.StatusCode < 300 {
			break
		}
		body = nil
	}
	if len(body) == 0 {
		if lastStatus > 0 {
			return nil, fmt.Errorf("上游模型目录返回 HTTP %d", lastStatus)
		}
		return nil, errors.New("无法连接上游模型目录")
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Models []struct {
			ID string `json:"id"`
		} `json:"models"`
	}
	var stableDiffusion []struct {
		Title     string `json:"title"`
		ModelName string `json:"model_name"`
	}
	if json.Unmarshal(body, &payload) != nil && json.Unmarshal(body, &stableDiffusion) != nil {
		return nil, errors.New("上游模型目录格式不正确")
	}
	values := make([]string, 0, len(payload.Data)+len(payload.Models))
	for _, item := range payload.Data {
		values = append(values, item.ID)
	}
	for _, item := range payload.Models {
		values = append(values, item.ID)
	}
	for _, item := range stableDiffusion {
		if item.ModelName != "" {
			values = append(values, item.ModelName)
		} else {
			values = append(values, item.Title)
		}
	}
	values = normalizedModelIDs(values)
	if len(values) == 0 {
		return nil, errors.New("上游模型目录为空")
	}
	models := make([]BuiltInModel, 0, len(values))
	singleCapability := ""
	if definition.Strict && len(definition.Capabilities) == 1 {
		singleCapability = definition.Capabilities[0]
	}
	for _, modelID := range values {
		capability := singleCapability
		if capability == "" {
			capability = inferCapability(modelID)
		}
		models = append(models, BuiltInModel{ID: modelID, Label: modelID, Capability: capability})
	}
	return models, nil
}

func normalizeChannelInput(input ChannelInput) (ChannelInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	input.Protocol = strings.ToLower(strings.TrimSpace(input.Protocol))
	if input.Protocol == "" {
		input.Protocol = "openai"
	}
	definition, ok := FindProtocolDefinition(input.Protocol)
	if !ok {
		return ChannelInput{}, ErrInvalidChannel
	}
	if input.BaseURL == "" {
		input.BaseURL = definition.DefaultBaseURL
	}
	input.AdvancedConfig = normalizeAdvancedConfig(input.AdvancedConfig, definition)
	if input.AdvancedConfig.PollIntervalSeconds > 3600 {
		return ChannelInput{}, ErrInvalidChannel
	}
	if input.Priority <= 0 {
		input.Priority = 100
	}
	if input.Weight <= 0 {
		input.Weight = 100
	}
	if input.MaxConcurrency <= 0 {
		input.MaxConcurrency = 4
	}
	if input.TimeoutSeconds <= 0 {
		input.TimeoutSeconds = 300
	}
	if input.FailureThreshold <= 0 {
		input.FailureThreshold = 3
	}
	if input.CooldownSeconds <= 0 {
		input.CooldownSeconds = 60
	}
	if input.Priority > 10000 || input.Weight > 10000 || input.MaxConcurrency > 1000 || input.TimeoutSeconds > 3600 || input.FailureThreshold > 100 || input.CooldownSeconds > 86400 {
		return ChannelInput{}, ErrInvalidChannel
	}
	parsed, err := url.Parse(input.BaseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || utf8.RuneCountInString(input.Name) < 2 || utf8.RuneCountInString(input.Name) > 80 {
		return ChannelInput{}, ErrInvalidChannel
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".local") || privateIP(net.ParseIP(host)) {
		return ChannelInput{}, ErrInvalidChannel
	}
	return input, nil
}

func normalizeModelInput(input ModelInput) (ModelInput, error) {
	input.ModelID = strings.TrimSpace(input.ModelID)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.Capability = strings.ToLower(strings.TrimSpace(input.Capability))
	if input.DisplayName == "" {
		input.DisplayName = input.ModelID
	}
	if input.Capability == "" {
		input.Capability = inferCapability(input.ModelID)
	}
	if input.Capability == "video" {
		if input.CapabilityConfig.MinDuration <= 0 {
			input.CapabilityConfig.MinDuration = 4
		}
		if input.CapabilityConfig.MaxDuration <= 0 {
			input.CapabilityConfig.MaxDuration = 30
		}
		if input.CapabilityConfig.MinDuration > input.CapabilityConfig.MaxDuration || input.CapabilityConfig.MaxDuration > 3600 || len(input.CapabilityConfig.Ratios) > 30 || len(input.CapabilityConfig.Qualities) > 30 || len(input.CapabilityConfig.Modes) > 10 {
			return ModelInput{}, ErrInvalidModel
		}
	}
	if input.ModelID == "" || utf8.RuneCountInString(input.ModelID) > 120 || utf8.RuneCountInString(input.DisplayName) > 120 || !validCapability(input.Capability) || input.SortOrder < 0 {
		return ModelInput{}, ErrInvalidModel
	}
	return input, nil
}

func decorateChannel(channel *Channel, cipher SecretCipher) {
	if definition, ok := FindProtocolDefinition(channel.Protocol); ok {
		channel.AdvancedConfig = normalizeAdvancedConfig(channel.AdvancedConfig, definition)
	}
	key, err := cipher.Decrypt(channel.apiKeyCiphertext)
	channel.HasAPIKey = err == nil && key != ""
	channel.APIKeyMasked = maskAPIKey(key)
	channel.apiKeyCiphertext = ""
}

func maskAPIKey(key string) string {
	if key == "" {
		return ""
	}
	runes := []rune(key)
	if len(runes) <= 6 {
		return "******"
	}
	return string(runes[:3]) + "••••••" + string(runes[len(runes)-4:])
}

var videoModelPattern = regexp.MustCompile(`(?i)(^|[-_. /])(video|videos|svd|i2v|t2v|ti2v|sora|veo|kling|wan|hailuo|runway|luma|seedance)([-_. /]|$)|vidu`)
var audioModelPattern = regexp.MustCompile(`(?i)(^|[-_. /])(audio|tts|speech|voice|music|sound)([-_. /]|$)|whisper|sensevoice`)
var imageModelPattern = regexp.MustCompile(`(?i)(^|[-_. /])(image|images|img|flux|sdxl|midjourney)([-_. /]|$)|nano[-_. ]?banana|seedream|gpt[-_.]?image|dall[-_.]?e|imagen|stable[-_. ]?diffusion`)

func inferCapability(modelID string) string {
	if videoModelPattern.MatchString(modelID) {
		return "video"
	}
	if audioModelPattern.MatchString(modelID) {
		return "audio"
	}
	if imageModelPattern.MatchString(modelID) {
		return "image"
	}
	return "text"
}

func validCapability(value string) bool {
	return value == "text" || value == "image" || value == "video" || value == "audio"
}

func normalizeAdvancedConfig(input AdvancedConfig, definition ProtocolDefinition) AdvancedConfig {
	defaults := DefaultAdvancedConfig(definition)
	if definition.Strict {
		input.APIFormat = defaults.APIFormat
		input.AuthMode = defaults.AuthMode
		input.ModelCatalogPaths = defaults.ModelCatalogPaths
		input.OperationConfigs = defaults.OperationConfigs
	} else {
		if input.APIFormat == "" {
			input.APIFormat = defaults.APIFormat
		}
		if input.AuthMode == "" {
			input.AuthMode = defaults.AuthMode
		}
		if input.ModelCatalogPaths == nil {
			input.ModelCatalogPaths = defaults.ModelCatalogPaths
		}
	}
	if input.OperationConfigs == nil {
		input.OperationConfigs = defaults.OperationConfigs
	}
	if input.PollIntervalSeconds <= 0 {
		input.PollIntervalSeconds = 5
	}
	return input
}

func catalogURL(baseURL, path string) string {
	base := strings.TrimRight(baseURL, "/")
	path = "/" + strings.TrimLeft(strings.TrimSpace(path), "/")
	if strings.HasSuffix(base, "/v1") && strings.HasPrefix(path, "/v1/") {
		path = strings.TrimPrefix(path, "/v1")
	}
	if strings.HasSuffix(base, "/api/v3") && strings.HasPrefix(path, "/api/v3/") {
		path = strings.TrimPrefix(path, "/api/v3")
	}
	return base + path
}

func applyAuth(request *http.Request, advanced AdvancedConfig, definition ProtocolDefinition, apiKey string) {
	mode := advanced.AuthMode
	if mode == "" {
		mode = definition.AuthMode
	}
	switch mode {
	case "none":
	case "x-api-key":
		request.Header.Set("x-api-key", apiKey)
	case "custom-header":
		header := advanced.AuthHeader
		if header == "" && definition.ID == "gemini" {
			header = "x-goog-api-key"
		}
		if header == "" {
			header = "x-api-key"
		}
		value := apiKey
		if advanced.AuthPrefix != "" {
			value = advanced.AuthPrefix + " " + apiKey
		}
		request.Header.Set(header, value)
	default:
		request.Header.Set("Authorization", "Bearer "+apiKey)
	}
}

func privateIP(ip net.IP) bool {
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast())
}
