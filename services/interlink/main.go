package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink/interlinkv1connect"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/auth"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/ratelimit"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/registry"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/server"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/telemetry"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	var (
		grpcAddr     = flag.String("grpc-addr", envOr("INTERLINK_GRPC_ADDR", "[::]:50052"), "gRPC listen address")
		redisURL     = flag.String("redis-url", envOr("INTERLINK_REDIS_URL", "redis://localhost:6379"), "Redis URL")
		authKey      = flag.String("auth-key", os.Getenv("INTERLINK_AUTH_KEY"), "HMAC secret key (required)")
		rateLimit    = flag.Float64("rate-limit", 100, "Requests per second per bot")
		burst        = flag.Int("burst", 200, "Burst allowance per bot")
		otelEndpoint = flag.String("otel-endpoint", envOr("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4318"), "OTLP HTTP endpoint")
		logLevel     = flag.String("log-level", envOr("LOG_LEVEL", "info"), "Log level (debug, info, warn, error)")
	)
	flag.Parse()

	level, err := zerolog.ParseLevel(*logLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	if *authKey == "" {
		log.Fatal().Msg("INTERLINK_AUTH_KEY is required")
	}

	shutdown, err := telemetry.Init("interlink", *otelEndpoint)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to init telemetry")
	}

	reg, err := registry.NewRegistry(*redisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer reg.Close()

	if err := reg.Ping(context.Background()); err != nil {
		log.Fatal().Err(err).Msg("Redis ping failed")
	}

	authVerifier := auth.NewVerifier(*authKey, auth.NewRedisNonceStore(reg.Client()))
	rateLimiter := ratelimit.NewLimiter(*rateLimit, *burst)
	defer rateLimiter.Stop()

	srv := server.NewServer(reg, authVerifier, rateLimiter)
	mux := http.NewServeMux()

	path, handler := interlinkv1connect.NewInterlinkServiceHandler(
		srv,
		connect.WithInterceptors(srv.AuthInterceptor()),
	)
	mux.Handle(path, handler)

	mux.Handle("/metrics", promhttp.Handler())

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := reg.Ping(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("degraded"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	h2s := &http2.Server{}
	httpSrv := &http.Server{
		Addr:              *grpcAddr,
		Handler:           h2c.NewHandler(mux, h2s),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", *grpcAddr).Msg("Starting Interlink gRPC server")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Info().Msg("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
	_ = shutdown(ctx)
}
