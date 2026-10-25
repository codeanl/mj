package assets

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("asset not found")

type Repository interface {
	Create(context.Context, CreateInput) (Asset, error)
	List(context.Context, string, Kind, Source, string, int, int) (Page, error)
	Find(context.Context, string, string) (Asset, error)
	FindByID(context.Context, string) (Asset, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Create(ctx context.Context, input CreateInput) (Asset, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO media_assets (id, user_id, kind, source, title, original_name, storage_key, mime_type, size_bytes, width, height)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id::text, kind, source, status, title, original_name, storage_key, mime_type, size_bytes, width, height, duration_seconds, created_at, coalesce(error_message, '')
	`, input.ID, input.UserID, input.Kind, input.Source, input.Title, input.OriginalName, input.StorageKey, input.MimeType, input.SizeBytes, input.Width, input.Height)

	return scanAsset(row)
}

func (repository *PostgresRepository) List(ctx context.Context, userID string, kind Kind, source Source, search string, page, pageSize int) (Page, error) {
	offset := (page - 1) * pageSize
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, kind, source, status, title, coalesce(original_name, ''), coalesce(storage_key, ''), coalesce(mime_type, ''), size_bytes, width, height, duration_seconds, created_at, coalesce(error_message, ''), count(*) OVER()
		FROM media_assets
		WHERE user_id = $1
		  AND ($2 = '' OR kind = $2)
		  AND ($3 = '' OR source = $3)
		  AND ($4 = '' OR title ILIKE '%' || $4 || '%')
		ORDER BY created_at DESC, id DESC
		LIMIT $5 OFFSET $6
	`, userID, kind, source, search, pageSize, offset)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()

	items := make([]Asset, 0, pageSize)
	var total int64
	for rows.Next() {
		var asset Asset
		if err := rows.Scan(&asset.ID, &asset.Kind, &asset.Source, &asset.Status, &asset.Title, &asset.OriginalName, &asset.storageKey, &asset.MimeType, &asset.SizeBytes, &asset.Width, &asset.Height, &asset.DurationSeconds, &asset.CreatedAt, &asset.ErrorMessage, &total); err != nil {
			return Page{}, err
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
		SELECT id::text, kind, source, status, title, coalesce(original_name, ''), coalesce(storage_key, ''), coalesce(mime_type, ''), size_bytes, width, height, duration_seconds, created_at, coalesce(error_message, '')
		FROM media_assets
		WHERE id = $1 AND user_id = $2
		LIMIT 1
	`, id, userID)
	asset, err := scanAsset(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return asset, err
}

func (repository *PostgresRepository) FindByID(ctx context.Context, id string) (Asset, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id::text, kind, source, status, title, coalesce(original_name, ''), coalesce(storage_key, ''), coalesce(mime_type, ''), size_bytes, width, height, duration_seconds, created_at, coalesce(error_message, '')
		FROM media_assets
		WHERE id = $1 AND status = 'ready'
		LIMIT 1
	`, id)
	asset, err := scanAsset(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return asset, err
}

type rowScanner interface {
	Scan(...interface{}) error
}

func scanAsset(row rowScanner) (Asset, error) {
	var asset Asset
	err := row.Scan(&asset.ID, &asset.Kind, &asset.Source, &asset.Status, &asset.Title, &asset.OriginalName, &asset.storageKey, &asset.MimeType, &asset.SizeBytes, &asset.Width, &asset.Height, &asset.DurationSeconds, &asset.CreatedAt, &asset.ErrorMessage)
	return asset, err
}
