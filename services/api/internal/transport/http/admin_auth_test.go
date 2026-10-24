package httptransport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"nova-creator-platform/services/api/internal/auth"
)

func TestRequireAdminRejectsUserAndAllowsAdministrator(t *testing.T) {
	handlers := authHandlers{}
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	tests := []struct {
		role   string
		status int
	}{
		{role: "user", status: http.StatusForbidden},
		{role: "admin", status: http.StatusNoContent},
	}
	for _, test := range tests {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/channels", nil)
		request = request.WithContext(context.WithValue(request.Context(), currentUserContextKey{}, auth.User{ID: "user-one", Role: test.role}))
		recorder := httptest.NewRecorder()
		handlers.RequireAdmin(next).ServeHTTP(recorder, request)
		if recorder.Code != test.status {
			t.Fatalf("role %s: expected %d, got %d", test.role, test.status, recorder.Code)
		}
	}
}
