package assets

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"
	"sync"

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
	repository  Repository
	storage     *LocalStorage
	thumbnailMu sync.Mutex
	posterMu    sync.Mutex
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

func (service *Service) List(ctx context.Context, userID string, kind Kind, source Source, status Status, search string, page, pageSize int) (Page, error) {
	if userID == "" || page < 1 || (pageSize != 6 && pageSize != 8 && pageSize != 12 && pageSize != 20) {
		return Page{}, ErrInvalidAsset
	}
	if kind != "" && kind != KindImage && kind != KindVideo && kind != KindAudio {
		return Page{}, ErrInvalidAsset
	}
	if source != "" && source != SourceGenerated && source != SourceUploaded {
		return Page{}, ErrInvalidAsset
	}
	if status != "" && status != StatusGenerating && status != StatusReady && status != StatusFailed && status != StatusNeedsReview {
		return Page{}, ErrInvalidAsset
	}
	return service.repository.List(ctx, userID, kind, source, status, strings.TrimSpace(search), page, pageSize)
}

func (service *Service) Rename(ctx context.Context, userID, id, title string) (Asset, error) {
	title = strings.TrimSpace(title)
	if userID == "" || id == "" || title == "" || len([]rune(title)) > 120 {
		return Asset{}, ErrInvalidAsset
	}
	return service.repository.Rename(ctx, userID, id, title)
}

func (service *Service) DeleteMany(ctx context.Context, userID string, ids []string) (int, error) {
	unique, err := validateAssetIDs(userID, ids)
	if err != nil {
		return 0, err
	}
	deleted, err := service.repository.DeleteMany(ctx, userID, unique)
	if err != nil {
		return 0, err
	}
	for _, asset := range deleted {
		if asset.StorageKey != "" {
			_ = service.storage.Delete(asset.StorageKey)
		}
		_ = service.storage.Delete(asset.ID + ".thumb.jpg")
		_ = service.storage.Delete(asset.ID + ".poster.jpg")
	}
	return len(deleted), nil
}

func (service *Service) Stats(ctx context.Context, userID string) (Stats, error) {
	if userID == "" {
		return Stats{}, ErrInvalidAsset
	}
	return service.repository.Stats(ctx, userID)
}

func (service *Service) FindMany(ctx context.Context, userID string, ids []string) ([]Asset, error) {
	unique, err := validateAssetIDs(userID, ids)
	if err != nil {
		return nil, err
	}
	return service.repository.FindMany(ctx, userID, unique)
}

func validateAssetIDs(userID string, ids []string) ([]string, error) {
	if userID == "" || len(ids) == 0 {
		return nil, ErrInvalidAsset
	}
	seen := make(map[string]struct{}, len(ids))
	unique := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if _, err := uuid.Parse(id); err != nil {
			return nil, ErrInvalidAsset
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique, nil
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

func (service *Service) OpenThumbnail(ctx context.Context, userID, id string) (Asset, io.ReadSeekCloser, error) {
	asset, err := service.repository.Find(ctx, userID, id)
	if err != nil {
		return Asset{}, nil, err
	}
	if asset.Kind != KindImage {
		return Asset{}, nil, ErrInvalidAsset
	}
	service.thumbnailMu.Lock()
	defer service.thumbnailMu.Unlock()
	thumbnailKey := asset.ID + ".thumb.jpg"
	if thumbnail, openErr := service.storage.Open(thumbnailKey); openErr == nil {
		return asset, thumbnail, nil
	}
	source, err := service.storage.Open(asset.storageKey)
	if err != nil {
		return Asset{}, nil, err
	}
	thumbnail, createErr := CreateImageThumbnail(source, 400)
	closeErr := source.Close()
	if createErr != nil {
		return Asset{}, nil, createErr
	}
	if closeErr != nil {
		return Asset{}, nil, closeErr
	}
	if err := service.storage.Save(thumbnailKey, bytes.NewReader(thumbnail)); err != nil {
		return Asset{}, nil, err
	}
	content, err := service.storage.Open(thumbnailKey)
	return asset, content, err
}

func (service *Service) OpenPoster(ctx context.Context, userID, id string) (Asset, io.ReadSeekCloser, error) {
	asset, err := service.repository.Find(ctx, userID, id)
	if err != nil {
		return Asset{}, nil, err
	}
	if asset.Kind != KindVideo || asset.storageKey == "" {
		return Asset{}, nil, ErrInvalidAsset
	}
	service.posterMu.Lock()
	defer service.posterMu.Unlock()
	posterKey := asset.ID + ".poster.jpg"
	if poster, openErr := service.storage.Open(posterKey); openErr == nil {
		return asset, poster, nil
	}
	if err := service.storage.CreateVideoPoster(ctx, asset.storageKey, posterKey); err != nil {
		return Asset{}, nil, err
	}
	poster, err := service.storage.Open(posterKey)
	return asset, poster, err
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
		"audio/mpeg":      {KindAudio, ".mp3"},
		"audio/wav":       {KindAudio, ".wav"},
		"audio/x-wav":     {KindAudio, ".wav"},
		"audio/ogg":       {KindAudio, ".ogg"},
		"audio/flac":      {KindAudio, ".flac"},
	}
	entry, ok := supported[mediaType]
	if !ok {
		return "", "", false
	}
	return entry.kind, entry.extension, true
}

func ContentDisposition(asset Asset) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": Filename(asset)})
}

func Filename(asset Asset) string {
	extension := filepath.Ext(asset.OriginalName)
	if extension == "" {
		_, extension, _ = ParseMediaType(asset.MimeType)
	}
	filename := asset.Title
	if filepath.Ext(filename) == "" {
		filename = fmt.Sprintf("%s%s", filename, extension)
	}
	return filename
}
