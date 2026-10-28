package httptransport

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/cdk"
)

type cdkHandlers struct {
	service *cdk.Service
	audit   *adminaudit.Service
	logger  *slog.Logger
}

func newCdkHandlers(service *cdk.Service, audit *adminaudit.Service, logger *slog.Logger) cdkHandlers {
	return cdkHandlers{service: service, audit: audit, logger: logger}
}

func (handlers cdkHandlers) Redeem(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var input cdk.RedeemInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, cdk.ErrInvalidInput)
		return
	}
	result, err := handlers.service.Redeem(r.Context(), user.ID, input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "兑换成功"})
}

func (handlers cdkHandlers) List(w http.ResponseWriter, r *http.Request) {
	page, err := positiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		handlers.writeError(w, cdk.ErrInvalidInput)
		return
	}
	pageSize, err := positiveInt(r.URL.Query().Get("pageSize"), 20)
	if err != nil {
		handlers.writeError(w, cdk.ErrInvalidInput)
		return
	}
	result, err := handlers.service.List(r.Context(), cdk.ListInput{Page: page, PageSize: pageSize, Search: r.URL.Query().Get("search"), Filter: r.URL.Query().Get("filter")})
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "获取成功"})
}

func (handlers cdkHandlers) Generate(w http.ResponseWriter, r *http.Request) {
	actor, _ := currentUser(r.Context())
	var input cdk.GenerateInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, cdk.ErrInvalidInput)
		return
	}
	items, err := handlers.service.Generate(r.Context(), actor.ID, input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "cdk.generate", "cdk", "batch", nil, map[string]interface{}{"count": len(items), "points": input.Points, "maxRedemptions": input.MaxRedemptions, "expiresInDays": input.ExpiresInDays, "note": input.Note})
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"items": items}, Msg: "CDK 已生成"})
}

func (handlers cdkHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	deleted, err := handlers.service.Delete(r.Context(), []string{id})
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	if deleted == 0 {
		handlers.writeError(w, cdk.ErrNotFound)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "cdk.delete", "cdk", id, map[string]string{"id": id}, nil)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]int64{"deleted": deleted}, Msg: "CDK 已删除"})
}

func (handlers cdkHandlers) BulkDelete(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, cdk.ErrInvalidInput)
		return
	}
	deleted, err := handlers.service.Delete(r.Context(), input.IDs)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "cdk.bulk_delete", "cdk", strconv.Itoa(len(input.IDs)), map[string]interface{}{"ids": input.IDs}, map[string]int64{"deleted": deleted})
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]int64{"deleted": deleted}, Msg: "CDK 已批量删除"})
}

func (handlers cdkHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, cdk.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40061, Msg: "CDK 参数不正确"})
	case errors.Is(err, cdk.ErrNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40461, Msg: "兑换码不存在或已被删除"})
	case errors.Is(err, cdk.ErrAlreadyRedeemed):
		writeJSON(w, http.StatusConflict, response{Code: 40961, Msg: "当前账号已经兑换过这个 CDK"})
	case errors.Is(err, cdk.ErrExpired):
		writeJSON(w, http.StatusConflict, response{Code: 40962, Msg: "这个 CDK 已过期"})
	case errors.Is(err, cdk.ErrExhausted):
		writeJSON(w, http.StatusConflict, response{Code: 40963, Msg: "这个 CDK 的兑换次数已用完"})
	case errors.Is(err, cdk.ErrDisabled):
		writeJSON(w, http.StatusConflict, response{Code: 40964, Msg: "这个 CDK 已停用"})
	default:
		handlers.logger.Error("cdk request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50061, Msg: "CDK 服务暂时不可用"})
	}
}
