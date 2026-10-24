package generation

import "testing"

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
