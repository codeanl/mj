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

	"nova-creator-platform/services/api/internal/adminusers"
	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/auth"
	"nova-creator-platform/services/api/internal/config"
	"nova-creator-platform/services/api/internal/generation"
	"nova-creator-platform/services/api/internal/modelchannels"
	"nova-creator-platform/services/api/internal/points"
)

func NewRouter(runtimeContext context.Context, cfg config.Config, logger *slog.Logger, db *pgxpool.Pool, redisClient *redis.Client) http.Handler {
	authService := auth.NewService(auth.NewPostgresRepository(db), auth.NewTokenManager(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAccessTTL))
	authHTTP := newAuthHandlers(authService, logger)
	adminUserHTTP := newAdminUserHandlers(adminusers.NewService(adminusers.NewPostgresRepository(db)), logger)
	assetStorage, err := assets.NewLocalStorage(cfg.AssetDataDir)
	if err != nil {
		panic(err)
	}
	assetHTTP := newAssetHandlers(assets.NewService(assets.NewPostgresRepository(db), assetStorage), logger, cfg.AssetMaxBytes)
	channelRepository := modelchannels.NewRepository(db)
	channelService := modelchannels.NewService(channelRepository, modelchannels.NewSecretCipher(cfg.JWTSecret), cfg.GenerationTimeout)
	if db != nil {
		if err := channelService.EnsureDefault(runtimeContext, cfg.OpenAIBaseURL, cfg.OpenAIAPIKey, cfg.ImageModel); err != nil {
			panic(err)
		}
	}
	channelHTTP := newModelChannelHandlers(channelService, logger)
	pointService := points.NewService(points.NewPostgresRepository(db))
	pointHTTP := newPointHandlers(pointService, logger)
	generationRepository := generation.NewRepository(db)
	imageProvider := generation.NewOpenAIImageProvider(cfg.GenerationTimeout, cfg.AssetMaxBytes)
	generationService := generation.NewService(generationRepository, channelService, pointService)
	generationHTTP := newGenerationHandlers(generationService, logger)
	if db != nil {
		go generation.NewWorker(generationRepository, imageProvider, channelService, assetStorage, logger, cfg.WorkerInterval, cfg.TaskStale).Run(runtimeContext)
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

		api.Group(func(protected chi.Router) {
			protected.Use(authHTTP.RequireAuth)
			protected.Get("/auth/me", authHTTP.Me)
			protected.Get("/assets", assetHTTP.List)
			protected.Post("/assets", assetHTTP.Upload)
			protected.Get("/assets/{id}/content", assetHTTP.Content)
			protected.Get("/models", channelHTTP.PublicModels)
			protected.Get("/points", pointHTTP.Wallet)
			protected.Get("/generations/capabilities", generationHTTP.GetCapabilities)
			protected.Post("/generations/images", generationHTTP.CreateImage)
			protected.Get("/generations/{id}", generationHTTP.GetTask)

			protected.Group(func(admin chi.Router) {
				admin.Use(authHTTP.RequireAdmin)
				admin.Get("/admin/protocols", channelHTTP.Protocols)
				admin.Get("/admin/users", adminUserHTTP.List)
				admin.Post("/admin/users", adminUserHTTP.Create)
				admin.Patch("/admin/users/{accountId}", adminUserHTTP.Update)
				admin.Patch("/admin/users/{accountId}/password", adminUserHTTP.ResetPassword)
				admin.Post("/admin/users/{accountId}/points", pointHTTP.Adjust)
				admin.Get("/admin/points/rules", pointHTTP.GetRules)
				admin.Put("/admin/points/rules", pointHTTP.SaveRules)
				admin.Get("/admin/channels", channelHTTP.List)
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
