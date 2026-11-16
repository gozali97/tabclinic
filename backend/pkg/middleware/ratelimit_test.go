package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimitPerIP(t *testing.T) {
	h := RateLimit(2, time.Minute, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	call := func(ip string) int {
		r := httptest.NewRequest("POST", "/", nil)
		r.RemoteAddr = ip + ":1234"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if call("1.1.1.1") != 204 || call("1.1.1.1") != 204 {
		t.Fatal("first two requests must pass")
	}
	if got := call("1.1.1.1"); got != http.StatusTooManyRequests {
		t.Fatalf("third request got %d", got)
	}
	if call("2.2.2.2") != 204 {
		t.Fatal("other IP must not be limited")
	}
}
