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

func TestConfiguredVideoExtendCreateQueryAndCancel(t *testing.T) {
	requests := []string{}
	var createBody map[string]interface{}
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.URL.Path {
		case "/extend":
			if err := json.NewDecoder(r.Body).Decode(&createBody); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"id":"extend-1"}}`))
		case "/extend/extend-1":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"status":"completed","video_url":"` + server.URL + `/result.mp4"}}`))
		case "/extend/extend-1/cancel":
			w.WriteHeader(http.StatusNoContent)
		case "/result.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("extended-video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	operation := modelchannels.ModeOperationConfig{CreatePath: "/extend", QueryPath: "/extend/:task_id", CancelPath: "/extend/:task_id/cancel", CancelMethod: "DELETE", RequestTemplate: `{"model":"{{model}}","action":"{{operation}}","source":"{{video}}","seconds":"{{duration}}","audio":"{{generate_audio}}"}`, StatusField: "data.status", ResultField: "data.video_url"}
	selected := modelchannels.ResolvedModel{BaseURL: server.URL, Protocol: "custom", UpstreamModel: "extend-pro", CapabilityConfig: modelchannels.ModelCapabilityConfig{ModeOperations: map[string]modelchannels.ModeOperationConfig{"extend": operation}}}
	provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	provider.client = server.Client()
	task := Task{ID: "local-task", VideoMode: "extend", Prompt: "延长镜头", Size: "16:9", Quality: "1080P", DurationSeconds: 8, SoundEnabled: true}
	created, err := provider.Create(context.Background(), task, selected, []*ReferenceImage{{Kind: "video", Role: VideoRoleVideo, MimeType: "video/mp4", Content: []byte("source-video")}})
	if err != nil || !created.Pending || created.UpstreamTaskID != "extend-1" {
		t.Fatalf("create: %#v err=%v", created, err)
	}
	if createBody["action"] != "extend" || createBody["model"] != "extend-pro" || createBody["seconds"] != float64(8) || createBody["audio"] != true || createBody["source"] == "" {
		t.Fatalf("unexpected create body: %#v", createBody)
	}
	task.UpstreamTaskID = created.UpstreamTaskID
	result, err := provider.Query(context.Background(), task, selected)
	if err != nil || string(result.Content) != "extended-video" || result.MimeType != "video/mp4" {
		t.Fatalf("query: %#v err=%v", result, err)
	}
	if err := provider.Cancel(context.Background(), task, selected); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	want := []string{"POST /extend", "GET /extend/extend-1", "GET /result.mp4", "DELETE /extend/extend-1/cancel"}
	if len(requests) != len(want) {
		t.Fatalf("unexpected requests: %#v", requests)
	}
	for index := range want {
		if requests[index] != want[index] {
			t.Fatalf("request %d: got %q want %q", index, requests[index], want[index])
		}
	}
}
