package visitrequests

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func validRequest() request {
	return request{Key: "c4c8ee46-5ced-4c04-86e9-4cdbd6bea016", FullName: "  Sari  ", Phone: "+62 (812) 3456-7890", Service: "Konsultasi Umum", Day: "Senin", Consent: true}
}

func TestValidate(t *testing.T) {
	r := validRequest()
	if !r.validate() || r.FullName != "Sari" || r.Phone != "+6281234567890" {
		t.Fatalf("normalization failed: %+v", r)
	}
	r.Key = strings.ReplaceAll(r.Key, "-", "")
	if !r.validate() {
		t.Fatal("browser-generated hexadecimal request key rejected")
	}
	for _, mutate := range []func(*request){
		func(r *request) { r.Key = "invalid" },
		func(r *request) { r.Key = "00000000-0000-0000-0000-000000000000" },
		func(r *request) { r.FullName = " " },
		func(r *request) { r.FullName = strings.Repeat("a", 101) },
		func(r *request) { r.Phone = "1234567" },
		func(r *request) { r.Phone = "1234567890123456" },
		func(r *request) { r.Phone = "0812abc9876" },
		func(r *request) { r.Service = "unknown" },
		func(r *request) { r.Day = "unknown" },
		func(r *request) { r.Consent = false },
	} {
		r := validRequest()
		mutate(&r)
		if r.validate() {
			t.Errorf("accepted invalid request: %+v", r)
		}
	}
}

func TestRejectInvalidBodyBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{`{`, `{}`, `{"unknown":true}`, `{} {}`, strings.Repeat("x", 4097)} {
		w := httptest.NewRecorder()
		NewHandler(nil, "").ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/visit-requests", strings.NewReader(body)))
		if w.Code != 400 && w.Code != 422 {
			t.Errorf("invalid body returned %d", w.Code)
		}
	}
}
