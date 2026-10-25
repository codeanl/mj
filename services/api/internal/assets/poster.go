package assets

import (
	"context"
	"errors"
	"os"
	"os/exec"
)

var ErrPosterUnavailable = errors.New("video poster generator is unavailable")

func (storage *LocalStorage) ConfigureFFmpeg(path string) {
	storage.ffmpegPath = path
}

func (storage *LocalStorage) CreateVideoPoster(ctx context.Context, videoKey, posterKey string) error {
	if storage.ffmpegPath == "" {
		return ErrPosterUnavailable
	}
	videoPath, err := storage.resolve(videoKey)
	if err != nil {
		return err
	}
	posterPath, err := storage.resolve(posterKey)
	if err != nil {
		return err
	}
	if _, err := os.Stat(posterPath); err == nil {
		return nil
	}
	temporaryPath := posterPath + ".tmp.jpg"
	_ = os.Remove(temporaryPath)
	command := exec.CommandContext(ctx, storage.ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-ss", "0", "-i", videoPath,
		"-frames:v", "1", "-vf", "scale=w='min(iw,640)':h=-2", "-q:v", "4", "-y", temporaryPath,
	)
	if output, err := command.CombinedOutput(); err != nil {
		_ = os.Remove(temporaryPath)
		return errors.New("video poster generation failed: " + string(output))
	}
	if err := os.Rename(temporaryPath, posterPath); err != nil {
		_ = os.Remove(temporaryPath)
		return err
	}
	return nil
}
