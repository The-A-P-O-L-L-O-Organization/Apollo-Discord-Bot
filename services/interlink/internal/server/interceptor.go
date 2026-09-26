package server

import (
	"context"
	"errors"
	"strconv"
	"time"

	"connectrpc.com/connect"

	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/telemetry"
)

func (s *Server) AuthInterceptor() connect.UnaryInterceptorFunc {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()

			botID, err := s.verifier.Verify(ctx, req)
			if err != nil {
				telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), err)
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			if !s.limiter.Allow(botID) {
				rlErr := errors.New("rate limit exceeded")
				telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), rlErr)
				return nil, connect.NewError(connect.CodeResourceExhausted, rlErr)
			}

			resp, err := next(ctx, req)
			telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), err)
			return resp, err
		})
	})
}

func headerTimestamp(value string) (int64, error) {
	ts, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, err
	}
	return ts, nil
}
