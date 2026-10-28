package cdk

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Create(ctx context.Context, actorID string, inputs []newCode) ([]Code, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	items := make([]Code, 0, len(inputs))
	for _, input := range inputs {
		item := Code{ID: uuid.NewString(), Code: input.Plain, CodePreview: input.Preview, Points: input.Points, MaxRedemptions: input.MaxRedemptions, Status: "active", Note: input.Note, ExpiresAt: input.ExpiresAt, Redemptions: []Redemption{}}
		if err := tx.QueryRow(ctx, `
			INSERT INTO cdk_codes (id, code_hash, code_ciphertext, code_preview, points, max_redemptions, note, expires_at, created_by)
			VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9)
			RETURNING created_at
		`, item.ID, input.Hash, input.Ciphertext, input.Preview, input.Points, input.MaxRedemptions, input.Note, input.ExpiresAt, actorID).Scan(&item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return items, nil
}

func (repository *PostgresRepository) List(ctx context.Context, input ListInput) (Page, error) {
	where, args := listWhere(input)
	var total int64
	if err := repository.pool.QueryRow(ctx, "SELECT count(*) FROM cdk_codes code "+where, args...).Scan(&total); err != nil {
		return Page{}, err
	}
	queryArgs := append(args, input.PageSize, (input.Page-1)*input.PageSize)
	rows, err := repository.pool.Query(ctx, `
		SELECT code.id::text, code.code_ciphertext, code.code_preview, code.points, code.max_redemptions,
		       code.redeemed_count, code.status, code.note, code.expires_at, code.created_at
		FROM cdk_codes code `+where+fmt.Sprintf(" ORDER BY code.created_at DESC, code.id DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2), queryArgs...)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	items := make([]Code, 0, input.PageSize)
	ids := make([]string, 0, input.PageSize)
	for rows.Next() {
		var item Code
		if err := rows.Scan(&item.ID, &item.Code, &item.CodePreview, &item.Points, &item.MaxRedemptions, &item.RedeemedCount, &item.Status, &item.Note, &item.ExpiresAt, &item.CreatedAt); err != nil {
			return Page{}, err
		}
		item.Redemptions = []Redemption{}
		items = append(items, item)
		ids = append(ids, item.ID)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	if len(ids) > 0 {
		redemptionRows, err := repository.pool.Query(ctx, `
			SELECT redemption.cdk_code_id::text, users.public_id, users.username, redemption.points, redemption.redeemed_at
			FROM cdk_redemptions redemption
			JOIN users ON users.id = redemption.user_id
			WHERE redemption.cdk_code_id::text = ANY($1::text[])
			ORDER BY redemption.redeemed_at DESC
		`, ids)
		if err != nil {
			return Page{}, err
		}
		defer redemptionRows.Close()
		byID := make(map[string]int, len(items))
		for index, item := range items {
			byID[item.ID] = index
		}
		for redemptionRows.Next() {
			var codeID string
			var redemption Redemption
			if err := redemptionRows.Scan(&codeID, &redemption.AccountID, &redemption.Username, &redemption.Points, &redemption.RedeemedAt); err != nil {
				return Page{}, err
			}
			index := byID[codeID]
			items[index].Redemptions = append(items[index].Redemptions, redemption)
		}
		if err := redemptionRows.Err(); err != nil {
			return Page{}, err
		}
	}
	var stats Stats
	if err := repository.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE redeemed_count > 0),
		       count(*) FILTER (WHERE redeemed_count = 0 AND (expires_at IS NULL OR expires_at > now())),
		       count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= now())
		FROM cdk_codes
	`).Scan(&stats.Total, &stats.Redeemed, &stats.Unused, &stats.Expired); err != nil {
		return Page{}, err
	}
	return Page{Items: items, Total: total, Page: input.Page, PageSize: input.PageSize, Stats: stats}, nil
}

func listWhere(input ListInput) (string, []interface{}) {
	conditions := make([]string, 0, 3)
	args := make([]interface{}, 0, 3)
	if input.Search != "" {
		args = append(args, "%"+strings.ToLower(input.Search)+"%", input.CodeHash)
		conditions = append(conditions, fmt.Sprintf(`(
			lower(code.code_preview) LIKE $%d OR lower(code.note) LIKE $%d OR code.code_hash = $%d OR EXISTS (
				SELECT 1 FROM cdk_redemptions redemption JOIN users ON users.id = redemption.user_id
				WHERE redemption.cdk_code_id = code.id AND (lower(users.username) LIKE $%d OR lpad(users.public_id::text, 4, '0') LIKE $%d)
			)
		)`, len(args)-1, len(args)-1, len(args), len(args)-1, len(args)-1))
	}
	switch input.Filter {
	case "redeemed":
		conditions = append(conditions, "code.redeemed_count > 0")
	case "unused":
		conditions = append(conditions, "code.redeemed_count = 0 AND (code.expires_at IS NULL OR code.expires_at > now())")
	case "expired":
		conditions = append(conditions, "code.expires_at IS NOT NULL AND code.expires_at <= now()")
	}
	if len(conditions) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(conditions, " AND "), args
}

func (repository *PostgresRepository) Delete(ctx context.Context, ids []string) (int64, error) {
	result, err := repository.pool.Exec(ctx, `DELETE FROM cdk_codes WHERE id::text = ANY($1::text[])`, ids)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (repository *PostgresRepository) Redeem(ctx context.Context, userID, codeHash string) (RedeemResult, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return RedeemResult{}, err
	}
	defer tx.Rollback(ctx)
	var codeID, status string
	var points float64
	var maxRedemptions, redeemedCount int
	var expiresAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT id::text, points, max_redemptions, redeemed_count, status, expires_at
		FROM cdk_codes WHERE code_hash = $1 FOR UPDATE
	`, codeHash).Scan(&codeID, &points, &maxRedemptions, &redeemedCount, &status, &expiresAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RedeemResult{}, ErrNotFound
		}
		return RedeemResult{}, err
	}
	if status != "active" {
		return RedeemResult{}, ErrDisabled
	}
	if expiresAt != nil && !expiresAt.After(time.Now()) {
		return RedeemResult{}, ErrExpired
	}
	var alreadyRedeemed bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM cdk_redemptions WHERE cdk_code_id = $1 AND user_id = $2)`, codeID, userID).Scan(&alreadyRedeemed); err != nil {
		return RedeemResult{}, err
	}
	if alreadyRedeemed {
		return RedeemResult{}, ErrAlreadyRedeemed
	}
	if redeemedCount >= maxRedemptions {
		return RedeemResult{}, ErrExhausted
	}
	var balance float64
	if err := tx.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return RedeemResult{}, err
	}
	next := normalizeAmount(balance + points)
	if _, err := tx.Exec(ctx, `UPDATE users SET points_balance = $2::numeric, updated_at = now() WHERE id = $1`, userID, next); err != nil {
		return RedeemResult{}, err
	}
	redemptionID := uuid.NewString()
	var redeemedAt time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO cdk_redemptions (id, cdk_code_id, user_id, points, balance_after)
		VALUES ($1, $2, $3, $4::numeric, $5::numeric)
		RETURNING redeemed_at
	`, redemptionID, codeID, userID, points, next).Scan(&redeemedAt); err != nil {
		return RedeemResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE cdk_codes SET redeemed_count = redeemed_count + 1, updated_at = now() WHERE id = $1`, codeID); err != nil {
		return RedeemResult{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO point_transactions (id, user_id, type, amount, balance_after, description, source_id, idempotency_key)
		VALUES ($1, $2, 'credit', $3::numeric, $4::numeric, 'CDK 兑换', $5, $6)
	`, uuid.NewString(), userID, points, next, codeID, "cdk:"+redemptionID); err != nil {
		return RedeemResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return RedeemResult{}, err
	}
	return RedeemResult{Points: points, Balance: next, RedeemedAt: redeemedAt}, nil
}
