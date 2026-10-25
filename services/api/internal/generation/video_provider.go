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

type GeneratedVideo struct {
	Content        []byte
	MimeType       string
	UpstreamTaskID string
	Pending        bool
	Failed         bool
	Error          string
}
type MiniMaxH3VideoProvider struct {
	client   *http.Client
	maxBytes int64
}

func NewMiniMaxH3VideoProvider(timeout time.Duration, maxBytes int64) *MiniMaxH3VideoProvider {
	return &MiniMaxH3VideoProvider{client: &http.Client{Timeout: timeout}, maxBytes: maxBytes}
}

func (provider *MiniMaxH3VideoProvider) Create(ctx context.Context, task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage) (GeneratedVideo, error) {
	if selected.Protocol != "compshare-minimax-h3" {
		return GeneratedVideo{}, ErrProviderUnavailable
	}
	content := []map[string]interface{}{}
	if task.Prompt != "" {
		content = append(content, map[string]interface{}{"type": "text", "text": task.Prompt})
	}
	for _, reference := range references {
		kind := reference.Kind
		if kind == "" {
			kind = strings.SplitN(reference.MimeType, "/", 2)[0]
		}
		if kind != "image" && kind != "video" && kind != "audio" {
			return GeneratedVideo{}, errors.New("video provider received unsupported reference media")
		}
		role := reference.Role
		if role == "" && kind == "image" {
			role = VideoRoleImage
		}
		field := kind + "_url"
		content = append(content, map[string]interface{}{"type": field, field: map[string]string{"url": "data:" + reference.MimeType + ";base64," + base64.StdEncoding.EncodeToString(reference.Content)}, "role": role})
	}
	payload, _ := json.Marshal(map[string]interface{}{"model": selected.UpstreamModel, "content": content, "resolution": task.Quality, "duration": task.DurationSeconds, "ratio": task.Size, "mute_audio": !task.SoundEnabled, "aigc_watermark": task.WatermarkEnabled})
	path := "/minimax/v2/video_generation"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(selected.BaseURL, "/")+path, bytes.NewReader(payload))
	if err != nil {
		return GeneratedVideo{}, err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Idempotency-Key", "nova-video:"+task.ID+fmt.Sprintf(":%d", task.retryCount))
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("video provider request failed: %w", err), Path: path, SafeToRetry: false}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return GeneratedVideo{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		status := response.StatusCode
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("video provider returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status, SafeToRetry: true}
	}
	var result struct {
		TaskID string `json:"task_id"`
	}
	if json.Unmarshal(body, &result) != nil || result.TaskID == "" {
		return GeneratedVideo{}, errors.New("video provider returned no task_id")
	}
	return GeneratedVideo{UpstreamTaskID: result.TaskID, Pending: true}, nil
}

func (provider *MiniMaxH3VideoProvider) Query(ctx context.Context, task Task, selected modelchannels.ResolvedModel) (GeneratedVideo, error) {
	path := "/minimax/v2/query/video_generation/" + url.PathEscape(task.UpstreamTaskID)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(selected.BaseURL, "/")+path, nil)
	if err != nil {
		return GeneratedVideo{}, err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Accept", "application/json")
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("video query failed: %w", err), Path: path, SafeToRetry: false}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return GeneratedVideo{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		status := response.StatusCode
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("video query returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status, SafeToRetry: false}
	}
	var result struct {
		Task struct {
			Status  string `json:"status"`
			Error   string `json:"error"`
			Content struct {
				URL string `json:"url"`
			} `json:"content"`
		} `json:"task"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return GeneratedVideo{}, err
	}
	switch result.Task.Status {
	case "queued", "running":
		return GeneratedVideo{UpstreamTaskID: task.UpstreamTaskID, Pending: true}, nil
	case "failed", "cancelled":
		return GeneratedVideo{Failed: true, Error: result.Task.Error}, nil
	case "succeeded":
		if result.Task.Content.URL == "" {
			return GeneratedVideo{}, errors.New("video task succeeded without content.url")
		}
		return provider.download(ctx, result.Task.Content.URL, selected)
	default:
		return GeneratedVideo{UpstreamTaskID: task.UpstreamTaskID, Pending: true}, nil
	}
}

func (provider *MiniMaxH3VideoProvider) Cancel(ctx context.Context, task Task, selected modelchannels.ResolvedModel) error {
	if selected.Protocol != "compshare-minimax-h3" || task.UpstreamTaskID == "" {
		return ErrProviderUnavailable
	}
	path := "/minimax/v2/video_generation/" + url.PathEscape(task.UpstreamTaskID)
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, strings.TrimRight(selected.BaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Accept", "application/json")
	response, err := provider.client.Do(request)
	if err != nil {
		return &ExecutionError{Err: fmt.Errorf("video cancel failed: %w", err), Path: path, SafeToRetry: false}
	}
	defer response.Body.Close()
	if (response.StatusCode >= 200 && response.StatusCode < 300) || response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	status := response.StatusCode
	return &ExecutionError{Err: fmt.Errorf("video cancel returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status, SafeToRetry: false}
}

func (provider *MiniMaxH3VideoProvider) download(ctx context.Context, rawURL string, selected modelchannels.ResolvedModel) (GeneratedVideo, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return GeneratedVideo{}, errors.New("video provider returned invalid content url")
	}
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedVideo{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GeneratedVideo{}, fmt.Errorf("video download returned status %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, provider.maxBytes+1))
	if err != nil {
		return GeneratedVideo{}, err
	}
	if int64(len(content)) > provider.maxBytes {
		return GeneratedVideo{}, errors.New("generated video exceeds media limit")
	}
	mimeType := response.Header.Get("Content-Type")
	if strings.Contains(mimeType, ";") {
		mimeType = strings.Split(mimeType, ";")[0]
	}
	if !strings.HasPrefix(mimeType, "video/") {
		mimeType = http.DetectContentType(content)
	}
	if !strings.HasPrefix(mimeType, "video/") {
		return GeneratedVideo{}, errors.New("provider output is not video")
	}
	return GeneratedVideo{Content: content, MimeType: mimeType}, nil
}
