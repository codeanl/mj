package cdk

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresRedeemCreditsDecimalPointsOnce(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	userID := uuid.NewString()
	email := "cdk-integration-" + uuid.NewString() + "@example.local"
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, username, password_hash, points_balance) VALUES ($1, $2, 'cdk-integration', 'test', 1.10::numeric)`, userID, email); err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(pool)
	service := NewService(repository, NewSecretCipher("integration-secret"))
	items, err := service.Generate(ctx, userID, GenerateInput{Count: 1, Points: 12.35, MaxRedemptions: 2})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = repository.Delete(ctx, []string{items[0].ID})
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()

	result, err := service.Redeem(ctx, userID, RedeemInput{Code: items[0].Code})
	if err != nil {
		t.Fatal(err)
	}
	if result.Points != 12.35 || result.Balance != 13.45 {
		t.Fatalf("unexpected redemption result: %#v", result)
	}
	if _, err := service.Redeem(ctx, userID, RedeemInput{Code: items[0].Code}); !errors.Is(err, ErrAlreadyRedeemed) {
		t.Fatalf("expected duplicate redemption error, got %v", err)
	}
	var balance float64
	var redemptionCount, transactionCount int
	if err := pool.QueryRow(ctx, `SELECT points_balance FROM users WHERE id = $1`, userID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM cdk_redemptions WHERE cdk_code_id = $1`, items[0].ID).Scan(&redemptionCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM point_transactions WHERE user_id = $1 AND source_id = $2`, userID, items[0].ID).Scan(&transactionCount); err != nil {
		t.Fatal(err)
	}
	if balance != 13.45 || redemptionCount != 1 || transactionCount != 1 {
		t.Fatalf("unexpected persisted state: balance=%v redemptions=%d transactions=%d", balance, redemptionCount, transactionCount)
	}
}
