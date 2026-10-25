package generation

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCreateImagesChargesAndRefundsEachTask(t *testing.T) {
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

	userID := uuid.NewString()
	channelID := uuid.NewString()
	referenceIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	email := "generation-batch-" + uuid.NewString() + "@example.com"
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, username, password_hash, points_balance) VALUES ($1, $2, 'batch-test', 'test', 20)`, userID, email); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO model_channels (id, name, base_url, protocol) VALUES ($1, 'batch-test', 'https://example.com/v1', 'openai')`, channelID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id = $1`, channelID)
	}()
	for _, referenceID := range referenceIDs {
		if _, err := pool.Exec(ctx, `
			INSERT INTO media_assets (id, user_id, kind, source, status, title, original_name, storage_key, mime_type, size_bytes, width, height)
			VALUES ($1, $2, 'image', 'uploaded', 'ready', 'reference', 'reference.png', $3, 'image/png', 9, 1, 1)
		`, referenceID, userID, referenceID+".png"); err != nil {
			t.Fatal(err)
		}
	}

	repository := NewRepository(pool)
	batch, err := repository.CreateImages(ctx, userID, "批量参考图生成", ImageOptions{
		ChannelID: channelID, Model: "gpt-image-2", Ratio: "1:1", Resolution: "1K",
		ProviderSize: "1024x1024", ProviderQuality: "high", Width: 1024, Height: 1024,
	}, 4, referenceIDs, 1.5)
	if err != nil {
		t.Fatalf("create images: %v", err)
	}
	if len(batch.Tasks) != 4 || batch.PointsRemaining != 14 {
		t.Fatalf("unexpected batch: %#v", batch)
	}
	for _, task := range batch.Tasks {
		if len(task.ReferenceAssetIDs) != 3 || task.ReferenceAssetIDs[2] != referenceIDs[2] || task.PointsCost != 1.5 {
			t.Fatalf("unexpected task: %#v", task)
		}
		if err := repository.Fail(ctx, task, "integration refund"); err != nil {
			t.Fatalf("refund task: %v", err)
		}
	}
	if err := repository.Fail(ctx, batch.Tasks[0], "repeated failure"); err != nil {
		t.Fatalf("repeat failure: %v", err)
	}
	var balance float64
	var consumes, refunds int
	if err := pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1`, userID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE type = 'consume'), count(*) FILTER (WHERE type = 'refund')
		FROM point_transactions WHERE user_id = $1
	`, userID).Scan(&consumes, &refunds); err != nil {
		t.Fatal(err)
	}
	if balance != 20 || consumes != 4 || refunds != 4 {
		t.Fatalf("unexpected billing result: balance=%v consumes=%d refunds=%d", balance, consumes, refunds)
	}
}
