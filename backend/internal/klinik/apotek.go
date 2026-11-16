package klinik

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ===== Apotek: pengeluaran obat =====

type PengeluaranRow struct {
	ID         string    `json:"id"`
	RekamID    string    `json:"rekam_id"`
	NoRekam    string    `json:"no_rekam"`
	PasienNama string    `json:"pasien_nama"`
	ObatID     string    `json:"obat_id"`
	ObatNama   string    `json:"obat_nama"`
	KdObat     *string   `json:"kd_obat"`
	Jumlah     int       `json:"jumlah"`
	Satuan     *string   `json:"satuan"`
	Harga      int64     `json:"harga"`
	Subtotal   int64     `json:"subtotal"`
	Keterangan *string   `json:"keterangan"`
	Petugas    string    `json:"petugas"`
	CreatedAt  time.Time `json:"created_at"`
}

const pengeluaranSelect = `SELECT x.id::text, x.rekam_id::text, r.no_rekam, p.nama, x.obat_id::text, o.nama, o.kd_obat, x.jumlah, x.satuan,
	x.harga, x.subtotal, x.keterangan, u.full_name, x.created_at
	FROM pengeluaran_obat x JOIN rekam r ON r.id=x.rekam_id JOIN pasien p ON p.id=x.pasien_id JOIN obat o ON o.id=x.obat_id
	JOIN users u ON u.id=x.petugas_id`

func (s *Service) pengeluaranFor(ctx context.Context, companyID, rekamID string) ([]PengeluaranRow, error) {
	rows, err := s.db.Query(ctx, pengeluaranSelect+` WHERE x.company_id=$1 AND x.rekam_id::text=$2 ORDER BY x.created_at`, companyID, rekamID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[PengeluaranRow])
}

// RiwayatObat is the "Riwayat Keluar Obat" list.
func (s *Service) RiwayatObat(ctx context.Context, companyID, q, from, to string, page, size int) (Page[PengeluaranRow], error) {
	page, size, off := pageArgs(page, size)
	out := Page[PengeluaranRow]{Page: page, Size: size, Items: []PengeluaranRow{}}
	for _, d := range []string{from, to} {
		if d != "" {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				return out, invalid("from", "Tanggal tidak valid")
			}
		}
	}
	where := ` WHERE x.company_id=$1 AND (lower(o.nama) LIKE $2 OR lower(coalesce(o.kd_obat,'')) LIKE $2 OR lower(p.nama) LIKE $2 OR lower(r.no_rekam) LIKE $2)
		AND ($3='' OR x.created_at::date >= $3::date) AND ($4='' OR x.created_at::date <= $4::date)`
	args := []any{companyID, likePattern(q), from, to}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM pengeluaran_obat x JOIN rekam r ON r.id=x.rekam_id JOIN pasien p ON p.id=x.pasien_id
		JOIN obat o ON o.id=x.obat_id`+where, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, pengeluaranSelect+where+` ORDER BY x.created_at DESC LIMIT $5 OFFSET $6`, append(args, size, off)...)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[PengeluaranRow])
	return out, err
}

type DispenseItem struct {
	ObatID     string  `json:"obat_id"`
	Jumlah     int     `json:"jumlah"`
	Keterangan *string `json:"keterangan"`
}

// Dispense records the drugs given for a rekam at status 3, reduces stock and moves the rekam on:
// Umum/Mandiri -> 4 Pembayaran, Jaminan Kesehatan -> 5 Selesai. Prices come from the master, not the client.
// An empty list is allowed (no drugs needed) and only advances the status.
func (s *Service) Dispense(ctx context.Context, a Actor, rekamID string, items []DispenseItem) (int, error) {
	if len(items) > 50 {
		return 0, invalid("items", "Maksimal 50 obat per resep")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	r, err := s.editable(ctx, tx, a, rekamID, StatusApotek)
	if err != nil {
		return 0, err
	}
	seen := map[string]bool{}
	for i, it := range items {
		if !isUUID(it.ObatID) || seen[it.ObatID] {
			return 0, invalid("items", "Obat tidak valid atau ganda")
		}
		seen[it.ObatID] = true
		if it.Jumlah <= 0 || it.Jumlah > 10000 {
			return 0, invalid("items", "Jumlah obat harus lebih dari 0")
		}
		var nama, satuan string
		var harga int64
		var stok int
		err := tx.QueryRow(ctx, `SELECT nama, satuan, harga, stok FROM obat WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`,
			a.CompanyID, it.ObatID).Scan(&nama, &satuan, &harga, &stok)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, invalid("items", "Obat tidak ditemukan")
		}
		if err != nil {
			return 0, err
		}
		if stok < it.Jumlah {
			return 0, conflict("INSUFFICIENT_STOCK", "Stok "+nama+" tidak cukup")
		}
		if _, err = tx.Exec(ctx, `UPDATE obat SET stok=stok-$2, updated_at=now() WHERE id=$1`, it.ObatID, it.Jumlah); err != nil {
			return 0, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO pengeluaran_obat (company_id, rekam_id, pasien_id, obat_id, jumlah, satuan, harga, subtotal, keterangan, petugas_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, a.CompanyID, rekamID, r.PasienID, it.ObatID, it.Jumlah, satuan, harga,
			harga*int64(it.Jumlah), trim(items[i].Keterangan), a.UserID); err != nil {
			return 0, err
		}
	}
	next := StatusSelesai
	if r.CaraBayar == CaraBayarUmum {
		next = StatusPembayaran
	}
	if _, err = tx.Exec(ctx, `UPDATE rekam SET status=$2, updated_at=now() WHERE id::text=$1`, rekamID, next); err != nil {
		return 0, err
	}
	if err = s.log(ctx, tx, a, "rekam.obat_diberikan", "rekam", rekamID, map[string]any{"items": len(items), "to": next}); err != nil {
		return 0, err
	}
	return next, tx.Commit(ctx)
}

// ===== Pembayaran =====

type Tagihan struct {
	BiayaPemeriksaan int64 `json:"biaya_pemeriksaan"`
	BiayaTindakan    int64 `json:"biaya_tindakan"`
	BiayaObat        int64 `json:"biaya_obat"`
	Total            int64 `json:"total"`
}

func tagihan(d *RekamDetail) Tagihan {
	t := Tagihan{BiayaPemeriksaan: d.BiayaPemeriksaan}
	for _, x := range d.TindakanFee {
		t.BiayaTindakan += x.Harga
	}
	for _, g := range d.Gigi {
		t.BiayaTindakan += g.Harga
	}
	for _, o := range d.Obat {
		t.BiayaObat += o.Subtotal
	}
	t.Total = t.BiayaPemeriksaan + t.BiayaTindakan + t.BiayaObat
	return t
}

type Pembayaran struct {
	ID               string    `json:"id"`
	RekamID          string    `json:"rekam_id"`
	NoRekam          string    `json:"no_rekam"`
	PasienNama       string    `json:"pasien_nama"`
	PasienNoRM       string    `json:"pasien_no_rm"`
	BiayaPemeriksaan int64     `json:"biaya_pemeriksaan"`
	BiayaTindakan    int64     `json:"biaya_tindakan"`
	BiayaObat        int64     `json:"biaya_obat"`
	Total            int64     `json:"total"`
	Dibayar          int64     `json:"dibayar"`
	Kembalian        int64     `json:"kembalian"`
	Metode           string    `json:"metode"`
	Petugas          string    `json:"petugas"`
	CreatedAt        time.Time `json:"created_at"`
}

const pembayaranSelect = `SELECT b.id::text, b.rekam_id::text, r.no_rekam, p.nama, p.no_rm, b.biaya_pemeriksaan, b.biaya_tindakan, b.biaya_obat,
	b.total, b.dibayar, b.kembalian, b.metode, u.full_name, b.created_at
	FROM pembayaran b JOIN rekam r ON r.id=b.rekam_id JOIN pasien p ON p.id=r.pasien_id JOIN users u ON u.id=b.petugas_id`

func (s *Service) pembayaranFor(ctx context.Context, companyID, rekamID string) (*Pembayaran, error) {
	rows, err := s.db.Query(ctx, pembayaranSelect+` WHERE b.company_id=$1 AND b.rekam_id::text=$2`, companyID, rekamID)
	if err != nil {
		return nil, err
	}
	p, err := pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByPos[Pembayaran])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

func (s *Service) ListPembayaran(ctx context.Context, companyID, q, from, to string, page, size int) (Page[Pembayaran], error) {
	page, size, off := pageArgs(page, size)
	out := Page[Pembayaran]{Page: page, Size: size, Items: []Pembayaran{}}
	for _, d := range []string{from, to} {
		if d != "" {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				return out, invalid("from", "Tanggal tidak valid")
			}
		}
	}
	where := ` WHERE b.company_id=$1 AND (lower(p.nama) LIKE $2 OR lower(p.no_rm) LIKE $2 OR lower(r.no_rekam) LIKE $2)
		AND ($3='' OR b.created_at::date >= $3::date) AND ($4='' OR b.created_at::date <= $4::date)`
	args := []any{companyID, likePattern(q), from, to}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM pembayaran b JOIN rekam r ON r.id=b.rekam_id JOIN pasien p ON p.id=r.pasien_id`+where, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := s.db.Query(ctx, pembayaranSelect+where+` ORDER BY b.created_at DESC LIMIT $5 OFFSET $6`, append(args, size, off)...)
	if err != nil {
		return out, err
	}
	out.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Pembayaran])
	return out, err
}

type BayarInput struct {
	Dibayar int64  `json:"dibayar"`
	Metode  string `json:"metode"`
}

// Bayar settles a rekam at status 4 for the server-computed total and closes it (status 5).
// The unique rekam_id constraint makes a double submit fail instead of charging twice.
func (s *Service) Bayar(ctx context.Context, a Actor, rekamID string, in BayarInput) (*Pembayaran, error) {
	switch in.Metode {
	case "Tunai", "Transfer", "Kartu Debit", "QRIS":
	default:
		return nil, invalid("metode", "Metode pembayaran wajib dipilih")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := s.editable(ctx, tx, a, rekamID, StatusPembayaran); err != nil {
		return nil, err
	}
	d, err := s.GetRekamDetail(ctx, a, rekamID)
	if err != nil {
		return nil, err
	}
	t := d.Tagihan
	if in.Metode != "Tunai" && in.Dibayar == 0 {
		in.Dibayar = t.Total
	}
	if in.Dibayar < t.Total {
		return nil, invalid("dibayar", "Jumlah dibayar kurang dari total tagihan")
	}
	if in.Metode != "Tunai" && in.Dibayar != t.Total {
		return nil, invalid("dibayar", "Pembayaran non-tunai harus sama dengan total")
	}
	_, err = tx.Exec(ctx, `INSERT INTO pembayaran (company_id, rekam_id, biaya_pemeriksaan, biaya_tindakan, biaya_obat, total, dibayar, kembalian, metode, petugas_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, a.CompanyID, rekamID, t.BiayaPemeriksaan, t.BiayaTindakan, t.BiayaObat, t.Total,
		in.Dibayar, in.Dibayar-t.Total, in.Metode, a.UserID)
	if pgCode(err) == "23505" {
		return nil, conflict("ALREADY_PAID", "Rekam ini sudah dibayar")
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE rekam SET status=5, updated_at=now() WHERE id::text=$1`, rekamID); err != nil {
		return nil, err
	}
	if err = s.log(ctx, tx, a, "rekam.dibayar", "rekam", rekamID, map[string]any{"total": t.Total, "metode": in.Metode}); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.pembayaranFor(ctx, a.CompanyID, rekamID)
}
