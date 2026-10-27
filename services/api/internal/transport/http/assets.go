package httptransport

import (
	"archive/zip"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"nova-creator-platform/services/api/internal/assets"
)

type assetHandlers struct {
	service   *assets.Service
	downloads assets.DownloadTokenManager
	logger    *slog.Logger
	maxBytes  int64
}

func newAssetHandlers(service *assets.Service, downloads assets.DownloadTokenManager, logger *slog.Logger, maxBytes int64) assetHandlers {
	return assetHandlers{service: service, downloads: downloads, logger: logger, maxBytes: maxBytes}
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
		r.Context(), user.ID, assets.Kind(r.URL.Query().Get("type")), assets.Source(r.URL.Query().Get("source")), assets.Status(r.URL.Query().Get("status")), r.URL.Query().Get("search"), page, pageSize,
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

func (handlers assetHandlers) Rename(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var input struct {
		Title string `json:"title"`
	}
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40016, Msg: "素材名称不正确"})
		return
	}
	asset, err := handlers.service.Rename(r.Context(), user.ID, r.PathValue("id"), input.Title)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	decorateAssetURLs(&asset)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: asset, Msg: "素材名称已更新"})
}

func (handlers assetHandlers) BatchDelete(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var input struct {
		IDs []string `json:"ids"`
	}
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40016, Msg: "请选择需要删除的素材"})
		return
	}
	count, err := handlers.service.DeleteMany(r.Context(), user.ID, input.IDs)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]int{"deleted": count}, Msg: "素材已删除"})
}

func (handlers assetHandlers) Stats(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	stats, err := handlers.service.Stats(r.Context(), user.ID)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: stats, Msg: "获取成功"})
}

func decorateAssetURLs(asset *assets.Asset) {
	asset.URL = "/api/v1/assets/" + asset.ID + "/content"
	asset.DownloadURL = asset.URL + "?download=1"
	if asset.Kind == assets.KindVideo && asset.Status == assets.StatusReady {
		asset.PosterURL = "/api/v1/assets/" + asset.ID + "/poster"
	}
}

func (handlers assetHandlers) Poster(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	asset, content, err := handlers.service.OpenPoster(r.Context(), user.ID, r.PathValue("id"))
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	defer content.Close()
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, asset.Title+".jpg", asset.CreatedAt, content)
}

func (handlers assetHandlers) Content(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	var asset assets.Asset
	var content io.ReadSeekCloser
	var err error
	if r.URL.Query().Get("thumbnail") == "1" {
		asset, content, err = handlers.service.OpenThumbnail(r.Context(), user.ID, r.PathValue("id"))
	} else {
		asset, content, err = handlers.service.Open(r.Context(), user.ID, r.PathValue("id"))
	}
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	defer content.Close()
	if r.URL.Query().Get("thumbnail") == "1" {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=300")
		http.ServeContent(w, r, asset.Title+".jpg", asset.CreatedAt, content)
		return
	}
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", assets.ContentDisposition(asset))
	}
	http.ServeContent(w, r, asset.OriginalName, asset.CreatedAt, content)
}

func (handlers assetHandlers) DownloadTicket(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	assetID := r.PathValue("id")
	asset, content, err := handlers.service.Open(r.Context(), user.ID, assetID)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	_ = content.Close()
	if asset.Status != assets.StatusReady {
		writeJSON(w, http.StatusBadRequest, response{Code: 40017, Msg: "素材尚未生成完成"})
		return
	}
	ticket, err := handlers.downloads.Issue(user.ID, assetID)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	downloadURL := "/api/v1/assets/" + assetID + "/download?ticket=" + url.QueryEscape(ticket.Token)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"url": downloadURL, "expiresAt": ticket.ExpiresAt}, Msg: "下载地址已生成"})
}

func (handlers assetHandlers) Download(w http.ResponseWriter, r *http.Request) {
	assetID := r.PathValue("id")
	userID, err := handlers.downloads.Parse(r.URL.Query().Get("ticket"), assetID)
	if err != nil {
		writeJSON(w, http.StatusForbidden, response{Code: 40303, Msg: "下载地址无效或已过期"})
		return
	}
	asset, content, err := handlers.service.Open(r.Context(), userID, assetID)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	defer content.Close()
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Content-Disposition", assets.ContentDisposition(asset))
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, asset.OriginalName, asset.CreatedAt, content)
}

func (handlers assetHandlers) ArchiveTicket(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var input struct {
		IDs []string `json:"ids"`
	}
	if decodeJSON(r, &input) != nil || len(input.IDs) == 0 {
		writeJSON(w, http.StatusBadRequest, response{Code: 40016, Msg: "请选择需要下载的素材"})
		return
	}
	items, err := handlers.service.FindMany(r.Context(), user.ID, input.IDs)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	if len(items) != len(input.IDs) {
		writeJSON(w, http.StatusBadRequest, response{Code: 40018, Msg: "部分素材不存在或尚未生成完成"})
		return
	}
	ticket, err := handlers.downloads.IssueArchive(user.ID, input.IDs)
	if err != nil {
		handlers.writeAssetError(w, err)
		return
	}
	downloadURL := "/api/v1/assets/archive/download?ticket=" + url.QueryEscape(ticket.Token)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"url": downloadURL, "expiresAt": ticket.ExpiresAt}, Msg: "下载地址已生成"})
}

func (handlers assetHandlers) DownloadArchive(w http.ResponseWriter, r *http.Request) {
	userID, ids, err := handlers.downloads.ParseArchive(r.URL.Query().Get("ticket"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, response{Code: 40303, Msg: "下载地址无效或已过期"})
		return
	}
	items, err := handlers.service.FindMany(r.Context(), userID, ids)
	if err != nil || len(items) != len(ids) {
		writeJSON(w, http.StatusNotFound, response{Code: 40401, Msg: "部分素材不存在"})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="nova-assets-`+time.Now().Format("20060102-150405")+`.zip"`)
	w.Header().Set("Cache-Control", "private, no-store")
	archive := zip.NewWriter(w)
	defer archive.Close()
	usedNames := make(map[string]int)
	for _, asset := range items {
		_, content, openErr := handlers.service.Open(r.Context(), userID, asset.ID)
		if openErr != nil {
			handlers.logger.Error("archive asset open failed", "asset_id", asset.ID, "error", openErr)
			return
		}
		name := uniqueArchiveName(assets.Filename(asset), usedNames)
		entry, createErr := archive.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
		if createErr == nil {
			_, createErr = io.Copy(entry, content)
		}
		_ = content.Close()
		if createErr != nil {
			handlers.logger.Error("archive asset write failed", "asset_id", asset.ID, "error", createErr)
			return
		}
	}
}

func uniqueArchiveName(name string, used map[string]int) string {
	count := used[name]
	used[name] = count + 1
	if count == 0 {
		return name
	}
	extension := filepath.Ext(name)
	base := strings.TrimSuffix(name, extension)
	return base + " (" + strconv.Itoa(count+1) + ")" + extension
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
