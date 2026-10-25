package assets

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type LocalStorage struct {
	root       string
	ffmpegPath string
}

func NewLocalStorage(root string) (*LocalStorage, error) {
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absoluteRoot, 0o750); err != nil {
		return nil, err
	}
	return &LocalStorage{root: absoluteRoot}, nil
}

func (storage *LocalStorage) Save(key string, source io.Reader) error {
	target, err := storage.resolve(key)
	if err != nil {
		return err
	}
	temporary := target + ".uploading"
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, source)
	closeErr := file.Close()
	if copyErr != nil {
		_ = os.Remove(temporary)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(temporary)
		return closeErr
	}
	return os.Rename(temporary, target)
}

func (storage *LocalStorage) Open(key string) (*os.File, error) {
	target, err := storage.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(target)
}

func (storage *LocalStorage) Delete(key string) error {
	target, err := storage.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (storage *LocalStorage) resolve(key string) (string, error) {
	cleanKey := filepath.Clean(key)
	if cleanKey == "." || filepath.IsAbs(cleanKey) || strings.HasPrefix(cleanKey, "..") || strings.ContainsAny(cleanKey, `/\`) {
		return "", fmt.Errorf("invalid storage key")
	}
	return filepath.Join(storage.root, cleanKey), nil
}
