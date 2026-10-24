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
	"log/slog"
	"time"

	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/modelchannels"
)

type Worker struct {
	repository *Repository
	provider   ImageProvider
	channels   *modelchannels.Service
	storage    *assets.LocalStorage
	logger     *slog.Logger
	interval   time.Duration
	stale      time.Duration
}

func NewWorker(repository *Repository, provider ImageProvider, channels *modelchannels.Service, storage *assets.LocalStorage, logger *slog.Logger, interval, stale time.Duration) *Worker {
	return &Worker{repository: repository, provider: provider, channels: channels, storage: storage, logger: logger, interval: interval, stale: stale}
}

func (worker *Worker) Run(ctx context.Context) {
	worker.logger.Info("generation worker started", "interval", worker.interval.String())
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
		task, found, err := worker.repository.ClaimNext(ctx)
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
	selected, err := worker.channels.ResolveImageModel(ctx, task.ChannelID, task.Model)
	if err != nil {
		worker.fail(ctx, task, fmt.Errorf("generation channel unavailable: %w", err))
		return
	}
	generated, err := worker.provider.Generate(ctx, task, selected)
	if err != nil {
		worker.fail(ctx, task, err)
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

func (worker *Worker) fail(ctx context.Context, task Task, err error) {
	message := err.Error()
	if persistErr := worker.repository.Fail(ctx, task, message); persistErr != nil {
		worker.logger.Error("failed to persist generation failure", "task_id", task.ID, "error", persistErr)
	}
	worker.logger.Error("generation task failed", "task_id", task.ID, "error", err)
}
