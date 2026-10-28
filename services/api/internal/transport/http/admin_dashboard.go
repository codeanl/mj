package httptransport

import (
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/admindashboard"
)

type adminDashboardHandlers struct {
	service *admindashboard.Service
	audit   *adminaudit.Service
	logger  *slog.Logger
}

func newAdminDashboardHandlers(service *admindashboard.Service, audit *adminaudit.Service, logger *slog.Logger) adminDashboardHandlers {
	return adminDashboardHandlers{service: service, audit: audit, logger: logger}
}

func (handlers adminDashboardHandlers) Get(w http.ResponseWriter, r *http.Request) {
	dashboard, err := handlers.service.Get(r.Context())
	if err != nil {
		handlers.logger.Error("admin dashboard request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50062, Msg: "管理总览暂时不可用"})
		return
	}
	recentAudit, err := handlers.audit.Recent(r.Context(), 6)
	if err != nil {
		handlers.logger.Error("admin dashboard audit request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50062, Msg: "管理总览暂时不可用"})
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"summary": dashboard.Summary, "trend": dashboard.Trend, "alerts": dashboard.Alerts, "recentAudit": recentAudit}, Msg: "获取成功"})
}
