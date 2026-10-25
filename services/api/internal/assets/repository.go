package assets

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("asset not found")

type Repository interface {
	Create(context.Context, CreateInput) (Asset, error)
	List(context.Context, string, Kind, Source, Status, string, int, int) (Page, error)
	Find(context.Context, string, string) (Asset, error)
	FindByID(context.Context, string) (Asset, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

const assetColumns = `
	asset.id::text,asset.kind,asset.source,asset.status,asset.title,coalesce(asset.original_name,''),
	coalesce(asset.storage_key,''),coalesce(asset.mime_type,''),asset.size_bytes,asset.width,asset.height,
	asset.duration_seconds,asset.created_at,coalesce(asset.error_message,'')`

const generationColumns = `
	coalesce(task.id::text,''),coalesce(task.status,''),coalesce(task.provider,''),coalesce(task.model,''),coalesce(task.prompt,''),
	coalesce(task.parameters->>'size',''),coalesce(task.parameters->>'quality',''),coalesce((task.parameters->>'durationSeconds')::integer,0),
	coalesce((task.parameters->>'soundEnabled')::boolean,false),coalesce((task.parameters->>'watermarkEnabled')::boolean,false),
	coalesce(task.parameters->>'videoMode',''),jsonb_array_length(coalesce(task.parameters->'referenceAssetIds','[]'::jsonb)),
	coalesce(task.points_cost,0),coalesce(task.retry_count,0),coalesce(channel.name,''),coalesce(channel.protocol,''),
	coalesce(task.upstream_task_id,''),task.created_at,task.started_at,task.completed_at,
	CASE WHEN task.started_at IS NOT NULL AND task.completed_at IS NOT NULL THEN (extract(epoch FROM (task.completed_at-task.started_at))*1000)::bigint END,
	coalesce((
		SELECT jsonb_agg(jsonb_build_object(
			'assetId',reference.id::text,'type',reference.kind,'role',reference_item.role,
			'title',reference.title,'url','/api/v1/assets/'||reference.id::text||'/content'
		) ORDER BY reference_item.position)
		FROM (
			SELECT item.value->>'assetId' AS asset_id,item.value->>'role' AS role,item.position
			FROM jsonb_array_elements(coalesce(task.parameters->'videoReferences','[]'::jsonb)) WITH ORDINALITY item(value,position)
			UNION ALL
			SELECT image_id.value AS asset_id,'reference_image' AS role,image_id.position
			FROM jsonb_array_elements_text(coalesce(task.parameters->'referenceAssetIds','[]'::jsonb)) WITH ORDINALITY image_id(value,position)
			WHERE jsonb_array_length(coalesce(task.parameters->'videoReferences','[]'::jsonb))=0
		) reference_item
		JOIN media_assets reference ON reference.id=reference_item.asset_id::uuid AND reference.user_id=asset.user_id
	),'[]'::jsonb)`

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Create(ctx context.Context, input CreateInput) (Asset, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO media_assets (id, user_id, kind, source, title, original_name, storage_key, mime_type, size_bytes, width, height)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id::text, kind, source, status, title, original_name, storage_key, mime_type, size_bytes, width, height, duration_seconds, created_at, coalesce(error_message, '')
	`, input.ID, input.UserID, input.Kind, input.Source, input.Title, input.OriginalName, input.StorageKey, input.MimeType, input.SizeBytes, input.Width, input.Height)

	return scanAsset(row, false)
}

func (repository *PostgresRepository) List(ctx context.Context, userID string, kind Kind, source Source, status Status, search string, page, pageSize int) (Page, error) {
	offset := (page - 1) * pageSize
	rows, err := repository.pool.Query(ctx, `
		SELECT `+assetColumns+`,`+generationColumns+`,count(*) OVER()
		FROM media_assets asset
		LEFT JOIN generation_tasks task ON task.asset_id=asset.id
		LEFT JOIN model_channels channel ON channel.id=task.channel_id
		WHERE asset.user_id = $1
		  AND ($2 = '' OR asset.kind = $2)
		  AND ($3 = '' OR asset.source = $3)
		  AND ($4 = '' OR asset.status = $4)
		  AND ($5 = '' OR asset.title ILIKE '%' || $5 || '%')
		ORDER BY asset.created_at DESC, asset.id DESC
		LIMIT $6 OFFSET $7
	`, userID, kind, source, status, search, pageSize, offset)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()

	items := make([]Asset, 0, pageSize)
	var total int64
	for rows.Next() {
		asset, scanErr := scanAsset(rows, true, &total)
		if scanErr != nil {
			return Page{}, scanErr
		}
		items = append(items, asset)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	return Page{Items: items, Total: total, Page: page, PageSize: pageSize}, nil
}

func (repository *PostgresRepository) Find(ctx context.Context, userID, id string) (Asset, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+assetColumns+`,`+generationColumns+`
		FROM media_assets asset
		LEFT JOIN generation_tasks task ON task.asset_id=asset.id
		LEFT JOIN model_channels channel ON channel.id=task.channel_id
		WHERE asset.id = $1 AND asset.user_id = $2
		LIMIT 1
	`, id, userID)
	asset, err := scanAsset(row, true)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return asset, err
}

func (repository *PostgresRepository) FindByID(ctx context.Context, id string) (Asset, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+assetColumns+`,`+generationColumns+`
		FROM media_assets asset
		LEFT JOIN generation_tasks task ON task.asset_id=asset.id
		LEFT JOIN model_channels channel ON channel.id=task.channel_id
		WHERE asset.id = $1 AND asset.status = 'ready'
		LIMIT 1
	`, id)
	asset, err := scanAsset(row, true)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return asset, err
}

type rowScanner interface {
	Scan(...interface{}) error
}

func scanAsset(row rowScanner, withGeneration bool, extra ...interface{}) (Asset, error) {
	var asset Asset
	values := []interface{}{&asset.ID, &asset.Kind, &asset.Source, &asset.Status, &asset.Title, &asset.OriginalName, &asset.storageKey, &asset.MimeType, &asset.SizeBytes, &asset.Width, &asset.Height, &asset.DurationSeconds, &asset.CreatedAt, &asset.ErrorMessage}
	var metadata GenerationMetadata
	var generationCreatedAt *time.Time
	if withGeneration {
		values = append(values,
			&metadata.TaskID, &metadata.Status, &metadata.Provider, &metadata.Model, &metadata.Prompt,
			&metadata.Ratio, &metadata.Quality, &metadata.RequestedDurationSeconds, &metadata.SoundEnabled, &metadata.WatermarkEnabled,
			&metadata.VideoMode, &metadata.ReferenceCount, &metadata.PointsCost, &metadata.RetryCount, &metadata.ChannelName, &metadata.Protocol,
			&metadata.UpstreamTaskID, &generationCreatedAt, &metadata.StartedAt, &metadata.CompletedAt, &metadata.ExecutionDurationMS,
			&metadata.referenceJSON,
		)
	}
	values = append(values, extra...)
	err := row.Scan(values...)
	if err == nil && metadata.TaskID != "" {
		asset.GenerationTaskID = metadata.TaskID
		if generationCreatedAt != nil {
			metadata.CreatedAt = *generationCreatedAt
		}
		asset.Generation = &metadata
		if err := json.Unmarshal(metadata.referenceJSON, &metadata.References); err != nil {
			return Asset{}, err
		}
	}
	return asset, err
}
