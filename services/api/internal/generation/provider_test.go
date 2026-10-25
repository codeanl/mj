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
	}, modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "test-key", UpstreamModel: "gpt-image-2"}, nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if body["model"] != "gpt-image-2" || body["size"] != "576x1024" || body["quality"] != "high" {
		t.Fatalf("unexpected provider request: %#v", body)
	}
}

func TestProviderUsesStableDiffusionAdvancedRouteWithoutAPIKey(t *testing.T) {
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sdapi/v1/txt2img" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "" {
			t.Fatal("stable diffusion no-auth channel must not send authorization")
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"images":["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="]}`))
	}))
	defer server.Close()

	provider := NewOpenAIImageProvider(time.Second, 1024*1024)
	_, err := provider.Generate(context.Background(), Task{Prompt: "测试", Width: 1024, Height: 1024}, modelchannels.ResolvedModel{
		BaseURL: server.URL, Protocol: "stable-diffusion", UpstreamModel: "checkpoint-one",
		AdvancedConfig: modelchannels.AdvancedConfig{AuthMode: "none", CreatePath: "/sdapi/v1/txt2img"},
	}, nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if body["width"] != float64(1024) || body["height"] != float64(1024) {
		t.Fatalf("unexpected dimensions: %#v", body)
	}
}

func TestProviderUsesOpenAIEditMultipartForReferenceImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/images/edits" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart: %v", err)
		}
		file, header, err := r.FormFile("image")
		if err != nil {
			t.Fatalf("missing reference image: %v", err)
		}
		file.Close()
		if header.Filename != "reference.png" || len(r.MultipartForm.File["image"]) != 2 || r.FormValue("model") != "gpt-image-2" || r.FormValue("size") != "1024x1024" {
			t.Fatalf("unexpected multipart payload: filename=%q model=%q size=%q", header.Filename, r.FormValue("model"), r.FormValue("size"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}]}`))
	}))
	defer server.Close()

	provider := NewOpenAIImageProvider(time.Second, 1024*1024)
	_, err := provider.Generate(context.Background(), Task{Prompt: "参考生成", providerSize: "1024x1024", providerQuality: "high"}, modelchannels.ResolvedModel{
		BaseURL: server.URL, APIKey: "test-key", Protocol: "openai", UpstreamModel: "gpt-image-2",
		AdvancedConfig: modelchannels.AdvancedConfig{OperationConfigs: map[string]modelchannels.OperationConfig{"image": {CreatePath: "/images/generations", EditPath: "/images/edits", SupportsReferenceImage: true}}},
	}, []*ReferenceImage{
		{Content: []byte("reference-one"), MimeType: "image/png", Name: "reference.png"},
		{Content: []byte("reference-two"), MimeType: "image/png", Name: "reference-two.png"},
	})
	if err != nil {
		t.Fatalf("generate edit: %v", err)
	}
}

func TestProviderUsesProtocolSpecificJSONReferenceFields(t *testing.T) {
	for _, testCase := range []struct {
		protocol, path, field string
	}{
		{protocol: "sub2api", path: "/images/generations", field: "image_urls"},
		{protocol: "stable-diffusion", path: "/sdapi/v1/img2img", field: "init_images"},
	} {
		t.Run(testCase.protocol, func(t *testing.T) {
			var body map[string]interface{}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != testCase.path {
					t.Fatalf("unexpected path: %s", r.URL.Path)
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatalf("decode request: %v", err)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"images":["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="]}`))
			}))
			defer server.Close()

			advanced := modelchannels.AdvancedConfig{AuthMode: "none", OperationConfigs: map[string]modelchannels.OperationConfig{"image": {CreatePath: "/images/generations", EditPath: testCase.path, SupportsReferenceImage: true}}}
			if testCase.protocol == "stable-diffusion" {
				advanced.CreatePath = "/sdapi/v1/txt2img"
				advanced.EditPath = testCase.path
				advanced.SupportsReferenceImage = true
			}
			provider := NewOpenAIImageProvider(time.Second, 1024*1024)
			_, err := provider.Generate(context.Background(), Task{Prompt: "参考生成", Width: 1, Height: 1}, modelchannels.ResolvedModel{
				BaseURL: server.URL, Protocol: testCase.protocol, UpstreamModel: "image-model", AdvancedConfig: advanced,
			}, []*ReferenceImage{{Content: []byte("reference"), MimeType: "image/png", Name: "reference.png"}})
			if err != nil {
				t.Fatalf("generate: %v", err)
			}
			if _, ok := body[testCase.field]; !ok {
				t.Fatalf("missing %s in %#v", testCase.field, body)
			}
		})
	}
}

func TestProviderKeepsAsyncTaskOnOriginalChannel(t *testing.T) {
	requests := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"id":"upstream-42","status":"processing"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}]}`))
	}))
	defer server.Close()
	provider := NewOpenAIImageProvider(time.Second, 1024*1024)
	selected := modelchannels.ResolvedModel{BaseURL: server.URL, APIKey: "key", Protocol: "openai", UpstreamModel: "image-model", AdvancedConfig: modelchannels.AdvancedConfig{OperationConfigs: map[string]modelchannels.OperationConfig{"image": {CreatePath: "/images/generations", QueryPath: "/images/tasks/:task_id"}}}}
	created, err := provider.Generate(context.Background(), Task{Prompt: "test", providerSize: "1024x1024", providerQuality: "high"}, selected, nil)
	if err != nil || !created.Pending || created.UpstreamTaskID != "upstream-42" {
		t.Fatalf("create pending: %#v %v", created, err)
	}
	completed, err := provider.Query(context.Background(), Task{UpstreamTaskID: created.UpstreamTaskID, UpstreamQueryPath: created.QueryPath}, selected)
	if err != nil || len(completed.Content) == 0 {
		t.Fatalf("query: %#v %v", completed, err)
	}
	if len(requests) != 2 || requests[0] != "POST /images/generations" || requests[1] != "GET /images/tasks/upstream-42" {
		t.Fatalf("unexpected requests: %#v", requests)
	}
}
