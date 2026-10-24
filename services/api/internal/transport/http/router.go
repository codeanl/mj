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

	"nova-creator-platform/services/api/internal/assets"
	"nova-creator-platform/services/api/internal/auth"
	"nova-creator-platform/services/api/internal/config"
	"nova-creator-platform/services/api/internal/generation"
)

func NewRouter(runtimeContext context.Context, cfg config.Config, logger *slog.Logger, db *pgxpool.Pool, redisClient *redis.Client) http.Handler {
	authService := auth.NewService(auth.NewPostgresRepository(db), auth.NewTokenManager(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAccessTTL))
	authHTTP := newAuthHandlers(authService, logger)
	assetStorage, err := assets.NewLocalStorage(cfg.AssetDataDir)
	if err != nil {
		panic(err)
	}
	assetHTTP := newAssetHandlers(assets.NewService(assets.NewPostgresRepository(db), assetStorage), logger, cfg.AssetMaxBytes)
	generationRepository := generation.NewRepository(db)
	imageProvider := generation.NewOpenAIImageProvider(cfg.OpenAIBaseURL, cfg.OpenAIAPIKey, cfg.GenerationTimeout, cfg.AssetMaxBytes)
	generationService := generation.NewService(generationRepository, imageProvider, cfg.ImageModel)
	generationHTTP := newGenerationHandlers(generationService, logger)
	go generation.NewWorker(generationRepository, imageProvider, assetStorage, logger, cfg.WorkerInterval, cfg.TaskStale).Run(runtimeContext)
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
			protected.Get("/generations/capabilities", generationHTTP.GetCapabilities)
			protected.Post("/generations/images", generationHTTP.CreateImage)
			protected.Get("/generations/{id}", generationHTTP.GetTask)
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
