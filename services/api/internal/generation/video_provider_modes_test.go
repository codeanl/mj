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

func TestMiniMaxH3VideoProviderPreservesReferenceRolesAndMediaTypes(t *testing.T) {
	var content []struct {
		Type     string `json:"type"`
		Role     string `json:"role"`
		ImageURL *struct {
			URL string `json:"url"`
		} `json:"image_url"`
		VideoURL *struct {
			URL string `json:"url"`
		} `json:"video_url"`
		AudioURL *struct {
			URL string `json:"url"`
		} `json:"audio_url"`
	}
	var muteAudio, watermark bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Content       json.RawMessage `json:"content"`
			MuteAudio     bool            `json:"mute_audio"`
			AIGCWatermark bool            `json:"aigc_watermark"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(body.Content, &content); err != nil {
			t.Fatal(err)
		}
		muteAudio, watermark = body.MuteAudio, body.AIGCWatermark
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"task_id":"mode-task"}`))
	}))
	defer server.Close()

	provider := NewMiniMaxH3VideoProvider(time.Second, 1024)
	selected := modelchannels.ResolvedModel{BaseURL: server.URL, Protocol: "compshare-minimax-h3", UpstreamModel: "MiniMax-H3"}
	result, err := provider.Create(context.Background(), Task{ID: "task", Quality: "768P", Size: "adaptive", DurationSeconds: 5, SoundEnabled: false, WatermarkEnabled: true}, selected, []*ReferenceImage{
		{Content: []byte("first"), MimeType: "image/png", Kind: "image", Role: VideoRoleFirstFrame},
		{Content: []byte("video"), MimeType: "video/mp4", Kind: "video", Role: VideoRoleVideo},
		{Content: []byte("audio"), MimeType: "audio/mpeg", Kind: "audio", Role: VideoRoleAudio},
	})
	if err != nil || result.UpstreamTaskID != "mode-task" {
		t.Fatalf("create: %#v %v", result, err)
	}
	if len(content) != 3 || content[0].Type != "image_url" || content[0].Role != VideoRoleFirstFrame || content[0].ImageURL == nil || content[1].Type != "video_url" || content[1].Role != VideoRoleVideo || content[1].VideoURL == nil || content[2].Type != "audio_url" || content[2].Role != VideoRoleAudio || content[2].AudioURL == nil {
		t.Fatalf("unexpected multimodal content: %#v", content)
	}
	if !muteAudio || !watermark {
		t.Fatalf("unexpected sound or watermark options: mute_audio=%v watermark=%v", muteAudio, watermark)
	}
}
