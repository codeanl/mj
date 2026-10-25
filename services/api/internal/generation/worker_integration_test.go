package generation

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/modelchannels"
)

func TestWorkerAutomaticallyPollsMiniMaxTaskWithoutDuplicateCharge(t *testing.T) {
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

	var creates, queries atomic.Int32
	var upstream *httptest.Server
	upstream = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/minimax/v2/video_generation":
			creates.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"task_id":"upstream-auto"}`))
		case "/minimax/v2/query/video_generation/upstream-auto":
			queries.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"task":{"status":"succeeded","content":{"url":"` + upstream.URL + `/result.mp4"}}}`))
		case "/result.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video-content"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	userID, channelID := uuid.NewString(), uuid.NewString()
	cipher := modelchannels.NewSecretCipher("worker-integration-secret")
	encryptedKey, err := cipher.Encrypt("sk-ml-test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash,points_balance)VALUES($1,$2,'worker-video','x',20)`, userID, "worker-video-"+uuid.NewString()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO model_channels(id,name,base_url,protocol,advanced_config,api_key_ciphertext,enabled)VALUES($1,'worker-minimax',$2,'compshare-minimax-h3','{"apiFormat":"openai","authMode":"bearer","pollIntervalSeconds":1}'::jsonb,$3,true)`, channelID, upstream.URL, encryptedKey); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO channel_models(channel_id,model_id,display_name,capability,enabled)VALUES($1,'MiniMax-H3','MiniMax H3','video',true)`, channelID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id=$1`, channelID)
	}()

	repository := NewRepository(pool)
	task, _, err := repository.CreateVideo(ctx, userID, uuid.NewString(), "自动轮询视频", VideoOptions{ChannelID: channelID, Model: "MiniMax-H3", Ratio: "16:9", Resolution: "768P", DurationSeconds: 5, SoundEnabled: true, Mode: VideoModeText}, nil, 2.5)
	if err != nil {
		t.Fatal(err)
	}
	storage, err := assets.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	videoProvider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	videoProvider.client = upstream.Client()
	channels := modelchannels.NewService(modelchannels.NewRepository(pool), cipher, time.Second)
	worker := NewWorker(repository, NewOpenAIImageProvider(time.Second, 1024), videoProvider, channels, storage, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Second, time.Minute)

	claimed, found, err := repository.ClaimNext(ctx, time.Now().Add(time.Minute))
	if err != nil || !found || claimed.ID != task.ID {
		t.Fatalf("claim create: %#v found=%v err=%v", claimed, found, err)
	}
	worker.process(ctx, claimed)
	pending, err := repository.Get(ctx, userID, task.ID)
	if err != nil || pending.Status != TaskRunning || pending.UpstreamTaskID != "upstream-auto" {
		t.Fatalf("pending task: %#v err=%v", pending, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE generation_tasks SET next_poll_at=now() WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	claimed, found, err = repository.ClaimNext(ctx, time.Now().Add(time.Minute))
	if err != nil || !found || claimed.UpstreamTaskID != "upstream-auto" {
		t.Fatalf("claim poll: %#v found=%v err=%v", claimed, found, err)
	}
	worker.process(ctx, claimed)
	completed, err := repository.Get(ctx, userID, task.ID)
	if err != nil || completed.Status != TaskSucceeded {
		t.Fatalf("completed task: %#v err=%v", completed, err)
	}
	var consumes, assetsCount, attempts int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM point_transactions WHERE user_id=$1 AND type='consume'`, userID).Scan(&consumes); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM media_assets WHERE id=$1 AND status='ready'`, task.AssetID).Scan(&assetsCount); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM generation_attempts WHERE task_id=$1`, task.ID).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if creates.Load() != 1 || queries.Load() != 1 || consumes != 1 || assetsCount != 1 || attempts != 2 {
		t.Fatalf("unexpected counts: creates=%d queries=%d consumes=%d assets=%d attempts=%d", creates.Load(), queries.Load(), consumes, assetsCount, attempts)
	}
}
