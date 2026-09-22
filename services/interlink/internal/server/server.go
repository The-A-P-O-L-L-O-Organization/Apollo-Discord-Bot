package server

import (
	"context"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/rs/zerolog/log"

	interlinkv1 "github.com/apollo-bot/interlink/gen/go/interlink/v1"
	"github.com/apollo-bot/interlink/gen/go/interlink/v1/interlinkv1connect"
	"github.com/apollo-bot/interlink/internal/auth"
	"github.com/apollo-bot/interlink/internal/ratelimit"
	"github.com/apollo-bot/interlink/internal/registry"
)

const streamBufferSize = 100

type Server struct {
	interlinkv1connect.UnimplementedInterlinkServiceHandler

	registry *registry.Registry
	verifier *auth.Verifier
	limiter  *ratelimit.Limiter

	mu      sync.RWMutex
	streams map[string]chan *interlinkv1.Envelope
}

func NewServer(reg *registry.Registry, verifier *auth.Verifier, limiter *ratelimit.Limiter) *Server {
	return &Server{
		registry: reg,
		verifier: verifier,
		limiter:  limiter,
		streams:  make(map[string]chan *interlinkv1.Envelope),
	}
}

func (s *Server) Send(ctx context.Context, req *connect.Request[interlinkv1.Envelope]) (*connect.Response[interlinkv1.SendResponse], error) {
	env := req.Msg
	s.handleIncoming(ctx, env)
	return connect.NewResponse(&interlinkv1.SendResponse{
		Accepted:  true,
		MessageId: env.GetId(),
	}), nil
}

func (s *Server) Subscribe(ctx context.Context, req *connect.Request[interlinkv1.SubscribeRequest], stream *connect.ServerStream[interlinkv1.Envelope]) error {
	bodyHash, err := auth.BodyHash(req.Msg)
	if err != nil {
		return connect.NewError(connect.CodeInvalidArgument, err)
	}
	if err := s.verifier.VerifyHandshake(stream.Conn().RequestHeader(), interlinkv1connect.InterlinkServiceSubscribeProcedure, bodyHash); err != nil {
		return connect.NewError(connect.CodeUnauthenticated, err)
	}
	if err := s.verifier.CheckNonce(ctx, req.Header().Get(auth.NonceHeader)); err != nil {
		return connect.NewError(connect.CodeUnauthenticated, err)
	}

	botID := req.Msg.GetBotId()
	if botID == "" {
		return connect.NewError(connect.CodeUnauthenticated, auth.ErrUnknownBot)
	}

	msgCh := s.attachStream(botID)
	defer s.detachStream(botID, msgCh)

	filter := make(map[string]struct{}, len(req.Msg.GetMessageTypes()))
	for _, t := range req.Msg.GetMessageTypes() {
		filter[t] = struct{}{}
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case env, ok := <-msgCh:
			if !ok {
				return nil
			}
			if len(filter) > 0 {
				if _, ok := filter[env.GetType()]; !ok {
					continue
				}
			}
			if err := stream.Send(env); err != nil {
				return err
			}
		}
	}
}

func (s *Server) Connect(ctx context.Context, stream *connect.BidiStream[interlinkv1.Envelope, interlinkv1.Envelope]) error {
	if err := s.verifier.VerifyHandshake(stream.RequestHeader(), interlinkv1connect.InterlinkServiceConnectProcedure, auth.EmptyBodyHash()); err != nil {
		return connect.NewError(connect.CodeUnauthenticated, err)
	}
	handshakeTS, err := headerTimestamp(stream.RequestHeader().Get(auth.TimestampHeader))
	if err != nil {
		return connect.NewError(connect.CodeUnauthenticated, err)
	}
	if err := s.verifier.VerifyMessage(ctx, stream.RequestHeader().Get(auth.NonceHeader), handshakeTS); err != nil {
		return connect.NewError(connect.CodeUnauthenticated, err)
	}

	var botID string
	var msgCh chan *interlinkv1.Envelope
	var senderDone <-chan error

	startSender := func() {
		ch := make(chan error, 1)
		senderDone = ch
		go s.pumpStream(ctx, stream, msgCh, ch)
	}

	// shutdown detaches the stream, stops the sender, and waits for any
	// in-flight Send to finish so Send never races handler return
	// (Send after return panics: "Write called after Handler finished").
	shutdown := func() error {
		if msgCh == nil {
			return nil
		}
		s.detachAndClose(botID, msgCh)
		select {
		case err := <-senderDone:
			return err
		case <-ctx.Done():
			return nil
		}
	}

	for {
		env, err := stream.Receive()
		if err != nil {
			if serr := shutdown(); serr != nil {
				return serr
			}
			return nil
		}

		if err := s.verifier.VerifyMessage(ctx, env.GetNonce(), env.GetTimestamp()); err != nil {
			log.Warn().Err(err).Str("bot", env.GetSource()).Msg("Stream message rejected")
			continue
		}
		if !s.limiter.Allow(env.GetSource()) {
			log.Warn().Str("bot", env.GetSource()).Msg("Stream message rate limited")
			continue
		}

		if msgCh == nil {
			botID = env.GetSource()
			if botID == "" {
				return connect.NewError(connect.CodeUnauthenticated, auth.ErrUnknownBot)
			}
			msgCh = s.attachStream(botID)
			startSender()
		} else if env.GetSource() != botID {
			if serr := shutdown(); serr != nil {
				return serr
			}
			return connect.NewError(connect.CodeUnauthenticated, auth.ErrInvalidAuth)
		}

		s.handleIncoming(ctx, env)
	}
}

func (s *Server) RegisterBot(ctx context.Context, req *connect.Request[interlinkv1.RegisterBotRequest]) (*connect.Response[interlinkv1.RegisterBotResponse], error) {
	info, err := s.registry.Register(ctx, req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.RegisterBotResponse{
		Success: true,
		BotId:   info.GetBotId(),
	}), nil
}

func (s *Server) Heartbeat(ctx context.Context, req *connect.Request[interlinkv1.HeartbeatRequest]) (*connect.Response[interlinkv1.HeartbeatResponse], error) {
	if err := s.registry.Heartbeat(ctx, req.Msg.GetBotId()); err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&interlinkv1.HeartbeatResponse{
		Alive:      true,
		ServerTime: time.Now().UnixMilli(),
	}), nil
}

func (s *Server) UnregisterBot(ctx context.Context, req *connect.Request[interlinkv1.UnregisterBotRequest]) (*connect.Response[interlinkv1.UnregisterBotResponse], error) {
	if err := s.registry.Unregister(ctx, req.Msg.GetBotId()); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.UnregisterBotResponse{
		Success: true,
	}), nil
}

func (s *Server) ListBots(ctx context.Context, req *connect.Request[interlinkv1.ListBotsRequest]) (*connect.Response[interlinkv1.ListBotsResponse], error) {
	bots, err := s.registry.List(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.ListBotsResponse{
		Bots: bots,
	}), nil
}

func (s *Server) GetBotInfo(ctx context.Context, req *connect.Request[interlinkv1.GetBotInfoRequest]) (*connect.Response[interlinkv1.BotInfo], error) {
	info, err := s.registry.Get(ctx, req.Msg.GetBotId())
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(info), nil
}

func (s *Server) attachStream(botID string) chan *interlinkv1.Envelope {
	ch := make(chan *interlinkv1.Envelope, streamBufferSize)
	s.mu.Lock()
	if old, ok := s.streams[botID]; ok {
		close(old)
	}
	s.streams[botID] = ch
	s.mu.Unlock()
	return ch
}

func (s *Server) detachStream(botID string, ch chan *interlinkv1.Envelope) {
	s.mu.Lock()
	if cur, ok := s.streams[botID]; ok && cur == ch {
		delete(s.streams, botID)
	}
	s.mu.Unlock()
}

func (s *Server) detachAndClose(botID string, ch chan *interlinkv1.Envelope) {
	s.mu.Lock()
	if cur, ok := s.streams[botID]; ok && cur == ch {
		delete(s.streams, botID)
		close(ch)
	}
	s.mu.Unlock()
}

func (s *Server) pumpStream(ctx context.Context, stream *connect.BidiStream[interlinkv1.Envelope, interlinkv1.Envelope], msgCh <-chan *interlinkv1.Envelope, sendErr chan<- error) {
	for {
		select {
		case <-ctx.Done():
			return
		case env, ok := <-msgCh:
			if !ok {
				select {
				case sendErr <- nil:
				default:
				}
				return
			}
			if err := stream.Send(env); err != nil {
				select {
				case sendErr <- err:
				default:
				}
				return
			}
		}
	}
}

func (s *Server) handleIncoming(_ context.Context, env *interlinkv1.Envelope) {
	if env.GetTarget() == "" || env.GetTarget() == "*" {
		s.broadcast(env)
		return
	}
	s.sendToBot(env.GetTarget(), env)
}

func (s *Server) sendToBot(targetBotID string, env *interlinkv1.Envelope) {
	s.mu.RLock()
	ch, ok := s.streams[targetBotID]
	s.mu.RUnlock()

	if !ok {
		return
	}
	select {
	case ch <- env:
	default:
		log.Warn().Str("target", targetBotID).Msg("Stream buffer full, dropping message")
	}
}

func (s *Server) broadcast(env *interlinkv1.Envelope) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for botID, ch := range s.streams {
		if botID == env.GetSource() {
			continue
		}
		select {
		case ch <- env:
		default:
		}
	}
}
