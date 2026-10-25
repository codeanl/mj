package generation

import (
	"testing"

	"github.com/google/uuid"
)

func TestImageOptionsUseBackendDefaultsWhenOmitted(t *testing.T) {
	defaults, ok := resolveImageOptions(CreateImageInput{}, "configured-image-model")
	if !ok || defaults.Model != "configured-image-model" || defaults.Ratio != "16:9" || defaults.Resolution != "2K" || defaults.ProviderSize != "2048x1152" {
		t.Fatalf("unexpected backend defaults: %#v", defaults)
	}
	portrait, ok := resolveImageOptions(CreateImageInput{Model: "configured-image-model", Size: "9:16", Quality: "1K"}, "configured-image-model")
	if !ok || portrait.Width != 576 || portrait.Height != 1024 || portrait.ProviderSize != "576x1024" {
		t.Fatalf("unexpected portrait options: %#v", portrait)
	}
}

func TestImageOptionsCoverCommonRatiosAtOneAndTwoK(t *testing.T) {
	for _, resolution := range []string{"1K", "2K"} {
		for _, ratio := range []string{"1:1", "16:9", "9:16", "4:3", "3:4"} {
			options, ok := resolveImageOptions(CreateImageInput{Model: "gpt-image-2", Size: ratio, Quality: resolution}, "gpt-image-2")
			if !ok || options.Width <= 0 || options.Height <= 0 || options.ProviderSize == "" {
				t.Fatalf("missing mapping for %s %s: %#v", ratio, resolution, options)
			}
		}
	}
	for _, input := range []CreateImageInput{
		{Model: "other-model", Size: "16:9", Quality: "2K"},
		{Model: "gpt-image-2", Size: "21:9", Quality: "2K"},
		{Model: "gpt-image-2", Size: "16:9", Quality: "4K"},
	} {
		if _, ok := resolveImageOptions(input, "gpt-image-2"); ok {
			t.Fatalf("expected unsupported options to be rejected: %#v", input)
		}
	}
}

func TestNormalizeImageCountDefaultsToOneAndCapsAtFour(t *testing.T) {
	for input, expected := range map[int]int{0: 1, 1: 1, 2: 2, 4: 4} {
		actual, ok := normalizeImageCount(input)
		if !ok || actual != expected {
			t.Fatalf("count %d normalized to %d, %v", input, actual, ok)
		}
	}
	for _, input := range []int{-1, 5} {
		if _, ok := normalizeImageCount(input); ok {
			t.Fatalf("expected count %d to be rejected", input)
		}
	}
}

func TestNormalizeReferenceAssetIDsAllowsThreeUniqueImages(t *testing.T) {
	values := []string{
		"11111111-1111-4111-8111-111111111111",
		"22222222-2222-4222-8222-222222222222",
		"33333333-3333-4333-8333-333333333333",
	}
	actual, ok := normalizeReferenceAssetIDs(append(values, values[0]))
	if !ok || len(actual) != 3 {
		t.Fatalf("unexpected references: %#v, %v", actual, ok)
	}
	if _, ok := normalizeReferenceAssetIDs(append(values, "44444444-4444-4444-8444-444444444444")); ok {
		t.Fatal("expected four reference images to be rejected")
	}
	if _, ok := normalizeReferenceAssetIDs([]string{"not-a-uuid"}); ok {
		t.Fatal("expected invalid reference ID to be rejected")
	}
}

func TestNormalizeVideoReferencesValidatesModesAndLimits(t *testing.T) {
	if references, ok := normalizeVideoReferences(VideoModeText, nil); !ok || len(references) != 0 {
		t.Fatalf("text mode should accept no references: %#v %v", references, ok)
	}
	first, last := uuid.NewString(), uuid.NewString()
	frames := []VideoReference{{AssetID: first, Role: VideoRoleFirstFrame}, {AssetID: last, Role: VideoRoleLastFrame}}
	if normalized, ok := normalizeVideoReferences(VideoModeFrames, frames); !ok || len(normalized) != 2 {
		t.Fatalf("frames should be valid: %#v %v", normalized, ok)
	}
	if _, ok := normalizeVideoReferences(VideoModeFrames, append(frames, VideoReference{AssetID: uuid.NewString(), Role: VideoRoleImage})); ok {
		t.Fatal("frames mode must reject reference media")
	}
	full := make([]VideoReference, 0, 12)
	for index := 0; index < 9; index++ {
		full = append(full, VideoReference{AssetID: uuid.NewString(), Role: VideoRoleImage})
	}
	for index := 0; index < 3; index++ {
		full = append(full, VideoReference{AssetID: uuid.NewString(), Role: VideoRoleVideo})
	}
	if normalized, ok := normalizeVideoReferences(VideoModeReference, full); !ok || len(normalized) != 12 {
		t.Fatalf("full reference should accept 12 valid media items: %#v %v", normalized, ok)
	}
	if _, ok := normalizeVideoReferences(VideoModeReference, []VideoReference{{AssetID: uuid.NewString(), Role: VideoRoleAudio}}); ok {
		t.Fatal("audio-only reference must be rejected")
	}
}
