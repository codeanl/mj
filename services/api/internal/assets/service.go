package assets

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

var ErrInvalidAsset = errors.New("invalid asset")

type UploadInput struct {
	UserID       string
	Title        string
	OriginalName string
	MimeType     string
	SizeBytes    int64
	Width        int
	Height       int
	Content      io.Reader
}

type Service struct {
	repository Repository
	storage    *LocalStorage
}

func NewService(repository Repository, storage *LocalStorage) *Service {
	return &Service{repository: repository, storage: storage}
}

func (service *Service) Upload(ctx context.Context, input UploadInput) (Asset, error) {
	return service.store(ctx, input, SourceUploaded)
}

func (service *Service) StoreGenerated(ctx context.Context, input UploadInput) (Asset, error) {
	return service.store(ctx, input, SourceGenerated)
}

func (service *Service) store(ctx context.Context, input UploadInput, source Source) (Asset, error) {
	kind, extension, ok := ParseMediaType(input.MimeType)
	if !ok || input.SizeBytes <= 0 || input.UserID == "" || input.Content == nil {
		return Asset{}, ErrInvalidAsset
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(input.OriginalName), filepath.Ext(input.OriginalName))
	}
	if title == "" || len([]rune(title)) > 120 {
		return Asset{}, ErrInvalidAsset
	}

	id := uuid.NewString()
	storageKey := id + extension
	if err := service.storage.Save(storageKey, input.Content); err != nil {
		return Asset{}, err
	}
	asset, err := service.repository.Create(ctx, CreateInput{
		ID: id, UserID: input.UserID, Kind: kind, Source: source, Title: title, OriginalName: filepath.Base(input.OriginalName), StorageKey: storageKey,
		MimeType: input.MimeType, SizeBytes: input.SizeBytes, Width: input.Width, Height: input.Height,
	})
	if err != nil {
		_ = service.storage.Delete(storageKey)
		return Asset{}, err
	}
	return asset, nil
}

func (service *Service) List(ctx context.Context, userID string, kind Kind, source Source, search string, page, pageSize int) (Page, error) {
	if userID == "" || page < 1 || (pageSize != 8 && pageSize != 12) {
		return Page{}, ErrInvalidAsset
	}
	if kind != "" && kind != KindImage && kind != KindVideo {
		return Page{}, ErrInvalidAsset
	}
	if source != "" && source != SourceGenerated && source != SourceUploaded {
		return Page{}, ErrInvalidAsset
	}
	return service.repository.List(ctx, userID, kind, source, strings.TrimSpace(search), page, pageSize)
}

func (service *Service) Open(ctx context.Context, userID, id string) (Asset, io.ReadSeekCloser, error) {
	asset, err := service.repository.Find(ctx, userID, id)
	if err != nil {
		return Asset{}, nil, err
	}
	file, err := service.storage.Open(asset.storageKey)
	return asset, file, err
}

func (service *Service) OpenByID(ctx context.Context, id string) (Asset, io.ReadSeekCloser, error) {
	asset, err := service.repository.FindByID(ctx, id)
	if err != nil {
		return Asset{}, nil, err
	}
	file, err := service.storage.Open(asset.storageKey)
	return asset, file, err
}

func ParseMediaType(mimeType string) (Kind, string, bool) {
	mediaType, _, err := mime.ParseMediaType(mimeType)
	if err != nil {
		return "", "", false
	}
	supported := map[string]struct {
		kind      Kind
		extension string
	}{
		"image/jpeg":      {KindImage, ".jpg"},
		"image/png":       {KindImage, ".png"},
		"image/webp":      {KindImage, ".webp"},
		"image/gif":       {KindImage, ".gif"},
		"video/mp4":       {KindVideo, ".mp4"},
		"video/webm":      {KindVideo, ".webm"},
		"video/quicktime": {KindVideo, ".mov"},
	}
	entry, ok := supported[mediaType]
	if !ok {
		return "", "", false
	}
	return entry.kind, entry.extension, true
}

func ContentDisposition(asset Asset) string {
	extension := filepath.Ext(asset.OriginalName)
	if extension == "" {
		_, extension, _ = ParseMediaType(asset.MimeType)
	}
	return mime.FormatMediaType("attachment", map[string]string{"filename": fmt.Sprintf("%s%s", asset.Title, extension)})
}
