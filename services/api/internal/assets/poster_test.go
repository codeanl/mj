package assets

import (
	"context"
	"image"
	_ "image/jpeg"
	"os"
	"os/exec"
	"testing"
)

func TestCreateVideoPosterWithConfiguredFFmpeg(t *testing.T) {
	ffmpeg := os.Getenv("FFMPEG_PATH")
	if ffmpeg == "" {
		t.Skip("FFMPEG_PATH is not configured")
	}
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	storage.ConfigureFFmpeg(ffmpeg)
	videoPath, err := storage.resolve("fixture.mp4")
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=0.2", "-pix_fmt", "yuv420p", "-y", videoPath)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("create fixture: %v: %s", err, output)
	}
	if err := storage.CreateVideoPoster(context.Background(), "fixture.mp4", "fixture.poster.jpg"); err != nil {
		t.Fatal(err)
	}
	poster, err := storage.Open("fixture.poster.jpg")
	if err != nil {
		t.Fatal(err)
	}
	defer poster.Close()
	config, _, err := image.DecodeConfig(poster)
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != 320 || config.Height != 180 {
		t.Fatalf("unexpected poster dimensions: %dx%d", config.Width, config.Height)
	}
}
