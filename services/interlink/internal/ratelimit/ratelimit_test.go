package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestAllow_BurstThenDeny(t *testing.T) {
	l := NewLimiter(10, 5)
	defer l.Stop()
	allowed := 0
	for i := 0; i < 10; i++ {
		if l.Allow("bot-a") {
			allowed++
		}
	}
	if allowed != 5 {
		t.Fatalf("allowed = %d, want 5 (burst)", allowed)
	}
}

func TestAllow_IndependentBots(t *testing.T) {
	l := NewLimiter(10, 2)
	defer l.Stop()
	for i := 0; i < 2; i++ {
		if !l.Allow("bot-a") {
			t.Fatal("bot-a should be allowed")
		}
	}
	if l.Allow("bot-a") {
		t.Fatal("bot-a should be denied after burst")
	}
	if !l.Allow("bot-b") {
		t.Fatal("bot-b should be allowed independently")
	}
}

func TestAllow_Refill(t *testing.T) {
	l := NewLimiter(50, 1)
	defer l.Stop()
	if !l.Allow("bot-a") {
		t.Fatal("first request should be allowed")
	}
	if l.Allow("bot-a") {
		t.Fatal("second immediate request should be denied")
	}
	time.Sleep(100 * time.Millisecond)
	if !l.Allow("bot-a") {
		t.Fatal("request after refill should be allowed")
	}
}

func TestWait(t *testing.T) {
	l := NewLimiter(50, 1)
	defer l.Stop()
	if !l.Allow("bot-a") {
		t.Fatal("first request should be allowed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := l.Wait(ctx, "bot-a"); err != nil {
		t.Fatalf("Wait failed: %v", err)
	}
}
