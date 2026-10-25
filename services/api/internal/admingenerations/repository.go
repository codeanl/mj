package admingenerations

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

type rowScanner interface {
	Scan(...interface{}) error
}

type lockedTask struct {
	userID              string
	assetID             string
	status              string
	model               string
	pointsCost          float64
	pointsRefunded      bool
	pointsTransactionID string
	retryCount          int
}

const taskColumns = `
	t.id::text, t.asset_id::text, t.kind, t.status, t.model, t.prompt,
	coalesce(t.parameters->>'size', ''), coalesce(t.parameters->>'quality', ''),
	coalesce((t.parameters->>'width')::integer, 0), coalesce((t.parameters->>'height')::integer, 0),
	jsonb_array_length(coalesce(t.parameters->'referenceAssetIds', '[]'::jsonb)),
	t.points_cost, t.points_refunded, t.retry_count, coalesce(t.error_message, ''),
	u.public_id, u.username, u.email, coalesce(t.channel_id::text, ''), coalesce(c.name, ''), coalesce(c.protocol, ''),
	t.created_at, t.started_at, t.completed_at`

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) List(ctx context.Context, input ListInput) (Page, error) {
	offset := (input.Page - 1) * input.PageSize
	rows, err := repository.pool.Query(ctx, `
		SELECT `+taskColumns+`, count(*) OVER()
		FROM generation_tasks t
		JOIN users u ON u.id = t.user_id
		LEFT JOIN model_channels c ON c.id = t.channel_id
		WHERE ($1 = '' OR t.id::text ILIKE '%' || $1 || '%' OR t.prompt ILIKE '%' || $1 || '%' OR t.model ILIKE '%' || $1 || '%' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
		  AND ($2::bigint IS NULL OR u.public_id = $2::bigint)
		  AND ($3 = '' OR t.status = $3)
		  AND ($4 = '' OR t.kind = $4)
		ORDER BY t.created_at DESC, t.id DESC
		LIMIT $5 OFFSET $6
	`, input.Search, input.AccountID, input.Status, input.Kind, input.PageSize, offset)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	items := make([]Task, 0, input.PageSize)
	var total int64
	for rows.Next() {
		var task Task
		if err := scanTask(rows, &task, &total); err != nil {
			return Page{}, err
		}
		items = append(items, task)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	summary, err := repository.summary(ctx)
	if err != nil {
		return Page{}, err
	}
	return Page{Items: items, Total: total, Page: input.Page, PageSize: input.PageSize, Summary: summary}, nil
}

func (repository *Repository) summary(ctx context.Context) (Summary, error) {
	var summary Summary
	err := repository.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE status = 'queued'), count(*) FILTER (WHERE status = 'running'),
		       count(*) FILTER (WHERE status = 'succeeded'), count(*) FILTER (WHERE status = 'failed'),
		       count(*) FILTER (WHERE status = 'cancelled'),
		       coalesce(sum(points_cost) FILTER (WHERE NOT points_refunded), 0)
		FROM generation_tasks
	`).Scan(&summary.Total, &summary.Queued, &summary.Running, &summary.Succeeded, &summary.Failed, &summary.Cancelled, &summary.PointsSpent)
	return summary, err
}

func (repository *Repository) Get(ctx context.Context, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+taskColumns+`
		FROM generation_tasks t
		JOIN users u ON u.id = t.user_id
		LEFT JOIN model_channels c ON c.id = t.channel_id
		WHERE t.id = $1
	`, taskID)
	var task Task
	if err := scanTask(row, &task); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, ErrNotFound
		}
		return Task{}, err
	}
	return task, nil
}

func scanTask(row rowScanner, task *Task, extra ...interface{}) error {
	values := []interface{}{
		&task.ID, &task.AssetID, &task.Kind, &task.Status, &task.Model, &task.Prompt,
		&task.Size, &task.Quality, &task.Width, &task.Height, &task.ReferenceCount,
		&task.PointsCost, &task.PointsRefunded, &task.RetryCount, &task.ErrorMessage,
		&task.AccountID, &task.Username, &task.Email, &task.ChannelID, &task.ChannelName, &task.ChannelProtocol,
		&task.CreatedAt, &task.StartedAt, &task.CompletedAt,
	}
	values = append(values, extra...)
	return row.Scan(values...)
}

func (repository *Repository) Cancel(ctx context.Context, taskID string) (ActionResult, error) {
	tx, task, err := repository.lock(ctx, taskID)
	if err != nil {
		return ActionResult{}, err
	}
	defer tx.Rollback(ctx)
	if task.status != "queued" {
		return ActionResult{}, ErrInvalidState
	}
	balance, refunded, err := refundLocked(ctx, tx, taskID, task, "管理员取消生成任务")
	if err != nil {
		return ActionResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE media_assets SET status = 'failed', error_message = '管理员取消任务' WHERE id = $1`, task.assetID); err != nil {
		return ActionResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status = 'cancelled', completed_at = now(), error_message = '管理员取消任务', points_refunded = $2 WHERE id = $1`, taskID, refunded); err != nil {
		return ActionResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ActionResult{}, err
	}
	updated, err := repository.Get(ctx, taskID)
	return ActionResult{Task: updated, PointsRemaining: balance, RefundedPointCost: refundedCost(task.pointsCost, refunded)}, err
}

func (repository *Repository) Refund(ctx context.Context, taskID string) (ActionResult, error) {
	tx, task, err := repository.lock(ctx, taskID)
	if err != nil {
		return ActionResult{}, err
	}
	defer tx.Rollback(ctx)
	if task.status != "succeeded" || task.pointsRefunded || task.pointsCost <= 0 {
		return ActionResult{}, ErrInvalidState
	}
	balance, refunded, err := refundLocked(ctx, tx, taskID, task, "管理员补退图片生成积分")
	if err != nil {
		return ActionResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET points_refunded = $2 WHERE id = $1`, taskID, refunded); err != nil {
		return ActionResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ActionResult{}, err
	}
	updated, err := repository.Get(ctx, taskID)
	return ActionResult{Task: updated, PointsRemaining: balance, RefundedPointCost: task.pointsCost}, err
}

func (repository *Repository) Retry(ctx context.Context, taskID string) (ActionResult, error) {
	tx, task, err := repository.lock(ctx, taskID)
	if err != nil {
		return ActionResult{}, err
	}
	defer tx.Rollback(ctx)
	if task.status != "failed" && task.status != "cancelled" {
		return ActionResult{}, ErrInvalidState
	}
	var balance float64
	if err := tx.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1`, task.userID).Scan(&balance); err != nil {
		return ActionResult{}, err
	}
	transactionID := task.pointsTransactionID
	if task.pointsCost > 0 && task.pointsRefunded {
		if err := tx.QueryRow(ctx, `
			UPDATE users SET points_balance = points_balance - $2::numeric, updated_at = now()
			WHERE id = $1 AND status = 'active' AND points_balance >= $2::numeric
			RETURNING points_balance
		`, task.userID, task.pointsCost).Scan(&balance); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ActionResult{}, ErrInsufficientPoints
			}
			return ActionResult{}, err
		}
		transactionID = uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, model, source_id, idempotency_key)
			VALUES ($1, $2, 'consume', $3::numeric, $4::numeric, '管理员重试图片生成', $5, $6, $7)
		`, transactionID, task.userID, -task.pointsCost, balance, task.model, taskID, fmt.Sprintf("generation-retry:%s:%d", taskID, task.retryCount+1)); err != nil {
			return ActionResult{}, err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE media_assets SET status = 'generating', error_message = NULL WHERE id = $1`, task.assetID); err != nil {
		return ActionResult{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE generation_tasks
		SET status = 'queued', started_at = NULL, completed_at = NULL, error_message = NULL,
		    points_refunded = false, points_transaction_id = NULLIF($2, '')::uuid, retry_count = retry_count + 1
		WHERE id = $1
	`, taskID, transactionID); err != nil {
		return ActionResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ActionResult{}, err
	}
	updated, err := repository.Get(ctx, taskID)
	return ActionResult{Task: updated, PointsRemaining: &balance}, err
}

func (repository *Repository) lock(ctx context.Context, taskID string) (pgx.Tx, lockedTask, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, lockedTask{}, err
	}
	var task lockedTask
	err = tx.QueryRow(ctx, `
		SELECT user_id::text, asset_id::text, status, model, points_cost, points_refunded,
		       coalesce(points_transaction_id::text, ''), retry_count
		FROM generation_tasks WHERE id = $1 FOR UPDATE
	`, taskID).Scan(&task.userID, &task.assetID, &task.status, &task.model, &task.pointsCost, &task.pointsRefunded, &task.pointsTransactionID, &task.retryCount)
	if errors.Is(err, pgx.ErrNoRows) {
		tx.Rollback(ctx)
		return nil, lockedTask{}, ErrNotFound
	}
	if err != nil {
		tx.Rollback(ctx)
		return nil, lockedTask{}, err
	}
	return tx, task, nil
}

func refundLocked(ctx context.Context, tx pgx.Tx, taskID string, task lockedTask, description string) (*float64, bool, error) {
	if task.pointsCost <= 0 || task.pointsRefunded {
		return nil, task.pointsRefunded, nil
	}
	var balance float64
	if err := tx.QueryRow(ctx, `UPDATE users SET points_balance = points_balance + $2::numeric, updated_at = now() WHERE id = $1 RETURNING points_balance`, task.userID, task.pointsCost).Scan(&balance); err != nil {
		return nil, false, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, model, source_id, idempotency_key)
		VALUES ($1, $2, 'refund', $3::numeric, $4::numeric, $5, $6, $7, $8)
		ON CONFLICT (idempotency_key) DO NOTHING
	`, uuid.NewString(), task.userID, task.pointsCost, balance, description, task.model, taskID, fmt.Sprintf("generation-refund:%s:%d", taskID, task.retryCount)); err != nil {
		return nil, false, err
	}
	return &balance, true, nil
}

func refundedCost(cost float64, refunded bool) float64 {
	if refunded {
		return cost
	}
	return 0
}
