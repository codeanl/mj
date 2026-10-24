package generation

import (
	"context"
	"encoding/json"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTaskNotFound = errors.New("generation task not found")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) CreateImage(ctx context.Context, userID, prompt, model string) (Task, error) {
	taskID := uuid.NewString()
	assetID := uuid.NewString()
	title := truncateRunes(prompt, 80)
	parameters, err := json.Marshal(map[string]interface{}{"size": ImageSize, "quality": ImageQuality, "width": ImageWidth, "height": ImageHeight})
	if err != nil {
		return Task{}, err
	}

	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO media_assets (id, user_id, kind, source, status, title, size_bytes, width, height)
		VALUES ($1, $2, 'image', 'generated', 'generating', $3, 0, $4, $5)
	`, assetID, userID, title, ImageWidth, ImageHeight); err != nil {
		return Task{}, err
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO generation_tasks (id, user_id, asset_id, kind, status, provider, model, prompt, parameters)
		VALUES ($1, $2, $3, 'image', 'queued', 'openai-compatible', $4, $5, $6::jsonb)
		RETURNING id::text, asset_id::text, kind, status, model, prompt,
		          (parameters->>'width')::integer, (parameters->>'height')::integer, parameters->>'quality', created_at
	`, taskID, userID, assetID, model, prompt, parameters)

	var task Task
	if err := row.Scan(&task.ID, &task.AssetID, &task.Kind, &task.Status, &task.Model, &task.Prompt, &task.Width, &task.Height, &task.Quality, &task.CreatedAt); err != nil {
		return Task{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Task{}, err
	}
	return task, nil
}

func (repository *Repository) Get(ctx context.Context, userID, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, asset_id::text, kind, status, model, prompt,
		       (parameters->>'width')::integer, (parameters->>'height')::integer, parameters->>'quality',
		       coalesce(error_message, ''), created_at
		FROM generation_tasks
		WHERE id = $1 AND user_id = $2
	`, taskID, userID)
	var task Task
	if err := row.Scan(&task.ID, &task.AssetID, &task.Kind, &task.Status, &task.Model, &task.Prompt, &task.Width, &task.Height, &task.Quality, &task.ErrorMessage, &task.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, ErrTaskNotFound
		}
		return Task{}, err
	}
	return task, nil
}

func (repository *Repository) RequeueStale(ctx context.Context, staleBefore time.Time) error {
	_, err := repository.pool.Exec(ctx, `
		UPDATE generation_tasks
		SET status = 'queued', started_at = NULL
		WHERE status = 'running' AND started_at < $1
	`, staleBefore)
	return err
}

func (repository *Repository) ClaimNext(ctx context.Context) (Task, bool, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Task{}, false, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
		SELECT id::text, asset_id::text, kind, status, model, prompt,
		       (parameters->>'width')::integer, (parameters->>'height')::integer, parameters->>'quality', created_at
		FROM generation_tasks
		WHERE status = 'queued'
		ORDER BY created_at ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`)
	var task Task
	if err := row.Scan(&task.ID, &task.AssetID, &task.Kind, &task.Status, &task.Model, &task.Prompt, &task.Width, &task.Height, &task.Quality, &task.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, false, nil
		}
		return Task{}, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status = 'running', started_at = now(), error_message = NULL WHERE id = $1`, task.ID); err != nil {
		return Task{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Task{}, false, err
	}
	task.Status = TaskRunning
	return task, true, nil
}

func (repository *Repository) Complete(ctx context.Context, task Task, asset CompletedAsset) error {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		UPDATE media_assets
		SET status = 'ready', storage_key = $2, original_name = $3, mime_type = $4,
		    size_bytes = $5, width = $6, height = $7, error_message = NULL
		WHERE id = $1
	`, task.AssetID, asset.StorageKey, asset.OriginalName, asset.MimeType, asset.SizeBytes, asset.Width, asset.Height); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE generation_tasks
		SET status = 'succeeded', completed_at = now(), error_message = NULL
		WHERE id = $1
	`, task.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *Repository) Fail(ctx context.Context, task Task, message string) error {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE media_assets SET status = 'failed', error_message = $2 WHERE id = $1`, task.AssetID, message); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1`, task.ID, message); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func truncateRunes(value string, maximum int) string {
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	runes := []rune(value)
	return string(runes[:maximum])
}
