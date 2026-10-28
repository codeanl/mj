package adminaudit

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAuditRecordAndList(t *testing.T) {
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
	actorID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO users(id,email,username,password_hash,role)VALUES($1,$2,'audit-admin','x','admin')`, actorID, "audit-"+uuid.NewString()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM admin_audit_logs WHERE actor_user_id=$1`, actorID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, actorID)
	}()
	service := NewService(NewRepository(pool))
	if err := service.Record(ctx, Entry{ActorUserID: actorID, Action: "user.password_reset", TargetType: "user", TargetID: "0001", Before: map[string]string{"status": "active"}, After: map[string]bool{"sessionsRevoked": true}, IPAddress: "127.0.0.1", RequestID: "request-test", Succeeded: true, StatusCode: 200}); err != nil {
		t.Fatal(err)
	}
	page, err := service.List(ctx, ListInput{Page: 1, PageSize: 20, Search: "0001"})
	if err != nil || len(page.Items) != 1 || page.Items[0].Action != "user.password_reset" || page.Items[0].RequestID != "request-test" || !page.Items[0].Succeeded || page.Items[0].StatusCode != 200 {
		t.Fatalf("unexpected audit page: %#v err=%v", page, err)
	}
}
