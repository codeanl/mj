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
	if len(capabilities.Image.Sizes) != 1 || capabilities.Image.Sizes[0].Value != ImageSize || capabilities.Image.Sizes[0].Width != ImageWidth || capabilities.Image.Sizes[0].Height != ImageHeight {
		t.Fatalf("unexpected sizes: %#v", capabilities.Image.Sizes)
	}
	if len(capabilities.Image.Qualities) != 1 || capabilities.Image.Qualities[0].Value != ImageQuality {
		t.Fatalf("unexpected qualities: %#v", capabilities.Image.Qualities)
	}
}

func TestCreateImageRejectsOptionsOutsideBackendCapabilities(t *testing.T) {
	service := NewService(nil, availableImageProvider{}, "configured-image-model")
	input := CreateImageInput{UserID: "user-1", Prompt: "生成一张海报", Model: "other-model", Size: ImageSize, Quality: ImageQuality}

	if _, err := service.CreateImage(context.Background(), input); !errors.Is(err, ErrUnsupportedOptions) {
		t.Fatalf("expected unsupported options error, got %v", err)
	}
}

func TestImageOptionsUseBackendDefaultsWhenOmitted(t *testing.T) {
	if !supportsImageOptions(CreateImageInput{}, "configured-image-model") {
		t.Fatal("expected omitted options to use backend defaults")
	}
	if !supportsImageOptions(CreateImageInput{Model: "configured-image-model", Size: ImageSize, Quality: ImageQuality}, "configured-image-model") {
		t.Fatal("expected explicit supported options to remain valid")
	}
}
