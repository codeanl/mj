package httptransport

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/adminusers"
)

type adminUserHandlers struct {
	service *adminusers.Service
	audit   *adminaudit.Service
	logger  *slog.Logger
}

func newAdminUserHandlers(service *adminusers.Service, audit *adminaudit.Service, logger *slog.Logger) adminUserHandlers {
	return adminUserHandlers{service: service, audit: audit, logger: logger}
}

func (handlers adminUserHandlers) List(w http.ResponseWriter, r *http.Request) {
	actor, _ := currentUser(r.Context())
	page, err := positiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	pageSize, err := positiveInt(r.URL.Query().Get("pageSize"), 20)
	if err != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	result, err := handlers.service.List(r.Context(), actor.ID, adminusers.ListInput{
		Page: page, PageSize: pageSize, Search: r.URL.Query().Get("search"), Role: r.URL.Query().Get("role"), Status: r.URL.Query().Get("status"),
	})
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "获取成功"})
}

func (handlers adminUserHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var input adminusers.CreateInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	user, err := handlers.service.Create(r.Context(), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "user.create", "user", strconv.FormatInt(user.AccountID, 10), nil, user)
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: map[string]interface{}{"user": user}, Msg: "用户已创建"})
}

func (handlers adminUserHandlers) Update(w http.ResponseWriter, r *http.Request) {
	actor, _ := currentUser(r.Context())
	accountID, err := parseAccountIDPath(r.PathValue("accountId"))
	if err != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	var input adminusers.UpdateInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	before, err := handlers.service.Get(r.Context(), accountID)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	user, err := handlers.service.Update(r.Context(), actor.ID, accountID, input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "user.update", "user", strconv.FormatInt(accountID, 10), before, user)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"user": user}, Msg: "用户已更新"})
}

func (handlers adminUserHandlers) ResetPassword(w http.ResponseWriter, r *http.Request) {
	accountID, err := parseAccountIDPath(r.PathValue("accountId"))
	if err != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	var input adminusers.PasswordInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, adminusers.ErrInvalidInput)
		return
	}
	target, err := handlers.service.Get(r.Context(), accountID)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	if err := handlers.service.ResetPassword(r.Context(), accountID, input); err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "user.password_reset", "user", strconv.FormatInt(accountID, 10), map[string]interface{}{"username": target.Username}, map[string]bool{"sessionsRevoked": true})
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"updated": true}, Msg: "密码已重置"})
}

func (handlers adminUserHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, adminusers.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40041, Msg: "用户参数不正确，请检查邮箱、用户名、角色、状态和密码"})
	case errors.Is(err, adminusers.ErrUserNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40441, Msg: "用户不存在"})
	case errors.Is(err, adminusers.ErrEmailConflict):
		writeJSON(w, http.StatusConflict, response{Code: 40941, Msg: "该邮箱已被使用"})
	case errors.Is(err, adminusers.ErrSelfProtection):
		writeJSON(w, http.StatusConflict, response{Code: 40942, Msg: "不能停用当前管理员或移除自己的管理员角色"})
	case errors.Is(err, adminusers.ErrLastAdmin):
		writeJSON(w, http.StatusConflict, response{Code: 40943, Msg: "系统必须保留至少一个启用的管理员"})
	default:
		handlers.logger.Error("admin user request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50041, Msg: "用户管理服务暂时不可用"})
	}
}

func parseAccountIDPath(value string) (int64, error) {
	accountID, err := strconv.ParseInt(value, 10, 64)
	if err != nil || accountID < 1 {
		return 0, adminusers.ErrInvalidInput
	}
	return accountID, nil
}
