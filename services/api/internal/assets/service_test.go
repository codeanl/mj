package assets

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

type captureRepository struct {
	lastInput  CreateInput
	listKind   Kind
	listSource Source
	listSearch string
}

func (repository *captureRepository) Create(_ context.Context, input CreateInput) (Asset, error) {
	repository.lastInput = input
	return Asset{
		ID: input.ID, Kind: input.Kind, Source: input.Source, Title: input.Title, OriginalName: input.OriginalName,
		MimeType: input.MimeType, SizeBytes: input.SizeBytes, Width: input.Width, Height: input.Height, CreatedAt: time.Now(), storageKey: input.StorageKey,
	}, nil
}

func (repository *captureRepository) List(_ context.Context, _ string, kind Kind, source Source, search string, _ int, _ int) (Page, error) {
	repository.listKind = kind
	repository.listSource = source
	repository.listSearch = search
	return Page{}, nil
}

func (repository *captureRepository) Find(context.Context, string, string) (Asset, error) {
	return Asset{}, ErrNotFound
}

func (repository *captureRepository) FindByID(context.Context, string) (Asset, error) {
	return Asset{}, ErrNotFound
}

func TestListValidatesAndPassesSourceFilter(t *testing.T) {
	repository := &captureRepository{}
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	service := NewService(repository, storage)

	if _, err := service.List(context.Background(), "user-1", KindImage, SourceGenerated, "  海报  ", 1, 8); err != nil {
		t.Fatalf("list generated assets: %v", err)
	}
	if repository.listKind != KindImage || repository.listSource != SourceGenerated || repository.listSearch != "海报" {
		t.Fatalf("unexpected list filters: kind=%q source=%q search=%q", repository.listKind, repository.listSource, repository.listSearch)
	}
	if _, err := service.List(context.Background(), "user-1", "", Source("external"), "", 1, 8); !errors.Is(err, ErrInvalidAsset) {
		t.Fatalf("expected invalid source error, got %v", err)
	}
}

func TestStoresUploadedAndGeneratedSources(t *testing.T) {
	repository := &captureRepository{}
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	service := NewService(repository, storage)
	input := UploadInput{
		UserID: "user-1", Title: "测试素材", OriginalName: "asset.png", MimeType: "image/png",
		SizeBytes: 4, Width: 10, Height: 20, Content: bytes.NewReader([]byte("data")),
	}

	uploaded, err := service.Upload(context.Background(), input)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if uploaded.Source != SourceUploaded || repository.lastInput.Source != SourceUploaded {
		t.Fatalf("expected uploaded source, got asset=%q input=%q", uploaded.Source, repository.lastInput.Source)
	}

	input.Content = bytes.NewReader([]byte("data"))
	generated, err := service.StoreGenerated(context.Background(), input)
	if err != nil {
		t.Fatalf("store generated: %v", err)
	}
	if generated.Source != SourceGenerated || repository.lastInput.Source != SourceGenerated {
		t.Fatalf("expected generated source, got asset=%q input=%q", generated.Source, repository.lastInput.Source)
	}
}

func TestParseMediaTypeSupportsVideoReferenceAudio(t *testing.T) {
	for mimeType, expectedKind := range map[string]Kind{"audio/mpeg": KindAudio, "audio/wav": KindAudio, "audio/ogg": KindAudio, "video/mp4": KindVideo} {
		kind, extension, ok := ParseMediaType(mimeType)
		if !ok || kind != expectedKind || extension == "" {
			t.Fatalf("unexpected media mapping for %s: kind=%q extension=%q ok=%v", mimeType, kind, extension, ok)
		}
	}
}
