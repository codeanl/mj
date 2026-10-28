package admindashboard

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) Get(ctx context.Context) (Dashboard, error) {
	var dashboard Dashboard
	var completedToday int64
	err := repository.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM users),
			(SELECT count(*) FROM users WHERE created_at >= date_trunc('day', now())),
			(SELECT count(*) FROM generation_tasks WHERE created_at >= date_trunc('day', now())),
			(SELECT count(*) FROM generation_tasks WHERE status = 'succeeded' AND created_at >= date_trunc('day', now())),
			(SELECT count(*) FROM generation_tasks WHERE status IN ('failed', 'cancelled') AND created_at >= date_trunc('day', now())),
			(SELECT count(*) FROM generation_tasks WHERE status IN ('succeeded', 'failed', 'cancelled') AND created_at >= date_trunc('day', now())),
			(SELECT coalesce(sum(points_cost), 0) FROM generation_tasks WHERE NOT points_refunded AND created_at >= date_trunc('day', now())),
			(SELECT count(*) FROM generation_tasks WHERE status IN ('queued', 'running')),
			(SELECT count(*) FROM generation_tasks WHERE status = 'needs_review'),
			(SELECT coalesce(sum(size_bytes), 0) FROM media_assets),
			(SELECT coalesce(avg(last_latency_ms), 0)::bigint FROM model_channels WHERE enabled AND last_latency_ms IS NOT NULL),
			(SELECT count(*) FROM model_channels WHERE enabled AND (consecutive_failures > 0 OR cooldown_until > now())),
			(SELECT count(*) FROM model_channels WHERE enabled)
	`).Scan(
		&dashboard.Summary.UsersTotal,
		&dashboard.Summary.UsersToday,
		&dashboard.Summary.TasksToday,
		&dashboard.Summary.SucceededToday,
		&dashboard.Summary.FailedToday,
		&completedToday,
		&dashboard.Summary.PointsSpentToday,
		&dashboard.Summary.ActiveTasks,
		&dashboard.Summary.NeedsReview,
		&dashboard.Summary.StorageBytes,
		&dashboard.Summary.AverageLatencyMS,
		&dashboard.Summary.UnhealthyChannels,
		&dashboard.Summary.EnabledChannelCount,
	)
	if err != nil {
		return Dashboard{}, err
	}
	if completedToday > 0 {
		dashboard.Summary.SuccessRate = float64(dashboard.Summary.SucceededToday) / float64(completedToday) * 100
	}
	dashboard.Trend, err = repository.trend(ctx)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.Alerts, err = repository.alerts(ctx)
	return dashboard, err
}

func (repository *Repository) trend(ctx context.Context) ([]DailyMetric, error) {
	rows, err := repository.pool.Query(ctx, `
		WITH days AS (
			SELECT (now() AT TIME ZONE 'UTC')::date - series_offset AS day
			FROM generate_series(6, 0, -1) AS series_offset
		)
		SELECT days.day,
		       coalesce(metric.total, 0),
		       coalesce(metric.succeeded, 0),
		       coalesce(metric.failed + metric.cancelled, 0),
		       coalesce(metric.points_spent, 0)
		FROM days
		LEFT JOIN generation_daily_metrics metric ON metric.day = days.day
		ORDER BY days.day
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]DailyMetric, 0, 7)
	for rows.Next() {
		var item DailyMetric
		if err := rows.Scan(&item.Date, &item.Total, &item.Succeeded, &item.Failed, &item.Points); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repository *Repository) alerts(ctx context.Context) ([]Alert, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT type, target_id, title, detail, created_at FROM (
			SELECT 'generation'::text AS type, task.id::text AS target_id,
			       '生成任务失败'::text AS title,
			       coalesce(nullif(task.error_message, ''), task.model) AS detail,
			       coalesce(task.completed_at, task.created_at) AS created_at
			FROM generation_tasks task
			WHERE task.status = 'failed'
			UNION ALL
			SELECT 'channel'::text, channel.id::text, '模型渠道异常'::text,
			       coalesce(nullif(channel.last_runtime_error, ''), channel.last_test_message),
			       coalesce(channel.last_runtime_at, channel.last_tested_at, channel.updated_at)
			FROM model_channels channel
			WHERE channel.enabled AND (channel.consecutive_failures > 0 OR channel.cooldown_until > now())
		) alerts
		ORDER BY created_at DESC
		LIMIT 8
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Alert, 0, 8)
	for rows.Next() {
		var item Alert
		if err := rows.Scan(&item.Type, &item.TargetID, &item.Title, &item.Detail, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan dashboard alert: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
