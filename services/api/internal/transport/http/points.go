package httptransport

import (
	"errors"
	"log/slog"
	"net/http"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/points"
)

type pointHandlers struct {
	service *points.Service
	audit   *adminaudit.Service
	logger  *slog.Logger
}

func newPointHandlers(service *points.Service, audit *adminaudit.Service, logger *slog.Logger) pointHandlers {
	return pointHandlers{service: service, audit: audit, logger: logger}
}

func (handlers pointHandlers) Wallet(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	balance, err := handlers.service.Balance(r.Context(), user.ID)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	transactions, err := handlers.service.Transactions(r.Context(), user.ID)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"balance": balance, "transactions": transactions}, Msg: "获取成功"})
}

func (handlers pointHandlers) GetRules(w http.ResponseWriter, r *http.Request) {
	config, err := handlers.service.GetConfig(r.Context())
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: config, Msg: "获取成功"})
}

func (handlers pointHandlers) SaveRules(w http.ResponseWriter, r *http.Request) {
	before, err := handlers.service.GetConfig(r.Context())
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	var input points.RuleConfig
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, points.ErrInvalidInput)
		return
	}
	config, err := handlers.service.SaveConfig(r.Context(), input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "points.rules_update", "points_rules", "default", before, config)
	writeJSON(w, http.StatusOK, response{Code: 0, Data: config, Msg: "积分规则已保存"})
}

func (handlers pointHandlers) Adjust(w http.ResponseWriter, r *http.Request) {
	actor, _ := currentUser(r.Context())
	accountID, err := parseAccountIDPath(r.PathValue("accountId"))
	if err != nil {
		handlers.writeError(w, points.ErrInvalidInput)
		return
	}
	var input points.AdjustmentInput
	if decodeJSON(r, &input) != nil {
		handlers.writeError(w, points.ErrInvalidInput)
		return
	}
	result, err := handlers.service.Adjust(r.Context(), actor.ID, accountID, input)
	if err != nil {
		handlers.writeError(w, err)
		return
	}
	recordAdminAudit(handlers.audit, handlers.logger, r, "points.adjust", "user", r.PathValue("accountId"), map[string]float64{"balance": result.Balance - input.Amount}, map[string]interface{}{"balance": result.Balance, "amount": input.Amount, "description": input.Description})
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "用户积分已调整"})
}

func (handlers pointHandlers) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, points.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40051, Msg: "积分参数不正确"})
	case errors.Is(err, points.ErrUserNotFound):
		writeJSON(w, http.StatusNotFound, response{Code: 40451, Msg: "用户不存在"})
	case errors.Is(err, points.ErrInsufficientPoints):
		writeJSON(w, http.StatusConflict, response{Code: 40951, Msg: "调整后的积分余额不能小于零"})
	default:
		handlers.logger.Error("points request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50051, Msg: "积分服务暂时不可用"})
	}
}
