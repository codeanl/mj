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
	listStatus Status
	listSearch string
}

func (repository *captureRepository) Create(_ context.Context, input CreateInput) (Asset, error) {
	repository.lastInput = input
	return Asset{
		ID: input.ID, Kind: input.Kind, Source: input.Source, Title: input.Title, OriginalName: input.OriginalName,
		MimeType: input.MimeType, SizeBytes: input.SizeBytes, Width: input.Width, Height: input.Height, CreatedAt: time.Now(), storageKey: input.StorageKey,
	}, nil
}

func (repository *captureRepository) List(_ context.Context, _ string, kind Kind, source Source, status Status, search string, _ int, _ int) (Page, error) {
	repository.listKind = kind
	repository.listSource = source
	repository.listStatus = status
	repository.listSearch = search
	return Page{}, nil
}

func (repository *captureRepository) Find(context.Context, string, string) (Asset, error) {
	return Asset{}, ErrNotFound
}

func (repository *captureRepository) FindByID(context.Context, string) (Asset, error) {
	return Asset{}, ErrNotFound
}

func (repository *captureRepository) FindMany(context.Context, string, []string) ([]Asset, error) {
	return nil, nil
}

func (repository *captureRepository) Rename(context.Context, string, string, string) (Asset, error) {
	return Asset{}, nil
}

func (repository *captureRepository) DeleteMany(context.Context, string, []string) ([]DeletedAsset, error) {
	return nil, nil
}

func (repository *captureRepository) Stats(context.Context, string) (Stats, error) {
	return Stats{}, nil
}

func TestListValidatesAndPassesSourceFilter(t *testing.T) {
	repository := &captureRepository{}
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	service := NewService(repository, storage)

	if _, err := service.List(context.Background(), "user-1", KindImage, SourceGenerated, StatusReady, "  海报  ", 1, 8); err != nil {
		t.Fatalf("list generated assets: %v", err)
	}
	if repository.listKind != KindImage || repository.listSource != SourceGenerated || repository.listStatus != StatusReady || repository.listSearch != "海报" {
		t.Fatalf("unexpected list filters: kind=%q source=%q search=%q", repository.listKind, repository.listSource, repository.listSearch)
	}
	if _, err := service.List(context.Background(), "user-1", "", Source("external"), "", "", 1, 8); !errors.Is(err, ErrInvalidAsset) {
		t.Fatalf("expected invalid source error, got %v", err)
	}
}

func TestListAcceptsHomeRecentPageSize(t *testing.T) {
	repository := &captureRepository{}
	service := NewService(repository, nil)
	if _, err := service.List(context.Background(), "user-1", "", SourceGenerated, "", "", 1, 6); err != nil {
		t.Fatalf("home recent page size should be accepted: %v", err)
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

func TestFindManyValidatesAndDeduplicatesIDs(t *testing.T) {
	repository := &captureRepository{}
	service := NewService(repository, nil)
	validID := "e4307a99-29d2-4a18-b3ee-7517313db72d"
	if _, err := service.FindMany(context.Background(), "user-1", []string{"invalid"}); !errors.Is(err, ErrInvalidAsset) {
		t.Fatalf("invalid asset id must fail validation: %v", err)
	}
	if _, err := service.FindMany(context.Background(), "user-1", []string{validID, validID}); err != nil {
		t.Fatalf("duplicate valid ids should be accepted: %v", err)
	}
}
