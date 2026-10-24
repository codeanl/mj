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
	if selected.BaseURL == "" || selected.APIKey == "" || selected.UpstreamModel == "" {
		return GeneratedImage{}, ErrProviderUnavailable
	}
	payload, err := json.Marshal(map[string]interface{}{
		"model":   selected.UpstreamModel,
		"prompt":  task.Prompt,
		"n":       1,
		"size":    task.providerSize,
		"quality": task.providerQuality,
	})
	if err != nil {
		return GeneratedImage{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(selected.BaseURL, "/")+"/images/generations", bytes.NewReader(payload))
	if err != nil {
		return GeneratedImage{}, err
	}
	request.Header.Set("Authorization", "Bearer "+selected.APIKey)
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
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return GeneratedImage{}, fmt.Errorf("invalid image provider response: %w", err)
	}
	if len(result.Data) == 0 {
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
