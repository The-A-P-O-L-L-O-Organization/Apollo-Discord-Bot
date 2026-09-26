package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"

	interlinkv1 "github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink/interlinkv1connect"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/auth"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/ratelimit"
	"github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/internal/registry"
)

const testSecret = "test-secret-key-min-32-bytes-long!!"

type harness struct {
	server *httptest.Server
	client interlinkv1connect.InterlinkServiceClient
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	mr := miniredis.RunT(t)
	t.Cleanup(mr.Close)
	reg := registry.NewRegistryWithClient(goredis.NewClient(&goredis.Options{Addr: mr.Addr(), DisableIdentity: true}))
	t.Cleanup(func() { _ = reg.Close() })

	verifier := auth.NewVerifier(testSecret, auth.NewInMemoryNonceStore())
	limiter := ratelimit.NewLimiter(1000, 1000)
	t.Cleanup(limiter.Stop)

	srv := NewServer(reg, verifier, limiter)
	mux := http.NewServeMux()
	path, handler := interlinkv1connect.NewInterlinkServiceHandler(
		srv,
		connect.WithInterceptors(srv.AuthInterceptor()),
	)
	mux.Handle(path, handler)
	httpSrv := httptest.NewServer(mux)
	t.Cleanup(httpSrv.Close)

	return &harness{
		server: httpSrv,
		client: interlinkv1connect.NewInterlinkServiceClient(httpSrv.Client(), httpSrv.URL),
	}
}

func signEnvelope(t *testing.T, req *connect.Request[interlinkv1.Envelope], procedure string) {
	t.Helper()
	bodyHash, err := auth.BodyHash(req.Msg)
	if err != nil {
		t.Fatal(err)
	}
	stamp := func(r *connect.Request[interlinkv1.Envelope]) {
		timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
		nonce := auth.GenerateNonce()
		r.Header().Set(auth.AuthHeader, auth.AuthScheme+" "+auth.Sign(testSecret, procedure, timestamp, nonce, bodyHash))
		r.Header().Set(auth.TimestampHeader, timestamp)
		r.Header().Set(auth.NonceHeader, nonce)
	}
	stamp(req)
}

func TestSend_Success(t *testing.T) {
	h := newHarness(t)
	req := connect.NewRequest(&interlinkv1.Envelope{
		Protocol: "apollo.interlink.v1", Version: "1.0",
		Type: "message", Source: "bot-a", Target: "bot-b",
		Id: "test-123", Timestamp: time.Now().UnixMilli(), Nonce: "nonce-123",
		Payload: []byte(`{"text": "hello"}`),
	})
	signEnvelope(t, req, interlinkv1connect.InterlinkServiceSendProcedure)

	resp, err := h.client.Send(context.Background(), req)
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}
	if !resp.Msg.GetAccepted() {
		t.Fatal("accepted = false")
	}
	if resp.Msg.GetMessageId() != "test-123" {
		t.Fatalf("message_id = %q", resp.Msg.GetMessageId())
	}
}

func TestSend_Unauthenticated(t *testing.T) {
	h := newHarness(t)
	req := connect.NewRequest(&interlinkv1.Envelope{Source: "bot-a", Target: "bot-b", Id: "x"})
	_, err := h.client.Send(context.Background(), req)
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeUnauthenticated {
		t.Fatalf("err = %v, want CodeUnauthenticated", err)
	}
}

func TestRegisterBot_ListBots(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	regReq := connect.NewRequest(&interlinkv1.RegisterBotRequest{
		BotId: "bot-a", Endpoint: "localhost:50052",
		Capabilities:         map[string]string{"commands": "true"},
		MaxConcurrentStreams: 10,
	})
	bodyHash, _ := auth.BodyHash(regReq.Msg)
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce := auth.GenerateNonce()
	regReq.Header().Set(auth.AuthHeader, auth.AuthScheme+" "+auth.Sign(testSecret, interlinkv1connect.InterlinkServiceRegisterBotProcedure, timestamp, nonce, bodyHash))
	regReq.Header().Set(auth.TimestampHeader, timestamp)
	regReq.Header().Set(auth.NonceHeader, nonce)

	regResp, err := h.client.RegisterBot(ctx, regReq)
	if err != nil {
		t.Fatalf("RegisterBot failed: %v", err)
	}
	if !regResp.Msg.GetSuccess() || regResp.Msg.GetBotId() != "bot-a" {
		t.Fatalf("unexpected response: %+v", regResp.Msg)
	}

	listReq := connect.NewRequest(&interlinkv1.ListBotsRequest{})
	bodyHash, _ = auth.BodyHash(listReq.Msg)
	timestamp = strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce = auth.GenerateNonce()
	listReq.Header().Set(auth.AuthHeader, auth.AuthScheme+" "+auth.Sign(testSecret, interlinkv1connect.InterlinkServiceListBotsProcedure, timestamp, nonce, bodyHash))
	listReq.Header().Set(auth.TimestampHeader, timestamp)
	listReq.Header().Set(auth.NonceHeader, nonce)
	listReq.Header().Set(auth.BotHeader, "bot-a")

	listResp, err := h.client.ListBots(ctx, listReq)
	if err != nil {
		t.Fatalf("ListBots failed: %v", err)
	}
	if len(listResp.Msg.GetBots()) != 1 || listResp.Msg.GetBots()[0].GetBotId() != "bot-a" {
		t.Fatalf("unexpected bots: %+v", listResp.Msg.GetBots())
	}
}

func TestSubscribe_ReceivesSend(t *testing.T) {
	h := newHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	subReq := connect.NewRequest(&interlinkv1.SubscribeRequest{BotId: "bot-b"})
	bodyHash, _ := auth.BodyHash(subReq.Msg)
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce := auth.GenerateNonce()
	subReq.Header().Set(auth.AuthHeader, auth.AuthScheme+" "+auth.Sign(testSecret, interlinkv1connect.InterlinkServiceSubscribeProcedure, timestamp, nonce, bodyHash))
	subReq.Header().Set(auth.TimestampHeader, timestamp)
	subReq.Header().Set(auth.NonceHeader, nonce)

	go func() {
		time.Sleep(200 * time.Millisecond)
		sendReq := connect.NewRequest(&interlinkv1.Envelope{
			Type: "message", Source: "bot-a", Target: "bot-b",
			Id: "sub-1", Timestamp: time.Now().UnixMilli(), Nonce: auth.GenerateNonce(),
		})
		signEnvelope(t, sendReq, interlinkv1connect.InterlinkServiceSendProcedure)
		if _, err := h.client.Send(context.Background(), sendReq); err != nil {
			t.Logf("background Send failed: %v", err)
		}
	}()

	stream, err := h.client.Subscribe(ctx, subReq)
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	if !stream.Receive() {
		t.Fatalf("stream closed: %v", stream.Err())
	}
	if stream.Msg().GetId() != "sub-1" {
		t.Fatalf("got id %q, want sub-1", stream.Msg().GetId())
	}
	cancel()
	_ = stream.Close()
}
