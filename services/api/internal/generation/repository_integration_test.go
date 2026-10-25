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
	attemptID, attemptNo, err := repository.StartAttempt(ctx, batch.Tasks[0].ID, channelID, "openai", "/images/generations")
	if err != nil || attemptNo != 1 {
		t.Fatalf("start attempt: %d, %v", attemptNo, err)
	}
	status := 503
	if err := repository.FinishAttempt(ctx, attemptID, "failed", &status, 125, "upstream unavailable"); err != nil {
		t.Fatalf("finish attempt: %v", err)
	}
	if err := repository.MarkNeedsReview(ctx, batch.Tasks[0], "upstream-42", "/images/tasks/:task_id", "上游任务已提交"); err != nil {
		t.Fatalf("mark needs review: %v", err)
	}
	review, err := repository.Get(ctx, userID, batch.Tasks[0].ID)
	if err != nil || review.Status != TaskNeedsReview || review.AssetID != batch.Tasks[0].AssetID || review.UpstreamTaskID != "upstream-42" {
		t.Fatalf("review task: %#v %v", review, err)
	}
	var reviewBalance float64
	if err := pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id=$1`, userID).Scan(&reviewBalance); err != nil || reviewBalance != 14 {
		t.Fatalf("needs review must not refund: %v %v", reviewBalance, err)
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

func TestCreateVideoCreatesOneTaskAndChargesOnce(t *testing.T) {
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
	referenceIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	email := "generation-video-" + uuid.NewString() + "@example.com"
	if _, err = pool.Exec(ctx, `INSERT INTO users (id,email,username,password_hash,points_balance) VALUES ($1,$2,'video-test','test',20)`, userID, email); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO model_channels (id,name,base_url,protocol,enabled) VALUES ($1,'minimax-test','https://cp.compshare.cn','compshare-minimax-h3',true)`, channelID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id=$1`, channelID)
	}()
	referenceFixtures := []struct {
		kind, name, mimeType, extension string
	}{{"image", "reference.png", "image/png", ".png"}, {"video", "reference.mp4", "video/mp4", ".mp4"}, {"audio", "reference.mp3", "audio/mpeg", ".mp3"}}
	for index, fixture := range referenceFixtures {
		if _, err = pool.Exec(ctx, `INSERT INTO media_assets (id,user_id,kind,source,status,title,original_name,storage_key,mime_type,size_bytes,width,height) VALUES ($1,$2,$3,'uploaded','ready','reference',$4,$5,$6,5,1,1)`, referenceIDs[index], userID, fixture.kind, fixture.name, referenceIDs[index]+fixture.extension, fixture.mimeType); err != nil {
			t.Fatal(err)
		}
	}

	repository := NewRepository(pool)
	videoReferences := []VideoReference{{AssetID: referenceIDs[0], Role: VideoRoleImage}, {AssetID: referenceIDs[1], Role: VideoRoleVideo}, {AssetID: referenceIDs[2], Role: VideoRoleAudio}}
	task, remaining, err := repository.CreateVideo(ctx, userID, "海边日落运镜", VideoOptions{ChannelID: channelID, Model: "MiniMax-H3", Ratio: "16:9", Resolution: "1080P", DurationSeconds: 10, SoundEnabled: true, WatermarkEnabled: true, Mode: VideoModeReference}, videoReferences, 3.5)
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	if task.Kind != "video" || task.Status != TaskQueued || task.DurationSeconds != 10 || !task.SoundEnabled || !task.WatermarkEnabled || task.Size != "16:9" || task.Quality != "1080P" || remaining != 16.5 {
		t.Fatalf("unexpected video task: %#v remaining=%v", task, remaining)
	}
	var taskCount, assetCount, consumeCount int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM generation_tasks WHERE id=$1`, task.ID).Scan(&taskCount); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM media_assets WHERE id=$1 AND kind='video'`, task.AssetID).Scan(&assetCount); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM point_transactions WHERE user_id=$1 AND type='consume'`, userID).Scan(&consumeCount); err != nil {
		t.Fatal(err)
	}
	if taskCount != 1 || assetCount != 1 || consumeCount != 1 {
		t.Fatalf("unexpected persisted counts: tasks=%d assets=%d consumes=%d", taskCount, assetCount, consumeCount)
	}
	storedReferences, err := repository.GetReferences(ctx, task)
	if err != nil || len(storedReferences) != 3 || storedReferences[0].Role != VideoRoleImage || storedReferences[1].Kind != "video" || storedReferences[1].Role != VideoRoleVideo || storedReferences[2].Kind != "audio" || storedReferences[2].Role != VideoRoleAudio {
		t.Fatalf("unexpected stored references: %#v err=%v", storedReferences, err)
	}
	if err = repository.MarkNeedsReview(ctx, task, "upstream-video-1", "/minimax/v2/query/video_generation/:task_id", "任务已提交"); err != nil {
		t.Fatal(err)
	}
	if err = repository.Fail(ctx, task, "上游确认失败"); err != nil {
		t.Fatal(err)
	}
	if err = repository.Fail(ctx, task, "重复失败"); err != nil {
		t.Fatal(err)
	}
	var balance float64
	var refundCount int
	if err = pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id=$1`, userID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM point_transactions WHERE user_id=$1 AND type='refund'`, userID).Scan(&refundCount); err != nil {
		t.Fatal(err)
	}
	if balance != 20 || refundCount != 1 {
		t.Fatalf("unexpected refund result: balance=%v refunds=%d", balance, refundCount)
	}
}
