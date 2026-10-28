package httptransport

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"nova-creator-platform/services/api/internal/adminaudit"
	"nova-creator-platform/services/api/internal/admindashboard"
	"nova-creator-platform/services/api/internal/admingenerations"
	"nova-creator-platform/services/api/internal/adminusers"
	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/auth"
	"nova-creator-platform/services/api/internal/cdk"
	"nova-creator-platform/services/api/internal/config"
	"nova-creator-platform/services/api/internal/generation"
	"nova-creator-platform/services/api/internal/modelchannels"
	"nova-creator-platform/services/api/internal/points"
)

func NewRouter(runtimeContext context.Context, cfg config.Config, logger *slog.Logger, db *pgxpool.Pool, redisClient *redis.Client) http.Handler {
	assetStorage, err := assets.NewLocalStorage(cfg.AssetDataDir)
	if err != nil {
		panic(err)
	}
	assetStorage.ConfigureFFmpeg(cfg.FFmpegPath)
	authService := auth.NewService(auth.NewPostgresRepository(db), auth.NewTokenManager(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAccessTTL), assetStorage)
	authHTTP := newAuthHandlers(authService, logger, cfg.AssetMaxBytes)
	auditService := adminaudit.NewService(adminaudit.NewRepository(db))
	auditHTTP := newAdminAuditHandlers(auditService, logger)
	dashboardHTTP := newAdminDashboardHandlers(admindashboard.NewService(admindashboard.NewRepository(db)), auditService, logger)
	adminUserHTTP := newAdminUserHandlers(adminusers.NewService(adminusers.NewPostgresRepository(db)), auditService, logger)
	assetService := assets.NewService(assets.NewPostgresRepository(db), assetStorage)
	assetHTTP := newAssetHandlers(assetService, assets.NewDownloadTokenManager(cfg.JWTSecret, cfg.JWTIssuer, cfg.AssetDownloadTTL), logger, cfg.AssetMaxBytes)
	adminGenerationService := admingenerations.NewService(admingenerations.NewRepository(db))
	channelRepository := modelchannels.NewRepository(db)
	channelService := modelchannels.NewService(channelRepository, modelchannels.NewSecretCipher(cfg.JWTSecret), cfg.GenerationTimeout)
	if db != nil {
		if err := channelService.EnsureDefault(runtimeContext, cfg.OpenAIBaseURL, cfg.OpenAIAPIKey, cfg.ImageModel); err != nil {
			panic(err)
		}
	}
	channelHTTP := newModelChannelHandlers(channelService, auditService, logger)
	pointService := points.NewService(points.NewPostgresRepository(db))
	pointHTTP := newPointHandlers(pointService, auditService, logger)
	cdkHTTP := newCdkHandlers(cdk.NewService(cdk.NewPostgresRepository(db), cdk.NewSecretCipher(cfg.JWTSecret)), auditService, logger)
	generationRepository := generation.NewRepository(db)
	imageProvider := generation.NewOpenAIImageProvider(cfg.GenerationTimeout, cfg.AssetMaxBytes)
	videoProvider := generation.NewMiniMaxH3VideoProvider(cfg.GenerationTimeout, cfg.AssetMaxBytes)
	recoveryService := generation.NewRecoveryService(generationRepository, imageProvider, videoProvider, channelService, assetStorage)
	adminGenerationHTTP := newAdminGenerationHandlers(adminGenerationService, assetService, recoveryService, auditService, logger)
	generationService := generation.NewService(generationRepository, channelService, pointService)
	generationHTTP := newGenerationHandlers(generationService, adminGenerationService, recoveryService, logger)
	if db != nil {
		go generation.NewWorker(generationRepository, imageProvider, videoProvider, channelService, assetStorage, logger, cfg.WorkerInterval, cfg.TaskStale).Run(runtimeContext)
	}
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(30 * time.Second))
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins(),
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	router.Use(requestLogger(logger))

	router.Route("/api/v1", func(api chi.Router) {
		api.Get("/health/live", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]string{"status": "live"}, Msg: "service is running"})
		})
		api.Get("/health/ready", readinessHandler(db, redisClient))

		api.Route("/auth", func(authRouter chi.Router) {
			authRouter.Post("/register", authHTTP.Register)
			authRouter.Post("/login", authHTTP.Login)
		})
		api.Get("/assets/{id}/download", assetHTTP.Download)
		api.Get("/assets/archive/download", assetHTTP.DownloadArchive)

		api.Group(func(protected chi.Router) {
			protected.Use(authHTTP.RequireAuth)
			protected.Get("/auth/me", authHTTP.Me)
			protected.Post("/auth/logout", authHTTP.Logout)
			protected.Patch("/profile", authHTTP.UpdateProfile)
			protected.Patch("/profile/password", authHTTP.ChangePassword)
			protected.Put("/profile/avatar", authHTTP.UpdateAvatar)
			protected.Delete("/profile/avatar", authHTTP.RemoveAvatar)
			protected.Get("/profile/avatar", authHTTP.Avatar)
			protected.Get("/profile/sessions", authHTTP.Sessions)
			protected.Delete("/profile/sessions/{sessionId}", authHTTP.RevokeSession)
			protected.Post("/profile/sessions/revoke-others", authHTTP.RevokeOtherSessions)
			protected.Get("/profile/deletion-request", authHTTP.DeletionRequest)
			protected.Post("/profile/deletion-request", authHTTP.RequestDeletion)
			protected.Delete("/profile/deletion-request", authHTTP.CancelDeletion)
			protected.Get("/assets", assetHTTP.List)
			protected.Get("/assets/stats", assetHTTP.Stats)
			protected.Post("/assets", assetHTTP.Upload)
			protected.Patch("/assets/{id}", assetHTTP.Rename)
			protected.Post("/assets/batch-delete", assetHTTP.BatchDelete)
			protected.Post("/assets/archive-ticket", assetHTTP.ArchiveTicket)
			protected.Get("/assets/{id}/content", assetHTTP.Content)
			protected.Get("/assets/{id}/poster", assetHTTP.Poster)
			protected.Post("/assets/{id}/download-ticket", assetHTTP.DownloadTicket)
			protected.Get("/models", channelHTTP.PublicModels)
			protected.Get("/points", pointHTTP.Wallet)
			protected.Post("/cdk/redeem", cdkHTTP.Redeem)
			protected.Get("/generations/capabilities", generationHTTP.GetCapabilities)
			protected.Post("/generations/images", generationHTTP.CreateImage)
			protected.Post("/generations/videos", generationHTTP.CreateVideo)
			protected.Get("/generations/{id}", generationHTTP.GetTask)
			protected.Post("/generations/{id}/retry", generationHTTP.Retry)
			protected.Post("/generations/{id}/cancel", generationHTTP.Cancel)
			protected.Post("/generations/{id}/check", generationHTTP.Check)

			protected.Group(func(admin chi.Router) {
				admin.Use(authHTTP.RequireAdmin)
				admin.Use(adminFailureAudit(auditService, logger))
				admin.Get("/admin/dashboard", dashboardHTTP.Get)
				admin.Get("/admin/audit", auditHTTP.List)
				admin.Get("/admin/protocols", channelHTTP.Protocols)
				admin.Get("/admin/users", adminUserHTTP.List)
				admin.Post("/admin/users", adminUserHTTP.Create)
				admin.Patch("/admin/users/{accountId}", adminUserHTTP.Update)
				admin.Patch("/admin/users/{accountId}/password", adminUserHTTP.ResetPassword)
				admin.Post("/admin/users/{accountId}/points", pointHTTP.Adjust)
				admin.Get("/admin/generations", adminGenerationHTTP.List)
				admin.Get("/admin/generations/{taskId}", adminGenerationHTTP.Get)
				admin.Get("/admin/generations/{taskId}/preview", adminGenerationHTTP.Preview)
				admin.Post("/admin/generations/{taskId}/retry", adminGenerationHTTP.Retry)
				admin.Post("/admin/generations/{taskId}/cancel", adminGenerationHTTP.Cancel)
				admin.Post("/admin/generations/{taskId}/refund", adminGenerationHTTP.Refund)
				admin.Post("/admin/generations/{taskId}/check", adminGenerationHTTP.Check)
				admin.Post("/admin/generations/{taskId}/review", adminGenerationHTTP.Review)
				admin.Get("/admin/points/rules", pointHTTP.GetRules)
				admin.Put("/admin/points/rules", pointHTTP.SaveRules)
				admin.Get("/admin/cdk", cdkHTTP.List)
				admin.Post("/admin/cdk", cdkHTTP.Generate)
				admin.Delete("/admin/cdk/{id}", cdkHTTP.Delete)
				admin.Post("/admin/cdk/batch-delete", cdkHTTP.BulkDelete)
				admin.Get("/admin/channels", channelHTTP.List)
				admin.Get("/admin/channels/simulate", channelHTTP.Simulate)
				admin.Get("/admin/channels/stats", channelHTTP.Stats)
				admin.Post("/admin/channels", channelHTTP.Create)
				admin.Patch("/admin/channels/{channelId}", channelHTTP.Update)
				admin.Delete("/admin/channels/{channelId}", channelHTTP.Delete)
				admin.Post("/admin/channels/{channelId}/test", channelHTTP.Test)
				admin.Post("/admin/channels/{channelId}/models/sync", channelHTTP.SyncModels)
				admin.Post("/admin/channels/{channelId}/models", channelHTTP.CreateModel)
				admin.Patch("/admin/channels/{channelId}/models/{modelId}", channelHTTP.UpdateModel)
				admin.Delete("/admin/channels/{channelId}/models/{modelId}", channelHTTP.DeleteModel)
			})
		})
	})

	return router
}

func readinessHandler(db *pgxpool.Pool, redisClient *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, response{Code: 50301, Msg: "database is unavailable"})
			return
		}
		if err := redisClient.Ping(ctx).Err(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, response{Code: 50302, Msg: "cache is unavailable"})
			return
		}

		writeJSON(w, http.StatusOK, response{Code: 0, Data: map[string]string{"status": "ready"}, Msg: "service is ready"})
	}
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startedAt := time.Now()
			next.ServeHTTP(w, r)
			logger.Info("http request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(startedAt).String(), "request_id", middleware.GetReqID(r.Context()))
		})
	}
}
