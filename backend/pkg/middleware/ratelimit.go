package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/nicofx/real-clinic/backend/pkg/response"
)

// RateLimit allows `limit` requests per client IP per window; in-memory, so per-instance only.
func RateLimit(limit int, window time.Duration, next http.Handler) http.Handler {
	type bucket struct {
		count int
		reset time.Time
	}
	var mu sync.Mutex
	buckets := map[string]*bucket{}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		now := time.Now()
		mu.Lock()
		if len(buckets) > 10000 {
			for k, b := range buckets {
				if now.After(b.reset) {
					delete(buckets, k)
				}
			}
		}
		b, ok := buckets[ip]
		if !ok || now.After(b.reset) {
			b = &bucket{reset: now.Add(window)}
			buckets[ip] = b
		}
		b.count++
		over := b.count > limit
		mu.Unlock()
		if over {
			w.Header().Set("Retry-After", b.reset.Sub(now).Round(time.Second).String())
			response.Error(w, http.StatusTooManyRequests, "RATE_LIMITED", "Terlalu banyak permintaan, coba lagi nanti")
			return
		}
		next.ServeHTTP(w, r)
	})
}
