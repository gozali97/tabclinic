package klinik

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Pasien struct {
	ID              string     `json:"id"`
	NoRM            string     `json:"no_rm"`
	Nama            string     `json:"nama"`
	TmpLahir        *string    `json:"tmp_lahir"`
	TglLahir        *time.Time `json:"tgl_lahir"`
	JK              string     `json:"jk"`
	AlamatLengkap   *string    `json:"alamat_lengkap"`
	Kelurahan       *string    `json:"kelurahan"`
	Kecamatan       *string    `json:"kecamatan"`
	Kabupaten       *string    `json:"kabupaten"`
	Kodepos         *string    `json:"kodepos"`
	Agama           *string    `json:"agama"`
	StatusMenikah   *string    `json:"status_menikah"`
	Pendidikan      *string    `json:"pendidikan"`
	Pekerjaan       *string    `json:"pekerjaan"`
	Kewarganegaraan string     `json:"kewarganegaraan"`
	NoHP            string     `json:"no_hp"`
	CaraBayar       string     `json:"cara_bayar"`
	NoBPJS          *string    `json:"no_bpjs"`
	Alergi          *string    `json:"alergi"`
	CreatedAt       time.Time  `json:"created_at"`
	HasConsent      bool       `json:"has_consent"`
}

type PasienInput struct {
	PermintaanID    string  `json:"permintaan_id,omitempty"`
	NoRM            string  `json:"no_rm"`
	Nama            string  `json:"nama"`
	TmpLahir        *string `json:"tmp_lahir"`
	TglLahir        *string `json:"tgl_lahir"`
	JK              string  `json:"jk"`
	AlamatLengkap   *string `json:"alamat_lengkap"`
	Kelurahan       *string `json:"kelurahan"`
	Kecamatan       *string `json:"kecamatan"`
	Kabupaten       *string `json:"kabupaten"`
	Kodepos         *string `json:"kodepos"`
	Agama           *string `json:"agama"`
	StatusMenikah   *string `json:"status_menikah"`
	Pendidikan      *string `json:"pendidikan"`
	Pekerjaan       *string `json:"pekerjaan"`
	Kewarganegaraan string  `json:"kewarganegaraan"`
	NoHP            string  `json:"no_hp"`
	CaraBayar       string  `json:"cara_bayar"`
	NoBPJS          *string `json:"no_bpjs"`
	Alergi          *string `json:"alergi"`
}

var (
	phoneRe = regexp.MustCompile(`^\+?[0-9]{8,15}$`)
	bpjsRe  = regexp.MustCompile(`^[0-9]{13}$`)
)

func (in *PasienInput) validate() (*time.Time, error) {
	in.NoRM, in.Nama, in.NoHP = strings.ToUpper(strings.TrimSpace(in.NoRM)), strings.TrimSpace(in.Nama), strings.TrimSpace(in.NoHP)
	if err := required("no_rm", "No. RM", in.NoRM); err != nil {
		return nil, err
	}
	if err := required("nama", "Nama", in.Nama); err != nil {
		return nil, err
	}
	if in.JK != "Laki-Laki" && in.JK != "Perempuan" {
		return nil, invalid("jk", "Jenis kelamin wajib dipilih")
	}
	if !phoneRe.MatchString(in.NoHP) {
		return nil, invalid("no_hp", "No. HP 8–15 digit")
	}
	if in.Kewarganegaraan == "" {
		in.Kewarganegaraan = "WNI"
	}
	if in.Kewarganegaraan != "WNI" && in.Kewarganegaraan != "WNA" {
		return nil, invalid("kewarganegaraan", "Pilih WNI atau WNA")
	}
	if in.CaraBayar != CaraBayarUmum && in.CaraBayar != CaraBayarJaminan {
		return nil, invalid("cara_bayar", "Cara bayar wajib dipilih")
	}
	in.NoBPJS = trim(in.NoBPJS)
	if in.NoBPJS != nil && !bpjsRe.MatchString(*in.NoBPJS) {
		return nil, invalid("no_bpjs", "No. BPJS 13 digit")
	}
	if in.CaraBayar == CaraBayarJaminan && in.NoBPJS == nil {
		return nil, invalid("no_bpjs", "No. BPJS wajib untuk Jaminan Kesehatan")
	}
	if s := trim(in.StatusMenikah); s != nil {
		switch *s {
		case "Menikah", "Belum Menikah", "Janda", "Duda":
		default:
			return nil, invalid("status_menikah", "Status menikah tidak dikenal")
		}
	}
	in.StatusMenikah = trim(in.StatusMenikah)
	var tgl *time.Time
	if v := trim(in.TglLahir); v != nil {
		t, err := time.Parse("2006-01-02", *v)
		if err != nil || t.After(time.Now()) || t.Year() < 1900 {
			return nil, invalid("tgl_lahir", "Tanggal lahir tidak valid")
		}
		tgl = &t
	}
	return tgl, nil
}

const pasienCols = `id::text, no_rm, nama, tmp_lahir, tgl_lahir, jk, alamat_lengkap, kelurahan, kecamatan, kabupaten, kodepos,
	agama, status_menikah, pendidikan, pekerjaan, kewarganegaraan, no_hp, cara_bayar, no_bpjs, alergi, created_at,
	consent_file IS NOT NULL`

func (s *Service) ListPasien(ctx context.Context, companyID, q string, page, size int) (Page[Pasien], error) {
	page, size, off := pageArgs(page, size)
	out := Page[Pasien]{Page: page, Size: size, Items: []Pasien{}}
	where := `FROM pasien WHERE company_id=$1 AND (lower(nama) LIKE $2 OR lower(no_rm) LIKE $2 OR coalesce(no_bpjs,'') LIKE $2 OR no_hp LIKE $2)`
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+where, companyID, likePattern(q)).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, `SELECT `+pasienCols+` `+where+` ORDER BY created_at DESC LIMIT $3 OFFSET $4`, companyID, likePattern(q), size, off)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Pasien])
	return out, err
}

func (s *Service) GetPasien(ctx context.Context, companyID, id string) (*Pasien, error) {
	rows, err := s.db.Query(ctx, `SELECT `+pasienCols+` FROM pasien WHERE company_id=$1 AND id::text=$2`, companyID, id)
	if err != nil {
		return nil, err
	}
	p, err := pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByPos[Pasien])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

func (s *Service) SavePasien(ctx context.Context, a Actor, id string, in PasienInput) (string, error) {
	tgl, err := in.validate()
	if err != nil {
		return "", err
	}
	if in.PermintaanID != "" && (id != "" || !isUUID(in.PermintaanID)) {
		return "", invalid("permintaan_id", "Permintaan hanya dapat ditautkan saat membuat pasien baru")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var requestStatus string
	if in.PermintaanID != "" {
		var linkedID *string
		err = tx.QueryRow(ctx, `SELECT v.status, v.pasien_id::text FROM visit_requests v
			WHERE v.id=$3 AND `+permintaanScope+` FOR UPDATE`, a.CompanyID, a.Super, in.PermintaanID).Scan(&requestStatus, &linkedID)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		if err != nil {
			return "", err
		}
		if requestStatus == "batal" {
			return "", conflict("REQUEST_CANCELLED", "Permintaan sudah dibatalkan; buka kembali sebelum mendaftarkan pasien")
		}
		if linkedID != nil {
			return *linkedID, nil
		}
	}
	args := []any{a.CompanyID, in.NoRM, in.Nama, trim(in.TmpLahir), tgl, in.JK, trim(in.AlamatLengkap), trim(in.Kelurahan), trim(in.Kecamatan),
		trim(in.Kabupaten), trim(in.Kodepos), trim(in.Agama), in.StatusMenikah, trim(in.Pendidikan), trim(in.Pekerjaan), in.Kewarganegaraan,
		in.NoHP, in.CaraBayar, in.NoBPJS, trim(in.Alergi)}
	action := "pasien.updated"
	if id == "" {
		action = "pasien.created"
		err = tx.QueryRow(ctx, `INSERT INTO pasien (company_id, no_rm, nama, tmp_lahir, tgl_lahir, jk, alamat_lengkap, kelurahan, kecamatan,
			kabupaten, kodepos, agama, status_menikah, pendidikan, pekerjaan, kewarganegaraan, no_hp, cara_bayar, no_bpjs, alergi)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id::text`, args...).Scan(&id)
	} else {
		var updatedID string
		err = tx.QueryRow(ctx, `UPDATE pasien SET no_rm=$2, nama=$3, tmp_lahir=$4, tgl_lahir=$5, jk=$6, alamat_lengkap=$7, kelurahan=$8, kecamatan=$9,
			kabupaten=$10, kodepos=$11, agama=$12, status_menikah=$13, pendidikan=$14, pekerjaan=$15, kewarganegaraan=$16, no_hp=$17,
			cara_bayar=$18, no_bpjs=$19, alergi=$20, updated_at=now() WHERE company_id=$1 AND id::text=$21 RETURNING id::text`, append(args, id)...).Scan(&updatedID)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
	}
	if pgCode(err) == "23505" {
		if strings.Contains(err.Error(), "bpjs") {
			return "", invalid("no_bpjs", "No. BPJS sudah terdaftar")
		}
		return "", invalid("no_rm", "No. RM sudah dipakai")
	}
	if err != nil {
		return "", err
	}
	if err = s.log(ctx, tx, a, action, "pasien", id, nil); err != nil {
		return "", err
	}
	if in.PermintaanID != "" {
		if _, err = tx.Exec(ctx, `UPDATE visit_requests SET company_id=$2, status='terdaftar', pasien_id=$3,
			handled_by=$4, handled_at=now() WHERE id=$1`, in.PermintaanID, a.CompanyID, id, a.UserID); err != nil {
			return "", err
		}
		if err = s.log(ctx, tx, a, "permintaan.updated", "visit_request", in.PermintaanID,
			map[string]any{"from": requestStatus, "to": "terdaftar"}); err != nil {
			return "", err
		}
	}
	return id, tx.Commit(ctx)
}

func (s *Service) DeletePasien(ctx context.Context, a Actor, id string) error {
	var consent *string
	err := s.db.QueryRow(ctx, `DELETE FROM pasien WHERE company_id=$1 AND id::text=$2 RETURNING consent_file`, a.CompanyID, id).Scan(&consent)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err == nil {
		s.removeFile(consent)
		err = s.log(ctx, nil, a, "pasien.deleted", "pasien", id, nil)
	}
	return inUse(err, "Pasien yang sudah punya rekam medis")
}

// NextNoRM follows SI-Shina: kategori (D dewasa / A anak) + huruf pertama nama + nomor urut 3 digit.
func (s *Service) NextNoRM(ctx context.Context, companyID, kategori, nama string) (string, error) {
	kategori = strings.ToUpper(strings.TrimSpace(kategori))
	if kategori != "D" && kategori != "A" {
		return "", invalid("kategori", "Kategori D (dewasa) atau A (anak)")
	}
	nama = strings.TrimSpace(nama)
	if nama == "" {
		return "", invalid("nama", "Isi nama dulu")
	}
	first := strings.ToUpper(string([]rune(nama)[0]))
	if first < "A" || first > "Z" {
		first = "X"
	}
	prefix := kategori + first
	var last int
	err := s.db.QueryRow(ctx, `SELECT coalesce(max(substring(no_rm from 3)::int), 0) FROM pasien
		WHERE company_id=$1 AND no_rm ~ ('^' || $2 || '[0-9]+$')`, companyID, prefix).Scan(&last)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%03d", prefix, last+1), nil
}
