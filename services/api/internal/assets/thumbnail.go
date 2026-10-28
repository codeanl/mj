package assets

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"io"

	"github.com/HugoSmits86/nativewebp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

func CreateImageThumbnail(source io.Reader, maximumDimension int) ([]byte, error) {
	decoded, _, err := image.Decode(source)
	if err != nil {
		return nil, err
	}
	bounds := decoded.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > maximumDimension || height > maximumDimension {
		if width >= height {
			height = max(1, height*maximumDimension/width)
			width = maximumDimension
		} else {
			width = max(1, width*maximumDimension/height)
			height = maximumDimension
		}
	}
	destination := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(destination, destination.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	xdraw.CatmullRom.Scale(destination, destination.Bounds(), decoded, bounds, draw.Over, nil)
	var output bytes.Buffer
	if err := nativewebp.Encode(&output, destination, &nativewebp.Options{CompressionLevel: nativewebp.DefaultCompression}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
