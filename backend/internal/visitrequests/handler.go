package visitrequests

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nicofx/real-clinic/backend/pkg/response"
)

type request struct {
	Key      string `json:"idempotency_key"`
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Service  string `json:"service"`
	Day      string `json:"preferred_day"`
	Consent  bool   `json:"consent"`
}

var phonePattern = regexp.MustCompile(`^\+?[0-9]{8,15}$`)

func (req *request) validate() bool {
	id, err := uuid.Parse(req.Key)
	if err != nil || id == uuid.Nil {
		return false
	}
	req.Key = id.String()
	req.FullName = strings.TrimSpace(req.FullName)
	req.Phone = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(req.Phone))
	return utf8.RuneCountInString(req.FullName) >= 2 && utf8.RuneCountInString(req.FullName) <= 100 &&
		phonePattern.MatchString(req.Phone) && req.Consent &&
		slices.Contains([]string{"Konsultasi Umum", "Kesehatan Gigi"}, req.Service) &&
		slices.Contains([]string{"Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"}, req.Day)
}

// NewHandler stores public visit requests. companyID (LANDING_COMPANY_ID) assigns them to the clinic
// whose staff follows them up; empty leaves them unassigned for a superadmin to handle.
func NewHandler(db *pgxpool.Pool, companyID string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var req request
		if err := decoder.Decode(&req); err != nil {
			response.Error(w, 400, "INVALID_BODY", "Format permintaan tidak valid.")
			return
		}
		if decoder.Decode(&struct{}{}) != io.EOF || !req.validate() {
			response.Error(w, 422, "VALIDATION_ERROR", "Periksa nama, nomor WhatsApp, poli, hari, dan persetujuan Anda.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		var key string
		// Retrying the same submission must not create another visit request.
		err := db.QueryRow(ctx, `INSERT INTO visit_requests AS current
			(idempotency_key, full_name, phone, service, preferred_day, consent, company_id)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, NULLIF($7, '')::uuid)
			ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
			WHERE (current.full_name, current.phone, current.service, current.preferred_day, current.consent)
			= (EXCLUDED.full_name, EXCLUDED.phone, EXCLUDED.service, EXCLUDED.preferred_day, EXCLUDED.consent)
			RETURNING idempotency_key::text`, req.Key, req.FullName, req.Phone, req.Service, req.Day, req.Consent, companyID).Scan(&key)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Error(w, 409, "CONFLICT", "Permintaan sebelumnya sudah tercatat. Muat ulang halaman untuk mengajukan permintaan berbeda.")
			return
		}
		if err != nil {
			log.Printf("Unable to save visit request: %v", err)
			response.Error(w, 503, "UNAVAILABLE", "Permintaan belum dapat disimpan. Coba kembali sebentar lagi.")
			return
		}
		response.JSON(w, 201, map[string]string{"id": key, "status": "pending_confirmation"})
	})
}
