// Package klinik implements the SI-Shina outpatient flow: pendaftaran -> dokter -> apotek -> pembayaran.
// Every query is scoped by company_id from the session.
package klinik

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nicofx/real-clinic/backend/internal/audit"
)

// Status rekam medis, sama dengan SI-Shina.
const (
	StatusAntrian     = 1
	StatusPemeriksaan = 2
	StatusApotek      = 3
	StatusPembayaran  = 4
	StatusSelesai     = 5
)

var StatusLabel = map[int]string{
	StatusAntrian: "Antrian", StatusPemeriksaan: "Pemeriksaan", StatusApotek: "Di Apotek",
	StatusPembayaran: "Pembayaran", StatusSelesai: "Selesai",
}

const (
	CaraBayarUmum     = "Umum/Mandiri"
	CaraBayarJaminan  = "Jaminan Kesehatan"
	defaultPageSize   = 20
	maxPageSize       = 100
	maxTextFieldBytes = 20000
)

var ErrNotFound = errors.New("data tidak ditemukan")

// ValidationError is a client input problem on one field (HTTP 422).
type ValidationError struct{ Field, Message string }

func (e *ValidationError) Error() string { return e.Message }

// ConflictError is a rule that blocks the action in the current state (HTTP 409).
type ConflictError struct{ Code, Message string }

func (e *ConflictError) Error() string { return e.Message }

func invalid(field, msg string) error { return &ValidationError{field, msg} }

func conflict(code, msg string) error { return &ConflictError{code, msg} }

// Actor is the signed-in user performing an action.
type Actor struct {
	CompanyID string
	UserID    string
	Roles     []string
	Super     bool
}

func (a Actor) Has(role string) bool {
	if a.Super {
		return true
	}
	for _, r := range a.Roles {
		if r == role {
			return true
		}
	}
	return false
}

type Service struct {
	db       *pgxpool.Pool
	audit    *audit.Service
	filesDir string // lampiran: FILES_DIR/{company_id}/{uuid}.{ext}
}

func NewService(db *pgxpool.Pool, auditSvc *audit.Service, filesDir string) *Service {
	return &Service{db: db, audit: auditSvc, filesDir: filesDir}
}

func (s *Service) log(ctx context.Context, tx pgx.Tx, a Actor, action, objType, objID string, meta map[string]any) error {
	return s.audit.LogTx(ctx, tx, audit.Event{CompanyID: a.CompanyID, ActorID: a.UserID, ActorRoles: a.Roles,
		Action: action, ObjectType: objType, ObjectID: objID, Metadata: meta})
}

// Page is a paginated list response.
type Page[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
	Page  int `json:"page"`
	Size  int `json:"size"`
}

func pageArgs(page, size int) (int, int, int) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > maxPageSize {
		size = defaultPageSize
	}
	return page, size, (page - 1) * size
}

func trim(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func required(field, label, v string) error {
	if strings.TrimSpace(v) == "" {
		return invalid(field, label+" wajib diisi")
	}
	if len(v) > maxTextFieldBytes {
		return invalid(field, label+" terlalu panjang")
	}
	return nil
}

func likePattern(q string) string {
	q = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(strings.TrimSpace(strings.ToLower(q)))
	return "%" + q + "%"
}

func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

// inUse maps FK violations on delete into a readable conflict.
func inUse(err error, what string) error {
	if pgCode(err) == "23503" {
		return conflict("IN_USE", what+" masih dipakai data lain")
	}
	return err
}

func isUUID(v string) bool {
	if len(v) != 36 {
		return false
	}
	for i, c := range v {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
				return false
			}
		}
	}
	return true
}
