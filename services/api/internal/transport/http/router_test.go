package httptransport

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/redis/go-redis/v9"

	"nova-creator-platform/services/api/internal/config"
)

func TestLiveHealth(t *testing.T) {
	handler := NewRouter(context.Background(), config.Load(), slog.Default(), nil, redis.NewClient(&redis.Options{}))
	request := httptest.NewRequest(http.MethodGet, "/api/v1/health/live", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
}
