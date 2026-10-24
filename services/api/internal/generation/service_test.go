package generation

import (
	"context"
	"errors"
	"testing"
)

type availableImageProvider struct{}

func (availableImageProvider) Available() bool { return true }

func (availableImageProvider) Generate(context.Context, Task) (GeneratedImage, error) {
	return GeneratedImage{}, nil
}

func TestCapabilitiesDescribeBackendImageContract(t *testing.T) {
	service := NewService(nil, availableImageProvider{}, "configured-image-model")
	capabilities := service.Capabilities()

	if !capabilities.Image.Enabled || capabilities.Video.Enabled {
		t.Fatalf("unexpected capability availability: %#v", capabilities)
	}
	if len(capabilities.Image.Models) != 1 || capabilities.Image.Models[0].Value != "configured-image-model" {
		t.Fatalf("unexpected models: %#v", capabilities.Image.Models)
	}
	if len(capabilities.Image.Sizes) != 5 || capabilities.Image.Sizes[1].Value != DefaultImageRatio || capabilities.Image.Sizes[1].Width != 2048 || capabilities.Image.Sizes[1].Height != 1152 {
		t.Fatalf("unexpected sizes: %#v", capabilities.Image.Sizes)
	}
	if len(capabilities.Image.Qualities) != 2 || capabilities.Image.Qualities[1].Value != DefaultImageResolution {
		t.Fatalf("unexpected qualities: %#v", capabilities.Image.Qualities)
	}
}

func TestCreateImageRejectsOptionsOutsideBackendCapabilities(t *testing.T) {
	service := NewService(nil, availableImageProvider{}, "configured-image-model")
	input := CreateImageInput{UserID: "user-1", Prompt: "生成一张海报", Model: "other-model", Size: "16:9", Quality: "2K"}

	if _, err := service.CreateImage(context.Background(), input); !errors.Is(err, ErrUnsupportedOptions) {
		t.Fatalf("expected unsupported options error, got %v", err)
	}
}

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
	if _, ok := resolveImageOptions(CreateImageInput{Model: "gpt-image-2", Size: "21:9", Quality: "2K"}, "gpt-image-2"); ok {
		t.Fatal("expected unsupported ratio to be rejected")
	}
}
