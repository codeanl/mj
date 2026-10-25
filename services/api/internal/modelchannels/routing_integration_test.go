package modelchannels

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRouteSimulationAndRuntimeStats(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	userID, taskID, assetID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	channels := []string{uuid.NewString(), uuid.NewString()}
	email := "route-stats-" + uuid.NewString() + "@example.com"
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'route-test','x')`, userID, email); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
		for _, id := range channels {
			_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id=$1`, id)
		}
	}()
	for index, id := range channels {
		if _, err = pool.Exec(ctx, `INSERT INTO model_channels(id,name,base_url,protocol,enabled,priority,weight,max_concurrency,active_requests,cooldown_until)VALUES($1,$2,'https://example.com/v1','openai',true,$3,$4,2,$5,$6)`, id, "route-"+id[:4], 100, index+1, map[int]int{0: 0, 1: 2}[index], map[int]interface{}{0: nil, 1: time.Now().Add(time.Hour)}[index]); err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, `INSERT INTO channel_models(channel_id,model_id,display_name,capability,enabled,sort_order)VALUES($1,'route-image','route-image','image',true,0)`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = pool.Exec(ctx, `INSERT INTO media_assets(id,user_id,kind,source,status,title,size_bytes,width,height)VALUES($1,$2,'image','generated','failed','route',0,1,1)`, assetID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO generation_tasks(id,user_id,asset_id,channel_id,kind,status,provider,model,prompt,parameters)VALUES($1,$2,$3,$4,'image','failed','test','route-image','route','{}')`, taskID, userID, assetID, channels[0]); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO generation_attempts(task_id,attempt_no,channel_id,protocol,request_path,status,http_status,duration_ms,concurrency_at_start,completed_at)VALUES($1,1,$2,'openai','/images/generations','succeeded',200,240,1,now()),($1,2,$2,'openai','/images/generations','failed',503,120,2,now())`, taskID, channels[0]); err != nil {
		t.Fatal(err)
	}
	service := NewService(NewRepository(pool), NewSecretCipher("route-test-secret"), time.Second)
	simulation, err := service.SimulateImageRoute(ctx, "route-image", "16:9", "2K")
	if err != nil || len(simulation.Candidates) != 2 || simulation.SelectedChannelID != channels[0] || simulation.Candidates[1].Available {
		t.Fatalf("simulation: %#v %v", simulation, err)
	}
	stats, err := service.RuntimeStats(ctx, "24h")
	if err != nil || stats.Requests < 2 || stats.AutoSwitches < 1 || stats.PeakConcurrency < 2 || stats.HTTPErrors["503"] < 1 {
		t.Fatalf("stats: %#v %v", stats, err)
	}
}
