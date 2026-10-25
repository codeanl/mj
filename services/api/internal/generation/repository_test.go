package generation

import "testing"

func TestSanitizeExecutionErrorRedactsSecrets(t *testing.T) {
	value := sanitizeExecutionError(`provider failed: Bearer token-secret-123 api_key="key-secret-456" sk-secret789`)
	if value == "" || value == `provider failed: Bearer token-secret-123 api_key="key-secret-456" sk-secret789` || containsAny(value, "token-secret-123", "key-secret-456", "sk-secret789") {
		t.Fatalf("secret was not redacted: %s", value)
	}
}
func containsAny(value string, values ...string) bool {
	for _, item := range values {
		if len(item) > 0 && regexpMatch(value, item) {
			return true
		}
	}
	return false
}
func regexpMatch(value, item string) bool {
	for index := 0; index+len(item) <= len(value); index++ {
		if value[index:index+len(item)] == item {
			return true
		}
	}
	return false
}
