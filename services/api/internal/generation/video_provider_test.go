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

func TestMiniMaxH3VideoProviderCreateQueryAndDownload(t *testing.T) {
	var server *httptest.Server
	requests := make([]string, 0, 3)
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.URL.Path {
		case "/minimax/v2/video_generation":
			if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer sk-ml-test" {
				t.Fatalf("unexpected create authorization or method")
			}
			if r.Header.Get("Idempotency-Key") != "nova-video:task-1:2" {
				t.Fatalf("unexpected idempotency key: %q", r.Header.Get("Idempotency-Key"))
			}
			var body struct {
				Model         string `json:"model"`
				Resolution    string `json:"resolution"`
				Duration      int    `json:"duration"`
				Ratio         string `json:"ratio"`
				MuteAudio     bool   `json:"mute_audio"`
				AIGCWatermark bool   `json:"aigc_watermark"`
				Content       []struct {
					Type     string `json:"type"`
					Text     string `json:"text"`
					Role     string `json:"role"`
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"content"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create request: %v", err)
			}
			if body.Model != "MiniMax-H3" || body.Resolution != "1080P" || body.Duration != 8 || body.Ratio != "16:9" || body.MuteAudio || body.AIGCWatermark {
				t.Fatalf("unexpected create options: %#v", body)
			}
			if len(body.Content) != 4 || body.Content[0].Type != "text" || body.Content[0].Text != "海边日落" {
				t.Fatalf("unexpected content: %#v", body.Content)
			}
			for index, item := range body.Content[1:] {
				if item.Type != "image_url" || item.Role != "reference_image" || item.ImageURL.URL != "data:image/png;base64,aW1hZ2U=" {
					t.Fatalf("unexpected reference %d: %#v", index, item)
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"task_id":"upstream-1"}`))
		case "/minimax/v2/query/video_generation/upstream-1":
			if r.Method != http.MethodGet || r.Header.Get("Authorization") != "Bearer sk-ml-test" {
				t.Fatalf("unexpected query authorization or method")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"task":{"status":"succeeded","content":{"url":"` + server.URL + `/result.mp4"}}}`))
		case "/result.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video-content"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	provider.client = server.Client()
	selected := modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "sk-ml-test", Protocol: "compshare-minimax-h3", UpstreamModel: "MiniMax-H3"}
	references := []*ReferenceImage{
		{Content: []byte("image"), MimeType: "image/png"},
		{Content: []byte("image"), MimeType: "image/png"},
		{Content: []byte("image"), MimeType: "image/png"},
	}
	created, err := provider.Create(context.Background(), Task{ID: "task-1", Prompt: "海边日落", Quality: "1080P", Size: "16:9", DurationSeconds: 8, SoundEnabled: true, retryCount: 2}, selected, references)
	if err != nil || !created.Pending || created.UpstreamTaskID != "upstream-1" {
		t.Fatalf("create result: %#v, %v", created, err)
	}
	completed, err := provider.Query(context.Background(), Task{UpstreamTaskID: created.UpstreamTaskID}, selected)
	if err != nil || completed.Pending || completed.Failed || completed.MimeType != "video/mp4" || string(completed.Content) != "video-content" {
		t.Fatalf("query result: %#v, %v", completed, err)
	}
	if len(requests) != 3 || requests[0] != "POST /minimax/v2/video_generation" || requests[1] != "GET /minimax/v2/query/video_generation/upstream-1" || requests[2] != "GET /result.mp4" {
		t.Fatalf("unexpected requests: %#v", requests)
	}
}

func TestMiniMaxH3VideoProviderMapsTerminalFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"task":{"status":"failed","error":"content rejected"}}`))
	}))
	defer server.Close()

	provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	result, err := provider.Query(context.Background(), Task{UpstreamTaskID: "upstream-2"}, modelchannels.ResolvedModel{BaseURL: server.URL})
	if err != nil || !result.Failed || result.Error != "content rejected" {
		t.Fatalf("failed result: %#v, %v", result, err)
	}
}
