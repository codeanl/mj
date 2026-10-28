package httptransport

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5/middleware"

	"nova-creator-platform/services/api/internal/adminaudit"
)

type adminAuditHandlers struct {
	service *adminaudit.Service
	logger  *slog.Logger
}

func newAdminAuditHandlers(service *adminaudit.Service, logger *slog.Logger) adminAuditHandlers {
	return adminAuditHandlers{service: service, logger: logger}
}

func (handlers adminAuditHandlers) List(w http.ResponseWriter, r *http.Request) {
	page, err := positiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		handlers.writeError(w, adminaudit.ErrInvalidInput)
		return
	}
	pageSize, err := positiveInt(r.URL.Query().Get("pageSize"), 20)
	if err != nil {
		handlers.writeError(w, adminaudit.ErrInvalidInput)
		return
	}
	result, err := handlers.service.List(r.Context(), adminaudit.ListInput{Page: page, PageSize: pageSize, Search: r.URL.Query().Get("search"), Action: r.URL.Query().Get("action")})
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "获取成功"})
}

func (handlers adminAuditHandlers) writeError(w http.ResponseWriter, err error) {
	if errors.Is(err, adminaudit.ErrInvalidInput) {
		writeJSON(w, http.StatusBadRequest, response{Code: 40061, Msg: "审计筛选参数不正确"})
		return
	}
	handlers.logger.Error("admin audit request failed", "error", err)
	writeJSON(w, http.StatusInternalServerError, response{Code: 50061, Msg: "审计日志服务暂时不可用"})
}

func recordAdminAudit(service *adminaudit.Service, logger *slog.Logger, r *http.Request, action, targetType, targetID string, before, after interface{}) {
	actor, ok := currentUser(r.Context())
	if !ok {
		return
	}
	client := requestClientInfo(r)
	statusCode := http.StatusOK
	if strings.HasSuffix(action, ".create") {
		statusCode = http.StatusCreated
	}
	if err := service.Record(r.Context(), adminaudit.Entry{
		ActorUserID: actor.ID,
		Action:      action,
		TargetType:  targetType,
		TargetID:    targetID,
		Before:      before,
		After:       after,
		IPAddress:   client.IPAddress,
		UserAgent:   client.UserAgent,
		RequestID:   middleware.GetReqID(r.Context()),
		Succeeded:   true,
		StatusCode:  statusCode,
	}); err != nil {
		logger.Error("admin audit record failed", "action", action, "target_type", targetType, "target_id", targetID, "error", err)
	}
}

type auditResponseWriter struct {
	http.ResponseWriter
	status int
}

func (writer *auditResponseWriter) WriteHeader(status int) {
	writer.status = status
	writer.ResponseWriter.WriteHeader(status)
}

func adminFailureAudit(service *adminaudit.Service, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writer := &auditResponseWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(writer, r)
			if writer.status < http.StatusBadRequest || r.Method == http.MethodGet {
				return
			}
			action, targetType := failedAuditAction(r.Method, r.URL.Path)
			if action == "" {
				return
			}
			actor, ok := currentUser(r.Context())
			if !ok {
				return
			}
			client := requestClientInfo(r)
			if err := service.Record(r.Context(), adminaudit.Entry{
				ActorUserID: actor.ID, Action: action, TargetType: targetType, TargetID: auditTargetID(r),
				After: map[string]int{"statusCode": writer.status}, IPAddress: client.IPAddress, UserAgent: client.UserAgent,
				RequestID: middleware.GetReqID(r.Context()), Succeeded: false, StatusCode: writer.status,
			}); err != nil {
				logger.Error("admin failure audit record failed", "action", action, "status", writer.status, "error", err)
			}
		})
	}
}

func failedAuditAction(method, path string) (string, string) {
	switch {
	case strings.Contains(path, "/password"):
		return "user.password_reset", "user"
	case strings.Contains(path, "/points/rules"):
		return "points.rules_update", "points_rules"
	case strings.HasSuffix(path, "/points"):
		return "points.adjust", "user"
	case strings.Contains(path, "/generations/"):
		part := path[strings.LastIndex(path, "/")+1:]
		return "generation." + part, "generation"
	case strings.HasSuffix(path, "/models/sync"):
		return "channel.models_sync", "channel"
	case strings.HasSuffix(path, "/test") && strings.Contains(path, "/channels/"):
		return "channel.test", "channel"
	case strings.Contains(path, "/channels/") && strings.Contains(path, "/models"):
		return "channel_model." + strings.ToLower(method), "channel_model"
	case strings.Contains(path, "/channels"):
		return "channel." + strings.ToLower(method), "channel"
	case strings.Contains(path, "/users"):
		return "user." + strings.ToLower(method), "user"
	default:
		return "", ""
	}
}

func auditTargetID(r *http.Request) string {
	for _, key := range []string{"taskId", "modelId", "channelId", "accountId"} {
		if value := r.PathValue(key); value != "" {
			return value
		}
	}
	return ""
}
