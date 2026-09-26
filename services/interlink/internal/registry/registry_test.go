package registry

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"

	interlinkv1 "github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink"
)

func testRegistry(t *testing.T) (*Registry, func()) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := goredis.NewClient(&goredis.Options{Addr: mr.Addr(), DisableIdentity: true})
	reg := NewRegistryWithClient(client)
	return reg, func() {
		_ = client.Close()
	}
}

func TestRegister_Get(t *testing.T) {
	reg, cleanup := testRegistry(t)
	defer cleanup()
	ctx := context.Background()

	info, err := reg.Register(ctx, &interlinkv1.RegisterBotRequest{
		BotId:        "bot-a",
		Endpoint:     "localhost:50052",
		Capabilities: map[string]string{"commands": "true"},
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if info.GetBotId() != "bot-a" || !info.GetOnline() {
		t.Fatalf("unexpected info: %+v", info)
	}

	got, err := reg.Get(ctx, "bot-a")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got.GetEndpoint() != "localhost:50052" {
		t.Fatalf("endpoint = %q", got.GetEndpoint())
	}
	if got.GetCapabilities()["commands"] != "true" {
		t.Fatalf("capabilities = %v", got.GetCapabilities())
	}
}

func TestHeartbeat(t *testing.T) {
	reg, cleanup := testRegistry(t)
	defer cleanup()
	ctx := context.Background()

	if _, err := reg.Register(ctx, &interlinkv1.RegisterBotRequest{BotId: "bot-a"}); err != nil {
		t.Fatal(err)
	}
	before, _ := reg.Get(ctx, "bot-a")
	if err := reg.Heartbeat(ctx, "bot-a"); err != nil {
		t.Fatalf("Heartbeat failed: %v", err)
	}
	after, _ := reg.Get(ctx, "bot-a")
	if after.GetLastHeartbeat() < before.GetLastHeartbeat() {
		t.Fatal("heartbeat did not advance LastHeartbeat")
	}
	if err := reg.Heartbeat(ctx, "missing"); err == nil {
		t.Fatal("expected error for unknown bot")
	}
}

func TestUnregister(t *testing.T) {
	reg, cleanup := testRegistry(t)
	defer cleanup()
	ctx := context.Background()

	if _, err := reg.Register(ctx, &interlinkv1.RegisterBotRequest{BotId: "bot-a"}); err != nil {
		t.Fatal(err)
	}
	if err := reg.Unregister(ctx, "bot-a"); err != nil {
		t.Fatalf("Unregister failed: %v", err)
	}
	if _, err := reg.Get(ctx, "bot-a"); err == nil {
		t.Fatal("expected error after unregister")
	}
	bots, err := reg.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(bots) != 0 {
		t.Fatalf("bots = %d, want 0", len(bots))
	}
}

func TestList(t *testing.T) {
	reg, cleanup := testRegistry(t)
	defer cleanup()
	ctx := context.Background()

	for _, id := range []string{"bot-a", "bot-b"} {
		if _, err := reg.Register(ctx, &interlinkv1.RegisterBotRequest{BotId: id}); err != nil {
			t.Fatal(err)
		}
	}
	bots, err := reg.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(bots) != 2 {
		t.Fatalf("bots = %d, want 2", len(bots))
	}
}
