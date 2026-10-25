package admingenerations

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAdminGenerationActionsAndPublicAccountSearch(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	userID, channelID := uuid.NewString(), uuid.NewString()
	queuedTaskID, queuedAssetID := uuid.NewString(), uuid.NewString()
	email := "admin-generation-" + uuid.NewString() + "@example.com"
	var accountID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (id, email, username, password_hash, points_balance) VALUES ($1, $2, '任务用户', 'test', 8) RETURNING public_id`, userID, email).Scan(&accountID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO model_channels (id, name, base_url, protocol) VALUES ($1, '任务渠道', 'https://example.com/v1', 'openai')`, channelID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id = $1`, channelID)
	}()
	insertTask := func(taskID, assetID, status string, cost float64) {
		if _, err := pool.Exec(ctx, `INSERT INTO media_assets (id, user_id, kind, source, status, title, size_bytes, width, height) VALUES ($1, $2, 'image', 'generated', $3, '测试任务', 0, 1024, 1024)`, assetID, userID, map[string]string{"queued": "generating", "succeeded": "ready"}[status]); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO generation_tasks (id, user_id, asset_id, channel_id, kind, status, provider, model, prompt, parameters, points_cost)
			VALUES ($1, $2, $3, $4, 'image', $5, 'openai-compatible', 'gpt-image-2', '测试生成任务', '{"size":"1:1","quality":"1K","width":1024,"height":1024,"referenceAssetIds":[]}'::jsonb, $6::numeric)
		`, taskID, userID, assetID, channelID, status, cost); err != nil {
			t.Fatal(err)
		}
	}

	insertTask(queuedTaskID, queuedAssetID, "queued", 2)
	repository := NewRepository(pool)
	if _, err := pool.Exec(ctx, `INSERT INTO generation_attempts(id,task_id,attempt_no,channel_id,protocol,request_path,status,http_status,duration_ms,error_message,completed_at) VALUES($1,$2,1,$3,'openai','/images/generations','failed',503,125,'upstream unavailable',now())`, uuid.NewString(), queuedTaskID, channelID); err != nil {
		t.Fatal(err)
	}
	detail, err := repository.Get(ctx, queuedTaskID)
	if err != nil || len(detail.Attempts) != 1 || detail.Attempts[0].HTTPStatus == nil || *detail.Attempts[0].HTTPStatus != 503 {
		t.Fatalf("attempt detail: %#v, %v", detail.Attempts, err)
	}
	if _, err := repository.Cancel(ctx, queuedTaskID); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	retried, err := repository.Retry(ctx, queuedTaskID)
	if err != nil || retried.Task.Status != "queued" || retried.Task.RetryCount != 1 {
		t.Fatalf("retry: %#v, %v", retried, err)
	}
	if _, err := repository.Cancel(ctx, queuedTaskID); err != nil {
		t.Fatalf("cancel retry: %v", err)
	}

	succeededTaskID, succeededAssetID := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `UPDATE users SET points_balance = 7 WHERE id = $1`, userID); err != nil {
		t.Fatal(err)
	}
	insertTask(succeededTaskID, succeededAssetID, "succeeded", 3)
	refunded, err := repository.Refund(ctx, succeededTaskID)
	if err != nil || refunded.RefundedPointCost != 3 || !refunded.Task.PointsRefunded {
		t.Fatalf("refund: %#v, %v", refunded, err)
	}
	var balance float64
	if err := pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1`, userID).Scan(&balance); err != nil || balance != 10 {
		t.Fatalf("unexpected balance: %v, %v", balance, err)
	}
	page, err := repository.List(ctx, ListInput{Page: 1, PageSize: 20, Search: "", AccountID: &accountID})
	if err != nil || page.Total != 2 || len(page.Items) != 2 {
		t.Fatalf("list by account ID: %#v, %v", page, err)
	}
}
