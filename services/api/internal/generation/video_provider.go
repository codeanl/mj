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
	"strconv"
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
	if isSpecialVideoMode(task.VideoMode) {
		return provider.createConfiguredMode(ctx, task, selected, references)
	}
	if selected.Protocol != "compshare-minimax-h3" {
		return provider.createConfiguredVideo(ctx, task, selected, references)
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
	if isSpecialVideoMode(task.VideoMode) {
		return provider.queryConfiguredMode(ctx, task, selected)
	}
	if selected.Protocol != "" && selected.Protocol != "compshare-minimax-h3" {
		return provider.queryConfiguredVideo(ctx, task, selected)
	}
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
	if isSpecialVideoMode(task.VideoMode) || selected.Protocol != "compshare-minimax-h3" {
		return provider.cancelConfiguredVideo(ctx, task, selected, configuredVideoOperation(selected, task.VideoMode))
	}
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

func isSpecialVideoMode(mode string) bool {
	return mode == "extend" || mode == "lip_sync" || mode == "edit" || mode == "motion_transfer"
}

func (provider *MiniMaxH3VideoProvider) createConfiguredMode(ctx context.Context, task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage) (GeneratedVideo, error) {
	return provider.createConfiguredOperation(ctx, task, selected, references, configuredVideoOperation(selected, task.VideoMode))
}

func (provider *MiniMaxH3VideoProvider) createConfiguredVideo(ctx context.Context, task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage) (GeneratedVideo, error) {
	operation := configuredVideoOperation(selected, task.VideoMode)
	for _, reference := range references {
		kind := reference.Kind
		if kind == "" {
			kind = strings.SplitN(reference.MimeType, "/", 2)[0]
		}
		if (kind == "image" && !operation.SupportsReferenceImage) || (kind == "video" && !operation.SupportsReferenceVideo) || (kind == "audio" && !operation.SupportsReferenceAudio) {
			return GeneratedVideo{}, ErrInvalidVideoReference
		}
	}
	return provider.createConfiguredOperation(ctx, task, selected, references, operation)
}

func (provider *MiniMaxH3VideoProvider) createConfiguredOperation(ctx context.Context, task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage, operation modelchannels.OperationConfig) (GeneratedVideo, error) {
	if operation.CreatePath == "" || operation.QueryPath == "" {
		return GeneratedVideo{}, ErrProviderUnavailable
	}
	content := make([]map[string]interface{}, 0, len(references)+1)
	if task.Prompt != "" {
		content = append(content, map[string]interface{}{"type": "text", "text": task.Prompt})
	}
	images := make([]string, 0)
	videos := make([]string, 0)
	audios := make([]string, 0)
	imageBase64, imageMimeType := "", ""
	for _, reference := range references {
		kind := reference.Kind
		if kind == "" {
			kind = strings.SplitN(reference.MimeType, "/", 2)[0]
		}
		dataURL := "data:" + reference.MimeType + ";base64," + base64.StdEncoding.EncodeToString(reference.Content)
		content = append(content, map[string]interface{}{"type": kind + "_url", "role": reference.Role, kind + "_url": map[string]string{"url": dataURL}})
		switch kind {
		case "image":
			images = append(images, dataURL)
			if imageBase64 == "" {
				imageBase64 = base64.StdEncoding.EncodeToString(reference.Content)
				imageMimeType = reference.MimeType
			}
		case "video":
			videos = append(videos, dataURL)
		case "audio":
			audios = append(audios, dataURL)
		}
	}
	values := map[string]interface{}{
		"model": selected.UpstreamModel, "operation": task.VideoMode, "prompt": task.Prompt,
		"ratio": task.Size, "resolution": task.Quality, "duration": task.DurationSeconds,
		"generate_audio": task.SoundEnabled, "watermark": task.WatermarkEnabled,
		"content": content, "images": images, "videos": videos, "audios": audios,
		"image": firstString(images), "video": firstString(videos), "audio": firstString(audios),
		"image_base64": imageBase64, "image_mime_type": imageMimeType,
	}
	payload, contentType, err := configuredVideoRequest(task, selected, references, operation, values)
	if err != nil {
		return GeneratedVideo{}, err
	}
	path := replaceTaskPath(operation.CreatePath, selected.UpstreamModel, "")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), payload)
	if err != nil {
		return GeneratedVideo{}, err
	}
	applyProviderAuth(request, selected)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Idempotency-Key", "nova-video:"+task.ID+fmt.Sprintf(":%d", task.retryCount))
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedVideo{}, &ExecutionError{Err: err, Path: path, SafeToRetry: false}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		status := response.StatusCode
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("configured video operation returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status, SafeToRetry: true}
	}
	var value interface{}
	if json.Unmarshal(body, &value) != nil {
		return GeneratedVideo{}, errors.New("configured video operation returned invalid JSON")
	}
	id := firstJSONText(value, "task_id", "id", "name", "data.task_id", "data.id", "data.taskId", "task.id", "metadata.task_id")
	if id == "" {
		return GeneratedVideo{}, errors.New("configured video operation returned no task id")
	}
	return GeneratedVideo{UpstreamTaskID: id, Pending: true}, nil
}

func (provider *MiniMaxH3VideoProvider) queryConfiguredMode(ctx context.Context, task Task, selected modelchannels.ResolvedModel) (GeneratedVideo, error) {
	return provider.queryConfiguredOperation(ctx, task, selected, configuredVideoOperation(selected, task.VideoMode))
}

func (provider *MiniMaxH3VideoProvider) queryConfiguredVideo(ctx context.Context, task Task, selected modelchannels.ResolvedModel) (GeneratedVideo, error) {
	return provider.queryConfiguredOperation(ctx, task, selected, configuredVideoOperation(selected, task.VideoMode))
}

func (provider *MiniMaxH3VideoProvider) queryConfiguredOperation(ctx context.Context, task Task, selected modelchannels.ResolvedModel, operation modelchannels.OperationConfig) (GeneratedVideo, error) {
	if operation.QueryPath == "" {
		return GeneratedVideo{}, ErrProviderUnavailable
	}
	path := replaceTaskPath(operation.QueryPath, selected.UpstreamModel, task.UpstreamTaskID)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), nil)
	if err != nil {
		return GeneratedVideo{}, err
	}
	applyProviderAuth(request, selected)
	response, err := provider.client.Do(request)
	if err != nil {
		return GeneratedVideo{}, &ExecutionError{Err: err, Path: path}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		status := response.StatusCode
		return GeneratedVideo{}, &ExecutionError{Err: fmt.Errorf("configured video query returned status %d: %s", status, providerErrorMessage(body)), Path: path, HTTPStatus: &status}
	}
	var value interface{}
	if json.Unmarshal(body, &value) != nil {
		return GeneratedVideo{}, errors.New("configured video query returned invalid JSON")
	}
	statusField := operation.StatusField
	if statusField == "" {
		statusField = "status"
	}
	status := strings.ToLower(jsonText(value, statusField))
	if status == "" {
		status = strings.ToLower(firstJSONText(value, "task.status", "data.status"))
	}
	if status == "failed" || status == "error" || status == "cancelled" || (status == "true" && firstJSONText(value, "error.message", "error", "message") != "") {
		return GeneratedVideo{Failed: true, Error: firstJSONText(value, "error", "message", "task.error", "data.error")}, nil
	}
	if status != "succeeded" && status != "success" && status != "completed" && status != "done" && status != "true" {
		return GeneratedVideo{UpstreamTaskID: task.UpstreamTaskID, Pending: true}, nil
	}
	resultField := operation.ResultField
	if resultField == "" {
		resultField = "result_url"
	}
	rawURL := configuredResultText(value, resultField)
	if rawURL == "" && strings.HasPrefix(resultField, "/") {
		rawURL = strings.TrimRight(selected.BaseURL, "/") + replaceTaskPath(resultField, selected.UpstreamModel, task.UpstreamTaskID)
	}
	if rawURL == "" {
		rawURL = firstJSONText(value, "video_url", "data.video_url", "result.url", "content.video_url")
	}
	if rawURL == "" {
		return GeneratedVideo{}, errors.New("configured video task completed without result URL")
	}
	return provider.download(ctx, rawURL, selected)
}

func configuredVideoOperation(selected modelchannels.ResolvedModel, mode string) modelchannels.OperationConfig {
	if isSpecialVideoMode(mode) {
		operation := selected.CapabilityConfig.ModeOperations[mode]
		return modelchannels.OperationConfig{CreatePath: operation.CreatePath, QueryPath: operation.QueryPath, CancelPath: operation.CancelPath, CancelMethod: operation.CancelMethod, RequestTemplate: operation.RequestTemplate, ResultField: operation.ResultField, StatusField: operation.StatusField}
	}
	operation := selected.AdvancedConfig.OperationConfigs["video"]
	advanced := selected.AdvancedConfig
	if advanced.CreatePath != "" {
		operation.CreatePath = advanced.CreatePath
	}
	if advanced.ImageToVideoPath != "" && mode != VideoModeText {
		operation.CreatePath = advanced.ImageToVideoPath
	}
	if advanced.QueryPath != "" {
		operation.QueryPath = advanced.QueryPath
	}
	if advanced.CancelPath != "" {
		operation.CancelPath = advanced.CancelPath
	}
	if advanced.CancelMethod != "" {
		operation.CancelMethod = advanced.CancelMethod
	}
	if advanced.RequestTemplate != "" {
		operation.RequestTemplate = advanced.RequestTemplate
	}
	if advanced.ResultField != "" {
		operation.ResultField = advanced.ResultField
	}
	if advanced.StatusField != "" {
		operation.StatusField = advanced.StatusField
	}
	return operation
}

func (provider *MiniMaxH3VideoProvider) cancelConfiguredVideo(ctx context.Context, task Task, selected modelchannels.ResolvedModel, operation modelchannels.OperationConfig) error {
	if operation.CancelPath == "" || task.UpstreamTaskID == "" {
		return ErrProviderUnavailable
	}
	path := replaceTaskPath(operation.CancelPath, selected.UpstreamModel, task.UpstreamTaskID)
	method := strings.ToUpper(operation.CancelMethod)
	if method == "" {
		method = http.MethodPost
	}
	request, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(selected.BaseURL, "/")+"/"+strings.TrimLeft(path, "/"), nil)
	if err != nil {
		return err
	}
	applyProviderAuth(request, selected)
	response, err := provider.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if (response.StatusCode >= 200 && response.StatusCode < 300) || response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return nil
	}
	status := response.StatusCode
	return &ExecutionError{Err: fmt.Errorf("video cancel returned status %d", status), Path: path, HTTPStatus: &status}
}

func replaceTaskPath(path, model, taskID string) string {
	path = strings.ReplaceAll(path, ":model", url.PathEscape(model))
	path = strings.ReplaceAll(path, ":task_path", escapePathSegments(taskID))
	path = strings.ReplaceAll(path, ":task_id", url.PathEscape(taskID))
	return path
}

func escapePathSegments(value string) string {
	parts := strings.Split(strings.Trim(value, "/"), "/")
	for index := range parts {
		parts[index] = url.PathEscape(parts[index])
	}
	return strings.Join(parts, "/")
}

func configuredVideoRequest(task Task, selected modelchannels.ResolvedModel, references []*ReferenceImage, operation modelchannels.OperationConfig, values map[string]interface{}) (io.Reader, string, error) {
	if selected.Protocol == "gemini" {
		instance := map[string]interface{}{"prompt": task.Prompt}
		parameters := map[string]interface{}{"aspectRatio": task.Size, "durationSeconds": task.DurationSeconds, "resolution": task.Quality}
		for _, reference := range references {
			if reference.Kind == "image" || strings.HasPrefix(reference.MimeType, "image/") {
				image := map[string]string{"bytesBase64Encoded": base64.StdEncoding.EncodeToString(reference.Content), "mimeType": reference.MimeType}
				if reference.Role == VideoRoleLastFrame {
					parameters["lastFrame"] = image
				} else if _, exists := instance["image"]; !exists {
					instance["image"] = image
				}
			}
		}
		payload, err := json.Marshal(map[string]interface{}{"instances": []interface{}{instance}, "parameters": parameters})
		return bytes.NewReader(payload), "application/json", err
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(operation.RequestTemplate)), "multipart/form-data") {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		for key, value := range map[string]string{"model": selected.UpstreamModel, "prompt": task.Prompt, "seconds": strconv.Itoa(task.DurationSeconds), "size": task.Size} {
			if value != "" {
				if err := writer.WriteField(key, value); err != nil {
					return nil, "", err
				}
			}
		}
		if len(references) > 0 {
			reference := references[0]
			part, err := writer.CreateFormFile("input_reference", reference.Name)
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
	payload, err := configuredVideoPayload(operation.RequestTemplate, values)
	return bytes.NewReader(payload), "application/json", err
}

func configuredVideoPayload(template string, values map[string]interface{}) ([]byte, error) {
	if strings.TrimSpace(template) == "" {
		return json.Marshal(values)
	}
	var parsed interface{}
	if err := json.Unmarshal([]byte(template), &parsed); err != nil {
		return nil, fmt.Errorf("configured video request template is invalid JSON: %w", err)
	}
	expanded, err := expandVideoTemplate(parsed, values)
	if err != nil {
		return nil, err
	}
	return json.Marshal(expanded)
}

func expandVideoTemplate(value interface{}, values map[string]interface{}) (interface{}, error) {
	switch typed := value.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{}, len(typed))
		for key, child := range typed {
			expanded, err := expandVideoTemplate(child, values)
			if err != nil {
				return nil, err
			}
			result[key] = expanded
		}
		return result, nil
	case []interface{}:
		result := make([]interface{}, len(typed))
		for index, child := range typed {
			expanded, err := expandVideoTemplate(child, values)
			if err != nil {
				return nil, err
			}
			result[index] = expanded
		}
		return result, nil
	case string:
		if strings.HasPrefix(typed, "{{") && strings.HasSuffix(typed, "}}") && strings.Count(typed, "{{") == 1 {
			key := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(typed, "{{"), "}}"))
			if replacement, ok := values[key]; ok {
				return replacement, nil
			}
		}
		result := typed
		for key, replacement := range values {
			placeholder := "{{" + key + "}}"
			if !strings.Contains(result, placeholder) {
				continue
			}
			switch scalar := replacement.(type) {
			case string:
				result = strings.ReplaceAll(result, placeholder, scalar)
			case bool, int, int64, float64:
				result = strings.ReplaceAll(result, placeholder, fmt.Sprint(scalar))
			default:
				return nil, fmt.Errorf("configured video template value %s must occupy the whole JSON field", key)
			}
		}
		if strings.Contains(result, "{{") || strings.Contains(result, "}}") {
			return nil, fmt.Errorf("configured video request template contains an unknown variable")
		}
		return result, nil
	default:
		return value, nil
	}
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func firstJSONText(value interface{}, paths ...string) string {
	for _, path := range paths {
		if text := jsonText(value, path); text != "" {
			return text
		}
	}
	return ""
}

func configuredResultText(value interface{}, field string) string {
	for _, candidate := range strings.Split(field, " / ") {
		if text := jsonText(value, strings.TrimSpace(candidate)); text != "" {
			return text
		}
	}
	return ""
}

func jsonText(value interface{}, path string) string {
	current := value
	for _, part := range strings.Split(path, ".") {
		name, index, hasIndex := strings.Cut(part, "[")
		object, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}
		current = object[name]
		if hasIndex {
			positionText := strings.TrimSuffix(index, "]")
			position, err := strconv.Atoi(positionText)
			array, arrayOK := current.([]interface{})
			if err != nil || !arrayOK || position < 0 || position >= len(array) {
				return ""
			}
			current = array[position]
		}
	}
	switch typed := current.(type) {
	case string:
		return typed
	case bool:
		return strconv.FormatBool(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func (provider *MiniMaxH3VideoProvider) download(ctx context.Context, rawURL string, selected modelchannels.ResolvedModel) (GeneratedVideo, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return GeneratedVideo{}, errors.New("video provider returned invalid content url")
	}
	base, baseErr := url.Parse(selected.BaseURL)
	if !parsed.IsAbs() && baseErr == nil {
		parsed = base.ResolveReference(parsed)
	}
	if parsed.Host == "" || (parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost"))) {
		return GeneratedVideo{}, errors.New("video provider returned invalid content url")
	}
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if baseErr == nil && parsed.Host == base.Host {
		applyProviderAuth(request, selected)
	}
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
