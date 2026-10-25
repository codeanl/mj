package httptransport

import (
	"errors"
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/admingenerations"
	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/generation"
)

type adminGenerationHandlers struct {
	service  *admingenerations.Service
	assets   *assets.Service
	recovery *generation.RecoveryService
	logger   *slog.Logger
}

func newAdminGenerationHandlers(service *admingenerations.Service, assetService *assets.Service, recovery *generation.RecoveryService, logger *slog.Logger) adminGenerationHandlers {
	return adminGenerationHandlers{service: service, assets: assetService, recovery: recovery, logger: logger}
}

func (handlers adminGenerationHandlers) Check(w http.ResponseWriter, r *http.Request) {
	task, err := handlers.recovery.CheckAdmin(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeReviewError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: task, Msg: "状态已检查"})
}
func (handlers adminGenerationHandlers) Review(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Action    string `json:"action"`
		ResultURL string `json:"resultUrl"`
		Reason    string `json:"reason"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40042, Msg: "接管参数不正确"})
		return
	}
	var task admingenerations.Task
	var err error
	switch input.Action {
	case "confirm_failed":
		var value generation.Task
		value, err = handlers.recovery.ConfirmFailed(r.Context(), r.PathValue("taskId"), input.Reason)
		if err == nil {
			task, err = handlers.service.Get(r.Context(), value.ID)
		}
	case "provide_result":
		var value generation.Task
		value, err = handlers.recovery.ProvideResult(r.Context(), r.PathValue("taskId"), input.ResultURL)
		if err == nil {
			task, err = handlers.service.Get(r.Context(), value.ID)
		}
	default:
		err = admingenerations.ErrInvalidInput
	}
	if err != nil {
		handlers.writeReviewError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: task, Msg: "任务已处理"})
}
func (handlers adminGenerationHandlers) writeReviewError(w http.ResponseWriter, err error) {
	if errors.Is(err, generation.ErrNotReviewable) {
		writeJSON(w, http.StatusConflict, response{Code: 40943, Msg: "任务不处于待确认状态"})
		return
	}
	handlers.writeError(w, err)
}

func (handlers adminGenerationHandlers) Preview(w http.ResponseWriter, r *http.Request) {
	task, err := handlers.service.Get(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	asset, content, err := handlers.assets.OpenByID(r.Context(), task.AssetID)
	if err != nil {
		if errors.Is(err, assets.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, response{Code: 40442, Msg: "任务结果素材不存在"})
			return
		}
		handlers.writeError(w, err)
		return
	}
	defer content.Close()
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, asset.OriginalName, asset.CreatedAt, content)
}

func (handlers adminGenerationHandlers) List(w http.ResponseWriter, r *http.Request) {
	page, err := positiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		handlers.writeError(w, admingenerations.ErrInvalidInput)
		return
	}
	pageSize, err := positiveInt(r.URL.Query().Get("pageSize"), 20)
	if err != nil {
		handlers.writeError(w, admingenerations.ErrInvalidInput)
		return
	}
	result, err := handlers.service.List(r.Context(), admingenerations.ListInput{
		Page: page, PageSize: pageSize, Search: r.URL.Query().Get("search"), Status: r.URL.Query().Get("status"), Kind: r.URL.Query().Get("type"),
	})
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "获取成功"})
}

func (handlers adminGenerationHandlers) Get(w http.ResponseWriter, r *http.Request) {
	task, err := handlers.service.Get(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: task, Msg: "获取成功"})
}

func (handlers adminGenerationHandlers) Retry(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.Retry(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "任务已重新排队"})
}

func (handlers adminGenerationHandlers) Cancel(w http.ResponseWriter, r *http.Request) {
	task, err := handlers.service.Get(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	if task.Status == "running" && task.UpstreamTaskID != "" {
		if err := handlers.recovery.CancelUpstreamAdmin(r.Context(), task.ID); err != nil {
			handlers.writeError(w, err)
			return
		}
	}
	result, err := handlers.service.Cancel(r.Context(), task.ID)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "排队任务已取消"})
}

func (handlers adminGenerationHandlers) Refund(w http.ResponseWriter, r *http.Request) {
	result, err := handlers.service.Refund(r.Context(), r.PathValue("taskId"))
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "积分已退回"})
}

func (handlers adminGenerationHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, admingenerations.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40041, Msg: "任务参数或筛选条件不正确"})
	case errors.Is(err, admingenerations.ErrNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40441, Msg: "生成任务不存在"})
	case errors.Is(err, admingenerations.ErrInvalidState):
		writeJSON(w, http.StatusConflict, response{Code: 40941, Msg: "当前任务状态不允许此操作"})
	case errors.Is(err, admingenerations.ErrInsufficientPoints):
		writeJSON(w, http.StatusConflict, response{Code: 40942, Msg: "用户积分不足，无法重新扣费"})
	default:
		handlers.logger.Error("admin generation request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50041, Msg: "生成任务服务暂时不可用"})
	}
}
