package assets

import (
	"bytes"
	"io"
	"testing"
)

func TestLocalStorageRoundTrip(t *testing.T) {
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	content := []byte("asset-content")
	if err := storage.Save("asset.png", bytes.NewReader(content)); err != nil {
		t.Fatalf("save: %v", err)
	}
	file, err := storage.Open("asset.png")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	loaded, err := io.ReadAll(file)
	if closeErr := file.Close(); closeErr != nil {
		t.Fatalf("close: %v", closeErr)
	}
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !bytes.Equal(loaded, content) {
		t.Fatalf("expected %q, got %q", content, loaded)
	}
	if err := storage.Delete("asset.png"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestLocalStorageRejectsTraversal(t *testing.T) {
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	if err := storage.Save("../outside", bytes.NewReader([]byte("no"))); err == nil {
		t.Fatal("expected traversal key to fail")
	}
}
