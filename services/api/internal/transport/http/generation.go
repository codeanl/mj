package httptransport

import (
	"errors"
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/generation"
)

type generationHandlers struct {
	service *generation.Service
	logger  *slog.Logger
}

func newGenerationHandlers(service *generation.Service, logger *slog.Logger) generationHandlers {
	return generationHandlers{service: service, logger: logger}
}

func (handlers generationHandlers) CreateImage(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	var input struct {
		Prompt            string   `json:"prompt"`
		Model             string   `json:"model"`
		Size              string   `json:"size"`
		Quality           string   `json:"quality"`
		Count             int      `json:"count"`
		ReferenceAssetIDs []string `json:"referenceAssetIds"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40021, Msg: "请求参数格式不正确"})
		return
	}
	batch, err := handlers.service.CreateImage(r.Context(), generation.CreateImageInput{
		UserID: user.ID, Prompt: input.Prompt, Model: input.Model, Size: input.Size, Quality: input.Quality,
		Count: input.Count, ReferenceAssetIDs: input.ReferenceAssetIDs,
	})
	if err != nil {
		handlers.writeGenerationError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, response{Code: 0, Data: batch, Msg: "生成任务已创建"})
}

func (handlers generationHandlers) GetCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := currentUser(r.Context()); !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	capabilities, err := handlers.service.Capabilities(r.Context())
	if err != nil {
		handlers.writeGenerationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: capabilities, Msg: "获取成功"})
}

func (handlers generationHandlers) GetTask(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	task, err := handlers.service.Get(r.Context(), user.ID, r.PathValue("id"))
	if err != nil {
		handlers.writeGenerationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: task, Msg: "获取成功"})
}

func (handlers generationHandlers) writeGenerationError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, generation.ErrInvalidPrompt):
		writeJSON(w, http.StatusBadRequest, response{Code: 40022, Msg: "提示词长度应为 2-2000 个字符"})
	case errors.Is(err, generation.ErrUnsupportedOptions):
		writeJSON(w, http.StatusBadRequest, response{Code: 40023, Msg: "所选模型、画面比例或分辨率不受支持"})
	case errors.Is(err, generation.ErrInvalidImageCount):
		writeJSON(w, http.StatusBadRequest, response{Code: 40024, Msg: "每次最多生成 4 张图片"})
	case errors.Is(err, generation.ErrInvalidReference):
		writeJSON(w, http.StatusBadRequest, response{Code: 40025, Msg: "参考图最多 3 张，且必须是当前用户的有效图片"})
	case errors.Is(err, generation.ErrProviderUnavailable):
		writeJSON(w, http.StatusServiceUnavailable, response{Code: 50311, Msg: "图片生成渠道尚未配置"})
	case errors.Is(err, generation.ErrInsufficientPoints):
		writeJSON(w, http.StatusPaymentRequired, response{Code: 40221, Msg: "积分余额不足，请联系管理员充值积分"})
	case errors.Is(err, generation.ErrTaskNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40411, Msg: "生成任务不存在"})
	default:
		handlers.logger.Error("generation request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50021, Msg: "生成服务暂时不可用"})
	}
}
