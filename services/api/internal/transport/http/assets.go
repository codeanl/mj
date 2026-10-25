package httptransport

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"nova-creator-platform/services/api/internal/assets"
)

type assetHandlers struct {
	service  *assets.Service
	logger   *slog.Logger
	maxBytes int64
}

func newAssetHandlers(service *assets.Service, logger *slog.Logger, maxBytes int64) assetHandlers {
	return assetHandlers{service: service, logger: logger, maxBytes: maxBytes}
}

func (handlers assetHandlers) List(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	page, err := positiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40011, Msg: "分页参数不正确"})
		return
	}
	pageSize, err := positiveInt(r.URL.Query().Get("pageSize"), 8)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40011, Msg: "分页参数不正确"})
		return
	}
	assetPage, err := handlers.service.List(
		r.Context(), user.ID, assets.Kind(r.URL.Query().Get("type")), assets.Source(r.URL.Query().Get("source")), r.URL.Query().Get("search"), page, pageSize,
	)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	for index := range assetPage.Items {
		decorateAssetURLs(&assetPage.Items[index])
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: assetPage, Msg: "获取成功"})
}

func (handlers assetHandlers) Upload(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, handlers.maxBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40012, Msg: "上传内容无效或超过大小限制"})
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40013, Msg: "请选择图片、视频或音频文件"})
		return
	}
	defer file.Close()
	if header.Size <= 0 || header.Size > handlers.maxBytes {
		writeJSON(w, http.StatusBadRequest, response{Code: 40012, Msg: "上传内容无效或超过大小限制"})
		return
	}

	headerBytes := make([]byte, 512)
	readBytes, readErr := io.ReadFull(file, headerBytes)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		writeJSON(w, http.StatusBadRequest, response{Code: 40014, Msg: "无法读取上传文件"})
		return
	}
	mimeType := http.DetectContentType(headerBytes[:readBytes])
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40014, Msg: "无法读取上传文件"})
		return
	}

	width, height := 0, 0
	if mimeType != "image/webp" && len(mimeType) >= 6 && mimeType[:6] == "image/" {
		imageConfig, _, decodeErr := image.DecodeConfig(file)
		if decodeErr != nil {
			writeJSON(w, http.StatusBadRequest, response{Code: 40015, Msg: "图片文件内容无效"})
			return
		}
		width, height = imageConfig.Width, imageConfig.Height
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			writeJSON(w, http.StatusBadRequest, response{Code: 40014, Msg: "无法读取上传文件"})
			return
		}
	}

	asset, err := handlers.service.Upload(r.Context(), assets.UploadInput{
		UserID: user.ID, Title: r.FormValue("title"), OriginalName: header.Filename, MimeType: mimeType,
		SizeBytes: header.Size, Width: width, Height: height, Content: file,
	})
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	decorateAssetURLs(&asset)
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: asset, Msg: "上传成功"})
}

func decorateAssetURLs(asset *assets.Asset) {
	asset.URL = "/api/v1/assets/" + asset.ID + "/content"
	asset.DownloadURL = asset.URL + "?download=1"
}

func (handlers assetHandlers) Content(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	asset, content, err := handlers.service.Open(r.Context(), user.ID, r.PathValue("id"))
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	defer content.Close()
	if r.URL.Query().Get("thumbnail") == "1" && asset.Kind == assets.KindImage {
		thumbnail, thumbnailErr := assets.CreateImageThumbnail(content, 400)
		if thumbnailErr != nil {
			handlers.logger.Warn("asset thumbnail failed", "asset_id", asset.ID, "error", thumbnailErr)
			writeJSON(w, http.StatusUnprocessableEntity, response{Code: 42211, Msg: "图片缩略图暂不可用"})
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=300")
		http.ServeContent(w, r, asset.Title+".jpg", asset.CreatedAt, bytes.NewReader(thumbnail))
		return
	}
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", assets.ContentDisposition(asset))
	}
	http.ServeContent(w, r, asset.OriginalName, asset.CreatedAt, content)
}

func (handlers assetHandlers) writeAssetError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, assets.ErrInvalidAsset):
		writeJSON(w, http.StatusBadRequest, response{Code: 40016, Msg: "素材参数或文件类型不正确"})
	case errors.Is(err, assets.ErrNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40401, Msg: "素材不存在"})
	default:
		handlers.logger.Error("asset request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50011, Msg: "素材服务暂时不可用"})
	}
}

func positiveInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return 0, errors.New("value must be a positive integer")
	}
	return value, nil
}
