package assets

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestCreateImageThumbnailPreservesRatioAndCapsLongestEdge(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 1200, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1200; x++ {
			source.Set(x, y, color.RGBA{R: 80, G: 120, B: 160, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, nil); err != nil {
		t.Fatal(err)
	}
	thumbnail, err := CreateImageThumbnail(bytes.NewReader(encoded.Bytes()), 400)
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(thumbnail))
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != 400 || config.Height != 200 {
		t.Fatalf("unexpected thumbnail dimensions: %dx%d", config.Width, config.Height)
	}
}
