package modelchannels

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrChannelNotFound = errors.New("model channel not found")
	ErrModelNotFound   = errors.New("channel model not found")
	ErrModelConflict   = errors.New("model id already exists")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) List(ctx context.Context) ([]Channel, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, name, base_url, protocol, api_key_ciphertext, enabled,
		       last_test_status, last_test_message, last_tested_at, created_at, updated_at
		FROM model_channels
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	channels := make([]Channel, 0)
	for rows.Next() {
		channel, err := scanChannel(rows)
		if err != nil {
			return nil, err
		}
		channels = append(channels, channel)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	models, err := repository.listModels(ctx, "")
	if err != nil {
		return nil, err
	}
	byChannel := make(map[string][]Model)
	for _, model := range models {
		byChannel[model.ChannelID] = append(byChannel[model.ChannelID], model)
	}
	for index := range channels {
		channels[index].Models = byChannel[channels[index].ID]
		if channels[index].Models == nil {
			channels[index].Models = []Model{}
		}
	}
	return channels, nil
}

func (repository *Repository) Find(ctx context.Context, id string) (Channel, error) {
	channel, err := scanChannel(repository.pool.QueryRow(ctx, `
		SELECT id::text, name, base_url, protocol, api_key_ciphertext, enabled,
		       last_test_status, last_test_message, last_tested_at, created_at, updated_at
		FROM model_channels WHERE id = $1
	`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Channel{}, ErrChannelNotFound
	}
	if err != nil {
		return Channel{}, err
	}
	channel.Models, err = repository.listModels(ctx, id)
	return channel, err
}

func (repository *Repository) Create(ctx context.Context, input ChannelInput, encryptedKey string) (Channel, error) {
	id := uuid.NewString()
	channel, err := scanChannel(repository.pool.QueryRow(ctx, `
		INSERT INTO model_channels (id, name, base_url, protocol, api_key_ciphertext, enabled)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text, name, base_url, protocol, api_key_ciphertext, enabled,
		          last_test_status, last_test_message, last_tested_at, created_at, updated_at
	`, id, input.Name, input.BaseURL, input.Protocol, encryptedKey, input.Enabled))
	if err != nil {
		return Channel{}, err
	}
	channel.Models = []Model{}
	return channel, nil
}

func (repository *Repository) Update(ctx context.Context, id string, input ChannelInput, encryptedKey *string) (Channel, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE model_channels
		SET name = $2, base_url = $3, protocol = $4,
		    api_key_ciphertext = CASE WHEN $5::boolean THEN $6 ELSE api_key_ciphertext END,
		    enabled = $7, updated_at = now()
		WHERE id = $1
		RETURNING id::text, name, base_url, protocol, api_key_ciphertext, enabled,
		          last_test_status, last_test_message, last_tested_at, created_at, updated_at
	`, id, input.Name, input.BaseURL, input.Protocol, encryptedKey != nil, stringValue(encryptedKey), input.Enabled)
	channel, err := scanChannel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Channel{}, ErrChannelNotFound
	}
	if err != nil {
		return Channel{}, err
	}
	channel.Models, err = repository.listModels(ctx, id)
	return channel, err
}

func (repository *Repository) Delete(ctx context.Context, id string) error {
	result, err := repository.pool.Exec(ctx, `DELETE FROM model_channels WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func (repository *Repository) SaveTestResult(ctx context.Context, id, status, message string) error {
	result, err := repository.pool.Exec(ctx, `
		UPDATE model_channels
		SET last_test_status = $2, last_test_message = $3, last_tested_at = now(), updated_at = now()
		WHERE id = $1
	`, id, status, message)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func (repository *Repository) CreateModel(ctx context.Context, channelID string, input ModelInput) (Model, error) {
	id := uuid.NewString()
	model, err := scanModel(repository.pool.QueryRow(ctx, `
		INSERT INTO channel_models (id, channel_id, model_id, display_name, capability, enabled, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order, created_at, updated_at
	`, id, channelID, input.ModelID, input.DisplayName, input.Capability, input.Enabled, input.SortOrder))
	return model, modelConflict(err)
}

func (repository *Repository) UpdateModel(ctx context.Context, channelID, id string, input ModelInput) (Model, error) {
	model, err := scanModel(repository.pool.QueryRow(ctx, `
		UPDATE channel_models
		SET model_id = $3, display_name = $4, capability = $5, enabled = $6, sort_order = $7, updated_at = now()
		WHERE id = $1 AND channel_id = $2
		RETURNING id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order, created_at, updated_at
	`, id, channelID, input.ModelID, input.DisplayName, input.Capability, input.Enabled, input.SortOrder))
	if errors.Is(err, pgx.ErrNoRows) {
		return Model{}, ErrModelNotFound
	}
	return model, modelConflict(err)
}

func (repository *Repository) DeleteModel(ctx context.Context, channelID, id string) error {
	result, err := repository.pool.Exec(ctx, `DELETE FROM channel_models WHERE id = $1 AND channel_id = $2`, id, channelID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrModelNotFound
	}
	return nil
}

func (repository *Repository) UpsertDiscoveredModels(ctx context.Context, channelID string, modelIDs []string) error {
	batch := &pgx.Batch{}
	for index, modelID := range modelIDs {
		batch.Queue(`
			INSERT INTO channel_models (channel_id, model_id, display_name, capability, enabled, sort_order)
			VALUES ($1, $2, $2, 'image', true, $3)
			ON CONFLICT (lower(model_id)) DO UPDATE SET updated_at = now()
		`, channelID, modelID, index)
	}
	results := repository.pool.SendBatch(ctx, batch)
	defer results.Close()
	for range modelIDs {
		if _, err := results.Exec(); err != nil {
			return modelConflict(err)
		}
	}
	return nil
}

func (repository *Repository) ListPublicModels(ctx context.Context) ([]PublicModel, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT model.model_id, model.display_name, model.capability
		FROM channel_models model
		JOIN model_channels channel ON channel.id = model.channel_id
		WHERE channel.enabled = true AND model.enabled = true AND model.capability = 'image'
		  AND channel.api_key_ciphertext <> ''
		ORDER BY model.sort_order ASC, model.created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := make([]PublicModel, 0)
	for rows.Next() {
		var model PublicModel
		if err := rows.Scan(&model.ID, &model.DisplayName, &model.Capability); err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, rows.Err()
}

func (repository *Repository) ResolveImageModel(ctx context.Context, channelID, modelID string) (Channel, Model, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT channel.id::text, channel.name, channel.base_url, channel.protocol, channel.api_key_ciphertext, channel.enabled,
		       channel.last_test_status, channel.last_test_message, channel.last_tested_at, channel.created_at, channel.updated_at,
		       model.id::text, model.channel_id::text, model.model_id, model.display_name, model.capability, model.enabled, model.sort_order, model.created_at, model.updated_at
		FROM channel_models model
		JOIN model_channels channel ON channel.id = model.channel_id
		WHERE lower(model.model_id) = lower($1)
		  AND ($2 = '' OR channel.id = $2::uuid)
		  AND channel.enabled = true AND model.enabled = true AND model.capability = 'image'
		LIMIT 1
	`, modelID, channelID)
	var channel Channel
	var model Model
	err := row.Scan(
		&channel.ID, &channel.Name, &channel.BaseURL, &channel.Protocol, &channel.apiKeyCiphertext, &channel.Enabled,
		&channel.LastTestStatus, &channel.LastTestMessage, &channel.LastTestedAt, &channel.CreatedAt, &channel.UpdatedAt,
		&model.ID, &model.ChannelID, &model.ModelID, &model.DisplayName, &model.Capability, &model.Enabled, &model.SortOrder, &model.CreatedAt, &model.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Channel{}, Model{}, ErrModelNotFound
	}
	return channel, model, err
}

func (repository *Repository) listModels(ctx context.Context, channelID string) ([]Model, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order, created_at, updated_at
		FROM channel_models
		WHERE ($1 = '' OR channel_id = $1::uuid)
		ORDER BY sort_order ASC, created_at ASC, id ASC
	`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := make([]Model, 0)
	for rows.Next() {
		model, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, rows.Err()
}

type rowScanner interface {
	Scan(...interface{}) error
}

func scanChannel(row rowScanner) (Channel, error) {
	var channel Channel
	err := row.Scan(
		&channel.ID, &channel.Name, &channel.BaseURL, &channel.Protocol, &channel.apiKeyCiphertext, &channel.Enabled,
		&channel.LastTestStatus, &channel.LastTestMessage, &channel.LastTestedAt, &channel.CreatedAt, &channel.UpdatedAt,
	)
	return channel, err
}

func scanModel(row rowScanner) (Model, error) {
	var model Model
	err := row.Scan(&model.ID, &model.ChannelID, &model.ModelID, &model.DisplayName, &model.Capability, &model.Enabled, &model.SortOrder, &model.CreatedAt, &model.UpdatedAt)
	return model, err
}

func modelConflict(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" {
		return ErrModelConflict
	}
	return err
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func normalizedModelIDs(values []string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(values))
	for _, value := range values {
		modelID := strings.TrimSpace(value)
		key := strings.ToLower(modelID)
		if modelID == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, modelID)
	}
	return result
}
