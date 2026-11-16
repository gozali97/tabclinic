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

type Rekam struct {
	ID                 string    `json:"id"`
	NoRekam            string    `json:"no_rekam"`
	TglRekam           time.Time `json:"tgl_rekam"`
	PasienID           string    `json:"pasien_id"`
	PasienNama         string    `json:"pasien_nama"`
	PasienNoRM         string    `json:"pasien_no_rm"`
	DokterID           string    `json:"dokter_id"`
	DokterNama         string    `json:"dokter_nama"`
	PoliID             string    `json:"poli_id"`
	PoliNama           string    `json:"poli_nama"`
	IsGigi             bool      `json:"is_gigi"`
	Keluhan            string    `json:"keluhan"`
	Pemeriksaan        *string   `json:"pemeriksaan"`
	Tindakan           *string   `json:"tindakan"`
	ResepObat          *string   `json:"resep_obat"`
	CaraBayar          string    `json:"cara_bayar"`
	BiayaPemeriksaan   int64     `json:"biaya_pemeriksaan"`
	Status             int       `json:"status"`
	StatusLabel        string    `json:"status_label"`
	PetugasNama        string    `json:"petugas_nama"`
	CreatedAt          time.Time `json:"created_at"`
	HasPemeriksaanFile bool      `json:"has_pemeriksaan_file"`
	HasTindakanFile    bool      `json:"has_tindakan_file"`
}

type RekamDiagnosa struct {
	ID      string  `json:"id"`
	ICDCode string  `json:"icd_code"`
	ICDName *string `json:"icd_name"`
}

type RekamTindakan struct {
	ID         string `json:"id"`
	TindakanID string `json:"tindakan_id"`
	Nama       string `json:"nama"`
	Harga      int64  `json:"harga"`
}

type RekamGigi struct {
	ID           string    `json:"id"`
	RekamID      string    `json:"rekam_id"`
	ElemenGigi   string    `json:"elemen_gigi"`
	Kondisi      string    `json:"kondisi"`
	KondisiNama  *string   `json:"kondisi_nama"`
	Diagnosa     string    `json:"diagnosa"`
	TindakanID   *string   `json:"tindakan_id"`
	TindakanNama *string   `json:"tindakan_nama"`
	Harga        int64     `json:"harga"`
	TglRekam     time.Time `json:"tgl_rekam"`
}

// RekamDetail is everything one screen needs to work on a rekam.
type RekamDetail struct {
	Rekam
	Diagnosa    []RekamDiagnosa  `json:"diagnosa"`
	TindakanFee []RekamTindakan  `json:"tindakan_list"`
	Gigi        []RekamGigi      `json:"gigi"`
	Obat        []PengeluaranRow `json:"obat"`
	Pembayaran  *Pembayaran      `json:"pembayaran"`
	Tagihan     Tagihan          `json:"tagihan"`
}

const rekamSelect = `SELECT r.id::text, r.no_rekam, r.tgl_rekam, r.pasien_id::text, p.nama, p.no_rm, r.dokter_id::text, d.nama,
	r.poli_id::text, po.nama, po.is_gigi, r.keluhan, r.pemeriksaan, r.tindakan, r.resep_obat, r.cara_bayar, r.biaya_pemeriksaan,
	r.status, '', u.full_name, r.created_at, r.pemeriksaan_file IS NOT NULL, r.tindakan_file IS NOT NULL
	FROM rekam r JOIN pasien p ON p.id=r.pasien_id JOIN dokter d ON d.id=r.dokter_id JOIN poli po ON po.id=r.poli_id
	JOIN users u ON u.id=r.petugas_id`

func scanRekams(rows pgx.Rows) ([]Rekam, error) {
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Rekam])
	for i := range list {
		list[i].StatusLabel = StatusLabel[list[i].Status]
	}
	return list, err
}

type RekamFilter struct {
	Q        string
	Status   []int
	PasienID string
	DokterID string // set for dokter logins: they only see their own patients
	Date     string
	Page     int
	Size     int
}

func (s *Service) ListRekam(ctx context.Context, companyID string, f RekamFilter) (Page[Rekam], error) {
	page, size, off := pageArgs(f.Page, f.Size)
	out := Page[Rekam]{Page: page, Size: size, Items: []Rekam{}}
	status := make([]int32, 0, len(f.Status))
	for _, v := range f.Status {
		status = append(status, int32(v))
	}
	where := ` WHERE r.company_id=$1 AND (lower(p.nama) LIKE $2 OR lower(p.no_rm) LIKE $2 OR lower(r.no_rekam) LIKE $2 OR coalesce(p.no_bpjs,'') LIKE $2)
		AND (cardinality($3::int[])=0 OR r.status=ANY($3)) AND ($4='' OR r.pasien_id::text=$4) AND ($5='' OR r.dokter_id::text=$5)
		AND ($6='' OR r.tgl_rekam=$6::date)`
	args := []any{companyID, likePattern(f.Q), status, f.PasienID, f.DokterID, f.Date}
	if f.Date != "" {
		if _, err := time.Parse("2006-01-02", f.Date); err != nil {
			return out, invalid("date", "Tanggal tidak valid")
		}
	}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM rekam r JOIN pasien p ON p.id=r.pasien_id`+where, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, rekamSelect+where+` ORDER BY r.created_at DESC LIMIT $7 OFFSET $8`, append(args, size, off)...)
	if err != nil {
		return out, err
	}
	out.Items, err = scanRekams(rows)
	return out, err
}

func (s *Service) getRekam(ctx context.Context, q pgx.Tx, companyID, id string, lock bool) (*Rekam, error) {
	sql := rekamSelect + ` WHERE r.company_id=$1 AND r.id::text=$2`
	if lock {
		sql += ` FOR UPDATE OF r`
	}
	var rows pgx.Rows
	var err error
	if q != nil {
		rows, err = q.Query(ctx, sql, companyID, id)
	} else {
		rows, err = s.db.Query(ctx, sql, companyID, id)
	}
	if err != nil {
		return nil, err
	}
	list, err := scanRekams(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotFound
	}
	return &list[0], nil
}

// canSee hides other doctors' rekam from a dokter-only login, like SI-Shina.
func (s *Service) canSee(ctx context.Context, a Actor, r *Rekam) error {
	if a.Super || a.Has("admin") || a.Has("pendaftaran") || a.Has("apotek") {
		return nil
	}
	dokterID, err := s.DokterForUser(ctx, a.CompanyID, a.UserID)
	if err != nil {
		return err
	}
	if dokterID != r.DokterID {
		return ErrNotFound
	}
	return nil
}

func (s *Service) GetRekamDetail(ctx context.Context, a Actor, id string) (*RekamDetail, error) {
	r, err := s.getRekam(ctx, nil, a.CompanyID, id, false)
	if err != nil {
		return nil, err
	}
	if err := s.canSee(ctx, a, r); err != nil {
		return nil, err
	}
	d := &RekamDetail{Rekam: *r}
	rows, err := s.db.Query(ctx, `SELECT id::text, icd_code, icd_name FROM rekam_diagnosa WHERE company_id=$1 AND rekam_id::text=$2 ORDER BY created_at`, a.CompanyID, id)
	if err != nil {
		return nil, err
	}
	if d.Diagnosa, err = pgx.CollectRows(rows, pgx.RowToStructByPos[RekamDiagnosa]); err != nil {
		return nil, err
	}
	rows, err = s.db.Query(ctx, `SELECT id::text, tindakan_id::text, nama, harga FROM rekam_tindakan WHERE company_id=$1 AND rekam_id::text=$2 ORDER BY created_at`, a.CompanyID, id)
	if err != nil {
		return nil, err
	}
	if d.TindakanFee, err = pgx.CollectRows(rows, pgx.RowToStructByPos[RekamTindakan]); err != nil {
		return nil, err
	}
	if d.Gigi, err = s.listGigi(ctx, a.CompanyID, "g.rekam_id::text=$2", id); err != nil {
		return nil, err
	}
	if d.Obat, err = s.pengeluaranFor(ctx, a.CompanyID, id); err != nil {
		return nil, err
	}
	if d.Pembayaran, err = s.pembayaranFor(ctx, a.CompanyID, id); err != nil {
		return nil, err
	}
	d.Tagihan = tagihan(d)
	return d, nil
}

type RekamInput struct {
	PasienID  string `json:"pasien_id"`
	TglRekam  string `json:"tgl_rekam"`
	PoliID    string `json:"poli_id"`
	DokterID  string `json:"dokter_id"`
	Keluhan   string `json:"keluhan"`
	CaraBayar string `json:"cara_bayar"`
}

// validateRekam checks the dokter belongs to the chosen poli and loads the poli fee.
func (s *Service) validateRekam(ctx context.Context, tx pgx.Tx, companyID string, in *RekamInput) (time.Time, int64, error) {
	in.Keluhan = strings.TrimSpace(in.Keluhan)
	if err := required("keluhan", "Keluhan (anamnesa)", in.Keluhan); err != nil {
		return time.Time{}, 0, err
	}
	if in.CaraBayar != CaraBayarUmum && in.CaraBayar != CaraBayarJaminan {
		return time.Time{}, 0, invalid("cara_bayar", "Cara bayar wajib dipilih")
	}
	tgl, err := time.Parse("2006-01-02", in.TglRekam)
	if err != nil {
		return time.Time{}, 0, invalid("tgl_rekam", "Tanggal wajib diisi")
	}
	if !isUUID(in.PasienID) {
		return tgl, 0, invalid("pasien_id", "Pasien wajib dipilih")
	}
	var bpjs *string
	if err := tx.QueryRow(ctx, `SELECT no_bpjs FROM pasien WHERE company_id=$1 AND id=$2`, companyID, in.PasienID).Scan(&bpjs); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tgl, 0, invalid("pasien_id", "Data pasien tidak ditemukan")
		}
		return tgl, 0, err
	}
	if in.CaraBayar == CaraBayarJaminan && bpjs == nil {
		return tgl, 0, invalid("cara_bayar", "Pasien belum punya No. BPJS")
	}
	if !isUUID(in.PoliID) || !isUUID(in.DokterID) {
		return tgl, 0, invalid("dokter_id", "Poli dan dokter wajib dipilih")
	}
	var fee int64
	err = tx.QueryRow(ctx, `SELECT po.biaya_pemeriksaan FROM dokter d JOIN poli po ON po.id=d.poli_id JOIN users u ON u.id=d.user_id
		WHERE d.company_id=$1 AND d.id=$2 AND po.id=$3 AND d.is_active AND po.is_active AND u.status='active'`, companyID, in.DokterID, in.PoliID).Scan(&fee)
	if errors.Is(err, pgx.ErrNoRows) {
		return tgl, 0, invalid("dokter_id", "Dokter tidak aktif atau bukan dokter poli ini")
	}
	return tgl, fee, err
}

// CreateRekam is pendaftaran: one open rekam per pasien (status 1-4), like SI-Shina.
func (s *Service) CreateRekam(ctx context.Context, a Actor, in RekamInput) (string, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	tgl, fee, err := s.validateRekam(ctx, tx, a.CompanyID, &in)
	if err != nil {
		return "", err
	}
	// Serialise per pasien so the open-rekam check and the sequence number are race-free.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('rekam:' || $1))`, in.PasienID); err != nil {
		return "", err
	}
	var open string
	err = tx.QueryRow(ctx, `SELECT no_rekam FROM rekam WHERE company_id=$1 AND pasien_id=$2 AND status<5`, a.CompanyID, in.PasienID).Scan(&open)
	if err == nil {
		return "", conflict("OPEN_REKAM", "Pasien ini masih belum selesai periksa ("+open+"), selesaikan pemeriksaan sebelumnya")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	var seq int
	if err = tx.QueryRow(ctx, `SELECT count(*)+1 FROM rekam WHERE company_id=$1 AND pasien_id=$2 AND tgl_rekam=$3`, a.CompanyID, in.PasienID, tgl).Scan(&seq); err != nil {
		return "", err
	}
	var noRM string
	if err = tx.QueryRow(ctx, `SELECT no_rm FROM pasien WHERE id=$1`, in.PasienID).Scan(&noRM); err != nil {
		return "", err
	}
	no := fmt.Sprintf("REG#%s-%s-%d", tgl.Format("20060102"), noRM, seq)
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO rekam (company_id, no_rekam, tgl_rekam, pasien_id, dokter_id, poli_id, keluhan, cara_bayar, biaya_pemeriksaan, petugas_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,
		a.CompanyID, no, tgl, in.PasienID, in.DokterID, in.PoliID, in.Keluhan, in.CaraBayar, fee, a.UserID).Scan(&id)
	if pgCode(err) == "23505" {
		return "", conflict("OPEN_REKAM", "Pasien ini masih punya rekam yang belum selesai")
	}
	if err != nil {
		return "", err
	}
	if err = s.log(ctx, tx, a, "rekam.created", "rekam", id, map[string]any{"no_rekam": no}); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// UpdateRekam edits registration data while the patient is still in the queue.
func (s *Service) UpdateRekam(ctx context.Context, a Actor, id string, in RekamInput) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	r, err := s.getRekam(ctx, tx, a.CompanyID, id, true)
	if err != nil {
		return err
	}
	if r.Status != StatusAntrian {
		return conflict("REKAM_STATUS", "Data pendaftaran hanya bisa diubah saat status Antrian")
	}
	in.PasienID = r.PasienID
	tgl, fee, err := s.validateRekam(ctx, tx, a.CompanyID, &in)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE rekam SET tgl_rekam=$3, poli_id=$4, dokter_id=$5, keluhan=$6, cara_bayar=$7, biaya_pemeriksaan=$8, updated_at=now()
		WHERE company_id=$1 AND id::text=$2`, a.CompanyID, id, tgl, in.PoliID, in.DokterID, in.Keluhan, in.CaraBayar, fee); err != nil {
		return err
	}
	if err = s.log(ctx, tx, a, "rekam.updated", "rekam", id, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeleteRekam removes a registration that never reached the pharmacy.
func (s *Service) DeleteRekam(ctx context.Context, a Actor, id string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	r, err := s.getRekam(ctx, tx, a.CompanyID, id, true)
	if err != nil {
		return err
	}
	if r.Status > StatusPemeriksaan {
		return conflict("REKAM_STATUS", "Rekam yang sudah sampai apotek tidak bisa dihapus")
	}
	var pemFile, tindFile *string
	if err = tx.QueryRow(ctx, `DELETE FROM rekam WHERE company_id=$1 AND id::text=$2 RETURNING pemeriksaan_file, tindakan_file`,
		a.CompanyID, id).Scan(&pemFile, &tindFile); err != nil {
		return err
	}
	if err = s.log(ctx, tx, a, "rekam.deleted", "rekam", id, map[string]any{"no_rekam": r.NoRekam}); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	s.removeFile(pemFile)
	s.removeFile(tindFile)
	return nil
}

// editable locks the rekam and checks it is in one of the allowed statuses and visible to the actor.
func (s *Service) editable(ctx context.Context, tx pgx.Tx, a Actor, id string, allowed ...int) (*Rekam, error) {
	r, err := s.getRekam(ctx, tx, a.CompanyID, id, true)
	if err != nil {
		return nil, err
	}
	if err := s.canSee(ctx, a, r); err != nil {
		return nil, err
	}
	for _, st := range allowed {
		if r.Status == st {
			return r, nil
		}
	}
	return nil, conflict("REKAM_STATUS", "Tidak bisa diubah pada status "+StatusLabel[r.Status])
}

func (s *Service) withRekam(ctx context.Context, a Actor, id, action string, allowed []int, fn func(tx pgx.Tx, r *Rekam) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	r, err := s.editable(ctx, tx, a, id, allowed...)
	if err != nil {
		return err
	}
	if err = fn(tx, r); err != nil {
		return err
	}
	if err = s.log(ctx, tx, a, action, "rekam", id, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetPemeriksaan stores the S/O examination text (pendaftaran at status 1, dokter at status 2).
func (s *Service) SetPemeriksaan(ctx context.Context, a Actor, id, text string) error {
	if err := required("pemeriksaan", "Pemeriksaan", text); err != nil {
		return err
	}
	return s.withRekam(ctx, a, id, "rekam.pemeriksaan", []int{StatusAntrian, StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		_, err := tx.Exec(ctx, `UPDATE rekam SET pemeriksaan=$2, updated_at=now() WHERE id::text=$1`, id, strings.TrimSpace(text))
		return err
	})
}

// SetTindakan stores the dokter's plan text and the billable tindakan list (replaced as a whole).
func (s *Service) SetTindakan(ctx context.Context, a Actor, id, text string, tindakanIDs []string) error {
	if err := required("tindakan", "Tindakan", text); err != nil {
		return err
	}
	return s.withRekam(ctx, a, id, "rekam.tindakan", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		if _, err := tx.Exec(ctx, `UPDATE rekam SET tindakan=$2, updated_at=now() WHERE id::text=$1`, id, strings.TrimSpace(text)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM rekam_tindakan WHERE rekam_id::text=$1`, id); err != nil {
			return err
		}
		for _, tid := range tindakanIDs {
			if !isUUID(tid) {
				return invalid("tindakan_ids", "Tindakan tidak valid")
			}
			tag, err := tx.Exec(ctx, `INSERT INTO rekam_tindakan (company_id, rekam_id, tindakan_id, nama, harga)
				SELECT $1, $2, t.id, t.nama, t.harga FROM tindakan t WHERE t.company_id=$1 AND t.id=$3 AND t.poli_id=$4
				ON CONFLICT (rekam_id, tindakan_id) DO NOTHING`, a.CompanyID, id, tid, r.PoliID)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return invalid("tindakan_ids", "Tindakan tidak ditemukan untuk poli ini")
			}
		}
		return nil
	})
}

func (s *Service) SetResep(ctx context.Context, a Actor, id, text string) error {
	if err := required("resep_obat", "Resep obat", text); err != nil {
		return err
	}
	return s.withRekam(ctx, a, id, "rekam.resep", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		_, err := tx.Exec(ctx, `UPDATE rekam SET resep_obat=$2, updated_at=now() WHERE id::text=$1`, id, strings.TrimSpace(text))
		return err
	})
}

func (s *Service) AddDiagnosa(ctx context.Context, a Actor, id, code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return invalid("icd_code", "Pilih diagnosa ICD-10")
	}
	return s.withRekam(ctx, a, id, "rekam.diagnosa_added", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		tag, err := tx.Exec(ctx, `INSERT INTO rekam_diagnosa (company_id, rekam_id, pasien_id, icd_code, icd_name)
			SELECT $1, $2, $3, i.code, coalesce(i.name_id, i.name_en) FROM icd i WHERE i.company_id=$1 AND i.code=$4
			ON CONFLICT (rekam_id, icd_code) DO NOTHING`, a.CompanyID, id, r.PasienID, code)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			var dup bool
			_ = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rekam_diagnosa WHERE rekam_id::text=$1 AND icd_code=$2)`, id, code).Scan(&dup)
			if !dup {
				return invalid("icd_code", "Kode ICD tidak ditemukan")
			}
		}
		return nil
	})
}

func (s *Service) DeleteDiagnosa(ctx context.Context, a Actor, id, diagnosaID string) error {
	return s.withRekam(ctx, a, id, "rekam.diagnosa_deleted", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		tag, err := tx.Exec(ctx, `DELETE FROM rekam_diagnosa WHERE rekam_id::text=$1 AND id::text=$2`, id, diagnosaID)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	})
}

// ===== Poli gigi / odontogram =====

type GigiInput struct {
	ElemenGigi string  `json:"elemen_gigi"`
	Kondisi    string  `json:"kondisi"`
	Diagnosa   string  `json:"diagnosa"`
	TindakanID *string `json:"tindakan_id"`
}

// FDI tooth numbers: permanent 11-48, primary 51-85.
var elemenRe = regexp.MustCompile(`^([1-4][1-8]|[5-8][1-5])$`)

// SaveGigi upserts one tooth row for a dental rekam.
func (s *Service) SaveGigi(ctx context.Context, a Actor, id string, in GigiInput) error {
	in.ElemenGigi, in.Diagnosa = strings.TrimSpace(in.ElemenGigi), strings.TrimSpace(in.Diagnosa)
	if !elemenRe.MatchString(in.ElemenGigi) {
		return invalid("elemen_gigi", "Nomor gigi (FDI) tidak valid")
	}
	if err := required("diagnosa", "Diagnosa", in.Diagnosa); err != nil {
		return err
	}
	return s.withRekam(ctx, a, id, "rekam.gigi_saved", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		if !r.IsGigi {
			return conflict("NOT_GIGI", "Odontogram hanya untuk poli gigi")
		}
		var ok bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM kondisi_gigi WHERE kode=$1)`, in.Kondisi).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return invalid("kondisi", "Kondisi gigi tidak dikenal")
		}
		var tName *string
		var harga int64
		if t := trim(in.TindakanID); t != nil {
			err := tx.QueryRow(ctx, `SELECT nama, harga FROM tindakan WHERE company_id=$1 AND id::text=$2 AND poli_id=$3`, a.CompanyID, *t, r.PoliID).Scan(&tName, &harga)
			if errors.Is(err, pgx.ErrNoRows) {
				return invalid("tindakan_id", "Tindakan tidak ditemukan untuk poli ini")
			}
			if err != nil {
				return err
			}
			in.TindakanID = t
		} else {
			in.TindakanID = nil
		}
		_, err := tx.Exec(ctx, `INSERT INTO rekam_gigi (company_id, rekam_id, pasien_id, elemen_gigi, kondisi, diagnosa, tindakan_id, tindakan_nama, harga)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			ON CONFLICT (rekam_id, elemen_gigi) DO UPDATE SET kondisi=EXCLUDED.kondisi, diagnosa=EXCLUDED.diagnosa,
			  tindakan_id=EXCLUDED.tindakan_id, tindakan_nama=EXCLUDED.tindakan_nama, harga=EXCLUDED.harga, updated_at=now()`,
			a.CompanyID, id, r.PasienID, in.ElemenGigi, in.Kondisi, in.Diagnosa, in.TindakanID, tName, harga)
		return err
	})
}

func (s *Service) DeleteGigi(ctx context.Context, a Actor, id, gigiID string) error {
	return s.withRekam(ctx, a, id, "rekam.gigi_deleted", []int{StatusPemeriksaan}, func(tx pgx.Tx, r *Rekam) error {
		tag, err := tx.Exec(ctx, `DELETE FROM rekam_gigi WHERE rekam_id::text=$1 AND id::text=$2`, id, gigiID)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	})
}

func (s *Service) listGigi(ctx context.Context, companyID, cond, arg string) ([]RekamGigi, error) {
	rows, err := s.db.Query(ctx, `SELECT g.id::text, g.rekam_id::text, g.elemen_gigi, g.kondisi, k.nama, g.diagnosa, g.tindakan_id::text,
		g.tindakan_nama, g.harga, r.tgl_rekam FROM rekam_gigi g JOIN rekam r ON r.id=g.rekam_id JOIN kondisi_gigi k ON k.kode=g.kondisi
		WHERE g.company_id=$1 AND `+cond+` ORDER BY r.tgl_rekam DESC, g.elemen_gigi`, companyID, arg)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[RekamGigi])
}

// Odontogram returns every tooth record of a pasien across visits, newest first.
func (s *Service) Odontogram(ctx context.Context, companyID, pasienID string) ([]RekamGigi, error) {
	return s.listGigi(ctx, companyID, "g.pasien_id::text=$2", pasienID)
}

type KondisiGigi struct {
	Kode string  `json:"kode"`
	Nama *string `json:"nama"`
}

func (s *Service) ListKondisiGigi(ctx context.Context) ([]KondisiGigi, error) {
	rows, err := s.db.Query(ctx, `SELECT kode, nama FROM kondisi_gigi ORDER BY kode`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[KondisiGigi])
}

// ===== Status =====

// SetStatus moves a rekam forward. Only two manual steps exist, like SI-Shina:
// 1 -> 2 (pendaftaran sends to dokter) and 2 -> 3 (dokter sends to apotek).
// 3 -> 4/5 happens when apotek dispenses and 4 -> 5 when payment is recorded.
func (s *Service) SetStatus(ctx context.Context, a Actor, id string, to int) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var r *Rekam
	switch to {
	case StatusPemeriksaan:
		if !a.Has("pendaftaran") && !a.Has("admin") {
			return errForbidden
		}
		if r, err = s.editable(ctx, tx, a, id, StatusAntrian); err != nil {
			return err
		}
		if !r.IsGigi && r.Pemeriksaan == nil {
			return conflict("PEMERIKSAAN_REQUIRED", "Isi pemeriksaan lebih dulu")
		}
	case StatusApotek:
		if !a.Has("dokter") {
			return errForbidden
		}
		if r, err = s.editable(ctx, tx, a, id, StatusPemeriksaan); err != nil {
			return err
		}
		if r.IsGigi {
			var n int
			if err = tx.QueryRow(ctx, `SELECT count(*) FROM rekam_gigi WHERE rekam_id::text=$1`, id).Scan(&n); err != nil {
				return err
			}
			if n == 0 {
				return conflict("GIGI_REQUIRED", "Pemeriksaan, diagnosa dan tindakan gigi wajib diisi")
			}
		} else {
			var n int
			if err = tx.QueryRow(ctx, `SELECT count(*) FROM rekam_diagnosa WHERE rekam_id::text=$1`, id).Scan(&n); err != nil {
				return err
			}
			if r.Tindakan == nil || n == 0 {
				return conflict("TINDAKAN_REQUIRED", "Tindakan dan diagnosa belum diisi")
			}
		}
	default:
		return invalid("status", "Status hanya bisa diubah ke Pemeriksaan (2) atau Di Apotek (3)")
	}
	if _, err = tx.Exec(ctx, `UPDATE rekam SET status=$2, updated_at=now() WHERE id::text=$1`, id, to); err != nil {
		return err
	}
	if err = s.log(ctx, tx, a, "rekam.status", "rekam", id, map[string]any{"from": r.Status, "to": to}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var errForbidden = &ConflictError{Code: "FORBIDDEN", Message: "Peran Anda tidak boleh melakukan langkah ini"}

// IsForbidden reports the role-based refusal from SetStatus.
func IsForbidden(err error) bool { return errors.Is(err, errForbidden) }

// ===== Dashboard =====

type Dashboard struct {
	PeriksaHariIni   int   `json:"periksa_hari_ini"`
	AntriHariIni     int   `json:"antri_hari_ini"`
	PeriksaBulanIni  int   `json:"periksa_bulan_ini"`
	PeriksaTahunIni  int   `json:"periksa_tahun_ini"`
	TotalPasien      int   `json:"total_pasien"`
	PerStatus        []int `json:"per_status"` // index 0..4 = status 1..5, open rekam only
	PermintaanObat   int   `json:"permintaan_obat"`
	TotalObat        int   `json:"total_obat"`
	ObatKeluarHari   int   `json:"obat_keluar_hari_ini"`
	StokMenipis      int   `json:"stok_menipis"`
	PendapatanHari   int64 `json:"pendapatan_hari_ini"`
	MenungguBayar    int   `json:"menunggu_bayar"`
	PermintaanBaru   int   `json:"permintaan_janji_baru"`
	FilteredByDokter bool  `json:"filtered_by_dokter"`
}

// GetDashboard mirrors SI-Shina counters; a dokter login only counts its own patients.
func (s *Service) GetDashboard(ctx context.Context, a Actor) (*Dashboard, error) {
	dokterID := ""
	if !a.Super && !a.Has("admin") && !a.Has("pendaftaran") && a.Has("dokter") {
		var err error
		if dokterID, err = s.DokterForUser(ctx, a.CompanyID, a.UserID); err != nil {
			return nil, err
		}
		if dokterID == "" {
			dokterID = "00000000-0000-0000-0000-000000000000"
		}
	}
	d := &Dashboard{PerStatus: make([]int, 5), FilteredByDokter: dokterID != ""}
	err := s.db.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE tgl_rekam=current_date),
		count(*) FILTER (WHERE tgl_rekam=current_date AND status IN (1,2)),
		count(*) FILTER (WHERE date_trunc('month', tgl_rekam)=date_trunc('month', current_date)),
		count(*) FILTER (WHERE date_trunc('year', tgl_rekam)=date_trunc('year', current_date)),
		count(*) FILTER (WHERE status=1), count(*) FILTER (WHERE status=2), count(*) FILTER (WHERE status=3),
		count(*) FILTER (WHERE status=4), count(*) FILTER (WHERE status=5 AND tgl_rekam=current_date)
		FROM rekam WHERE company_id=$1 AND ($2='' OR dokter_id::text=$2)`, a.CompanyID, dokterID).
		Scan(&d.PeriksaHariIni, &d.AntriHariIni, &d.PeriksaBulanIni, &d.PeriksaTahunIni,
			&d.PerStatus[0], &d.PerStatus[1], &d.PerStatus[2], &d.PerStatus[3], &d.PerStatus[4])
	if err != nil {
		return nil, err
	}
	d.PermintaanObat, d.MenungguBayar = d.PerStatus[2], d.PerStatus[3]
	err = s.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM pasien WHERE company_id=$1),
		(SELECT count(*) FROM obat WHERE company_id=$1 AND deleted_at IS NULL),
		(SELECT count(*) FROM obat WHERE company_id=$1 AND deleted_at IS NULL AND stok<=10),
		(SELECT count(*) FROM pengeluaran_obat WHERE company_id=$1 AND created_at::date=current_date),
		(SELECT coalesce(sum(total),0) FROM pembayaran WHERE company_id=$1 AND created_at::date=current_date)`, a.CompanyID).
		Scan(&d.TotalPasien, &d.TotalObat, &d.StokMenipis, &d.ObatKeluarHari, &d.PendapatanHari)
	if err != nil {
		return nil, err
	}
	if dokterID != "" {
		d.PendapatanHari = 0
	}
	if a.Has("admin") || a.Has("pendaftaran") {
		if d.PermintaanBaru, err = s.countPermintaanBaru(ctx, a); err != nil {
			return nil, err
		}
	}
	return d, nil
}
