package generation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"nova-creator-platform/services/api/internal/modelchannels"
)

func TestProviderUsesTaskSpecificImageOptions(t *testing.T) {
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/images/generations" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}]}`))
	}))
	defer server.Close()

	provider := NewOpenAIImageProvider(time.Second, 1024*1024)
	_, err := provider.Generate(context.Background(), Task{
		Model: "gpt-image-2", Prompt: "测试", providerSize: "576x1024", providerQuality: "high",
	}, modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "test-key", UpstreamModel: "gpt-image-2"})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if body["model"] != "gpt-image-2" || body["size"] != "576x1024" || body["quality"] != "high" {
		t.Fatalf("unexpected provider request: %#v", body)
	}
}
