package klinik

import (
	"context"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Permintaan janji: form "Buat Janji" di landing page, ditindaklanjuti pendaftaran.
// Statusnya bukan jadwal: klinik menghubungi pasien lalu mendaftarkannya seperti biasa.
var permintaanStatus = map[string]bool{"baru": true, "dihubungi": true, "terdaftar": true, "batal": true}

type Permintaan struct {
	ID         string     `json:"id"`
	FullName   string     `json:"full_name"`
	Phone      string     `json:"phone"`
	Service    string     `json:"service"`
	Day        string     `json:"preferred_day"`
	Status     string     `json:"status"`
	Catatan    *string    `json:"catatan"`
	PasienID   *string    `json:"pasien_id"`
	PasienNama *string    `json:"pasien_nama"`
	PasienNoRM *string    `json:"pasien_no_rm"`
	HandledBy  *string    `json:"handled_by"`
	HandledAt  *time.Time `json:"handled_at"`
	CreatedAt  time.Time  `json:"created_at"`
	Unassigned bool       `json:"unassigned"` // belum terikat company (LANDING_COMPANY_ID kosong)
}

type PermintaanFilter struct {
	Q      string
	Status string
	Page   int
	Size   int
}

type PermintaanPage struct {
	Page[Permintaan]
	Counts map[string]int `json:"counts"`
}

// permintaanScope: own company, plus unassigned rows for a superadmin.
const permintaanScope = `(v.company_id=$1 OR ($2 AND v.company_id IS NULL))`

func (s *Service) ListPermintaan(ctx context.Context, a Actor, f PermintaanFilter) (PermintaanPage, error) {
	page, size, off := pageArgs(f.Page, f.Size)
	out := PermintaanPage{Page: Page[Permintaan]{Page: page, Size: size, Items: []Permintaan{}},
		Counts: map[string]int{"baru": 0, "dihubungi": 0, "terdaftar": 0, "batal": 0}}
	if f.Status != "" && !permintaanStatus[f.Status] {
		return out, invalid("status", "Status tidak dikenal")
	}
	rows, err := s.db.Query(ctx, `SELECT v.status, count(*) FROM visit_requests v WHERE `+permintaanScope+` GROUP BY v.status`, a.CompanyID, a.Super)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			rows.Close()
			return out, err
		}
		out.Counts[st] = n
	}
	rows.Close()
	where := `FROM visit_requests v LEFT JOIN pasien p ON p.id=v.pasien_id LEFT JOIN users u ON u.id=v.handled_by
		WHERE ` + permintaanScope + ` AND ($3='' OR v.status=$3) AND (lower(v.full_name) LIKE $4 OR v.phone LIKE $4)`
	args := []any{a.CompanyID, a.Super, f.Status, likePattern(f.Q)}
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+where, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err = s.db.Query(ctx, `SELECT v.id::text, v.full_name, v.phone, v.service, v.preferred_day, v.status, v.catatan,
		v.pasien_id::text, p.nama, p.no_rm, u.full_name, v.handled_at, v.created_at, v.company_id IS NULL `+where+`
		ORDER BY v.status='baru' DESC, v.created_at DESC LIMIT $5 OFFSET $6`, append(args, size, off)...)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Permintaan])
	return out, err
}

type PermintaanInput struct {
	Status   string  `json:"status"`
	Catatan  *string `json:"catatan"`
	PasienID *string `json:"pasien_id"`
}

// UpdatePermintaan records the follow-up. An unassigned row is claimed by the superadmin's selected company.
func (s *Service) UpdatePermintaan(ctx context.Context, a Actor, id string, in PermintaanInput) error {
	if !isUUID(id) {
		return ErrNotFound
	}
	if !permintaanStatus[in.Status] {
		return invalid("status", "Status tidak dikenal")
	}
	catatan := trim(in.Catatan)
	if catatan != nil && utf8.RuneCountInString(*catatan) > 1000 {
		return invalid("catatan", "Catatan maksimal 1000 karakter")
	}
	pasienID := trim(in.PasienID)
	if in.Status == "terdaftar" && pasienID == nil {
		return invalid("pasien_id", "Pilih pasien yang sudah didaftarkan")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var from string
	err = tx.QueryRow(ctx, `SELECT v.status FROM visit_requests v WHERE v.id=$3 AND `+permintaanScope+` FOR UPDATE`,
		a.CompanyID, a.Super, id).Scan(&from)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if pasienID != nil {
		var ok bool
		if !isUUID(*pasienID) {
			return invalid("pasien_id", "Pasien tidak ditemukan")
		}
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pasien WHERE company_id=$1 AND id=$2)`, a.CompanyID, *pasienID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return invalid("pasien_id", "Pasien tidak ditemukan")
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE visit_requests SET company_id=$2, status=$3, catatan=$4, pasien_id=$5,
		handled_by=$6, handled_at=now() WHERE id=$1`, id, a.CompanyID, in.Status, catatan, pasienID, a.UserID); err != nil {
		return err
	}
	if err = s.log(ctx, tx, a, "permintaan.updated", "visit_request", id, map[string]any{"from": from, "to": in.Status}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) countPermintaanBaru(ctx context.Context, a Actor) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM visit_requests v WHERE v.status='baru' AND `+permintaanScope, a.CompanyID, a.Super).Scan(&n)
	return n, err
}
