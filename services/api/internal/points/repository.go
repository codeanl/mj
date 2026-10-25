package points

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUserNotFound       = errors.New("points user not found")
	ErrInsufficientPoints = errors.New("insufficient points")
)

type Repository interface {
	GetConfig(context.Context) (RuleConfig, error)
	SaveConfig(context.Context, RuleConfig) (RuleConfig, error)
	Balance(context.Context, string) (float64, error)
	Adjust(context.Context, string, int64, float64, string, string) (AdjustmentResult, error)
	ListTransactions(context.Context, string, int) ([]Transaction, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) GetConfig(ctx context.Context) (RuleConfig, error) {
	var config RuleConfig
	var imageJSON, videoQualityJSON []byte
	err := repository.pool.QueryRow(ctx, `
		SELECT initial_points, default_model_cost, image_quality_multipliers, video_quality_multipliers, updated_at
		FROM points_settings WHERE id = 1
	`).Scan(&config.Settings.InitialPoints, &config.Settings.DefaultModelCost, &imageJSON, &videoQualityJSON, &config.Settings.UpdatedAt)
	if err != nil {
		return RuleConfig{}, err
	}
	if err := json.Unmarshal(imageJSON, &config.Settings.ImageQualityMultipliers); err != nil {
		return RuleConfig{}, err
	}
	if err := json.Unmarshal(videoQualityJSON, &config.Settings.VideoQualityMultipliers); err != nil {
		return RuleConfig{}, err
	}
	ruleRows, err := repository.pool.Query(ctx, `SELECT model_id, cost FROM model_point_rules ORDER BY lower(model_id)`)
	if err != nil {
		return RuleConfig{}, err
	}
	defer ruleRows.Close()
	config.Rules = make([]ModelRule, 0)
	for ruleRows.Next() {
		var rule ModelRule
		if err := ruleRows.Scan(&rule.ModelID, &rule.Cost); err != nil {
			return RuleConfig{}, err
		}
		config.Rules = append(config.Rules, rule)
	}
	if err := ruleRows.Err(); err != nil {
		return RuleConfig{}, err
	}
	modelRows, err := repository.pool.Query(ctx, `
		SELECT DISTINCT ON (lower(model.model_id)) model.model_id, model.display_name, model.capability, model.sort_order
		FROM channel_models model
		JOIN model_channels channel ON channel.id = model.channel_id
		WHERE model.enabled = true
		ORDER BY lower(model.model_id), model.sort_order, model.created_at
	`)
	if err != nil {
		return RuleConfig{}, err
	}
	defer modelRows.Close()
	config.Models = make([]CatalogModel, 0)
	for modelRows.Next() {
		var model CatalogModel
		var sortOrder int
		if err := modelRows.Scan(&model.ModelID, &model.DisplayName, &model.Capability, &sortOrder); err != nil {
			return RuleConfig{}, err
		}
		config.Models = append(config.Models, model)
	}
	return config, modelRows.Err()
}

func (repository *PostgresRepository) SaveConfig(ctx context.Context, config RuleConfig) (RuleConfig, error) {
	imageJSON, _ := json.Marshal(config.Settings.ImageQualityMultipliers)
	videoQualityJSON, _ := json.Marshal(config.Settings.VideoQualityMultipliers)
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return RuleConfig{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		UPDATE points_settings
		SET initial_points = $1::numeric, default_model_cost = $2::numeric,
		    image_quality_multipliers = $3::jsonb, video_quality_multipliers = $4::jsonb,
		    updated_at = now()
		WHERE id = 1
	`, config.Settings.InitialPoints, config.Settings.DefaultModelCost, imageJSON, videoQualityJSON); err != nil {
		return RuleConfig{}, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM model_point_rules`); err != nil {
		return RuleConfig{}, err
	}
	for _, rule := range config.Rules {
		if _, err := tx.Exec(ctx, `INSERT INTO model_point_rules (model_id, cost) VALUES ($1, $2::numeric)`, rule.ModelID, rule.Cost); err != nil {
			return RuleConfig{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return RuleConfig{}, err
	}
	return repository.GetConfig(ctx)
}

func (repository *PostgresRepository) Balance(ctx context.Context, userID string) (float64, error) {
	var balance float64
	err := repository.pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1`, userID).Scan(&balance)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	return balance, err
}

func (repository *PostgresRepository) Adjust(ctx context.Context, actorID string, accountID int64, amount float64, description, idempotencyKey string) (AdjustmentResult, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return AdjustmentResult{}, err
	}
	defer tx.Rollback(ctx)
	var userID string
	var balance float64
	if err := tx.QueryRow(ctx, `SELECT id::text, points_balance FROM users WHERE public_id = $1 FOR UPDATE`, accountID).Scan(&userID, &balance); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AdjustmentResult{}, ErrUserNotFound
		}
		return AdjustmentResult{}, err
	}
	next := normalizeAmount(balance + amount)
	if next < 0 {
		return AdjustmentResult{}, ErrInsufficientPoints
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET points_balance = $2::numeric, updated_at = now() WHERE id = $1`, userID, next); err != nil {
		return AdjustmentResult{}, err
	}
	transactionType := "adjustment"
	if amount > 0 {
		transactionType = "credit"
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO point_transactions (id, user_id, actor_user_id, type, amount, balance_after, description, idempotency_key)
		VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8)
	`, uuid.NewString(), userID, actorID, transactionType, amount, next, description, idempotencyKey); err != nil {
		return AdjustmentResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AdjustmentResult{}, err
	}
	return AdjustmentResult{Balance: next}, nil
}

func (repository *PostgresRepository) ListTransactions(ctx context.Context, userID string, limit int) ([]Transaction, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, type, amount, balance_after, description, coalesce(model, ''), created_at
		FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Transaction, 0, limit)
	for rows.Next() {
		var item Transaction
		if err := rows.Scan(&item.ID, &item.Type, &item.Amount, &item.BalanceAfter, &item.Description, &item.Model, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizeAmount(value float64) float64 {
	if value >= 0 {
		return float64(int64(value*100+0.5)) / 100
	}
	return float64(int64(value*100-0.5)) / 100
}
