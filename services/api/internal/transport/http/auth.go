package httptransport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"nova-creator-platform/services/api/internal/auth"
)

type authHandlers struct {
	service *auth.Service
	logger  *slog.Logger
}

func newAuthHandlers(service *auth.Service, logger *slog.Logger) authHandlers {
	return authHandlers{service: service, logger: logger}
}

func (handlers authHandlers) Register(w http.ResponseWriter, r *http.Request) {
	var input auth.RegisterInput
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40001, Msg: "请求参数格式不正确"})
		return
	}
	result, err := handlers.service.Register(r.Context(), input)
	if err != nil {
		handlers.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, response{Code: 0, Data: result, Msg: "注册成功"})
}

func (handlers authHandlers) Login(w http.ResponseWriter, r *http.Request) {
	var input auth.LoginInput
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40001, Msg: "请求参数格式不正确"})
		return
	}
	result, err := handlers.service.Login(r.Context(), input)
	if err != nil {
		handlers.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: result, Msg: "登录成功"})
}

func (handlers authHandlers) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "登录凭证无效或已过期"})
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: user, Msg: "获取成功"})
}

func (handlers authHandlers) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawToken, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
			return
		}
		user, err := handlers.service.CurrentUser(r.Context(), rawToken)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "登录凭证无效或已过期"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), currentUserContextKey{}, user)))
	})
}

func (handlers authHandlers) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := currentUser(r.Context())
		if !ok || user.Role != "admin" {
			writeJSON(w, http.StatusForbidden, response{Code: 40302, Msg: "需要管理员权限"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (handlers authHandlers) writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40002, Msg: "请输入有效邮箱、2-32 位用户名和 8-72 位密码"})
	case errors.Is(err, auth.ErrEmailTaken):
		writeJSON(w, http.StatusConflict, response{Code: 40901, Msg: "该邮箱已注册"})
	case errors.Is(err, auth.ErrInvalidCredentials):
		writeJSON(w, http.StatusUnauthorized, response{Code: 40102, Msg: "邮箱或密码错误"})
	case errors.Is(err, auth.ErrUserDisabled):
		writeJSON(w, http.StatusForbidden, response{Code: 40301, Msg: "账号已停用"})
	default:
		handlers.logger.Error("authentication request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50001, Msg: "服务暂时不可用"})
	}
}

func decodeJSON(r *http.Request, destination interface{}) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain one JSON value")
	}
	return nil
}

func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
		return "", false
	}
	return strings.TrimSpace(token), true
}

type currentUserContextKey struct{}

func currentUser(ctx context.Context) (auth.User, bool) {
	user, ok := ctx.Value(currentUserContextKey{}).(auth.User)
	return user, ok
}
