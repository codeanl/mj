package httptransport

import (
	"net/http"
	"testing"
)

func TestFailedAuditActionMapping(t *testing.T) {
	tests := []struct {
		method     string
		path       string
		action     string
		targetType string
	}{
		{http.MethodPatch, "/api/v1/admin/users/1/password", "user.password_reset", "user"},
		{http.MethodPost, "/api/v1/admin/channels/id/models/sync", "channel.models_sync", "channel"},
		{http.MethodPost, "/api/v1/admin/generations/id/refund", "generation.refund", "generation"},
	}
	for _, test := range tests {
		action, targetType := failedAuditAction(test.method, test.path)
		if action != test.action || targetType != test.targetType {
			t.Fatalf("unexpected mapping for %s: %q %q", test.path, action, targetType)
		}
	}
}
