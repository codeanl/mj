package generation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTaskNotFound = errors.New("generation task not found")
var ErrTaskNotActive = errors.New("generation task is no longer active")

type Repository struct {
	pool *pgxpool.Pool
}

type rowScanner interface {
	Scan(...interface{}) error
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) CreateImages(ctx context.Context, userID, requestID, prompt string, options ImageOptions, count int, referenceAssetIDs []string, pointsCost float64) (ImageBatch, error) {
	title := truncateRunes(prompt, 80)
	parameters, err := json.Marshal(map[string]interface{}{
		"size": options.Ratio, "quality": options.Resolution,
		"providerSize": options.ProviderSize, "providerQuality": options.ProviderQuality,
		"width": options.Width, "height": options.Height, "referenceAssetIds": referenceAssetIDs, "requestId": requestID,
	})
	if err != nil {
		return ImageBatch{}, err
	}

	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ImageBatch{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, userID+":"+requestID); err != nil {
		return ImageBatch{}, err
	}
	existing, remaining, err := loadRequestTasksTx(ctx, tx, userID, requestID, "image")
	if err != nil {
		return ImageBatch{}, err
	}
	if len(existing) > 0 {
		if err := tx.Commit(ctx); err != nil {
			return ImageBatch{}, err
		}
		return ImageBatch{Tasks: existing, PointsRemaining: remaining}, nil
	}
	for _, referenceAssetID := range referenceAssetIDs {
		var available bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM media_assets
				WHERE id = $1 AND user_id = $2 AND kind = 'image' AND status = 'ready'
				  AND storage_key IS NOT NULL AND mime_type LIKE 'image/%'
			)
		`, referenceAssetID, userID).Scan(&available); err != nil {
			return ImageBatch{}, err
		}
		if !available {
			return ImageBatch{}, ErrInvalidReference
		}
	}

	totalCost := pointsCost * float64(count)
	var pointsRemaining float64
	if err := tx.QueryRow(ctx, `
		UPDATE users
		SET points_balance = points_balance - $2::numeric, updated_at = now()
		WHERE id = $1 AND status = 'active' AND points_balance >= $2::numeric
		RETURNING points_balance
	`, userID, totalCost).Scan(&pointsRemaining); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ImageBatch{}, ErrInsufficientPoints
		}
		return ImageBatch{}, err
	}

	tasks := make([]Task, 0, count)
	for index := 0; index < count; index++ {
		taskID := uuid.NewString()
		assetID := uuid.NewString()
		pointsTransactionID := ""
		if pointsCost > 0 {
			pointsTransactionID = uuid.NewString()
			balanceAfter := pointsRemaining + pointsCost*float64(count-index-1)
			if _, err := tx.Exec(ctx, `
				INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, model, source_id, idempotency_key)
				VALUES ($1, $2, 'consume', $3::numeric, $4::numeric, '图片生成', $5, $6, $7)
			`, pointsTransactionID, userID, -pointsCost, balanceAfter, options.Model, taskID, "generation-consume:"+taskID); err != nil {
				return ImageBatch{}, err
			}
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO media_assets (id, user_id, kind, source, status, title, size_bytes, width, height)
			VALUES ($1, $2, 'image', 'generated', 'generating', $3, 0, $4, $5)
		`, assetID, userID, title, options.Width, options.Height); err != nil {
			return ImageBatch{}, err
		}
		var taskParameters map[string]interface{}
		if err := json.Unmarshal(parameters, &taskParameters); err != nil {
			return ImageBatch{}, err
		}
		taskParameters["requestIndex"] = index
		taskParametersJSON, err := json.Marshal(taskParameters)
		if err != nil {
			return ImageBatch{}, err
		}
		row := tx.QueryRow(ctx, `
			INSERT INTO generation_tasks (id, user_id, asset_id, channel_id, kind, status, provider, model, prompt, parameters, points_cost, points_transaction_id)
			VALUES ($1, $2, $3, $4, 'image', 'queued', 'openai-compatible', $5, $6, $7::jsonb, $8::numeric, NULLIF($9, '')::uuid)
			RETURNING id::text, asset_id::text, user_id::text, channel_id::text, kind, status, model, prompt,
			          parameters->>'size', (parameters->>'width')::integer, (parameters->>'height')::integer,
			          parameters->>'quality', parameters->>'providerSize', parameters->>'providerQuality',
			          coalesce((parameters->>'durationSeconds')::integer,0),coalesce(parameters->>'videoMode',''),coalesce((parameters->>'soundEnabled')::boolean,false),coalesce((parameters->>'watermarkEnabled')::boolean,false),coalesce(parameters->'referenceAssetIds', '[]'::jsonb), points_cost, coalesce(points_transaction_id::text, ''), points_refunded,
			          coalesce(upstream_task_id,''),coalesce(upstream_query_path,''),coalesce(review_reason,''),created_at
		`, taskID, userID, assetID, options.ChannelID, options.Model, prompt, taskParametersJSON, pointsCost, pointsTransactionID)

		var task Task
		if err := scanTask(row, &task, false); err != nil {
			return ImageBatch{}, err
		}
		task.PointsRemaining = pointsRemaining
		tasks = append(tasks, task)
	}
	if err := tx.Commit(ctx); err != nil {
		return ImageBatch{}, err
	}
	return ImageBatch{Tasks: tasks, PointsRemaining: pointsRemaining}, nil
}

func (repository *Repository) CreateVideo(ctx context.Context, userID, requestID, prompt string, options VideoOptions, references []VideoReference, pointsCost float64) (Task, float64, error) {
	taskID, assetID := uuid.NewString(), uuid.NewString()
	referenceAssetIDs := make([]string, 0, len(references))
	for _, reference := range references {
		referenceAssetIDs = append(referenceAssetIDs, reference.AssetID)
	}
	parameters, err := json.Marshal(map[string]interface{}{"size": options.Ratio, "quality": options.Resolution, "durationSeconds": options.DurationSeconds, "soundEnabled": options.SoundEnabled, "watermarkEnabled": options.WatermarkEnabled, "width": options.Width, "height": options.Height, "videoMode": options.Mode, "videoReferences": references, "referenceAssetIds": referenceAssetIDs, "requestId": requestID, "requestIndex": 0})
	if err != nil {
		return Task{}, 0, err
	}
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return Task{}, 0, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, userID+":"+requestID); err != nil {
		return Task{}, 0, err
	}
	existing, existingBalance, err := loadRequestTasksTx(ctx, tx, userID, requestID, "video")
	if err != nil {
		return Task{}, 0, err
	}
	if len(existing) > 0 {
		if err := tx.Commit(ctx); err != nil {
			return Task{}, 0, err
		}
		existing[0].PointsRemaining = existingBalance
		return existing[0], existingBalance, nil
	}
	for _, reference := range references {
		var kind, mimeType, storageKey string
		if err := tx.QueryRow(ctx, `SELECT kind,mime_type,coalesce(storage_key,'') FROM media_assets WHERE id=$1 AND user_id=$2 AND status='ready'`, reference.AssetID, userID).Scan(&kind, &mimeType, &storageKey); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return Task{}, 0, ErrInvalidVideoReference
			}
			return Task{}, 0, err
		}
		valid := storageKey != "" && strings.HasPrefix(mimeType, kind+"/")
		if options.Mode == VideoModeFrames {
			valid = valid && kind == "image" && (reference.Role == VideoRoleFirstFrame || reference.Role == VideoRoleLastFrame)
		} else {
			expectedRoles := map[string]string{"image": VideoRoleImage, "video": VideoRoleVideo, "audio": VideoRoleAudio}
			valid = valid && (options.Mode == VideoModeReference || isSpecialVideoMode(options.Mode)) && expectedRoles[kind] == reference.Role
		}
		if !valid {
			return Task{}, 0, ErrInvalidVideoReference
		}
	}
	var remaining float64
	if err := tx.QueryRow(ctx, `UPDATE users SET points_balance=points_balance-$2::numeric,updated_at=now() WHERE id=$1 AND status='active' AND points_balance >= $2::numeric RETURNING points_balance`, userID, pointsCost).Scan(&remaining); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, 0, ErrInsufficientPoints
		}
		return Task{}, 0, err
	}
	transactionID := ""
	if pointsCost > 0 {
		transactionID = uuid.NewString()
		if _, err = tx.Exec(ctx, `INSERT INTO point_transactions(id,user_id,type,amount,balance_after,description,model,source_id,idempotency_key)VALUES($1,$2,'consume',$3::numeric,$4::numeric,'视频生成',$5,$6,$7)`, transactionID, userID, -pointsCost, remaining, options.Model, taskID, "generation-consume:"+taskID); err != nil {
			return Task{}, 0, err
		}
	}
	title := truncateRunes(prompt, 80)
	if title == "" && options.Mode == VideoModeFrames {
		title = "首尾帧视频"
	} else if title == "" {
		title = "全能参考视频"
	}
	if _, err = tx.Exec(ctx, `INSERT INTO media_assets(id,user_id,kind,source,status,title,size_bytes,width,height)VALUES($1,$2,'video','generated','generating',$3,0,0,0)`, assetID, userID, title); err != nil {
		return Task{}, 0, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO generation_tasks(id,user_id,asset_id,channel_id,kind,status,provider,model,prompt,parameters,points_cost,points_transaction_id)VALUES($1,$2,$3,$4,'video','queued','compshare-minimax-h3',$5,$6,$7::jsonb,$8::numeric,NULLIF($9,'')::uuid)`, taskID, userID, assetID, options.ChannelID, options.Model, prompt, parameters, pointsCost, transactionID); err != nil {
		return Task{}, 0, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Task{}, 0, err
	}
	task, err := repository.Get(ctx, userID, taskID)
	task.PointsRemaining = remaining
	return task, remaining, err
}

func loadRequestTasksTx(ctx context.Context, tx pgx.Tx, userID, requestID, kind string) ([]Task, float64, error) {
	rows, err := tx.Query(ctx, `
		SELECT id::text,asset_id::text,user_id::text,coalesce(channel_id::text,''),kind,status,model,prompt,
		       coalesce(parameters->>'size',''),coalesce((parameters->>'width')::integer,0),coalesce((parameters->>'height')::integer,0),
		       coalesce(parameters->>'quality',''),coalesce(parameters->>'providerSize',''),coalesce(parameters->>'providerQuality',''),
		       coalesce((parameters->>'durationSeconds')::integer,0),coalesce(parameters->>'videoMode',''),coalesce((parameters->>'soundEnabled')::boolean,false),coalesce((parameters->>'watermarkEnabled')::boolean,false),
		       coalesce(parameters->'referenceAssetIds','[]'::jsonb),points_cost,coalesce(points_transaction_id::text,''),points_refunded,
		       coalesce(upstream_task_id,''),coalesce(upstream_query_path,''),coalesce(review_reason,''),created_at
		FROM generation_tasks WHERE user_id=$1 AND parameters->>'requestId'=$2 AND kind=$3
		ORDER BY (parameters->>'requestIndex')::integer
	`, userID, requestID, kind)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	tasks := []Task{}
	for rows.Next() {
		var task Task
		if err := scanTask(rows, &task, false); err != nil {
			return nil, 0, err
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var balance float64
	if err := tx.QueryRow(ctx, `SELECT points_balance FROM users WHERE id=$1`, userID).Scan(&balance); err != nil {
		return nil, 0, err
	}
	return tasks, balance, nil
}

func (repository *Repository) Get(ctx context.Context, userID, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, asset_id::text, user_id::text, coalesce(channel_id::text, ''), kind, status, model, prompt,
		       coalesce(parameters->>'size',''), coalesce((parameters->>'width')::integer,0), coalesce((parameters->>'height')::integer,0),
		       coalesce(parameters->>'quality',''), coalesce(parameters->>'providerSize',''), coalesce(parameters->>'providerQuality',''),coalesce((parameters->>'durationSeconds')::integer,0),coalesce(parameters->>'videoMode',''),coalesce((parameters->>'soundEnabled')::boolean,false),coalesce((parameters->>'watermarkEnabled')::boolean,false), coalesce(parameters->'referenceAssetIds', '[]'::jsonb), points_cost, coalesce(points_transaction_id::text, ''), points_refunded,
		       coalesce(upstream_task_id,''),coalesce(upstream_query_path,''),coalesce(review_reason,''),coalesce(error_message, ''), created_at
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
		WHERE status = 'running' AND upstream_task_id IS NULL AND started_at < $1
	`, staleBefore)
	return err
}

func (repository *Repository) RecoverPollingTasks(ctx context.Context) error {
	_, err := repository.pool.Exec(ctx, `UPDATE generation_tasks SET next_poll_at=now() WHERE kind='video' AND status='running' AND upstream_task_id IS NOT NULL`)
	return err
}

func (repository *Repository) ClaimNext(ctx context.Context, pollLeaseUntil time.Time) (Task, bool, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Task{}, false, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
		SELECT id::text, asset_id::text, user_id::text, channel_id::text, kind, status, model, prompt,
		       coalesce(parameters->>'size',''), coalesce((parameters->>'width')::integer,0), coalesce((parameters->>'height')::integer,0),
		       coalesce(parameters->>'quality',''), coalesce(parameters->>'providerSize',''), coalesce(parameters->>'providerQuality',''),coalesce((parameters->>'durationSeconds')::integer,0),coalesce(parameters->>'videoMode',''),coalesce((parameters->>'soundEnabled')::boolean,false),coalesce((parameters->>'watermarkEnabled')::boolean,false), coalesce(parameters->'referenceAssetIds', '[]'::jsonb), points_cost, coalesce(points_transaction_id::text, ''), points_refunded,
		       coalesce(upstream_task_id,''),coalesce(upstream_query_path,''),coalesce(review_reason,''),created_at
		FROM generation_tasks
		WHERE status = 'queued' OR (kind='video' AND status='running' AND upstream_task_id IS NOT NULL AND next_poll_at <= now())
		ORDER BY CASE WHEN status='running' THEN 0 ELSE 1 END,coalesce(next_poll_at,created_at) ASC
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
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status='running',started_at=coalesce(started_at,now()),error_message=NULL,next_poll_at=CASE WHEN upstream_task_id IS NULL THEN NULL ELSE $2::timestamptz END WHERE id=$1`, task.ID, pollLeaseUntil); err != nil {
		return Task{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Task{}, false, err
	}
	task.Status = TaskRunning
	return task, true, nil
}

func (repository *Repository) StartAttempt(ctx context.Context, taskID, channelID, protocol, path string) (string, int, error) {
	id := uuid.NewString()
	var attemptNo int
	err := repository.pool.QueryRow(ctx, `INSERT INTO generation_attempts (id,task_id,attempt_no,channel_id,protocol,request_path,status,concurrency_at_start) SELECT $1,$2,coalesce(max(a.attempt_no),0)+1,NULLIF($3,'')::uuid,$4,$5,'running',coalesce((SELECT active_requests FROM model_channels WHERE id=NULLIF($3,'')::uuid),0) FROM generation_attempts a WHERE a.task_id=$2 RETURNING attempt_no`, id, taskID, channelID, protocol, path).Scan(&attemptNo)
	return id, attemptNo, err
}

func (repository *Repository) FinishAttempt(ctx context.Context, id, status string, httpStatus *int, durationMS int64, message string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE generation_attempts SET status=$2,http_status=$3,duration_ms=$4,error_message=left($5,500),completed_at=now() WHERE id=$1`, id, status, httpStatus, durationMS, sanitizeExecutionError(message))
	return err
}

var secretTokenPattern = regexp.MustCompile(`(?i)(bearer\s+|api[_-]?key["'=:\s]+|sk-)[A-Za-z0-9._~+/=-]{6,}`)

func sanitizeExecutionError(value string) string {
	return strings.TrimSpace(secretTokenPattern.ReplaceAllString(value, "$1[REDACTED]"))
}

func (repository *Repository) SetChannel(ctx context.Context, taskID, channelID string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE generation_tasks SET channel_id=$2 WHERE id=$1`, taskID, channelID)
	return err
}

func (repository *Repository) MarkPolling(ctx context.Context, task Task, upstreamID, queryPath string, nextPollAt time.Time) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE media_assets SET status='generating',error_message=NULL WHERE id=$1`, task.AssetID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE generation_tasks SET status='running',upstream_task_id=$2,upstream_query_path=$3,next_poll_at=$4,review_reason=NULL,error_message=NULL WHERE id=$1`, task.ID, upstreamID, queryPath, nextPollAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *Repository) SchedulePoll(ctx context.Context, taskID string, nextPollAt time.Time, message string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE generation_tasks SET status='running',next_poll_at=$2,error_message=NULL,review_reason=NULL WHERE id=$1 AND status='running'`, taskID, nextPollAt)
	return err
}

func scanTask(row rowScanner, task *Task, withError bool) error {
	var referenceAssetIDs []byte
	values := []interface{}{
		&task.ID, &task.AssetID, &task.userID, &task.ChannelID, &task.Kind, &task.Status, &task.Model, &task.Prompt,
		&task.Size, &task.Width, &task.Height, &task.Quality, &task.providerSize, &task.providerQuality, &task.DurationSeconds, &task.VideoMode, &task.SoundEnabled, &task.WatermarkEnabled,
		&referenceAssetIDs, &task.PointsCost, &task.pointsTransactionID, &task.pointsRefunded,
		&task.UpstreamTaskID, &task.UpstreamQueryPath, &task.ReviewReason,
	}
	if withError {
		values = append(values, &task.ErrorMessage)
	}
	values = append(values, &task.CreatedAt)
	if err := row.Scan(values...); err != nil {
		return err
	}
	return json.Unmarshal(referenceAssetIDs, &task.ReferenceAssetIDs)
}

func (repository *Repository) GetByID(ctx context.Context, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `SELECT id::text,asset_id::text,user_id::text,coalesce(channel_id::text,''),kind,status,model,prompt,coalesce(parameters->>'size',''),coalesce((parameters->>'width')::integer,0),coalesce((parameters->>'height')::integer,0),coalesce(parameters->>'quality',''),coalesce(parameters->>'providerSize',''),coalesce(parameters->>'providerQuality',''),coalesce((parameters->>'durationSeconds')::integer,0),coalesce(parameters->>'videoMode',''),coalesce((parameters->>'soundEnabled')::boolean,false),coalesce((parameters->>'watermarkEnabled')::boolean,false),coalesce(parameters->'referenceAssetIds','[]'::jsonb),points_cost,coalesce(points_transaction_id::text,''),points_refunded,coalesce(upstream_task_id,''),coalesce(upstream_query_path,''),coalesce(review_reason,''),coalesce(error_message,''),created_at FROM generation_tasks WHERE id=$1`, taskID)
	var task Task
	if err := scanTask(row, &task, true); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Task{}, ErrTaskNotFound
		}
		return Task{}, err
	}
	return task, nil
}

func (repository *Repository) MarkNeedsReview(ctx context.Context, task Task, upstreamID, queryPath, reason string) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE media_assets SET status='needs_review',error_message=$2 WHERE id=$1`, task.AssetID, reason); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE generation_tasks SET status='needs_review',upstream_task_id=NULLIF($2,''),upstream_query_path=NULLIF($3,''),next_poll_at=NULL,review_reason=$4,error_message=$4 WHERE id=$1`, task.ID, upstreamID, queryPath, reason); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *Repository) GetReferences(ctx context.Context, task Task) ([]storedReference, error) {
	if len(task.ReferenceAssetIDs) == 0 || task.userID == "" {
		return nil, ErrInvalidReference
	}
	if task.Kind == "video" {
		rows, err := repository.pool.Query(ctx, `
			SELECT coalesce(asset.storage_key,''),coalesce(asset.original_name,''),coalesce(asset.mime_type,''),asset.kind,item.value->>'role'
			FROM generation_tasks task
			CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(task.parameters->'videoReferences')='array' THEN task.parameters->'videoReferences' ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value,position)
			JOIN media_assets asset ON asset.id=(item.value->>'assetId')::uuid AND asset.user_id=task.user_id AND asset.status='ready'
			WHERE task.id=$1 AND task.user_id=$2
			ORDER BY item.position
		`, task.ID, task.userID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		references := make([]storedReference, 0, len(task.ReferenceAssetIDs))
		for rows.Next() {
			var reference storedReference
			if err := rows.Scan(&reference.StorageKey, &reference.OriginalName, &reference.MimeType, &reference.Kind, &reference.Role); err != nil {
				return nil, err
			}
			if reference.StorageKey == "" {
				return nil, ErrInvalidVideoReference
			}
			references = append(references, reference)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if len(references) != len(task.ReferenceAssetIDs) {
			return nil, ErrInvalidVideoReference
		}
		return references, nil
	}
	references := make([]storedReference, 0, len(task.ReferenceAssetIDs))
	for _, referenceAssetID := range task.ReferenceAssetIDs {
		var reference storedReference
		err := repository.pool.QueryRow(ctx, `
			SELECT coalesce(storage_key, ''), coalesce(original_name, ''), coalesce(mime_type, ''),kind
			FROM media_assets
			WHERE id = $1 AND user_id = $2 AND kind = 'image' AND status = 'ready'
		`, referenceAssetID, task.userID).Scan(&reference.StorageKey, &reference.OriginalName, &reference.MimeType, &reference.Kind)
		if errors.Is(err, pgx.ErrNoRows) || reference.StorageKey == "" {
			return nil, ErrInvalidReference
		}
		if err != nil {
			return nil, err
		}
		references = append(references, reference)
	}
	return references, nil
}

func (repository *Repository) Complete(ctx context.Context, task Task, asset CompletedAsset) error {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM generation_tasks WHERE id=$1 FOR UPDATE`, task.ID).Scan(&status); err != nil {
		return err
	}
	if status != "running" && status != "needs_review" {
		return ErrTaskNotActive
	}
	if _, err := tx.Exec(ctx, `
		UPDATE media_assets
		SET status = 'ready', storage_key = $2, original_name = $3, mime_type = $4,
		    size_bytes = $5, width = $6, height = $7,duration_seconds=$8,error_message = NULL
		WHERE id = $1
	`, task.AssetID, asset.StorageKey, asset.OriginalName, asset.MimeType, asset.SizeBytes, asset.Width, asset.Height, asset.DurationSeconds); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE generation_tasks
		SET status = 'succeeded', completed_at = now(), next_poll_at=NULL,error_message = NULL
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
	var cost float64
	var refunded bool
	var retryCount int
	var userID, model, status string
	if err := tx.QueryRow(ctx, `SELECT user_id::text, model,status,points_cost, points_refunded, retry_count FROM generation_tasks WHERE id = $1 FOR UPDATE`, task.ID).Scan(&userID, &model, &status, &cost, &refunded, &retryCount); err != nil {
		return err
	}
	if status == "succeeded" || status == "failed" || status == "cancelled" {
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE media_assets SET status = 'failed', error_message = $2 WHERE id = $1`, task.AssetID, message); err != nil {
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
		`, uuid.NewString(), userID, cost, balance, model, task.ID, fmt.Sprintf("generation-refund:%s:%d", task.ID, retryCount)); err != nil {
			return err
		}
		refunded = true
	}
	if _, err := tx.Exec(ctx, `UPDATE generation_tasks SET status = 'failed', completed_at = now(),next_poll_at=NULL,error_message = $2, points_refunded = $3 WHERE id = $1`, task.ID, message, refunded); err != nil {
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
