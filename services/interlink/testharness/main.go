// Command testharness boots a hermetic Interlink server for Node.js
// integration tests: the real ConnectRPC service handler backed by an
// in-process miniredis instance. It listens on 127.0.0.1:0, prints
// "READY <baseURL>" on stdout once serving, and exits on SIGINT/SIGTERM.
//
// Test infrastructure only. Never deployed.
package main

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"connectrpc.com/connect"
	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/apollo-bot/interlink/gen/go/interlink/v1/interlinkv1connect"
	"github.com/apollo-bot/interlink/internal/auth"
	"github.com/apollo-bot/interlink/internal/ratelimit"
	"github.com/apollo-bot/interlink/internal/registry"
	"github.com/apollo-bot/interlink/internal/server"
)

func dumpMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("INTERLINK_TEST_DUMP") == "1" {
			body, _ := io.ReadAll(r.Body)
			_ = r.Body.Close()
			r.Body = io.NopCloser(bytes.NewReader(body))
			fmt.Fprintf(os.Stderr, "DUMP path=%s len=%d bodyhex=%x auth=%q ts=%q nonce=%q bot=%q\n",
				r.URL.Path, len(body), body,
				r.Header.Get("Authorization"),
				r.Header.Get("X-Interlink-Timestamp"),
				r.Header.Get("X-Interlink-Nonce"),
				r.Header.Get("X-Interlink-Bot"))
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	zerolog.SetGlobalLevel(zerolog.WarnLevel)
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	authKey := os.Getenv("INTERLINK_TEST_AUTH_KEY")
	if authKey == "" {
		log.Fatal().Msg("INTERLINK_TEST_AUTH_KEY is required")
	}

	mr, err := miniredis.Run()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to start miniredis")
	}
	defer mr.Close()

	redisClient := goredis.NewClient(&goredis.Options{Addr: mr.Addr(), DisableIdentity: true})
	reg := registry.NewRegistryWithClient(redisClient)
	defer reg.Close()

	verifier := auth.NewVerifier(authKey, auth.NewInMemoryNonceStore())
	limiter := ratelimit.NewLimiter(1000, 1000)
	defer limiter.Stop()

	srv := server.NewServer(reg, verifier, limiter)
	mux := http.NewServeMux()
	path, handler := interlinkv1connect.NewInterlinkServiceHandler(
		srv,
		connect.WithInterceptors(srv.AuthInterceptor()),
	)
	mux.Handle(path, dumpMiddleware(handler))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to listen")
	}

	httpSrv := &http.Server{Handler: h2c.NewHandler(mux, &http2.Server{})}
	go func() {
		if err := httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	fmt.Printf("READY http://%s\n", listener.Addr().String())

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	_ = httpSrv.Close()
}
