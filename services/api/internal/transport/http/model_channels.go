package httptransport

import (
	"errors"
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/modelchannels"
)

type modelChannelHandlers struct {
	service *modelchannels.Service
	logger  *slog.Logger
}

func newModelChannelHandlers(service *modelchannels.Service, logger *slog.Logger) modelChannelHandlers {
	return modelChannelHandlers{service: service, logger: logger}
}

func (handlers modelChannelHandlers) PublicModels(w http.ResponseWriter, r *http.Request) {
	models, err := handlers.service.PublicModels(r.Context())
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"models": models}, Msg: "获取成功"})
}

func (handlers modelChannelHandlers) List(w http.ResponseWriter, r *http.Request) {
	channels, err := handlers.service.List(r.Context())
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"channels": channels}, Msg: "获取成功"})
}

func (handlers modelChannelHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var input modelchannels.ChannelInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40031, Msg: "渠道参数格式不正确"})
		return
	}
	channel, err := handlers.service.Create(r.Context(), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"channel": channel}, Msg: "渠道已创建"})
}

func (handlers modelChannelHandlers) Update(w http.ResponseWriter, r *http.Request) {
	var input modelchannels.ChannelInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40031, Msg: "渠道参数格式不正确"})
		return
	}
	channel, err := handlers.service.Update(r.Context(), r.PathValue("channelId"), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"channel": channel}, Msg: "渠道已更新"})
}

func (handlers modelChannelHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	if err := handlers.service.Delete(r.Context(), r.PathValue("channelId")); err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"deleted": true}, Msg: "渠道已删除"})
}

func (handlers modelChannelHandlers) Test(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.TestConnection(r.Context(), r.PathValue("channelId"), false)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: result.Message})
}

func (handlers modelChannelHandlers) SyncModels(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.TestConnection(r.Context(), r.PathValue("channelId"), true)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: result.Message})
}

func (handlers modelChannelHandlers) CreateModel(w http.ResponseWriter, r *http.Request) {
	var input modelchannels.ModelInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40032, Msg: "模型参数格式不正确"})
		return
	}
	model, err := handlers.service.CreateModel(r.Context(), r.PathValue("channelId"), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"model": model}, Msg: "模型已添加"})
}

func (handlers modelChannelHandlers) UpdateModel(w http.ResponseWriter, r *http.Request) {
	var input modelchannels.ModelInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40032, Msg: "模型参数格式不正确"})
		return
	}
	model, err := handlers.service.UpdateModel(r.Context(), r.PathValue("channelId"), r.PathValue("modelId"), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"model": model}, Msg: "模型已更新"})
}

func (handlers modelChannelHandlers) DeleteModel(w http.ResponseWriter, r *http.Request) {
	if err := handlers.service.DeleteModel(r.Context(), r.PathValue("channelId"), r.PathValue("modelId")); err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"deleted": true}, Msg: "模型已删除"})
}

func (handlers modelChannelHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, modelchannels.ErrInvalidChannel):
		writeJSON(w, http.StatusBadRequest, response{Code: 40033, Msg: "请填写有效的渠道名称、HTTPS Base URL 和 API Key"})
	case errors.Is(err, modelchannels.ErrInvalidModel):
		writeJSON(w, http.StatusBadRequest, response{Code: 40034, Msg: "请填写有效的图片模型 ID 和名称"})
	case errors.Is(err, modelchannels.ErrChannelNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40431, Msg: "模型渠道不存在"})
	case errors.Is(err, modelchannels.ErrModelNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40432, Msg: "渠道模型不存在"})
	case errors.Is(err, modelchannels.ErrModelConflict):
		writeJSON(w, http.StatusConflict, response{Code: 40931, Msg: "模型 ID 已存在，请直接编辑现有模型"})
	default:
		handlers.logger.Error("model channel request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50031, Msg: "模型渠道服务暂时不可用"})
	}
}
