package assets

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAssetManagementRoundTrip(t *testing.T) {
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
	userID, otherUserID := uuid.NewString(), uuid.NewString()
	assetIDs := []string{uuid.NewString(), uuid.NewString()}
	otherAssetID := uuid.NewString()
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash)VALUES($1,$2,'asset-owner','x'),($3,$4,'other-owner','x')`, userID, "asset-owner-"+uuid.NewString()+"@example.com", otherUserID, "other-owner-"+uuid.NewString()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=ANY($1::uuid[])`, []string{userID, otherUserID})
	}()
	if _, err = pool.Exec(ctx, `
		INSERT INTO media_assets(id,user_id,kind,source,status,title,original_name,storage_key,mime_type,size_bytes,width,height) VALUES
		($1,$4,'image','uploaded','ready','第一张','one.png','one.png','image/png',100,10,10),
		($2,$4,'video','generated','ready','第二段','two.mp4','two.mp4','video/mp4',250,0,0),
		($3,$5,'image','uploaded','ready','他人素材','other.png','other.png','image/png',900,10,10)
	`, assetIDs[0], assetIDs[1], otherAssetID, userID, otherUserID); err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(pool)
	stats, err := repository.Stats(ctx, userID)
	if err != nil || stats.TotalCount != 2 || stats.TotalBytes != 350 || stats.ImageCount != 1 || stats.VideoCount != 1 || stats.GeneratedCount != 1 || stats.UploadedCount != 1 {
		t.Fatalf("unexpected asset stats: %#v err=%v", stats, err)
	}
	renamed, err := repository.Rename(ctx, userID, assetIDs[0], "新标题")
	if err != nil || renamed.Title != "新标题" {
		t.Fatalf("rename asset: %#v err=%v", renamed, err)
	}
	if _, err := repository.Rename(ctx, userID, otherAssetID, "不可修改"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("must not rename another user's asset: %v", err)
	}
	deleted, err := repository.DeleteMany(ctx, userID, append(assetIDs, otherAssetID))
	if err != nil || len(deleted) != 2 {
		t.Fatalf("delete owned assets: %#v err=%v", deleted, err)
	}
	if _, err := repository.Find(ctx, otherUserID, otherAssetID); err != nil {
		t.Fatalf("other user's asset must remain: %v", err)
	}
}

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
	if _, err = pool.Exec(ctx, `UPDATE generation_tasks SET parameters=jsonb_set(jsonb_set(parameters,'{videoReferences}','null'::jsonb),'{referenceAssetIds}','null'::jsonb) WHERE id=$1`, taskID); err != nil {
		t.Fatal(err)
	}
	page, err = NewPostgresRepository(pool).List(ctx, userID, "", SourceGenerated, StatusReady, "", 1, 8)
	if err != nil || len(page.Items) != 1 || page.Items[0].Generation == nil || page.Items[0].Generation.ReferenceCount != 0 || len(page.Items[0].Generation.References) != 0 {
		t.Fatalf("list with null references: %#v err=%v", page, err)
	}
}
