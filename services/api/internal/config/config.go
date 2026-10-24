package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv            string
	HTTPAddr          string
	WebOrigin         string
	AdminOrigin       string
	DatabaseURL       string
	RedisAddr         string
	RedisPassword     string
	RedisDB           int
	JWTSecret         string
	JWTIssuer         string
	JWTAccessTTL      time.Duration
	AssetDataDir      string
	AssetMaxBytes     int64
	OpenAIBaseURL     string
	OpenAIAPIKey      string
	ImageModel        string
	WorkerInterval    time.Duration
	TaskStale         time.Duration
	GenerationTimeout time.Duration
}

func Load() Config {
	return Config{
		AppEnv:            env("APP_ENV", "development"),
		HTTPAddr:          env("HTTP_ADDR", ":8080"),
		WebOrigin:         env("WEB_ORIGIN", "http://localhost:5173"),
		AdminOrigin:       env("ADMIN_ORIGIN", "http://localhost:5174"),
		DatabaseURL:       env("DATABASE_URL", "postgres://nova:nova@localhost:55432/nova?sslmode=disable"),
		RedisAddr:         env("REDIS_ADDR", "localhost:6379"),
		RedisPassword:     os.Getenv("REDIS_PASSWORD"),
		RedisDB:           envInt("REDIS_DB", 0),
		JWTSecret:         env("JWT_SECRET", "nova-local-development-secret-change-before-production"),
		JWTIssuer:         env("JWT_ISSUER", "nova-creator-api"),
		JWTAccessTTL:      envDuration("JWT_ACCESS_TTL", 24*time.Hour),
		AssetDataDir:      env("ASSET_DATA_DIR", ".data/assets"),
		AssetMaxBytes:     envInt64("ASSET_MAX_UPLOAD_BYTES", 256*1024*1024),
		OpenAIBaseURL:     env("OPENAI_BASE_URL", "https://gptcodex.top/v1"),
		OpenAIAPIKey:      strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		ImageModel:        env("OPENAI_IMAGE_MODEL", "gpt-image-2"),
		WorkerInterval:    envDuration("GENERATION_WORKER_INTERVAL", 2*time.Second),
		TaskStale:         envDuration("GENERATION_TASK_STALE", 10*time.Minute),
		GenerationTimeout: envDuration("GENERATION_REQUEST_TIMEOUT", 5*time.Minute),
	}
}

func (c Config) AllowedOrigins() []string {
	return []string{c.WebOrigin, c.AdminOrigin}
}

func (c Config) LogLevel() slog.Level {
	if strings.EqualFold(c.AppEnv, "development") {
		return slog.LevelDebug
	}
	return slog.LevelInfo
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil {
		return fallback
	}
	return value
}

func envInt64(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(key)), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value, err := time.ParseDuration(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
