package generation

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"nova-creator-platform/services/api/internal/modelchannels"
)

var ErrProviderUnavailable = errors.New("image generation channel is not configured")

type GeneratedImage struct {
	Content  []byte
	MimeType string
}

type ImageProvider interface {
	Generate(context.Context, Task, modelchannels.ResolvedModel) (GeneratedImage, error)
}

type OpenAIImageProvider struct {
	client   *http.Client
	maxBytes int64
}

func NewOpenAIImageProvider(timeout time.Duration, maxBytes int64) *OpenAIImageProvider {
	return &OpenAIImageProvider{
		client:   &http.Client{Timeout: timeout},
		maxBytes: maxBytes,
	}
}

func (provider *OpenAIImageProvider) Generate(ctx context.Context, task Task, selected modelchannels.ResolvedModel) (GeneratedImage, error) {
	if selected.BaseURL == "" || selected.UpstreamModel == "" || (selected.APIKey == "" && selected.AdvancedConfig.AuthMode != "none") {
		return GeneratedImage{}, ErrProviderUnavailable
	}
	requestBody := map[string]interface{}{"model": selected.UpstreamModel, "prompt": task.Prompt, "n": 1, "size": task.providerSize, "quality": task.providerQuality}
	if selected.Protocol == "stable-diffusion" {
		requestBody = map[string]interface{}{
			"prompt": task.Prompt, "width": task.Width, "height": task.Height, "batch_size": 1,
			"override_settings": map[string]string{"sd_model_checkpoint": selected.UpstreamModel}, "override_settings_restore_afterwards": true,
		}
	}
	payload, err := json.Marshal(requestBody)
	if err != nil {
		return GeneratedImage{}, err
	}
	path := selected.AdvancedConfig.CreatePath
	if path == "" {
		path = "/images/generations"
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), bytes.NewReader(payload))
	if err != nil {
		return GeneratedImage{}, err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Content-Type", "application/json")
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedImage{}, fmt.Errorf("image provider request failed: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, provider.maxBytes*2+1))
	if err != nil {
		return GeneratedImage{}, err
	}
	if int64(len(responseBody)) > provider.maxBytes*2 {
		return GeneratedImage{}, errors.New("image provider response exceeds configured media limit")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GeneratedImage{}, fmt.Errorf("image provider returned status %d: %s", response.StatusCode, providerErrorMessage(responseBody))
	}

	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
		Images []string `json:"images"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return GeneratedImage{}, fmt.Errorf("invalid image provider response: %w", err)
	}
	if len(result.Data) == 0 {
		if len(result.Images) > 0 {
			content, err := base64.StdEncoding.DecodeString(result.Images[0])
			if err != nil {
				return GeneratedImage{}, fmt.Errorf("invalid stable diffusion image output: %w", err)
			}
			return detectGeneratedImage(content)
		}
		return GeneratedImage{}, errors.New("image provider returned no output")
	}
	if result.Data[0].B64JSON != "" {
		content, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
		if err != nil {
			return GeneratedImage{}, fmt.Errorf("invalid base64 image output: %w", err)
		}
		if int64(len(content)) > provider.maxBytes {
			return GeneratedImage{}, errors.New("generated image exceeds configured media limit")
		}
		return detectGeneratedImage(content)
	}
	if result.Data[0].URL == "" {
		return GeneratedImage{}, errors.New("image provider returned neither b64_json nor url")
	}
	return provider.download(ctx, result.Data[0].URL, selected)
}

func applyProviderAuth(request *http.Request, selected modelchannels.ResolvedModel) {
	switch selected.AdvancedConfig.AuthMode {
	case "none":
	case "x-api-key":
		request.Header.Set("x-api-key", selected.APIKey)
	case "custom-header":
		header := selected.AdvancedConfig.AuthHeader
		if header == "" {
			header = "x-api-key"
		}
		value := selected.APIKey
		if selected.AdvancedConfig.AuthPrefix != "" {
			value = selected.AdvancedConfig.AuthPrefix + " " + value
		}
		request.Header.Set(header, value)
	default:
		request.Header.Set("Authorization", "Bearer "+selected.APIKey)
	}
}

func (provider *OpenAIImageProvider) download(ctx context.Context, rawURL string, selected modelchannels.ResolvedModel) (GeneratedImage, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme != "https" || parsedURL.Host == "" {
		return GeneratedImage{}, errors.New("image provider returned an invalid output URL")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return GeneratedImage{}, err
	}
	baseURL, _ := url.Parse(selected.BaseURL)
	if baseURL != nil && strings.EqualFold(baseURL.Hostname(), parsedURL.Hostname()) {
		request.Header.Set("Authorization", "Bearer "+selected.APIKey)
	}
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedImage{}, fmt.Errorf("generated image download failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GeneratedImage{}, fmt.Errorf("generated image download returned status %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, provider.maxBytes+1))
	if err != nil {
		return GeneratedImage{}, err
	}
	if int64(len(content)) > provider.maxBytes {
		return GeneratedImage{}, errors.New("generated image exceeds configured media limit")
	}
	return detectGeneratedImage(content)
}

func detectGeneratedImage(content []byte) (GeneratedImage, error) {
	if len(content) == 0 {
		return GeneratedImage{}, errors.New("generated image is empty")
	}
	mimeType := http.DetectContentType(content)
	if !strings.HasPrefix(mimeType, "image/") {
		return GeneratedImage{}, errors.New("provider output is not an image")
	}
	return GeneratedImage{Content: content, MimeType: mimeType}, nil
}

func providerErrorMessage(body []byte) string {
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &payload) == nil {
		if payload.Error.Message != "" {
			return payload.Error.Message
		}
		if payload.Message != "" {
			return payload.Message
		}
	}
	return "upstream request failed"
}
