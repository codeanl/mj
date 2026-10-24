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
		Prompt  string `json:"prompt"`
		Model   string `json:"model"`
		Size    string `json:"size"`
		Quality string `json:"quality"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40021, Msg: "请求参数格式不正确"})
		return
	}
	task, err := handlers.service.CreateImage(r.Context(), generation.CreateImageInput{
		UserID: user.ID, Prompt: input.Prompt, Model: input.Model, Size: input.Size, Quality: input.Quality,
	})
	if err != nil {
		handlers.writeGenerationError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, response{Code: 0, Data: task, Msg: "生成任务已创建"})
}

func (handlers generationHandlers) GetCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := currentUser(r.Context()); !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: handlers.service.Capabilities(), Msg: "获取成功"})
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
		writeJSON(w, http.StatusBadRequest, response{Code: 40023, Msg: "所选模型或生成参数不受当前渠道支持，请刷新后重试"})
	case errors.Is(err, generation.ErrProviderUnavailable):
		writeJSON(w, http.StatusServiceUnavailable, response{Code: 50311, Msg: "图片生成渠道尚未配置"})
	case errors.Is(err, generation.ErrTaskNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40411, Msg: "生成任务不存在"})
	default:
		handlers.logger.Error("generation request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50021, Msg: "生成服务暂时不可用"})
	}
}
