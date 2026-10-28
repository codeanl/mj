package adminaudit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (repository *Repository) Record(ctx context.Context, entry Entry) error {
	before, err := json.Marshal(entry.Before)
	if err != nil {
		return err
	}
	after, err := json.Marshal(entry.After)
	if err != nil {
		return err
	}
	_, err = repository.pool.Exec(ctx, `
		INSERT INTO admin_audit_logs
			(id, actor_user_id, action, target_type, target_id, before_data, after_data, ip_address, user_agent, request_id, succeeded, status_code)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
	`, uuid.NewString(), entry.ActorUserID, entry.Action, entry.TargetType, entry.TargetID, before, after, entry.IPAddress, entry.UserAgent, entry.RequestID, entry.Succeeded, entry.StatusCode)
	return err
}

func (repository *Repository) List(ctx context.Context, input ListInput) (Page, error) {
	offset := (input.Page - 1) * input.PageSize
	rows, err := repository.pool.Query(ctx, `
		SELECT log.id::text, actor.public_id, actor.username, log.action, log.target_type, log.target_id,
		       log.before_data, log.after_data, log.ip_address, log.user_agent, log.request_id, log.succeeded, log.status_code, log.created_at,
		       count(*) OVER()
		FROM admin_audit_logs log
		JOIN users actor ON actor.id = log.actor_user_id
		WHERE ($1 = '' OR log.action = $1)
		  AND ($2 = '' OR actor.username ILIKE '%' || $2 || '%' OR log.target_id ILIKE '%' || $2 || '%' OR log.action ILIKE '%' || $2 || '%')
		ORDER BY log.created_at DESC, log.id DESC
		LIMIT $3 OFFSET $4
	`, input.Action, input.Search, input.PageSize, offset)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	items := make([]Item, 0, input.PageSize)
	var total int64
	for rows.Next() {
		var item Item
		if err := rows.Scan(&item.ID, &item.ActorAccountID, &item.ActorUsername, &item.Action, &item.TargetType, &item.TargetID, &item.Before, &item.After, &item.IPAddress, &item.UserAgent, &item.RequestID, &item.Succeeded, &item.StatusCode, &item.CreatedAt, &total); err != nil {
			return Page{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	return Page{Items: items, Total: total, Page: input.Page, PageSize: input.PageSize}, nil
}

func (repository *Repository) Recent(ctx context.Context, limit int) ([]Item, error) {
	page, err := repository.List(ctx, ListInput{Page: 1, PageSize: limit})
	return page.Items, err
}
