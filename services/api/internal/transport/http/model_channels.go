package httptransport

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/modelchannels"
)

type modelChannelHandlers struct {
	service *modelchannels.Service
	audit   *adminaudit.Service
	logger  *slog.Logger
}

func newModelChannelHandlers(service *modelchannels.Service, audit *adminaudit.Service, logger *slog.Logger) modelChannelHandlers {
	return modelChannelHandlers{service: service, audit: audit, logger: logger}
}

func (handlers modelChannelHandlers) PublicModels(w http.ResponseWriter, r *http.Request) {
	models, err := handlers.service.PublicModels(r.Context(), r.URL.Query().Get("capability"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"models": models}, Msg: "获取成功"})
}

func (handlers modelChannelHandlers) Protocols(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"protocols": modelchannels.ProtocolDefinitions()}, Msg: "获取成功"})
}

func (handlers modelChannelHandlers) List(w http.ResponseWriter, r *http.Request) {
	channels, err := handlers.service.List(r.Context())
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"channels": channels}, Msg: "获取成功"})
}

func (handlers modelChannelHandlers) Simulate(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.SimulateImageRoute(r.Context(), r.URL.Query().Get("model"), r.URL.Query().Get("size"), r.URL.Query().Get("quality"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "路由模拟完成"})
}
func (handlers modelChannelHandlers) Stats(w http.ResponseWriter, r *http.Request) {
	window := r.URL.Query().Get("window")
	if window == "" {
		window = "24h"
	}
	result, err := handlers.service.RuntimeStats(r.Context(), window)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "获取成功"})
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
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel.create", "channel", channel.ID, nil, channel)
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"channel": channel}, Msg: "渠道已创建"})
}

func (handlers modelChannelHandlers) Update(w http.ResponseWriter, r *http.Request) {
	before, err := handlers.service.Get(r.Context(), r.PathValue("channelId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
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
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel.update", "channel", channel.ID, before, channel)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"channel": channel}, Msg: "渠道已更新"})
}

func (handlers modelChannelHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	before, err := handlers.service.Get(r.Context(), r.PathValue("channelId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	if err := handlers.service.Delete(r.Context(), r.PathValue("channelId")); err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel.delete", "channel", r.PathValue("channelId"), before, nil)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"deleted": true}, Msg: "渠道已删除"})
}

func (handlers modelChannelHandlers) Test(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.TestConnection(r.Context(), r.PathValue("channelId"), false)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel.test", "channel", r.PathValue("channelId"), nil, result)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: result.Message})
}

func (handlers modelChannelHandlers) SyncModels(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.TestConnection(r.Context(), r.PathValue("channelId"), true)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel.models_sync", "channel", r.PathValue("channelId"), nil, result)
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
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel_model.create", "channel_model", model.ID, nil, model)
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"model": model}, Msg: "模型已添加"})
}

func (handlers modelChannelHandlers) UpdateModel(w http.ResponseWriter, r *http.Request) {
	before, err := handlers.channelModel(r.Context(), r.PathValue("channelId"), r.PathValue("modelId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
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
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel_model.update", "channel_model", model.ID, before, model)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"model": model}, Msg: "模型已更新"})
}

func (handlers modelChannelHandlers) DeleteModel(w http.ResponseWriter, r *http.Request) {
	before, err := handlers.channelModel(r.Context(), r.PathValue("channelId"), r.PathValue("modelId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	if err := handlers.service.DeleteModel(r.Context(), r.PathValue("channelId"), r.PathValue("modelId")); err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "channel_model.delete", "channel_model", r.PathValue("modelId"), before, nil)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"deleted": true}, Msg: "模型已删除"})
}

func (handlers modelChannelHandlers) channelModel(ctx context.Context, channelID, modelID string) (modelchannels.Model, error) {
	channel, err := handlers.service.Get(ctx, channelID)
	if err != nil {
		return modelchannels.Model{}, err
	}
	for _, model := range channel.Models {
		if model.ID == modelID {
			return model, nil
		}
	}
	return modelchannels.Model{}, modelchannels.ErrModelNotFound
}

func (handlers modelChannelHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, modelchannels.ErrInvalidChannel):
		writeJSON(w, http.StatusBadRequest, response{Code: 40033, Msg: "请填写有效的渠道名称、HTTPS Base URL、协议与鉴权配置"})
	case errors.Is(err, modelchannels.ErrInvalidModel):
		writeJSON(w, http.StatusBadRequest, response{Code: 40034, Msg: "请填写有效的模型 ID、名称和能力"})
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
