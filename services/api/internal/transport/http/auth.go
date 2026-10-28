package httptransport

import (
	"context"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"

	_ "golang.org/x/image/webp"

	"nova-creator-platform/services/api/internal/auth"
)

type authHandlers struct {
	service  *auth.Service
	logger   *slog.Logger
	maxBytes int64
}

func newAuthHandlers(service *auth.Service, logger *slog.Logger, maxBytes int64) authHandlers {
	return authHandlers{service: service, logger: logger, maxBytes: maxBytes}
}

func (handlers authHandlers) Register(w http.ResponseWriter, r *http.Request) {
	var input auth.RegisterInput
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40001, Msg: "请求参数格式不正确"})
		return
	}
	result, err := handlers.service.Register(r.Context(), input, requestClientInfo(r))
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
	result, err := handlers.service.Login(r.Context(), input, requestClientInfo(r))
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

func (handlers authHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	if err := handlers.service.Logout(r.Context(), user); err != nil && !errors.Is(err, auth.ErrInvalidSession) {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]bool{"loggedOut": true}, Msg: "已退出登录"})
}

func (handlers authHandlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	var input auth.ChangePasswordInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "密码参数不正确"})
		return
	}
	if err := handlers.service.ChangePassword(r.Context(), user, input); err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: nil, Msg: "密码已更新，其他设备已退出"})
}

func (handlers authHandlers) Sessions(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	sessions, err := handlers.service.ListSessions(r.Context(), user)
	if err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]interface{}{"items": sessions}, Msg: "获取成功"})
}

func (handlers authHandlers) RevokeSession(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	if err := handlers.service.RevokeSession(r.Context(), user, r.PathValue("sessionId")); err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: nil, Msg: "设备已退出"})
}

func (handlers authHandlers) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	if err := handlers.service.RevokeOtherSessions(r.Context(), user); err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: nil, Msg: "其他设备已全部退出"})
}

func (handlers authHandlers) DeletionRequest(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	request, err := handlers.service.GetAccountDeletionRequest(r.Context(), user)
	if err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: request, Msg: "获取成功"})
}

func (handlers authHandlers) RequestDeletion(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var input auth.RequestAccountDeletionInput
	if decodeJSON(r, &input) != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "请输入当前密码"})
		return
	}
	request, err := handlers.service.RequestAccountDeletion(r.Context(), user, input)
	if err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: request, Msg: "注销申请已提交"})
}

func (handlers authHandlers) CancelDeletion(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	if err := handlers.service.CancelAccountDeletion(r.Context(), user); err != nil {
		handlers.writeSecurityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: nil, Msg: "注销申请已撤销"})
}

func (handlers authHandlers) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	var input auth.ProfileInput
	if err := decodeJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40003, Msg: "昵称参数不正确"})
		return
	}
	updated, err := handlers.service.UpdateProfile(r.Context(), user.ID, input)
	if err != nil {
		handlers.writeProfileError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: updated, Msg: "个人资料已更新"})
}

func (handlers authHandlers) UpdateAvatar(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, handlers.maxBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像文件无效或超过大小限制"})
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil || header.Size <= 0 || header.Size > handlers.maxBytes {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "请选择有效头像图片"})
		return
	}
	defer file.Close()
	headerBytes := make([]byte, 512)
	readBytes, readErr := io.ReadFull(file, headerBytes)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像文件无法读取"})
		return
	}
	mimeType := http.DetectContentType(headerBytes[:readBytes])
	if mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp" {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像仅支持 JPG、PNG 或 WebP"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像文件无法读取"})
		return
	}
	if _, _, err := image.DecodeConfig(file); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像图片内容无效"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "头像文件无法读取"})
		return
	}
	updated, err := handlers.service.UpdateAvatar(r.Context(), user.ID, mimeType, file)
	if err != nil {
		handlers.writeProfileError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: updated, Msg: "头像已更新"})
}

func (handlers authHandlers) RemoveAvatar(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	updated, err := handlers.service.RemoveAvatar(r.Context(), user.ID)
	if err != nil {
		handlers.writeProfileError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response{Code: 0, Data: updated, Msg: "头像已移除"})
}

func (handlers authHandlers) Avatar(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, response{Code: 40101, Msg: "请先登录"})
		return
	}
	avatar, err := handlers.service.OpenAvatar(r.Context(), user.ID)
	if err != nil {
		if errors.Is(err, auth.ErrAvatarMissing) {
			writeJSON(w, http.StatusNotFound, response{Code: 40402, Msg: "头像不存在"})
			return
		}
		handlers.writeProfileError(w, err)
		return
	}
	defer avatar.Content.Close()
	w.Header().Set("Content-Type", avatar.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, "avatar", avatar.UpdatedAt, avatar.Content)
}

func (handlers authHandlers) writeProfileError(w http.ResponseWriter, err error) {
	if errors.Is(err, auth.ErrInvalidInput) || errors.Is(err, auth.ErrInvalidAvatar) {
		writeJSON(w, http.StatusBadRequest, response{Code: 40003, Msg: "请输入 2-32 位昵称并选择有效头像"})
		return
	}
	handlers.logger.Error("profile request failed", "error", err)
	writeJSON(w, http.StatusInternalServerError, response{Code: 50002, Msg: "个人资料服务暂时不可用"})
}

func (handlers authHandlers) writeSecurityError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials):
		writeJSON(w, http.StatusUnauthorized, response{Code: 40102, Msg: "当前密码不正确"})
	case errors.Is(err, auth.ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, response{Code: 40004, Msg: "新密码需要 8-72 位"})
	case errors.Is(err, auth.ErrCurrentSession):
		writeJSON(w, http.StatusBadRequest, response{Code: 40005, Msg: "不能在此处注销当前设备"})
	case errors.Is(err, auth.ErrInvalidSession):
		writeJSON(w, http.StatusNotFound, response{Code: 40402, Msg: "登录设备不存在或已退出"})
	case errors.Is(err, auth.ErrDeletionRequestMissing):
		writeJSON(w, http.StatusNotFound, response{Code: 40403, Msg: "没有待处理的注销申请"})
	case errors.Is(err, auth.ErrAdminDeletionForbidden):
		writeJSON(w, http.StatusForbidden, response{Code: 40304, Msg: "管理员账号不能提交注销申请"})
	default:
		handlers.logger.Error("account security request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, response{Code: 50003, Msg: "账号安全服务暂时不可用"})
	}
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

func requestClientInfo(r *http.Request) auth.ClientInfo {
	ipAddress := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(ipAddress); err == nil {
		ipAddress = host
	}
	return auth.ClientInfo{UserAgent: r.UserAgent(), IPAddress: ipAddress}
}

type currentUserContextKey struct{}

func currentUser(ctx context.Context) (auth.User, bool) {
	user, ok := ctx.Value(currentUserContextKey{}).(auth.User)
	return user, ok
}
