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

type rowScanner interface {
	Scan(...interface{}) error
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) CreateImage(ctx context.Context, userID, prompt string, options ImageOptions, pointsCost float64) (Task, error) {
	taskID := uuid.NewString()
	assetID := uuid.NewString()
	title := truncateRunes(prompt, 80)
	parameters, err := json.Marshal(map[string]interface{}{
		"size": options.Ratio, "quality": options.Resolution,
		"providerSize": options.ProviderSize, "providerQuality": options.ProviderQuality,
		"width": options.Width, "height": options.Height,
	})
	if err != nil {
		return Task{}, err
	}

	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback(ctx)

	var pointsRemaining float64
	if err := tx.QueryRow(ctx, `
		UPDATE users
		SET points_balance = points_balance - $2::numeric, updated_at = now()
		WHERE id = $1 AND status = 'active' AND points_balance >= $2::numeric
		RETURNING points_balance
	`, userID, pointsCost).Scan(&pointsRemaining); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, ErrInsufficientPoints
		}
		return Task{}, err
	}
	pointsTransactionID := ""
	if pointsCost > 0 {
		pointsTransactionID = uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, model, source_id, idempotency_key)
			VALUES ($1, $2, 'consume', $3::numeric, $4::numeric, '图片生成', $5, $6, $7)
		`, pointsTransactionID, userID, -pointsCost, pointsRemaining, options.Model, taskID, "generation-consume:"+taskID); err != nil {
			return Task{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO media_assets (id, user_id, kind, source, status, title, size_bytes, width, height)
		VALUES ($1, $2, 'image', 'generated', 'generating', $3, 0, $4, $5)
	`, assetID, userID, title, options.Width, options.Height); err != nil {
		return Task{}, err
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO generation_tasks (id, user_id, asset_id, channel_id, kind, status, provider, model, prompt, parameters, points_cost, points_transaction_id)
		VALUES ($1, $2, $3, $4, 'image', 'queued', 'openai-compatible', $5, $6, $7::jsonb, $8::numeric, NULLIF($9, '')::uuid)
		RETURNING id::text, asset_id::text, channel_id::text, kind, status, model, prompt,
		          parameters->>'size', (parameters->>'width')::integer, (parameters->>'height')::integer,
		          parameters->>'quality', parameters->>'providerSize', parameters->>'providerQuality',
		          points_cost, coalesce(points_transaction_id::text, ''), points_refunded, created_at
	`, taskID, userID, assetID, options.ChannelID, options.Model, prompt, parameters, pointsCost, pointsTransactionID)

	var task Task
	if err := scanTask(row, &task, false); err != nil {
		return Task{}, err
	}
	task.PointsRemaining = pointsRemaining
	if err := tx.Commit(ctx); err != nil {
		return Task{}, err
	}
	return task, nil
}

func (repository *Repository) Get(ctx context.Context, userID, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, asset_id::text, channel_id::text, kind, status, model, prompt,
		       parameters->>'size', (parameters->>'width')::integer, (parameters->>'height')::integer,
		       parameters->>'quality', parameters->>'providerSize', parameters->>'providerQuality', points_cost, coalesce(points_transaction_id::text, ''), points_refunded,
		       coalesce(error_message, ''), created_at
		FROM generation_tasks
		WHERE id = $1 AND user_id = $2
	`, taskID, userID)
	var task Task
	if err := scanTask(row, &task, true); err != nil {
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
		SELECT id::text, asset_id::text, channel_id::text, kind, status, model, prompt,
		       parameters->>'size', (parameters->>'width')::integer, (parameters->>'height')::integer,
		       parameters->>'quality', parameters->>'providerSize', parameters->>'providerQuality', points_cost, coalesce(points_transaction_id::text, ''), points_refunded, created_at
		FROM generation_tasks
		WHERE status = 'queued'
		ORDER BY created_at ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`)
	var task Task
	if err := scanTask(row, &task, false); err != nil {
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

func scanTask(row rowScanner, task *Task, withError bool) error {
	values := []interface{}{
		&task.ID, &task.AssetID, &task.ChannelID, &task.Kind, &task.Status, &task.Model, &task.Prompt,
		&task.Size, &task.Width, &task.Height, &task.Quality, &task.providerSize, &task.providerQuality,
		&task.PointsCost, &task.pointsTransactionID, &task.pointsRefunded,
	}
	if withError {
		values = append(values, &task.ErrorMessage)
	}
	values = append(values, &task.CreatedAt)
	return row.Scan(values...)
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
	var cost float64
	var refunded bool
	var userID, model string
	if err := tx.QueryRow(ctx, `SELECT user_id::text, model, points_cost, points_refunded FROM generation_tasks WHERE id = $1 FOR UPDATE`, task.ID).Scan(&userID, &model, &cost, &refunded); err != nil {
		return err
	}
	if cost > 0 && !refunded {
		var balance float64
		if err := tx.QueryRow(ctx, `UPDATE users SET points_balance = points_balance + $2::numeric, updated_at = now() WHERE id = $1 RETURNING points_balance`, userID, cost).Scan(&balance); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, model, source_id, idempotency_key)
			VALUES ($1, $2, 'refund', $3::numeric, $4::numeric, '图片生成失败退款', $5, $6, $7)
			ON CONFLICT (idempotency_key) DO NOTHING
		`, uuid.NewString(), userID, cost, balance, model, task.ID, "generation-refund:"+task.ID); err != nil {
			return err
		}
		refunded = true
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status = 'failed', completed_at = now(), error_message = $2, points_refunded = $3 WHERE id = $1`, task.ID, message, refunded); err != nil {
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
