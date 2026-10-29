package generation

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"strings"
	"time"

	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/modelchannels"
)

type Worker struct {
	repository    *Repository
	provider      ImageProvider
	videoProvider *MiniMaxH3VideoProvider
	channels      *modelchannels.Service
	storage       *assets.LocalStorage
	logger        *slog.Logger
	interval      time.Duration
	stale         time.Duration
}

func NewWorker(repository *Repository, provider ImageProvider, videoProvider *MiniMaxH3VideoProvider, channels *modelchannels.Service, storage *assets.LocalStorage, logger *slog.Logger, interval, stale time.Duration) *Worker {
	return &Worker{repository: repository, provider: provider, videoProvider: videoProvider, channels: channels, storage: storage, logger: logger, interval: interval, stale: stale}
}

func (worker *Worker) Run(ctx context.Context) {
	worker.logger.Info("generation worker started", "interval", worker.interval.String())
	if err := worker.repository.RecoverPollingTasks(ctx); err != nil {
		worker.logger.Error("failed to recover video polling tasks", "error", err)
	}
	worker.runAvailable(ctx)
	ticker := time.NewTicker(worker.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			worker.logger.Info("generation worker stopped")
			return
		case <-ticker.C:
			worker.runAvailable(ctx)
		}
	}
}

func (worker *Worker) runAvailable(ctx context.Context) {
	if err := worker.repository.RequeueStale(ctx, time.Now().Add(-worker.stale)); err != nil {
		worker.logger.Error("failed to recover stale generation tasks", "error", err)
		return
	}
	for {
		task, found, err := worker.repository.ClaimNext(ctx, time.Now().Add(worker.stale))
		if err != nil {
			worker.logger.Error("failed to claim generation task", "error", err)
			return
		}
		if !found {
			return
		}
		worker.process(ctx, task)
	}
}

func (worker *Worker) process(ctx context.Context, task Task) {
	if task.Kind == "video" {
		worker.processVideo(ctx, task)
		return
	}
	candidates, err := worker.channels.ResolveImageCandidates(ctx, task.Model)
	if err != nil {
		worker.fail(ctx, task, fmt.Errorf("generation channel unavailable: %w", err))
		return
	}
	var references []*ReferenceImage
	if len(task.ReferenceAssetIDs) > 0 {
		storedReferences, err := worker.repository.GetReferences(ctx, task)
		if err != nil {
			worker.fail(ctx, task, fmt.Errorf("reference image unavailable: %w", err))
			return
		}
		references = make([]*ReferenceImage, 0, len(storedReferences))
		for _, stored := range storedReferences {
			file, err := worker.storage.Open(stored.StorageKey)
			if err != nil {
				worker.fail(ctx, task, fmt.Errorf("reference image storage unavailable: %w", err))
				return
			}
			content, readErr := io.ReadAll(file)
			closeErr := file.Close()
			if readErr != nil || closeErr != nil || len(content) == 0 || !strings.HasPrefix(stored.MimeType, "image/") {
				worker.fail(ctx, task, errors.New("reference image content is invalid"))
				return
			}
			references = append(references, &ReferenceImage{Content: content, MimeType: stored.MimeType, Name: stored.OriginalName, Kind: stored.Kind, Role: stored.Role})
		}
	}
	var generated GeneratedImage
	var latestErr error
	for _, candidate := range candidates {
		acquired, acquireErr := worker.channels.TryAcquire(ctx, candidate.ChannelID)
		if acquireErr != nil {
			latestErr = acquireErr
			continue
		}
		if !acquired {
			continue
		}
		_ = worker.repository.SetChannel(ctx, task.ID, candidate.ChannelID)
		path := imageOperation(candidate.AdvancedConfig).CreatePath
		if len(references) > 0 && imageOperation(candidate.AdvancedConfig).EditPath != "" {
			path = imageOperation(candidate.AdvancedConfig).EditPath
		}
		attemptID, _, attemptErr := worker.repository.StartAttempt(ctx, task.ID, candidate.ChannelID, candidate.Protocol, path)
		if attemptErr != nil {
			_ = worker.channels.Release(ctx, candidate.ChannelID, false, 0, attemptErr.Error())
			latestErr = attemptErr
			continue
		}
		started := time.Now()
		requestCtx, cancel := context.WithTimeout(ctx, time.Duration(candidate.TimeoutSeconds)*time.Second)
		generated, err = worker.provider.Generate(requestCtx, task, candidate, references)
		cancel()
		duration := time.Since(started).Milliseconds()
		if err == nil {
			if generated.Pending {
				_ = worker.repository.FinishAttempt(ctx, attemptID, "pending", nil, duration, "")
				_ = worker.channels.Release(ctx, candidate.ChannelID, true, duration, "")
				_ = worker.repository.MarkNeedsReview(ctx, task, generated.UpstreamTaskID, generated.QueryPath, "上游任务已提交，请检查状态")
				return
			}
			_ = worker.repository.FinishAttempt(ctx, attemptID, "succeeded", nil, duration, "")
			_ = worker.channels.Release(ctx, candidate.ChannelID, true, duration, "")
			break
		}
		latestErr = err
		var executionErr *ExecutionError
		httpStatus := (*int)(nil)
		safe := false
		if errors.As(err, &executionErr) {
			httpStatus = executionErr.HTTPStatus
			safe = executionErr.SafeToRetry
		}
		status := "failed"
		if !safe {
			status = "unknown"
		}
		_ = worker.repository.FinishAttempt(ctx, attemptID, status, httpStatus, duration, err.Error())
		_ = worker.channels.Release(ctx, candidate.ChannelID, false, duration, err.Error())
		if !safe {
			_ = worker.repository.MarkNeedsReview(ctx, task, "", "", "上游提交结果未知，请检查状态或联系管理员")
			return
		}
	}
	if latestErr != nil && len(generated.Content) == 0 {
		worker.fail(ctx, task, latestErr)
		return
	}
	if len(generated.Content) == 0 {
		worker.fail(ctx, task, ErrProviderUnavailable)
		return
	}
	_, extension, ok := assets.ParseMediaType(generated.MimeType)
	if !ok {
		worker.fail(ctx, task, errors.New("provider returned unsupported image content"))
		return
	}
	imageConfig, _, err := image.DecodeConfig(bytes.NewReader(generated.Content))
	if err != nil {
		worker.fail(ctx, task, fmt.Errorf("generated image decode failed: %w", err))
		return
	}
	if imageConfig.Width != task.Width || imageConfig.Height != task.Height {
		worker.fail(ctx, task, fmt.Errorf("generated image dimensions %dx%d do not match requested %dx%d", imageConfig.Width, imageConfig.Height, task.Width, task.Height))
		return
	}
	storageKey := task.AssetID + extension
	if err := worker.storage.Save(storageKey, bytes.NewReader(generated.Content)); err != nil {
		worker.fail(ctx, task, fmt.Errorf("generated image storage failed: %w", err))
		return
	}
	asset := CompletedAsset{
		StorageKey: storageKey, OriginalName: task.AssetID + extension, MimeType: generated.MimeType,
		SizeBytes: int64(len(generated.Content)), Width: imageConfig.Width, Height: imageConfig.Height,
	}
	if err := worker.repository.Complete(ctx, task, asset); err != nil {
		_ = worker.storage.Delete(storageKey)
		worker.fail(ctx, task, fmt.Errorf("generation result persistence failed: %w", err))
		return
	}
	worker.logger.Info("generation task completed", "task_id", task.ID, "asset_id", task.AssetID)
}

func (worker *Worker) processVideo(ctx context.Context, task Task) {
	if task.UpstreamTaskID != "" {
		worker.pollVideo(ctx, task)
		return
	}
	candidates, err := worker.channels.ResolveCandidates(ctx, "video", task.Model)
	if err != nil {
		worker.fail(ctx, task, err)
		return
	}
	var references []*ReferenceImage
	if len(task.ReferenceAssetIDs) > 0 {
		stored, err := worker.repository.GetReferences(ctx, task)
		if err != nil {
			worker.fail(ctx, task, err)
			return
		}
		for _, item := range stored {
			file, err := worker.storage.Open(item.StorageKey)
			if err != nil {
				worker.fail(ctx, task, err)
				return
			}
			content, readErr := io.ReadAll(file)
			file.Close()
			if readErr != nil {
				worker.fail(ctx, task, readErr)
				return
			}
			references = append(references, &ReferenceImage{Content: content, MimeType: item.MimeType, Name: item.OriginalName, Kind: item.Kind, Role: item.Role})
		}
	}
	var latest error
	for _, candidate := range candidates {
		acquired, _ := worker.channels.TryAcquire(ctx, candidate.ChannelID)
		if !acquired {
			continue
		}
		_ = worker.repository.SetChannel(ctx, task.ID, candidate.ChannelID)
		operation := configuredVideoOperation(candidate, task.VideoMode)
		createPath := operation.CreatePath
		if candidate.Protocol == "compshare-minimax-h3" && createPath == "" {
			createPath = "/minimax/v2/video_generation"
		}
		attemptID, _, err := worker.repository.StartAttempt(ctx, task.ID, candidate.ChannelID, candidate.Protocol, createPath)
		if err != nil {
			_ = worker.channels.Release(ctx, candidate.ChannelID, false, 0, err.Error())
			latest = err
			continue
		}
		started := time.Now()
		requestCtx, cancel := context.WithTimeout(ctx, time.Duration(candidate.TimeoutSeconds)*time.Second)
		result, err := worker.videoProvider.Create(requestCtx, task, candidate, references)
		cancel()
		duration := time.Since(started).Milliseconds()
		if err == nil && result.Pending {
			_ = worker.repository.FinishAttempt(ctx, attemptID, "pending", nil, duration, "")
			_ = worker.channels.Release(ctx, candidate.ChannelID, true, duration, "")
			queryPath := operation.QueryPath
			if candidate.Protocol == "compshare-minimax-h3" && queryPath == "" {
				queryPath = "/minimax/v2/query/video_generation/:task_id"
			}
			_ = worker.repository.MarkPolling(ctx, task, result.UpstreamTaskID, queryPath, time.Now().Add(time.Duration(candidate.PollIntervalSeconds)*time.Second))
			return
		}
		latest = err
		var executionErr *ExecutionError
		safe := false
		var status *int
		if errors.As(err, &executionErr) {
			safe = executionErr.SafeToRetry
			status = executionErr.HTTPStatus
		}
		attemptStatus := "failed"
		if !safe {
			attemptStatus = "unknown"
		}
		_ = worker.repository.FinishAttempt(ctx, attemptID, attemptStatus, status, duration, err.Error())
		_ = worker.channels.Release(ctx, candidate.ChannelID, false, duration, err.Error())
		if !safe {
			_ = worker.repository.MarkNeedsReview(ctx, task, "", "", "视频提交结果未知，请检查状态")
			return
		}
	}
	if latest == nil {
		latest = ErrProviderUnavailable
	}
	worker.fail(ctx, task, latest)
}

func (worker *Worker) pollVideo(ctx context.Context, task Task) {
	selected, err := worker.channels.ResolveModel(ctx, "video", task.ChannelID, task.Model)
	if err != nil {
		_ = worker.repository.MarkNeedsReview(ctx, task, task.UpstreamTaskID, task.UpstreamQueryPath, "原视频渠道配置不可用，请管理员检查")
		return
	}
	nextPollAt := func() time.Time {
		return time.Now().Add(time.Duration(selected.PollIntervalSeconds) * time.Second)
	}
	acquired, err := worker.channels.TryAcquirePinned(ctx, selected.ChannelID)
	if err != nil || !acquired {
		_ = worker.repository.SchedulePoll(ctx, task.ID, nextPollAt(), "")
		return
	}
	path := strings.ReplaceAll(task.UpstreamQueryPath, ":task_id", task.UpstreamTaskID)
	attemptID, _, err := worker.repository.StartAttempt(ctx, task.ID, selected.ChannelID, selected.Protocol, path)
	if err != nil {
		_ = worker.channels.Release(ctx, selected.ChannelID, false, 0, err.Error())
		_ = worker.repository.SchedulePoll(ctx, task.ID, nextPollAt(), "")
		return
	}
	started := time.Now()
	requestCtx, cancel := context.WithTimeout(ctx, time.Duration(selected.TimeoutSeconds)*time.Second)
	result, queryErr := worker.videoProvider.Query(requestCtx, task, selected)
	cancel()
	duration := time.Since(started).Milliseconds()
	if queryErr != nil {
		var executionErr *ExecutionError
		var httpStatus *int
		confirmedFailure := false
		if errors.As(queryErr, &executionErr) {
			httpStatus = executionErr.HTTPStatus
			confirmedFailure = httpStatus != nil && (*httpStatus == 400 || *httpStatus == 404 || *httpStatus == 410)
		}
		attemptStatus := "unknown"
		if confirmedFailure {
			attemptStatus = "failed"
		}
		_ = worker.repository.FinishAttempt(ctx, attemptID, attemptStatus, httpStatus, duration, queryErr.Error())
		_ = worker.channels.Release(ctx, selected.ChannelID, false, duration, queryErr.Error())
		if confirmedFailure {
			worker.fail(ctx, task, queryErr)
		} else {
			_ = worker.repository.SchedulePoll(ctx, task.ID, nextPollAt(), "")
		}
		return
	}
	if result.Pending {
		_ = worker.repository.FinishAttempt(ctx, attemptID, "pending", nil, duration, "")
		_ = worker.channels.Release(ctx, selected.ChannelID, true, duration, "")
		_ = worker.repository.SchedulePoll(ctx, task.ID, nextPollAt(), "")
		return
	}
	if result.Failed {
		_ = worker.repository.FinishAttempt(ctx, attemptID, "failed", nil, duration, result.Error)
		_ = worker.channels.Release(ctx, selected.ChannelID, true, duration, "")
		worker.fail(ctx, task, errors.New(result.Error))
		return
	}
	_ = worker.repository.FinishAttempt(ctx, attemptID, "succeeded", nil, duration, "")
	_ = worker.channels.Release(ctx, selected.ChannelID, true, duration, "")
	if err := worker.persistVideo(ctx, task, result); err != nil {
		if errors.Is(err, ErrTaskNotActive) {
			return
		}
		worker.fail(ctx, task, err)
		return
	}
	worker.logger.Info("video generation task completed", "task_id", task.ID, "asset_id", task.AssetID)
}

func (worker *Worker) persistVideo(ctx context.Context, task Task, result GeneratedVideo) error {
	_, extension, ok := assets.ParseMediaType(result.MimeType)
	if !ok {
		return errors.New("provider returned unsupported video content")
	}
	storageKey := task.AssetID + extension
	if err := worker.storage.Save(storageKey, bytes.NewReader(result.Content)); err != nil {
		return fmt.Errorf("generated video storage failed: %w", err)
	}
	duration := float64(task.DurationSeconds)
	asset := CompletedAsset{StorageKey: storageKey, OriginalName: storageKey, MimeType: result.MimeType, SizeBytes: int64(len(result.Content)), DurationSeconds: &duration}
	if err := worker.repository.Complete(ctx, task, asset); err != nil {
		_ = worker.storage.Delete(storageKey)
		return fmt.Errorf("video result persistence failed: %w", err)
	}
	return nil
}

func (worker *Worker) fail(ctx context.Context, task Task, err error) {
	message := publicGenerationError(err, task.Kind)
	if persistErr := worker.repository.Fail(ctx, task, message); persistErr != nil {
		worker.logger.Error("failed to persist generation failure", "task_id", task.ID, "error", persistErr)
	}
	worker.logger.Error("generation task failed", "task_id", task.ID, "error", err)
}

func publicGenerationError(err error, kind string) string {
	if errors.Is(err, ErrProviderUnavailable) {
		return "当前模型渠道不可用，请稍后重试"
	}
	var executionErr *ExecutionError
	if errors.As(err, &executionErr) {
		if executionErr.HTTPStatus != nil {
			return fmt.Sprintf("上游生成服务暂时不可用（HTTP %d）", *executionErr.HTTPStatus)
		}
		return "上游提交结果未知，请联系管理员检查任务执行记录"
	}
	if strings.Contains(err.Error(), "dimensions") {
		return "生成结果尺寸不符合要求，请重试"
	}
	if kind == "video" {
		return "视频生成失败，请重试"
	}
	return "图片生成失败，请重试"
}
