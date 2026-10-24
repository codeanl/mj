package modelchannels

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
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
	if err != nil || strings.TrimSpace(input.APIKey) == "" {
		return Channel{}, ErrInvalidChannel
	}
	encrypted, err := service.cipher.Encrypt(strings.TrimSpace(input.APIKey))
	if err != nil {
		return Channel{}, err
	}
	channel, err := service.repository.Create(ctx, input, encrypted)
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

func (service *Service) PublicModels(ctx context.Context) ([]PublicModel, error) {
	return service.repository.ListPublicModels(ctx)
}

func (service *Service) ResolveImageModel(ctx context.Context, channelID, modelID string) (ResolvedModel, error) {
	channel, model, err := service.repository.ResolveImageModel(ctx, channelID, strings.TrimSpace(modelID))
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
	if apiKey == "" {
		return ResolvedModel{}, ErrChannelDisabled
	}
	return ResolvedModel{ChannelID: channel.ID, BaseURL: channel.BaseURL, APIKey: apiKey, Protocol: channel.Protocol, UpstreamModel: model.ModelID}, nil
}

func (service *Service) TestConnection(ctx context.Context, id string, persistModels bool) (ConnectionResult, error) {
	channel, err := service.repository.Find(ctx, id)
	if err != nil {
		return ConnectionResult{}, err
	}
	apiKey, err := service.cipher.Decrypt(channel.apiKeyCiphertext)
	if err != nil {
		return ConnectionResult{}, err
	}
	models, err := service.fetchModels(ctx, channel.BaseURL, apiKey)
	if err != nil {
		message := err.Error()
		_ = service.repository.SaveTestResult(ctx, id, "failed", message)
		return ConnectionResult{Status: "failed", Message: message, DiscoveredModels: []string{}}, nil
	}
	imageModels := make([]string, 0)
	for _, modelID := range models {
		if imageModelID(modelID) {
			imageModels = append(imageModels, modelID)
		}
	}
	if persistModels && len(imageModels) > 0 {
		if err := service.repository.UpsertDiscoveredModels(ctx, id, imageModels); err != nil {
			return ConnectionResult{}, err
		}
	}
	message := fmt.Sprintf("连接成功，发现 %d 个模型，其中 %d 个图片模型", len(models), len(imageModels))
	if err := service.repository.SaveTestResult(ctx, id, "success", message); err != nil {
		return ConnectionResult{}, err
	}
	return ConnectionResult{Status: "success", Message: message, DiscoveredModels: imageModels}, nil
}

func (service *Service) EnsureDefault(ctx context.Context, baseURL, apiKey, modelID string) error {
	channels, err := service.repository.List(ctx)
	if err != nil || len(channels) > 0 || strings.TrimSpace(apiKey) == "" {
		return err
	}
	input, err := normalizeChannelInput(ChannelInput{Name: "默认 OpenAI 图片渠道", BaseURL: baseURL, Protocol: "openai", APIKey: apiKey, Enabled: true})
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

func (service *Service) fetchModels(ctx context.Context, baseURL, apiKey string) ([]string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/models", nil)
	if err != nil {
		return nil, ErrInvalidChannel
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := service.client.Do(request)
	if err != nil {
		return nil, errors.New("无法连接上游模型目录")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return nil, errors.New("无法读取上游模型目录")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("上游模型目录返回 HTTP %d", response.StatusCode)
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Models []struct {
			ID string `json:"id"`
		} `json:"models"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return nil, errors.New("上游模型目录格式不正确")
	}
	values := make([]string, 0, len(payload.Data)+len(payload.Models))
	for _, item := range payload.Data {
		values = append(values, item.ID)
	}
	for _, item := range payload.Models {
		values = append(values, item.ID)
	}
	values = normalizedModelIDs(values)
	if len(values) == 0 {
		return nil, errors.New("上游模型目录为空")
	}
	return values, nil
}

func normalizeChannelInput(input ChannelInput) (ChannelInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	input.Protocol = strings.ToLower(strings.TrimSpace(input.Protocol))
	if input.Protocol == "" {
		input.Protocol = "openai"
	}
	parsed, err := url.Parse(input.BaseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || input.Protocol != "openai" || utf8.RuneCountInString(input.Name) < 2 || utf8.RuneCountInString(input.Name) > 80 {
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
		input.Capability = "image"
	}
	if input.ModelID == "" || utf8.RuneCountInString(input.ModelID) > 120 || utf8.RuneCountInString(input.DisplayName) > 120 || input.Capability != "image" || input.SortOrder < 0 {
		return ModelInput{}, ErrInvalidModel
	}
	return input, nil
}

func decorateChannel(channel *Channel, cipher SecretCipher) {
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

func imageModelID(modelID string) bool {
	value := strings.ToLower(modelID)
	return strings.Contains(value, "image") || strings.Contains(value, "dall") || strings.Contains(value, "flux") || strings.Contains(value, "sdxl") || strings.Contains(value, "seedream")
}

func privateIP(ip net.IP) bool {
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast())
}
