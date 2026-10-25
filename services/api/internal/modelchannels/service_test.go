package modelchannels

import (
	"strings"
	"testing"
)

func TestSecretCipherRoundTripAndMasking(t *testing.T) {
	cipher := NewSecretCipher("test-encryption-secret")
	plain := "sk-test-secret-value"
	encrypted, err := cipher.Encrypt(plain)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if encrypted == plain || strings.Contains(encrypted, plain) {
		t.Fatal("encrypted channel key must not contain plaintext")
	}
	decrypted, err := cipher.Decrypt(encrypted)
	if err != nil || decrypted != plain {
		t.Fatalf("decrypt: value=%q err=%v", decrypted, err)
	}
	if masked := maskAPIKey(plain); masked != "sk-••••••alue" {
		t.Fatalf("unexpected masked key: %q", masked)
	}
}

func TestChannelValidationRequiresRemoteHTTPSOpenAIEndpoint(t *testing.T) {
	valid, err := normalizeChannelInput(ChannelInput{Name: "生产图片渠道", BaseURL: "https://api.example.com/v1/", Protocol: "openai", Enabled: true})
	if err != nil || valid.BaseURL != "https://api.example.com/v1" {
		t.Fatalf("unexpected valid channel result: %#v %v", valid, err)
	}
	for _, rawURL := range []string{"http://api.example.com/v1", "https://localhost:8080/v1", "https://127.0.0.1/v1", "https://10.0.0.8/v1"} {
		if _, err := normalizeChannelInput(ChannelInput{Name: "测试渠道", BaseURL: rawURL, Protocol: "openai"}); err == nil {
			t.Fatalf("expected URL to be rejected: %s", rawURL)
		}
	}
}

func TestModelValidationAndImageCatalogDetection(t *testing.T) {
	model, err := normalizeModelInput(ModelInput{ModelID: " gpt-image-2 ", Capability: "image", Enabled: true})
	if err != nil || model.DisplayName != "gpt-image-2" || model.ModelID != "gpt-image-2" {
		t.Fatalf("unexpected model normalization: %#v %v", model, err)
	}
	if inferCapability("gpt-image-2") != "image" || inferCapability("flux-pro") != "image" || inferCapability("gpt-4.1") != "text" || inferCapability("veo-3") != "video" || inferCapability("viduq3-pro") != "video" || inferCapability("jimeng_ti2v_v30_pro") != "video" || inferCapability("tts-1") != "audio" {
		t.Fatal("unexpected image model inference")
	}
}
