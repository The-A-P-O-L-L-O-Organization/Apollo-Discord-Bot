package auth

import (
	"context"
	"strconv"
	"testing"
	"time"

	"connectrpc.com/connect"

	interlinkv1 "github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink"
)

const testSecret = "test-secret-key-min-32-bytes-long!!"

func signedRequest(t *testing.T, msg *interlinkv1.Envelope, secret string) *connect.Request[interlinkv1.Envelope] {
	t.Helper()
	req := connect.NewRequest(msg)
	bodyHash, err := BodyHash(msg)
	if err != nil {
		t.Fatal(err)
	}
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce := GenerateNonce()
	req.Header().Set(AuthHeader, AuthScheme+" "+Sign(secret, req.Spec().Procedure, timestamp, nonce, bodyHash))
	req.Header().Set(TimestampHeader, timestamp)
	req.Header().Set(NonceHeader, nonce)
	return req
}

func TestVerify_Valid(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	req := signedRequest(t, &interlinkv1.Envelope{
		Protocol: "apollo.interlink.v1", Version: "1.0",
		Type: "message", Source: "bot-a", Target: "bot-b", Id: "m1",
	}, testSecret)
	botID, err := v.Verify(context.Background(), req)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
	if botID != "bot-a" {
		t.Fatalf("botID = %q, want bot-a", botID)
	}
}

func TestVerify_WrongSecret(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	req := signedRequest(t, &interlinkv1.Envelope{Source: "bot-a"}, "wrong-secret")
	if _, err := v.Verify(context.Background(), req); err != ErrInvalidSignature {
		t.Fatalf("err = %v, want ErrInvalidSignature", err)
	}
}

func TestVerify_MissingAuth(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	req := connect.NewRequest(&interlinkv1.Envelope{Source: "bot-a"})
	if _, err := v.Verify(context.Background(), req); err != ErrMissingAuth {
		t.Fatalf("err = %v, want ErrMissingAuth", err)
	}
}

func TestVerify_TimestampSkew(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	msg := &interlinkv1.Envelope{Source: "bot-a"}
	req := connect.NewRequest(msg)
	bodyHash, _ := BodyHash(msg)
	timestamp := strconv.FormatInt(time.Now().Add(-time.Hour).UnixMilli(), 10)
	nonce := GenerateNonce()
	probe := connect.NewRequest(&interlinkv1.Envelope{Source: "bot-a"})
	req.Header().Set(AuthHeader, AuthScheme+" "+Sign(testSecret, probe.Spec().Procedure, timestamp, nonce, bodyHash))
	req.Header().Set(TimestampHeader, timestamp)
	req.Header().Set(NonceHeader, nonce)
	if _, err := v.Verify(context.Background(), req); err != ErrTimestampSkew {
		t.Fatalf("err = %v, want ErrTimestampSkew", err)
	}
}

func TestVerify_Replay(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	msg := &interlinkv1.Envelope{Source: "bot-a"}
	bodyHash, _ := BodyHash(msg)
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce := GenerateNonce()
	probe := connect.NewRequest(&interlinkv1.Envelope{Source: "bot-a"})
	sig := Sign(testSecret, probe.Spec().Procedure, timestamp, nonce, bodyHash)

	newReq := func() *connect.Request[interlinkv1.Envelope] {
		req := connect.NewRequest(&interlinkv1.Envelope{Source: "bot-a"})
		req.Header().Set(AuthHeader, AuthScheme+" "+sig)
		req.Header().Set(TimestampHeader, timestamp)
		req.Header().Set(NonceHeader, nonce)
		return req
	}
	if _, err := v.Verify(context.Background(), newReq()); err != nil {
		t.Fatalf("first Verify failed: %v", err)
	}
	if _, err := v.Verify(context.Background(), newReq()); err != ErrReplayDetected {
		t.Fatalf("err = %v, want ErrReplayDetected", err)
	}
}

func TestVerify_UnknownBot(t *testing.T) {
	v := NewVerifier(testSecret, NewInMemoryNonceStore())
	req := signedRequest(t, &interlinkv1.Envelope{}, testSecret)
	if _, err := v.Verify(context.Background(), req); err != ErrUnknownBot {
		t.Fatalf("err = %v, want ErrUnknownBot", err)
	}
}

func TestBodyHash_MultiEntryMapPinned(t *testing.T) {
	newMsg := func() *interlinkv1.RegisterBotRequest {
		return &interlinkv1.RegisterBotRequest{
			BotId: "pin-bot", PublicKey: "pin-public-key", Endpoint: "https://example.com/hook",
			Capabilities:         map[string]string{"zeta": "1", "alpha": "2", "mid": "3"},
			MaxConcurrentStreams: 5,
		}
	}
	const want = "7141cf5f09622c9d3dc80fef52153c94ad3d4bfb8965667b8fd5469cf8367ebf"
	for i := 0; i < 50; i++ {
		got, err := BodyHash(newMsg())
		if err != nil {
			t.Fatalf("BodyHash failed: %v", err)
		}
		if got != want {
			t.Fatalf("BodyHash = %q, want pinned %q (iteration %d)", got, want, i)
		}
	}
}

func TestExtractBotID(t *testing.T) {
	cases := []struct {
		msg  any
		want string
	}{
		{&interlinkv1.Envelope{Source: "e"}, "e"},
		{&interlinkv1.RegisterBotRequest{BotId: "r"}, "r"},
		{&interlinkv1.HeartbeatRequest{BotId: "h"}, "h"},
		{&interlinkv1.SubscribeRequest{BotId: "s"}, "s"},
		{&interlinkv1.UnregisterBotRequest{BotId: "u"}, "u"},
		{&interlinkv1.GetBotInfoRequest{BotId: "g"}, "g"},
		{&interlinkv1.ListBotsRequest{}, ""},
		{struct{}{}, ""},
	}
	for _, c := range cases {
		if got := ExtractBotID(c.msg); got != c.want {
			t.Errorf("ExtractBotID(%T) = %q, want %q", c.msg, got, c.want)
		}
	}
}
