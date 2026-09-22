package ratelimit

import (
	"context"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const idleTTL = 10 * time.Minute

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type Limiter struct {
	mu       sync.Mutex
	limiters map[string]*entry
	rps      rate.Limit
	burst    int
	ticker   *time.Ticker
	stopCh   chan struct{}
}

func NewLimiter(requestsPerSecond float64, burst int) *Limiter {
	l := &Limiter{
		limiters: make(map[string]*entry),
		rps:      rate.Limit(requestsPerSecond),
		burst:    burst,
		ticker:   time.NewTicker(5 * time.Minute),
		stopCh:   make(chan struct{}),
	}
	go l.cleanupLoop()
	return l
}

func (l *Limiter) getLimiter(botID string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if e, ok := l.limiters[botID]; ok {
		e.lastSeen = now
		return e.limiter
	}
	limiter := rate.NewLimiter(l.rps, l.burst)
	l.limiters[botID] = &entry{limiter: limiter, lastSeen: now}
	return limiter
}

func (l *Limiter) Allow(botID string) bool {
	return l.getLimiter(botID).Allow()
}

func (l *Limiter) Wait(ctx context.Context, botID string) error {
	return l.getLimiter(botID).Wait(ctx)
}

func (l *Limiter) cleanupLoop() {
	for {
		select {
		case now := <-l.ticker.C:
			l.mu.Lock()
			for botID, e := range l.limiters {
				if now.Sub(e.lastSeen) > idleTTL {
					delete(l.limiters, botID)
				}
			}
			l.mu.Unlock()
		case <-l.stopCh:
			l.ticker.Stop()
			return
		}
	}
}

func (l *Limiter) Stop() {
	select {
	case <-l.stopCh:
	default:
		close(l.stopCh)
	}
}
