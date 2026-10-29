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

func TestSpecialVideoModeRequiresExecutableOperation(t *testing.T) {
	input := ModelInput{ModelID: "extend-pro", Capability: "video", CapabilityOverride: true, CapabilityConfig: ModelCapabilityConfig{MinDuration: 4, MaxDuration: 30, Modes: []string{"extend"}, ModeOperations: map[string]ModeOperationConfig{}}}
	if _, err := normalizeModelInput(input); err == nil {
		t.Fatal("special video mode without create/query paths must be rejected")
	}
	input.CapabilityConfig.ModeOperations["extend"] = ModeOperationConfig{CreatePath: "/extend", QueryPath: "/extend/:task_id"}
	if _, err := normalizeModelInput(input); err != nil {
		t.Fatalf("configured special video mode should be valid: %v", err)
	}
	operation := input.CapabilityConfig.ModeOperations["extend"]
	operation.RequestTemplate = `{invalid`
	input.CapabilityConfig.ModeOperations["extend"] = operation
	if _, err := normalizeModelInput(input); err == nil {
		t.Fatal("invalid special video request template must be rejected")
	}
}

func TestOfficialModelConfigRequiresVerifiedCapabilityProfile(t *testing.T) {
	if config, ok := officialModelConfig("compshare-minimax-h3", "MiniMax-H3"); !ok || config.MaxDuration != 30 || len(config.Modes) != 3 {
		t.Fatalf("MiniMax official capability profile missing: %#v %v", config, ok)
	}
	if _, ok := officialModelConfig("yumeng", "KlingO3"); ok {
		t.Fatal("a built-in model ID without a verified capability profile must remain editable")
	}
}

func TestVideoCapabilityDefaultsFillImportedModelsFromProtocol(t *testing.T) {
	config := capabilityConfigForModel("seedance", "video", ModelCapabilityConfig{})
	if len(config.Ratios) == 0 || len(config.Qualities) == 0 || len(config.Modes) == 0 || config.MinDuration != 4 || config.MaxDuration != 15 || !config.SupportsSound || !config.SupportsWatermark {
		t.Fatalf("expected seedance defaults, got %#v", config)
	}
	veo := capabilityConfigForModel("gemini", "video", ModelCapabilityConfig{})
	if veo.SupportsSound || veo.SupportsWatermark || !contains(veo.Modes, "frames") || contains(veo.Modes, "reference") {
		t.Fatalf("Veo capability must expose only verified controls: %#v", veo)
	}
	config = capabilityConfigForModel("compshare-minimax-h3", "video", ModelCapabilityConfig{})
	if config.MaxDuration != 30 || len(config.Ratios) != 7 || len(config.Modes) != 3 {
		t.Fatalf("expected official minimax profile, got %#v", config)
	}
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func TestDurationBoundsParseProtocolRange(t *testing.T) {
	minimum, maximum := durationBounds("4、6、8 秒")
	if minimum != 4 || maximum != 8 {
		t.Fatalf("unexpected duration bounds: %d-%d", minimum, maximum)
	}
}
