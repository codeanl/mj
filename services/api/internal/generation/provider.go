package generation

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"nova-creator-platform/services/api/internal/modelchannels"
)

var ErrProviderUnavailable = errors.New("image generation channel is not configured")

type GeneratedImage struct {
	Content        []byte
	MimeType       string
	UpstreamTaskID string
	QueryPath      string
	Pending        bool
}

type ExecutionError struct {
	Err         error
	Path        string
	HTTPStatus  *int
	SafeToRetry bool
}

func (err *ExecutionError) Error() string { return err.Err.Error() }
func (err *ExecutionError) Unwrap() error { return err.Err }

type ImageProvider interface {
	Generate(context.Context, Task, modelchannels.ResolvedModel, []*ReferenceImage) (GeneratedImage, error)
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

func (provider *OpenAIImageProvider) Generate(ctx context.Context, task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage) (GeneratedImage, error) {
	if selected.BaseURL == "" || selected.UpstreamModel == "" || (selected.APIKey == "" && selected.AdvancedConfig.AuthMode != "none") {
		return GeneratedImage{}, ErrProviderUnavailable
	}
	operation := imageOperation(selected.AdvancedConfig)
	requestBody := map[string]interface{}{"model": selected.UpstreamModel, "prompt": task.Prompt, "n": 1, "size": task.providerSize, "quality": task.providerQuality}
	if selected.Protocol == "stable-diffusion" {
		requestBody = map[string]interface{}{
			"prompt": task.Prompt, "width": task.Width, "height": task.Height, "batch_size": 1,
			"override_settings": map[string]string{"sd_model_checkpoint": selected.UpstreamModel}, "override_settings_restore_afterwards": true,
		}
	}
	path := operation.CreatePath
	if path == "" {
		path = "/images/generations"
	}
	contentType := "application/json"
	var body io.Reader
	if len(references) > 0 {
		if !operation.SupportsReferenceImage {
			return GeneratedImage{}, errors.New("selected image protocol does not support reference images")
		}
		switch selected.Protocol {
		case "stable-diffusion":
			requestBody["init_images"] = referenceBase64Values(references, false)
			if operation.EditPath != "" {
				path = operation.EditPath
			}
		case "sub2api":
			requestBody["image_urls"] = referenceBase64Values(references, true)
		case "yumeng":
			requestBody["reference_images"] = referenceBase64Values(references, true)
			if operation.EditPath != "" {
				path = operation.EditPath
			}
		default:
			multipartBody, multipartType, err := buildImageEditMultipart(task, selected.UpstreamModel, references)
			if err != nil {
				return GeneratedImage{}, err
			}
			body = multipartBody
			contentType = multipartType
			if operation.EditPath != "" {
				path = operation.EditPath
			} else {
				path = "/images/edits"
			}
		}
	}
	if body == nil {
		payload, err := json.Marshal(requestBody)
		if err != nil {
			return GeneratedImage{}, err
		}
		body = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), body)
	if err != nil {
		return GeneratedImage{}, err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Content-Type", contentType)
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedImage{}, &ExecutionError{Err: fmt.Errorf("image provider request failed: %w", err), Path: path, SafeToRetry: false}
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
		status := response.StatusCode
		return GeneratedImage{}, &ExecutionError{Err: fmt.Errorf("image provider returned status %d: %s", status, providerErrorMessage(responseBody)), Path: path, HTTPStatus: &status, SafeToRetry: true}
	}

	return provider.parseResponse(ctx, responseBody, selected, operation.QueryPath)
}

func (provider *OpenAIImageProvider) parseResponse(ctx context.Context, responseBody []byte, selected modelchannels.ResolvedModel, queryPath string) (GeneratedImage, error) {
	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
		Images []string `json:"images"`
		ID     string   `json:"id"`
		TaskID string   `json:"task_id"`
		Status string   `json:"status"`
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
		upstreamID := result.TaskID
		if upstreamID == "" {
			upstreamID = result.ID
		}
		if strings.EqualFold(result.Status, "failed") || strings.EqualFold(result.Status, "error") || strings.EqualFold(result.Status, "cancelled") {
			return GeneratedImage{}, &ExecutionError{Err: fmt.Errorf("upstream task ended with status %s", result.Status), Path: queryPath, SafeToRetry: false}
		}
		if upstreamID != "" && queryPath != "" {
			return GeneratedImage{UpstreamTaskID: upstreamID, QueryPath: queryPath, Pending: true}, nil
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

func (provider *OpenAIImageProvider) Query(ctx context.Context, task Task, selected modelchannels.ResolvedModel) (GeneratedImage, error) {
	if task.UpstreamTaskID == "" || task.UpstreamQueryPath == "" {
		return GeneratedImage{}, errors.New("upstream task query contract is missing")
	}
	path := strings.ReplaceAll(task.UpstreamQueryPath, ":task_id", url.PathEscape(task.UpstreamTaskID))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), nil)
	if err != nil {
		return GeneratedImage{}, err
	}
	applyProviderAuth(request, selected)
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedImage{}, &ExecutionError{Err: fmt.Errorf("upstream task query failed: %w", err), Path: path, SafeToRetry: false}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, provider.maxBytes*2+1))
	if err != nil {
		return GeneratedImage{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		status := response.StatusCode
		return GeneratedImage{}, &ExecutionError{Err: fmt.Errorf("upstream task query returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status, SafeToRetry: false}
	}
	return provider.parseResponse(ctx, body, selected, task.UpstreamQueryPath)
}

func (provider *OpenAIImageProvider) DownloadResult(ctx context.Context, rawURL string, selected modelchannels.ResolvedModel) (GeneratedImage, error) {
	return provider.download(ctx, rawURL, selected)
}

func imageOperation(advanced modelchannels.AdvancedConfig) modelchannels.OperationConfig {
	operation := advanced.OperationConfigs["image"]
	if advanced.CreatePath != "" {
		operation.CreatePath = advanced.CreatePath
	}
	if advanced.EditPath != "" {
		operation.EditPath = advanced.EditPath
	}
	if advanced.SupportsReferenceImage {
		operation.SupportsReferenceImage = true
	}
	return operation
}

func referenceBase64Values(references []*ReferenceImage, dataURL bool) []string {
	values := make([]string, 0, len(references))
	for _, reference := range references {
		value := base64.StdEncoding.EncodeToString(reference.Content)
		if dataURL {
			value = "data:" + reference.MimeType + ";base64," + value
		}
		values = append(values, value)
	}
	return values
}

func buildImageEditMultipart(task Task, model string, references []*ReferenceImage) (*bytes.Buffer, string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	fields := map[string]string{
		"model": model, "prompt": task.Prompt, "n": "1", "size": task.providerSize, "quality": task.providerQuality,
	}
	for name, value := range fields {
		if value != "" {
			if err := writer.WriteField(name, value); err != nil {
				return nil, "", err
			}
		}
	}
	for index, reference := range references {
		name := filepath.Base(reference.Name)
		if name == "." || name == "" {
			name = fmt.Sprintf("reference-%d.png", index+1)
		}
		part, err := writer.CreateFormFile("image", name)
		if err != nil {
			return nil, "", err
		}
		if _, err := part.Write(reference.Content); err != nil {
			return nil, "", err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return body, writer.FormDataContentType(), nil
}

func applyProviderAuth(request *http.Request, selected modelchannels.ResolvedModel) {
	switch selected.AdvancedConfig.AuthMode {
	case "none":
	case "x-api-key":
		request.Header.Set("x-api-key", selected.APIKey)
	case "x-goog-api-key":
		request.Header.Set("x-goog-api-key", selected.APIKey)
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
