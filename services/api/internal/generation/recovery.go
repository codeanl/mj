package generation

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"

	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/modelchannels"
)

var ErrNotReviewable = errors.New("generation task is not waiting for review")

type RecoveryService struct {
	repository    *Repository
	provider      *OpenAIImageProvider
	videoProvider *MiniMaxH3VideoProvider
	channels      *modelchannels.Service
	storage       *assets.LocalStorage
}

func NewRecoveryService(repository *Repository, provider *OpenAIImageProvider, videoProvider *MiniMaxH3VideoProvider, channels *modelchannels.Service, storage *assets.LocalStorage) *RecoveryService {
	return &RecoveryService{repository: repository, provider: provider, videoProvider: videoProvider, channels: channels, storage: storage}
}

func (service *RecoveryService) Check(ctx context.Context, userID, taskID string) (Task, error) {
	task, err := service.repository.Get(ctx, userID, taskID)
	if err != nil {
		return Task{}, err
	}
	return service.check(ctx, task)
}

func (service *RecoveryService) CheckAdmin(ctx context.Context, taskID string) (Task, error) {
	task, err := service.repository.GetByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	return service.check(ctx, task)
}

func (service *RecoveryService) CancelUpstream(ctx context.Context, userID, taskID string) error {
	task, err := service.repository.Get(ctx, userID, taskID)
	if err != nil {
		return err
	}
	return service.cancelUpstream(ctx, task)
}

func (service *RecoveryService) CancelUpstreamAdmin(ctx context.Context, taskID string) error {
	task, err := service.repository.GetByID(ctx, taskID)
	if err != nil {
		return err
	}
	return service.cancelUpstream(ctx, task)
}

func (service *RecoveryService) cancelUpstream(ctx context.Context, task Task) error {
	if task.Kind != "video" || task.UpstreamTaskID == "" {
		return nil
	}
	selected, err := service.channels.ResolveModel(ctx, task.Kind, task.ChannelID, task.Model)
	if err != nil {
		return err
	}
	return service.videoProvider.Cancel(ctx, task, selected)
}

func (service *RecoveryService) check(ctx context.Context, task Task) (Task, error) {
	if task.Status != TaskNeedsReview {
		return Task{}, ErrNotReviewable
	}
	if task.UpstreamTaskID == "" || task.UpstreamQueryPath == "" {
		return task, nil
	}
	selected, err := service.channels.ResolveModel(ctx, task.Kind, task.ChannelID, task.Model)
	if err != nil {
		return Task{}, err
	}
	if task.Kind == "video" {
		result, queryErr := service.videoProvider.Query(ctx, task, selected)
		if queryErr != nil {
			return task, nil
		}
		if result.Pending {
			return task, nil
		}
		if result.Failed {
			_ = service.repository.Fail(ctx, task, "视频生成失败，请重试")
			return service.repository.GetByID(ctx, task.ID)
		}
		if err := service.persistVideo(ctx, task, result); err != nil {
			return Task{}, err
		}
		return service.repository.GetByID(ctx, task.ID)
	}
	result, err := service.provider.Query(ctx, task, selected)
	if err != nil {
		var executionErr *ExecutionError
		if errors.As(err, &executionErr) && executionErr.HTTPStatus != nil && (*executionErr.HTTPStatus == 400 || *executionErr.HTTPStatus == 404 || *executionErr.HTTPStatus == 410) {
			_ = service.repository.Fail(ctx, task, "上游任务已确认失败")
			return service.repository.GetByID(ctx, task.ID)
		}
		return task, nil
	}
	if result.Pending {
		return task, nil
	}
	if err := service.persist(ctx, task, result); err != nil {
		return Task{}, err
	}
	return service.repository.GetByID(ctx, task.ID)
}

func (service *RecoveryService) ConfirmFailed(ctx context.Context, taskID, reason string) (Task, error) {
	task, err := service.repository.GetByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	if task.Status != TaskNeedsReview {
		return Task{}, ErrNotReviewable
	}
	if reason == "" {
		reason = "管理员确认上游任务失败"
	}
	if err := service.repository.Fail(ctx, task, reason); err != nil {
		return Task{}, err
	}
	return service.repository.GetByID(ctx, taskID)
}

func (service *RecoveryService) ProvideResult(ctx context.Context, taskID, rawURL string) (Task, error) {
	task, err := service.repository.GetByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	if task.Status != TaskNeedsReview {
		return Task{}, ErrNotReviewable
	}
	selected, err := service.channels.ResolveModel(ctx, task.Kind, task.ChannelID, task.Model)
	if err != nil {
		return Task{}, err
	}
	if task.Kind == "video" {
		video, downloadErr := service.videoProvider.download(ctx, rawURL, selected)
		if downloadErr != nil {
			return Task{}, downloadErr
		}
		if err := service.persistVideo(ctx, task, video); err != nil {
			return Task{}, err
		}
		return service.repository.GetByID(ctx, taskID)
	}
	result, err := service.provider.DownloadResult(ctx, rawURL, selected)
	if err != nil {
		return Task{}, err
	}
	if err := service.persist(ctx, task, result); err != nil {
		return Task{}, err
	}
	return service.repository.GetByID(ctx, taskID)
}

func (service *RecoveryService) persistVideo(ctx context.Context, task Task, result GeneratedVideo) error {
	_, extension, ok := assets.ParseMediaType(result.MimeType)
	if !ok {
		return errors.New("provided result is not supported video")
	}
	key := task.AssetID + extension
	if err := service.storage.Save(key, bytes.NewReader(result.Content)); err != nil {
		return err
	}
	duration := float64(task.DurationSeconds)
	asset := CompletedAsset{StorageKey: key, OriginalName: key, MimeType: result.MimeType, SizeBytes: int64(len(result.Content)), DurationSeconds: &duration}
	if err := service.repository.Complete(ctx, task, asset); err != nil {
		_ = service.storage.Delete(key)
		return err
	}
	return nil
}

func (service *RecoveryService) persist(ctx context.Context, task Task, result GeneratedImage) error {
	_, extension, ok := assets.ParseMediaType(result.MimeType)
	if !ok {
		return errors.New("provided result is not a supported image")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(result.Content))
	if err != nil {
		return err
	}
	if config.Width != task.Width || config.Height != task.Height {
		return fmt.Errorf("provided image dimensions %dx%d do not match requested %dx%d", config.Width, config.Height, task.Width, task.Height)
	}
	key := task.AssetID + extension
	if err := service.storage.Save(key, bytes.NewReader(result.Content)); err != nil {
		return err
	}
	asset := CompletedAsset{StorageKey: key, OriginalName: key, MimeType: result.MimeType, SizeBytes: int64(len(result.Content)), Width: config.Width, Height: config.Height}
	if err := service.repository.Complete(ctx, task, asset); err != nil {
		_ = service.storage.Delete(key)
		return err
	}
	return nil
}
