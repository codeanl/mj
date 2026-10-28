package modelchannels

import (
	"context"
	"encoding/json"
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
		SELECT id::text, name, base_url, protocol, advanced_config, api_key_ciphertext, enabled,
		       last_test_status, last_test_message, last_tested_at, created_at, updated_at,
		       priority, weight, max_concurrency, request_timeout_seconds, failure_threshold, cooldown_seconds,
		       active_requests, consecutive_failures, cooldown_until, last_runtime_error, last_runtime_at, last_latency_ms
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
		SELECT id::text, name, base_url, protocol, advanced_config, api_key_ciphertext, enabled,
		       last_test_status, last_test_message, last_tested_at, created_at, updated_at,
		       priority, weight, max_concurrency, request_timeout_seconds, failure_threshold, cooldown_seconds,
		       active_requests, consecutive_failures, cooldown_until, last_runtime_error, last_runtime_at, last_latency_ms
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
	advanced, err := json.Marshal(input.AdvancedConfig)
	if err != nil {
		return Channel{}, err
	}
	channel, err := scanChannel(repository.pool.QueryRow(ctx, `
		INSERT INTO model_channels (id, name, base_url, protocol, advanced_config, api_key_ciphertext, enabled, priority, weight, max_concurrency, request_timeout_seconds, failure_threshold, cooldown_seconds)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id::text, name, base_url, protocol, advanced_config, api_key_ciphertext, enabled,
		          last_test_status, last_test_message, last_tested_at, created_at, updated_at,
		          priority, weight, max_concurrency, request_timeout_seconds, failure_threshold, cooldown_seconds,
		          active_requests, consecutive_failures, cooldown_until, last_runtime_error, last_runtime_at, last_latency_ms
	`, id, input.Name, input.BaseURL, input.Protocol, advanced, encryptedKey, input.Enabled, input.Priority, input.Weight, input.MaxConcurrency, input.TimeoutSeconds, input.FailureThreshold, input.CooldownSeconds))
	if err != nil {
		return Channel{}, err
	}
	channel.Models = []Model{}
	return channel, nil
}

func (repository *Repository) Update(ctx context.Context, id string, input ChannelInput, encryptedKey *string) (Channel, error) {
	advanced, err := json.Marshal(input.AdvancedConfig)
	if err != nil {
		return Channel{}, err
	}
	row := repository.pool.QueryRow(ctx, `
		UPDATE model_channels
		SET name = $2, base_url = $3, protocol = $4, advanced_config = $5::jsonb,
		    api_key_ciphertext = CASE WHEN $6::boolean THEN $7 ELSE api_key_ciphertext END,
		    enabled = $8, priority = $9, weight = $10, max_concurrency = $11, request_timeout_seconds = $12,
		    failure_threshold = $13, cooldown_seconds = $14, updated_at = now()
		WHERE id = $1
		RETURNING id::text, name, base_url, protocol, advanced_config, api_key_ciphertext, enabled,
		          last_test_status, last_test_message, last_tested_at, created_at, updated_at,
		          priority, weight, max_concurrency, request_timeout_seconds, failure_threshold, cooldown_seconds,
		          active_requests, consecutive_failures, cooldown_until, last_runtime_error, last_runtime_at, last_latency_ms
	`, id, input.Name, input.BaseURL, input.Protocol, advanced, encryptedKey != nil, stringValue(encryptedKey), input.Enabled, input.Priority, input.Weight, input.MaxConcurrency, input.TimeoutSeconds, input.FailureThreshold, input.CooldownSeconds)
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

func (repository *Repository) SaveHealthCheck(ctx context.Context, id string, success bool, latencyMS int64, message string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE model_channels SET last_runtime_at=now(),last_latency_ms=$3,last_runtime_error=CASE WHEN $2 THEN '' ELSE left($4,500) END,consecutive_failures=CASE WHEN $2 THEN 0 ELSE consecutive_failures+1 END,cooldown_until=CASE WHEN $2 THEN NULL ELSE cooldown_until END WHERE id=$1`, id, success, latencyMS, message)
	return err
}

func (repository *Repository) CreateModel(ctx context.Context, channelID string, input ModelInput) (Model, error) {
	id := uuid.NewString()
	capabilityConfig, _ := json.Marshal(input.CapabilityConfig)
	model, err := scanModel(repository.pool.QueryRow(ctx, `
		INSERT INTO channel_models (id, channel_id, model_id, display_name, capability, enabled, sort_order,capability_config,capability_override)
		VALUES ($1, $2, $3, $4, $5, $6, $7,$8::jsonb,$9)
		RETURNING id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order,capability_config,capability_override,created_at, updated_at
	`, id, channelID, input.ModelID, input.DisplayName, input.Capability, input.Enabled, input.SortOrder, capabilityConfig, input.CapabilityOverride))
	return model, modelConflict(err)
}

func (repository *Repository) UpdateModel(ctx context.Context, channelID, id string, input ModelInput) (Model, error) {
	capabilityConfig, _ := json.Marshal(input.CapabilityConfig)
	model, err := scanModel(repository.pool.QueryRow(ctx, `
		UPDATE channel_models
		SET model_id = $3, display_name = $4, capability = $5, enabled = $6, sort_order = $7,capability_config=$8::jsonb,capability_override=$9,updated_at = now()
		WHERE id = $1 AND channel_id = $2
		RETURNING id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order,capability_config,capability_override,created_at, updated_at
	`, id, channelID, input.ModelID, input.DisplayName, input.Capability, input.Enabled, input.SortOrder, capabilityConfig, input.CapabilityOverride))
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

func (repository *Repository) UpsertDiscoveredModels(ctx context.Context, channelID string, models []BuiltInModel) error {
	batch := &pgx.Batch{}
	for index, model := range models {
		capabilityConfig, _ := json.Marshal(model.CapabilityConfig)
		batch.Queue(`
			INSERT INTO channel_models (channel_id, model_id, display_name, capability, enabled, sort_order,capability_config,capability_override)
			VALUES ($1, $2, $3, $4, true, $5,$6::jsonb,false)
			ON CONFLICT (channel_id, lower(model_id)) DO UPDATE SET display_name = EXCLUDED.display_name, capability = EXCLUDED.capability,capability_config=CASE WHEN channel_models.capability_override THEN channel_models.capability_config ELSE EXCLUDED.capability_config END,updated_at = now()
		`, channelID, model.ID, model.Label, model.Capability, index, capabilityConfig)
	}
	results := repository.pool.SendBatch(ctx, batch)
	defer results.Close()
	for range models {
		if _, err := results.Exec(); err != nil {
			return modelConflict(err)
		}
	}
	return nil
}

func (repository *Repository) ListPublicModels(ctx context.Context, capability string) ([]PublicModel, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT selected.model_id, selected.display_name, selected.capability,selected.capability_config, selected.protocol
		FROM (
			SELECT DISTINCT ON (lower(model.model_id)) model.model_id, model.display_name, model.capability,model.capability_config,
			       model.sort_order, model.created_at, channel.protocol
			FROM channel_models model
			JOIN model_channels channel ON channel.id = model.channel_id
			WHERE channel.enabled = true AND model.enabled = true AND ($1 = '' OR model.capability = $1)
			  AND (channel.api_key_ciphertext <> '' OR channel.protocol = 'stable-diffusion')
			ORDER BY lower(model.model_id), model.sort_order ASC, channel.created_at ASC, model.created_at ASC
		) selected
		ORDER BY selected.sort_order ASC, selected.created_at ASC, selected.model_id ASC
	`, capability)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := make([]PublicModel, 0)
	for rows.Next() {
		var model PublicModel
		var capabilityConfig []byte
		if err := rows.Scan(&model.ID, &model.DisplayName, &model.Capability, &capabilityConfig, &model.protocol); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(capabilityConfig, &model.CapabilityConfig); err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, rows.Err()
}

func (repository *Repository) ResolveImageModel(ctx context.Context, channelID, modelID string) (Channel, Model, error) {
	return repository.ResolveModel(ctx, "image", channelID, modelID)
}

func (repository *Repository) ResolveModel(ctx context.Context, capability, channelID, modelID string) (Channel, Model, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT channel.id::text, channel.name, channel.base_url, channel.protocol, channel.advanced_config, channel.api_key_ciphertext, channel.enabled,
		       channel.last_test_status, channel.last_test_message, channel.last_tested_at, channel.created_at, channel.updated_at,
		       channel.priority, channel.weight, channel.max_concurrency, channel.request_timeout_seconds, channel.failure_threshold, channel.cooldown_seconds,
		       channel.active_requests, channel.consecutive_failures, channel.cooldown_until, channel.last_runtime_error, channel.last_runtime_at, channel.last_latency_ms,
		       model.id::text, model.channel_id::text, model.model_id, model.display_name, model.capability, model.enabled, model.sort_order,model.capability_config,model.capability_override,model.created_at, model.updated_at
		FROM channel_models model
		JOIN model_channels channel ON channel.id = model.channel_id
		WHERE lower(model.model_id) = lower($1)
		  AND ($2 = '' OR channel.id = NULLIF($2, '')::uuid)
		  AND (($2 = '' AND channel.enabled = true AND model.enabled = true) OR $2 <> '') AND model.capability = $3
		LIMIT 1
	`, modelID, channelID, capability)
	channel, model, err := scanResolvedModel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Channel{}, Model{}, ErrModelNotFound
	}
	return channel, model, err
}

func (repository *Repository) ResolveImageModels(ctx context.Context, modelID string) ([]struct {
	Channel Channel
	Model   Model
}, error) {
	return repository.ResolveModels(ctx, "image", modelID)
}

func (repository *Repository) ResolveModels(ctx context.Context, capability, modelID string) ([]struct {
	Channel Channel
	Model   Model
}, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT channel.id::text, channel.name, channel.base_url, channel.protocol, channel.advanced_config, channel.api_key_ciphertext, channel.enabled,
		       channel.last_test_status, channel.last_test_message, channel.last_tested_at, channel.created_at, channel.updated_at,
		       channel.priority, channel.weight, channel.max_concurrency, channel.request_timeout_seconds, channel.failure_threshold, channel.cooldown_seconds,
		       channel.active_requests, channel.consecutive_failures, channel.cooldown_until, channel.last_runtime_error, channel.last_runtime_at, channel.last_latency_ms,
		       model.id::text, model.channel_id::text, model.model_id, model.display_name, model.capability, model.enabled, model.sort_order,model.capability_config,model.capability_override,model.created_at, model.updated_at
		FROM channel_models model JOIN model_channels channel ON channel.id = model.channel_id
		WHERE lower(model.model_id) = lower($1) AND channel.enabled AND model.enabled AND model.capability = $2
		  AND (channel.cooldown_until IS NULL OR channel.cooldown_until <= now())
		ORDER BY channel.priority ASC, channel.created_at ASC
	`, modelID, capability)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]struct {
		Channel Channel
		Model   Model
	}, 0)
	for rows.Next() {
		channel, model, err := scanResolvedModel(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, struct {
			Channel Channel
			Model   Model
		}{channel, model})
	}
	return result, rows.Err()
}

func (repository *Repository) TryAcquire(ctx context.Context, channelID string) (bool, error) {
	result, err := repository.pool.Exec(ctx, `UPDATE model_channels SET active_requests = active_requests + 1 WHERE id = $1 AND enabled AND active_requests < max_concurrency AND (cooldown_until IS NULL OR cooldown_until <= now())`, channelID)
	return err == nil && result.RowsAffected() == 1, err
}

func (repository *Repository) TryAcquirePinned(ctx context.Context, channelID string) (bool, error) {
	result, err := repository.pool.Exec(ctx, `UPDATE model_channels SET active_requests = active_requests + 1 WHERE id = $1 AND active_requests < max_concurrency`, channelID)
	return err == nil && result.RowsAffected() == 1, err
}

func (repository *Repository) Release(ctx context.Context, channelID string, success bool, latencyMS int64, message string) error {
	_, err := repository.pool.Exec(ctx, `
		UPDATE model_channels SET active_requests = greatest(active_requests - 1, 0), last_runtime_at = now(), last_latency_ms = $3,
		consecutive_failures = CASE WHEN $2 THEN 0 ELSE consecutive_failures + 1 END,
		last_runtime_error = CASE WHEN $2 THEN '' ELSE left($4, 500) END,
		cooldown_until = CASE WHEN $2 THEN NULL WHEN consecutive_failures + 1 >= failure_threshold THEN now() + make_interval(secs => cooldown_seconds) ELSE cooldown_until END
		WHERE id = $1
	`, channelID, success, latencyMS, message)
	return err
}

func scanResolvedModel(row rowScanner) (Channel, Model, error) {
	var channel Channel
	var model Model
	var advanced, capabilityConfig []byte
	err := row.Scan(
		&channel.ID, &channel.Name, &channel.BaseURL, &channel.Protocol, &advanced, &channel.apiKeyCiphertext, &channel.Enabled,
		&channel.LastTestStatus, &channel.LastTestMessage, &channel.LastTestedAt, &channel.CreatedAt, &channel.UpdatedAt,
		&channel.Priority, &channel.Weight, &channel.MaxConcurrency, &channel.TimeoutSeconds, &channel.FailureThreshold, &channel.CooldownSeconds,
		&channel.ActiveRequests, &channel.ConsecutiveFailures, &channel.CooldownUntil, &channel.LastRuntimeError, &channel.LastRuntimeAt, &channel.LastLatencyMs,
		&model.ID, &model.ChannelID, &model.ModelID, &model.DisplayName, &model.Capability, &model.Enabled, &model.SortOrder, &capabilityConfig, &model.CapabilityOverride, &model.CreatedAt, &model.UpdatedAt,
	)
	if err == nil {
		err = json.Unmarshal(advanced, &channel.AdvancedConfig)
	}
	if err == nil {
		err = json.Unmarshal(capabilityConfig, &model.CapabilityConfig)
	}
	return channel, model, err
}

func (repository *Repository) listModels(ctx context.Context, channelID string) ([]Model, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, channel_id::text, model_id, display_name, capability, enabled, sort_order,capability_config,capability_override,created_at, updated_at
		FROM channel_models
		WHERE ($1 = '' OR channel_id = NULLIF($1, '')::uuid)
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
	var advanced []byte
	err := row.Scan(
		&channel.ID, &channel.Name, &channel.BaseURL, &channel.Protocol, &advanced, &channel.apiKeyCiphertext, &channel.Enabled,
		&channel.LastTestStatus, &channel.LastTestMessage, &channel.LastTestedAt, &channel.CreatedAt, &channel.UpdatedAt,
		&channel.Priority, &channel.Weight, &channel.MaxConcurrency, &channel.TimeoutSeconds, &channel.FailureThreshold, &channel.CooldownSeconds,
		&channel.ActiveRequests, &channel.ConsecutiveFailures, &channel.CooldownUntil, &channel.LastRuntimeError, &channel.LastRuntimeAt, &channel.LastLatencyMs,
	)
	if err == nil {
		err = json.Unmarshal(advanced, &channel.AdvancedConfig)
	}
	return channel, err
}

func scanModel(row rowScanner) (Model, error) {
	var model Model
	var capabilityConfig []byte
	err := row.Scan(&model.ID, &model.ChannelID, &model.ModelID, &model.DisplayName, &model.Capability, &model.Enabled, &model.SortOrder, &capabilityConfig, &model.CapabilityOverride, &model.CreatedAt, &model.UpdatedAt)
	if err == nil {
		err = json.Unmarshal(capabilityConfig, &model.CapabilityConfig)
	}
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
