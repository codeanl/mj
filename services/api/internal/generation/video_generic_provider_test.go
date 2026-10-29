package generation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nova-creator-platform/services/api/internal/modelchannels"
)

func TestConfiguredSeedanceAndVolcengineCreateQueryReferenceVideo(t *testing.T) {
	for _, protocol := range []string{"seedance", "volcengine-video"} {
		t.Run(protocol, func(t *testing.T) {
			var server *httptest.Server
			createCount := 0
			server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/contents/generations/tasks":
					if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer sk-video" {
						t.Fatalf("unexpected create request")
					}
					var body struct {
						Model   string `json:"model"`
						Content []struct {
							Type     string            `json:"type"`
							Role     string            `json:"role"`
							Text     string            `json:"text"`
							VideoURL map[string]string `json:"video_url"`
						} `json:"content"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Fatal(err)
					}
					if body.Model != "seedance-test" || body.Content[0].Type != "text" {
						t.Fatalf("unexpected body: %#v", body)
					}
					switch createCount {
					case 0:
						if len(body.Content) != 1 {
							t.Fatalf("text mode references leaked: %#v", body.Content)
						}
					case 1:
						if len(body.Content) != 3 || body.Content[1].Type != "image_url" || body.Content[1].Role != VideoRoleFirstFrame || body.Content[2].Type != "image_url" || body.Content[2].Role != VideoRoleLastFrame {
							t.Fatalf("frames body: %#v", body.Content)
						}
					case 2:
						if len(body.Content) != 2 || body.Content[1].Type != "video_url" || body.Content[1].Role != VideoRoleVideo || !strings.HasPrefix(body.Content[1].VideoURL["url"], "data:video/mp4;base64,") {
							t.Fatalf("reference body: %#v", body.Content)
						}
					default:
						t.Fatalf("unexpected body: %#v", body)
					}
					createCount++
					_, _ = w.Write([]byte(`{"id":"job-1"}`))
				case "/contents/generations/tasks/job-1":
					_, _ = w.Write([]byte(`{"status":"succeeded","content":{"video_url":"` + server.URL + `/result.mp4"}}`))
				case "/result.mp4":
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write([]byte("configured-video"))
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			operation := modelchannels.OperationConfig{CreatePath: "/contents/generations/tasks", QueryPath: "/contents/generations/tasks/:task_id", RequestTemplate: `{"model":"{{model}}","content":"{{content}}","ratio":"{{ratio}}","resolution":"{{resolution}}","duration":"{{duration}}"}`, ResultField: "content.video_url", StatusField: "status", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}
			selected := modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "sk-video", Protocol: protocol, UpstreamModel: "seedance-test", AdvancedConfig: modelchannels.AdvancedConfig{AuthMode: "bearer", OperationConfigs: map[string]modelchannels.OperationConfig{"video": operation}}}
			provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
			provider.client = server.Client()
			if _, err := provider.Create(context.Background(), Task{ID: "task-text", Prompt: "海边日落", Size: "16:9", Quality: "1080P", DurationSeconds: 8, VideoMode: VideoModeText}, selected, nil); err != nil {
				t.Fatalf("text create: %v", err)
			}
			if _, err := provider.Create(context.Background(), Task{ID: "task-frames", Prompt: "镜头过渡", Size: "16:9", Quality: "1080P", DurationSeconds: 8, VideoMode: VideoModeFrames}, selected, []*ReferenceImage{{Content: []byte("first"), MimeType: "image/png", Kind: "image", Role: VideoRoleFirstFrame}, {Content: []byte("last"), MimeType: "image/png", Kind: "image", Role: VideoRoleLastFrame}}); err != nil {
				t.Fatalf("frames create: %v", err)
			}
			created, err := provider.Create(context.Background(), Task{ID: "task-1", Prompt: "延长镜头", Size: "16:9", Quality: "1080P", DurationSeconds: 8, VideoMode: VideoModeReference}, selected, []*ReferenceImage{{Content: []byte("video"), MimeType: "video/mp4", Kind: "video", Role: VideoRoleVideo}})
			if err != nil || created.UpstreamTaskID != "job-1" || !created.Pending {
				t.Fatalf("create: %#v %v", created, err)
			}
			completed, err := provider.Query(context.Background(), Task{UpstreamTaskID: created.UpstreamTaskID, VideoMode: VideoModeReference}, selected)
			if err != nil || string(completed.Content) != "configured-video" {
				t.Fatalf("query: %#v %v", completed, err)
			}
		})
	}
}

func TestConfiguredVeoCreateQueryFirstFrame(t *testing.T) {
	var server *httptest.Server
	createCount := 0
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "gemini-key" {
			t.Fatalf("missing Gemini API key on %s", r.URL.Path)
		}
		switch r.URL.Path {
		case "/v1beta/models/veo-test:predictLongRunning":
			var body struct {
				Instances []struct {
					Prompt string `json:"prompt"`
					Image  struct {
						Data string `json:"bytesBase64Encoded"`
						Mime string `json:"mimeType"`
					} `json:"image"`
				} `json:"instances"`
				Parameters struct {
					Ratio     string `json:"aspectRatio"`
					Duration  int    `json:"durationSeconds"`
					LastFrame struct {
						Data string `json:"bytesBase64Encoded"`
					} `json:"lastFrame"`
				} `json:"parameters"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if len(body.Instances) != 1 || body.Parameters.Ratio != "16:9" || body.Parameters.Duration != 8 {
				t.Fatalf("unexpected Veo body: %#v", body)
			}
			if createCount == 0 && (body.Instances[0].Prompt != "纯文本视频" || body.Instances[0].Image.Data != "" || body.Parameters.LastFrame.Data != "") {
				t.Fatalf("unexpected Veo text body: %#v", body)
			}
			if createCount == 1 && (body.Instances[0].Prompt != "人物走向镜头" || body.Instances[0].Image.Data == "" || body.Parameters.LastFrame.Data == "") {
				t.Fatalf("unexpected Veo body: %#v", body)
			}
			createCount++
			_, _ = w.Write([]byte(`{"name":"models/veo-test/operations/veo-job"}`))
		case "/v1beta/models/veo-test/operations/veo-job":
			_, _ = w.Write([]byte(`{"done":true,"response":{"generateVideoResponse":{"generatedSamples":[{"video":{"uri":"` + server.URL + `/veo.mp4"}}]}}}`))
		case "/veo.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("veo-video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	operation := modelchannels.OperationConfig{CreatePath: "/v1beta/models/:model:predictLongRunning", ImageToVideoPath: "/v1beta/models/:model:predictLongRunning", QueryPath: "/v1beta/:task_path", ResultField: "response.generateVideoResponse.generatedSamples[0].video.uri", StatusField: "done", SupportsReferenceImage: true}
	selected := modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "gemini-key", Protocol: "gemini", UpstreamModel: "veo-test", AdvancedConfig: modelchannels.AdvancedConfig{AuthMode: "x-goog-api-key", OperationConfigs: map[string]modelchannels.OperationConfig{"video": operation}}}
	provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	provider.client = server.Client()
	if _, err := provider.Create(context.Background(), Task{ID: "task-veo-text", Prompt: "纯文本视频", Size: "16:9", Quality: "1080P", DurationSeconds: 8, VideoMode: VideoModeText}, selected, nil); err != nil {
		t.Fatalf("text create: %v", err)
	}
	created, err := provider.Create(context.Background(), Task{ID: "task-veo", Prompt: "人物走向镜头", Size: "16:9", Quality: "1080P", DurationSeconds: 8, VideoMode: VideoModeFrames}, selected, []*ReferenceImage{{Content: []byte("first"), MimeType: "image/png", Kind: "image", Role: VideoRoleFirstFrame}, {Content: []byte("last"), MimeType: "image/png", Kind: "image", Role: VideoRoleLastFrame}})
	if err != nil || created.UpstreamTaskID != "models/veo-test/operations/veo-job" {
		t.Fatalf("create: %#v %v", created, err)
	}
	completed, err := provider.Query(context.Background(), Task{UpstreamTaskID: created.UpstreamTaskID, VideoMode: VideoModeFrames}, selected)
	if err != nil || string(completed.Content) != "veo-video" {
		t.Fatalf("query: %#v %v", completed, err)
	}
}
