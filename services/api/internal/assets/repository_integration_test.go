package assets

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestListIncludesGenerationMetadata(t *testing.T) {
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
	userID, channelID, assetID, taskID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	referenceIDs := []string{uuid.NewString(), uuid.NewString()}
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'asset-meta','x')`, userID, "asset-meta-"+uuid.NewString()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO model_channels(id,name,base_url,protocol)VALUES($1,'MiniMax 主渠道','https://cp.compshare.cn','compshare-minimax-h3')`, channelID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM model_channels WHERE id=$1`, channelID)
	}()
	if _, err = pool.Exec(ctx, `INSERT INTO media_assets(id,user_id,kind,source,status,title,original_name,storage_key,mime_type,size_bytes,width,height)VALUES($1,$2,'video','generated','ready','测试视频','video.mp4','video.mp4','video/mp4',1024,0,0)`, assetID, userID); err != nil {
		t.Fatal(err)
	}
	for index, referenceID := range referenceIDs {
		if _, err = pool.Exec(ctx, `INSERT INTO media_assets(id,user_id,kind,source,status,title,original_name,storage_key,mime_type,size_bytes,width,height)VALUES($1,$2,'image','uploaded','ready',$3,'reference.png',$4,'image/png',100,100,100)`, referenceID, userID, "参考图 "+string(rune('1'+index)), referenceID+".png"); err != nil {
			t.Fatal(err)
		}
	}
	parameters, err := json.Marshal(map[string]interface{}{"size": "16:9", "quality": "1080P", "durationSeconds": 9, "soundEnabled": true, "watermarkEnabled": false, "videoMode": "reference", "referenceAssetIds": referenceIDs})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `
		INSERT INTO generation_tasks(id,user_id,asset_id,channel_id,kind,status,provider,model,prompt,parameters,points_cost,retry_count,upstream_task_id,started_at,completed_at)
		VALUES($1,$2,$3,$4,'video','succeeded','compshare-minimax-h3','MiniMax-H3','测试提示词',$5::jsonb,4.5,1,'upstream-1',now()-interval '2 seconds',now())
	`, taskID, userID, assetID, channelID, parameters); err != nil {
		t.Fatal(err)
	}

	page, err := NewPostgresRepository(pool).List(ctx, userID, "", SourceGenerated, StatusReady, "", 1, 8)
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("list: %#v err=%v", page, err)
	}
	metadata := page.Items[0].Generation
	if metadata == nil || metadata.Model != "MiniMax-H3" || metadata.ChannelName != "MiniMax 主渠道" || metadata.Protocol != "compshare-minimax-h3" || metadata.PointsCost != 4.5 || metadata.ReferenceCount != 2 || metadata.RequestedDurationSeconds != 9 || !metadata.SoundEnabled || metadata.ExecutionDurationMS == nil || *metadata.ExecutionDurationMS < 1900 {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
	if len(metadata.References) != 2 || metadata.References[0].AssetID != referenceIDs[0] || metadata.References[0].Role != "reference_image" || metadata.References[0].Title != "参考图 1" || metadata.References[0].URL == "" {
		t.Fatalf("unexpected references: %#v", metadata.References)
	}
}
