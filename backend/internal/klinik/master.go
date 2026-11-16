package klinik

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// ===== Poli =====

type Poli struct {
	ID               string `json:"id"`
	Nama             string `json:"nama"`
	IsGigi           bool   `json:"is_gigi"`
	BiayaPemeriksaan int64  `json:"biaya_pemeriksaan"`
	IsActive         bool   `json:"is_active"`
}

type PoliInput struct {
	Nama             string `json:"nama"`
	IsGigi           bool   `json:"is_gigi"`
	BiayaPemeriksaan int64  `json:"biaya_pemeriksaan"`
	IsActive         *bool  `json:"is_active"`
}

func (in *PoliInput) validate() error {
	in.Nama = strings.TrimSpace(in.Nama)
	if err := required("nama", "Nama poli", in.Nama); err != nil {
		return err
	}
	if in.BiayaPemeriksaan < 0 {
		return invalid("biaya_pemeriksaan", "Biaya tidak boleh negatif")
	}
	return nil
}

func (s *Service) ListPoli(ctx context.Context, companyID string, activeOnly bool) ([]Poli, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text, nama, is_gigi, biaya_pemeriksaan, is_active FROM poli
		WHERE company_id=$1 AND (is_active OR NOT $2) ORDER BY nama`, companyID, activeOnly)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Poli])
}

func (s *Service) SavePoli(ctx context.Context, a Actor, id string, in PoliInput) (string, error) {
	if err := in.validate(); err != nil {
		return "", err
	}
	active := in.IsActive == nil || *in.IsActive
	var err error
	if id == "" {
		err = s.db.QueryRow(ctx, `INSERT INTO poli (company_id, nama, is_gigi, biaya_pemeriksaan, is_active)
			VALUES ($1,$2,$3,$4,$5) RETURNING id::text`, a.CompanyID, in.Nama, in.IsGigi, in.BiayaPemeriksaan, active).Scan(&id)
	} else {
		err = s.exec1(ctx, `UPDATE poli SET nama=$3, is_gigi=$4, biaya_pemeriksaan=$5, is_active=$6, updated_at=now()
			WHERE company_id=$1 AND id::text=$2`, a.CompanyID, id, in.Nama, in.IsGigi, in.BiayaPemeriksaan, active)
	}
	if pgCode(err) == "23505" {
		return "", invalid("nama", "Nama poli sudah ada")
	}
	return id, err
}

func (s *Service) DeletePoli(ctx context.Context, a Actor, id string) error {
	return inUse(s.exec1(ctx, `DELETE FROM poli WHERE company_id=$1 AND id::text=$2`, a.CompanyID, id), "Poli")
}

// exec1 runs a statement that must affect exactly one row of the caller's company.
func (s *Service) exec1(ctx context.Context, sql string, args ...any) error {
	tag, err := s.db.Exec(ctx, sql, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ===== Dokter (akun login peran dokter) =====

type Dokter struct {
	ID       string  `json:"id"`
	UserID   string  `json:"user_id"`
	Email    string  `json:"email"`
	NIP      *string `json:"nip"`
	Nama     string  `json:"nama"`
	NoHP     string  `json:"no_hp"`
	Alamat   *string `json:"alamat"`
	PoliID   string  `json:"poli_id"`
	PoliNama string  `json:"poli_nama"`
	IsActive bool    `json:"is_active"`
}

type DokterInput struct {
	Email    string  `json:"email"`
	Password string  `json:"password"`
	NIP      *string `json:"nip"`
	Nama     string  `json:"nama"`
	NoHP     string  `json:"no_hp"`
	Alamat   *string `json:"alamat"`
	PoliID   string  `json:"poli_id"`
	IsActive *bool   `json:"is_active"`
}

const dokterSelect = `SELECT d.id::text, d.user_id::text, u.email, d.nip, d.nama, d.no_hp, d.alamat, d.poli_id::text, p.nama, d.is_active AND u.status='active'
	FROM dokter d JOIN users u ON u.id=d.user_id JOIN poli p ON p.id=d.poli_id`

func (s *Service) ListDokter(ctx context.Context, companyID, poliID string, activeOnly bool) ([]Dokter, error) {
	rows, err := s.db.Query(ctx, dokterSelect+` WHERE d.company_id=$1 AND ($2='' OR d.poli_id::text=$2)
		AND (NOT $3 OR (d.is_active AND u.status='active')) ORDER BY d.nama`, companyID, poliID, activeOnly)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Dokter])
}

func (s *Service) poliExists(ctx context.Context, q pgx.Tx, companyID, poliID string) error {
	var ok bool
	if err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM poli WHERE company_id=$1 AND id::text=$2)`, companyID, poliID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return invalid("poli_id", "Poli tidak ditemukan")
	}
	return nil
}

func (s *Service) CreateDokter(ctx context.Context, a Actor, in DokterInput) (string, error) {
	in.Email, in.Nama, in.NoHP = strings.TrimSpace(in.Email), strings.TrimSpace(in.Nama), strings.TrimSpace(in.NoHP)
	if addr, err := mail.ParseAddress(in.Email); err != nil || addr.Address != in.Email {
		return "", invalid("email", "Email tidak valid")
	}
	if err := required("nama", "Nama", in.Nama); err != nil {
		return "", err
	}
	if err := required("no_hp", "No. HP", in.NoHP); err != nil {
		return "", err
	}
	if len(in.Password) < 8 || len(in.Password) > 72 {
		return "", invalid("password", "Password 8–72 karakter")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	if err := s.poliExists(ctx, tx, a.CompanyID, in.PoliID); err != nil {
		return "", err
	}
	var branchID string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM branches WHERE company_id=$1 AND is_active ORDER BY created_at LIMIT 1`, a.CompanyID).Scan(&branchID); err != nil {
		return "", fmt.Errorf("company tanpa cabang aktif: %w", err)
	}
	userID := uuid.NewString()
	_, err = tx.Exec(ctx, `INSERT INTO users (id, company_id, email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4,$5,$6)`,
		userID, a.CompanyID, in.Email, string(hash), in.Nama, in.NoHP)
	if pgCode(err) == "23505" {
		return "", invalid("email", "Email sudah dipakai")
	}
	if err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO user_roles (user_id, company_id, branch_id, role) VALUES ($1,$2,$3,'dokter')`, userID, a.CompanyID, branchID); err != nil {
		return "", err
	}
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO dokter (company_id, user_id, poli_id, nip, nama, no_hp, alamat)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, a.CompanyID, userID, in.PoliID, trim(in.NIP), in.Nama, in.NoHP, trim(in.Alamat)).Scan(&id); err != nil {
		return "", err
	}
	if err = s.log(ctx, tx, a, "dokter.created", "dokter", id, nil); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// UpdateDokter changes profile, poli and active flag; an optional password resets the doctor's login.
func (s *Service) UpdateDokter(ctx context.Context, a Actor, id string, in DokterInput) error {
	in.Nama, in.NoHP = strings.TrimSpace(in.Nama), strings.TrimSpace(in.NoHP)
	if err := required("nama", "Nama", in.Nama); err != nil {
		return err
	}
	if err := required("no_hp", "No. HP", in.NoHP); err != nil {
		return err
	}
	if in.Password != "" && (len(in.Password) < 8 || len(in.Password) > 72) {
		return invalid("password", "Password 8–72 karakter")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := s.poliExists(ctx, tx, a.CompanyID, in.PoliID); err != nil {
		return err
	}
	active := in.IsActive == nil || *in.IsActive
	var userID string
	err = tx.QueryRow(ctx, `UPDATE dokter SET nip=$3, nama=$4, no_hp=$5, alamat=$6, poli_id=$7, is_active=$8, updated_at=now()
		WHERE company_id=$1 AND id::text=$2 RETURNING user_id::text`, a.CompanyID, id, trim(in.NIP), in.Nama, in.NoHP, trim(in.Alamat), in.PoliID, active).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	status := "active"
	if !active {
		status = "inactive"
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET full_name=$2, phone=$3, status=$4, updated_at=now() WHERE id::text=$1`, userID, in.Nama, in.NoHP, status); err != nil {
		return err
	}
	if in.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE users SET password_hash=$2 WHERE id::text=$1`, userID, string(hash)); err != nil {
			return err
		}
	}
	if !active || in.Password != "" {
		if _, err = tx.Exec(ctx, `UPDATE sessions SET revoked=true WHERE user_id::text=$1 AND NOT revoked`, userID); err != nil {
			return err
		}
	}
	if err = s.log(ctx, tx, a, "dokter.updated", "dokter", id, map[string]any{"active": active, "password_reset": in.Password != ""}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DokterForUser returns the dokter row linked to a login, or "" if the user is not a doctor.
func (s *Service) DokterForUser(ctx context.Context, companyID, userID string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id::text FROM dokter WHERE company_id=$1 AND user_id::text=$2`, companyID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// ===== Obat =====

type Obat struct {
	ID     string  `json:"id"`
	KdObat *string `json:"kd_obat"`
	Nama   string  `json:"nama"`
	Satuan string  `json:"satuan"`
	Stok   int     `json:"stok"`
	Harga  int64   `json:"harga"`
	IsBPJS bool    `json:"is_bpjs"`
}

type ObatInput struct {
	KdObat *string `json:"kd_obat"`
	Nama   string  `json:"nama"`
	Satuan string  `json:"satuan"`
	Stok   int     `json:"stok"`
	Harga  int64   `json:"harga"`
	IsBPJS bool    `json:"is_bpjs"`
}

func (s *Service) ListObat(ctx context.Context, companyID, q string, page, size int) (Page[Obat], error) {
	page, size, off := pageArgs(page, size)
	out := Page[Obat]{Page: page, Size: size, Items: []Obat{}}
	where := `FROM obat WHERE company_id=$1 AND deleted_at IS NULL AND (lower(nama) LIKE $2 OR lower(coalesce(kd_obat,'')) LIKE $2)`
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+where, companyID, likePattern(q)).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, `SELECT id::text, kd_obat, nama, satuan, stok, harga, is_bpjs `+where+` ORDER BY nama LIMIT $3 OFFSET $4`,
		companyID, likePattern(q), size, off)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Obat])
	return out, err
}

func (s *Service) SaveObat(ctx context.Context, a Actor, id string, in ObatInput) (string, error) {
	in.Nama, in.Satuan = strings.TrimSpace(in.Nama), strings.TrimSpace(in.Satuan)
	if err := required("nama", "Nama obat", in.Nama); err != nil {
		return "", err
	}
	if err := required("satuan", "Satuan", in.Satuan); err != nil {
		return "", err
	}
	if in.Stok < 0 {
		return "", invalid("stok", "Stok tidak boleh negatif")
	}
	if in.Harga < 0 {
		return "", invalid("harga", "Harga tidak boleh negatif")
	}
	var err error
	if id == "" {
		err = s.db.QueryRow(ctx, `INSERT INTO obat (company_id, kd_obat, nama, satuan, stok, harga, is_bpjs) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
			a.CompanyID, trim(in.KdObat), in.Nama, in.Satuan, in.Stok, in.Harga, in.IsBPJS).Scan(&id)
	} else {
		err = s.exec1(ctx, `UPDATE obat SET kd_obat=$3, nama=$4, satuan=$5, stok=$6, harga=$7, is_bpjs=$8, updated_at=now()
			WHERE company_id=$1 AND id::text=$2 AND deleted_at IS NULL`, a.CompanyID, id, trim(in.KdObat), in.Nama, in.Satuan, in.Stok, in.Harga, in.IsBPJS)
	}
	if pgCode(err) == "23505" {
		return "", invalid("kd_obat", "Kode obat sudah dipakai")
	}
	if err == nil {
		err = s.log(ctx, nil, a, "obat.saved", "obat", id, map[string]any{"stok": in.Stok, "harga": in.Harga})
	}
	return id, err
}

// DeleteObat is a soft delete so dispensing history keeps its drug reference.
func (s *Service) DeleteObat(ctx context.Context, a Actor, id string) error {
	return s.exec1(ctx, `UPDATE obat SET deleted_at=now(), kd_obat=NULL WHERE company_id=$1 AND id::text=$2 AND deleted_at IS NULL`, a.CompanyID, id)
}

// ===== Tindakan =====

type Tindakan struct {
	ID       string `json:"id"`
	PoliID   string `json:"poli_id"`
	PoliNama string `json:"poli_nama"`
	Kode     string `json:"kode"`
	Nama     string `json:"nama"`
	Harga    int64  `json:"harga"`
}

type TindakanInput struct {
	PoliID string `json:"poli_id"`
	Kode   string `json:"kode"`
	Nama   string `json:"nama"`
	Harga  int64  `json:"harga"`
}

func (s *Service) ListTindakan(ctx context.Context, companyID, poliID string) ([]Tindakan, error) {
	rows, err := s.db.Query(ctx, `SELECT t.id::text, t.poli_id::text, p.nama, t.kode, t.nama, t.harga
		FROM tindakan t JOIN poli p ON p.id=t.poli_id WHERE t.company_id=$1 AND ($2='' OR t.poli_id::text=$2) ORDER BY p.nama, t.kode`, companyID, poliID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Tindakan])
}

func (s *Service) SaveTindakan(ctx context.Context, a Actor, id string, in TindakanInput) (string, error) {
	in.Kode, in.Nama = strings.TrimSpace(in.Kode), strings.TrimSpace(in.Nama)
	if err := required("kode", "Kode", in.Kode); err != nil {
		return "", err
	}
	if err := required("nama", "Nama tindakan", in.Nama); err != nil {
		return "", err
	}
	if in.Harga < 0 {
		return "", invalid("harga", "Harga tidak boleh negatif")
	}
	if !isUUID(in.PoliID) {
		return "", invalid("poli_id", "Poli wajib dipilih")
	}
	var err error
	if id == "" {
		err = s.db.QueryRow(ctx, `INSERT INTO tindakan (company_id, poli_id, kode, nama, harga) VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
			a.CompanyID, in.PoliID, in.Kode, in.Nama, in.Harga).Scan(&id)
	} else {
		err = s.exec1(ctx, `UPDATE tindakan SET poli_id=$3, kode=$4, nama=$5, harga=$6, updated_at=now() WHERE company_id=$1 AND id::text=$2`,
			a.CompanyID, id, in.PoliID, in.Kode, in.Nama, in.Harga)
	}
	switch pgCode(err) {
	case "23505":
		return "", invalid("kode", "Kode tindakan sudah dipakai")
	case "23503":
		return "", invalid("poli_id", "Poli tidak ditemukan")
	}
	return id, err
}

func (s *Service) DeleteTindakan(ctx context.Context, a Actor, id string) error {
	return inUse(s.exec1(ctx, `DELETE FROM tindakan WHERE company_id=$1 AND id::text=$2`, a.CompanyID, id), "Tindakan")
}

// ===== ICD-10 =====

type ICD struct {
	Code   string  `json:"code"`
	NameID *string `json:"name_id"`
	NameEN *string `json:"name_en"`
}

func (s *Service) ListICD(ctx context.Context, companyID, q string, page, size int) (Page[ICD], error) {
	page, size, off := pageArgs(page, size)
	out := Page[ICD]{Page: page, Size: size, Items: []ICD{}}
	where := `FROM icd WHERE company_id=$1 AND (lower(code) LIKE $2 OR lower(coalesce(name_id,'') || ' ' || coalesce(name_en,'')) LIKE $2)`
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+where, companyID, likePattern(q)).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, `SELECT code, name_id, name_en `+where+` ORDER BY code LIMIT $3 OFFSET $4`, companyID, likePattern(q), size, off)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[ICD])
	return out, err
}

// SaveICD creates (oldCode == "") or edits one code.
func (s *Service) SaveICD(ctx context.Context, a Actor, oldCode string, in ICD) error {
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if err := required("code", "Kode", in.Code); err != nil {
		return err
	}
	if trim(in.NameID) == nil && trim(in.NameEN) == nil {
		return invalid("name_id", "Nama wajib diisi")
	}
	var err error
	if oldCode == "" {
		_, err = s.db.Exec(ctx, `INSERT INTO icd (company_id, code, name_id, name_en) VALUES ($1,$2,$3,$4)`, a.CompanyID, in.Code, trim(in.NameID), trim(in.NameEN))
	} else {
		err = s.exec1(ctx, `UPDATE icd SET code=$3, name_id=$4, name_en=$5, updated_at=now() WHERE company_id=$1 AND code=$2`,
			a.CompanyID, oldCode, in.Code, trim(in.NameID), trim(in.NameEN))
	}
	if pgCode(err) == "23505" {
		return invalid("code", "Kode ICD sudah ada")
	}
	return err
}

func (s *Service) DeleteICD(ctx context.Context, a Actor, code string) error {
	return s.exec1(ctx, `DELETE FROM icd WHERE company_id=$1 AND code=$2`, a.CompanyID, code)
}

// ImportICD upserts rows "code,name_id,name_en" (header optional) in one transaction.
func (s *Service) ImportICD(ctx context.Context, a Actor, r io.Reader) (int, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1
	cr.TrimLeadingSpace = true
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	n := 0
	for line := 1; ; line++ {
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return 0, invalid("file", fmt.Sprintf("CSV tidak valid di baris %d", line))
		}
		code := strings.ToUpper(strings.TrimSpace(rec[0]))
		if line == 1 && strings.EqualFold(code, "code") || code == "" {
			continue
		}
		var nameID, nameEN *string
		if len(rec) > 1 {
			nameID = trim(&rec[1])
		}
		if len(rec) > 2 {
			nameEN = trim(&rec[2])
		}
		if nameID == nil && nameEN == nil {
			return 0, invalid("file", fmt.Sprintf("Nama kosong di baris %d", line))
		}
		if _, err = tx.Exec(ctx, `INSERT INTO icd (company_id, code, name_id, name_en) VALUES ($1,$2,$3,$4)
			ON CONFLICT (company_id, code) DO UPDATE SET name_id=EXCLUDED.name_id, name_en=EXCLUDED.name_en, updated_at=now()`,
			a.CompanyID, code, nameID, nameEN); err != nil {
			return 0, err
		}
		n++
	}
	if err = s.log(ctx, tx, a, "icd.imported", "icd", time.Now().Format(time.RFC3339), map[string]any{"rows": n}); err != nil {
		return 0, err
	}
	return n, tx.Commit(ctx)
}
