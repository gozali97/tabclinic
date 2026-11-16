package bootstrap

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const CompanyID = "11111111-1111-4111-8111-111111111111"
const BranchID = "22222222-2222-4222-8222-222222222222"
const CompanySlug = "tabmedik-demo"
const SuperadminEmail = "superadmin@gmail.com"

// DemoAccounts are the per-role logins created by the seed (password = SEED_PASSWORD).
var DemoAccounts = []struct{ Email, Name, Role string }{
	{"admin@demo.local", "Admin Klinik", "admin"},
	{"pendaftaran@demo.local", "Petugas Pendaftaran", "pendaftaran"},
	{"apotek@demo.local", "Petugas Apotek", "apotek"},
	{"dokter.umum@demo.local", "dr. Rina Umum", "dokter"},
	{"dokter.gigi@demo.local", "drg. Budi Gigi", "dokter"},
}

// Seed creates the demo company once (seed_history 'shina_demo_v1'). Re-running never resets passwords.
func Seed(ctx context.Context, pool *pgxpool.Pool, password string) error {
	if len(password) < 8 || len(password) > 72 {
		return fmt.Errorf("seed password must contain 8 to 72 bytes")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(726341002)`); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO users (email, password_hash, full_name, is_superadmin)
		VALUES ($1, $2, 'Superadmin', true) ON CONFLICT ((lower(email))) DO NOTHING`, SuperadminEmail, string(hash)); err != nil {
		return err
	}
	var done bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM seed_history WHERE name='shina_demo_v1')`).Scan(&done); err != nil {
		return err
	}
	if !done {
		if err = seedDemo(ctx, tx, string(hash)); err != nil {
			return fmt.Errorf("seed demo: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func seedDemo(ctx context.Context, tx pgx.Tx, hash string) error {
	steps := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO companies (id, name, mode, slug) VALUES ($1, 'TabMedik Demo', 'klinik', $2)`, []any{CompanyID, CompanySlug}},
		{`INSERT INTO branches (id, company_id, name) VALUES ($1, $2, 'Klinik Utama')`, []any{BranchID, CompanyID}},
		{`INSERT INTO poli (company_id, nama, is_gigi, biaya_pemeriksaan) VALUES ($1,'Poli Umum',false,50000), ($1,'Poli Gigi',true,75000)`, []any{CompanyID}},
	}
	for _, st := range steps {
		if _, err := tx.Exec(ctx, st.sql, st.args...); err != nil {
			return err
		}
	}
	for _, acc := range DemoAccounts {
		var userID string
		if err := tx.QueryRow(ctx, `INSERT INTO users (company_id, email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4,'081200000000') RETURNING id::text`,
			CompanyID, acc.Email, hash, acc.Name).Scan(&userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, company_id, branch_id, role) VALUES ($1,$2,$3,$4)`, userID, CompanyID, BranchID, acc.Role); err != nil {
			return err
		}
		if acc.Role == "dokter" {
			poli := "Poli Umum"
			if acc.Email == "dokter.gigi@demo.local" {
				poli = "Poli Gigi"
			}
			if _, err := tx.Exec(ctx, `INSERT INTO dokter (company_id, user_id, poli_id, nama, no_hp)
				SELECT $1, $2, id, $3, '081200000000' FROM poli WHERE company_id=$1 AND nama=$4`, CompanyID, userID, acc.Name, poli); err != nil {
				return err
			}
		}
	}
	data := []string{
		`INSERT INTO tindakan (company_id, poli_id, kode, nama, harga)
		 SELECT $1, p.id, t.kode, t.nama, t.harga FROM poli p JOIN (VALUES
		   ('Poli Umum','U01','Konsultasi dan edukasi',0), ('Poli Umum','U02','Nebulizer',75000), ('Poli Umum','U03','Rawat luka ringan',50000),
		   ('Poli Gigi','G01','Tambal gigi komposit',150000), ('Poli Gigi','G02','Cabut gigi',100000), ('Poli Gigi','G03','Scaling',200000)
		 ) AS t(poli, kode, nama, harga) ON t.poli=p.nama WHERE p.company_id=$1`,
		`INSERT INTO obat (company_id, kd_obat, nama, satuan, stok, harga, is_bpjs) VALUES
		   ($1,'OB001','Paracetamol 500 mg','Tablet',500,500,true), ($1,'OB002','Amoxicillin 500 mg','Kapsul',300,1200,true),
		   ($1,'OB003','Antasida DOEN','Tablet',200,400,true), ($1,'OB004','Vitamin C 50 mg','Tablet',400,300,false),
		   ($1,'OB005','Asam Mefenamat 500 mg','Tablet',250,800,true)`,
		// Contoh ICD-10 saja; impor daftar resmi lewat menu ICD.
		`INSERT INTO icd (company_id, code, name_id, name_en) VALUES
		   ($1,'A09','Diare dan gastroenteritis','Diarrhoea and gastroenteritis of presumed infectious origin'),
		   ($1,'J00','Nasofaringitis akut (common cold)','Acute nasopharyngitis [common cold]'),
		   ($1,'J06.9','Infeksi saluran napas atas akut','Acute upper respiratory infection, unspecified'),
		   ($1,'K02.1','Karies dentin','Caries of dentine'),
		   ($1,'K04.0','Pulpitis','Pulpitis'),
		   ($1,'K05.1','Gingivitis kronis','Chronic gingivitis'),
		   ($1,'K29.7','Gastritis','Gastritis, unspecified'),
		   ($1,'I10','Hipertensi esensial','Essential (primary) hypertension'),
		   ($1,'E11.9','Diabetes melitus tipe 2','Type 2 diabetes mellitus without complications'),
		   ($1,'R50.9','Demam','Fever, unspecified')`,
		`INSERT INTO pasien (company_id, no_rm, nama, tmp_lahir, tgl_lahir, jk, alamat_lengkap, no_hp, cara_bayar, no_bpjs, agama) VALUES
		   ($1,'DP001','Pasien Demo Satu','Banjarmasin','1990-04-12','Laki-Laki','Jl. Contoh No. 1','081300000001','Umum/Mandiri',NULL,'Islam'),
		   ($1,'DP002','Pasien Demo Dua','Martapura','1985-09-30','Perempuan','Jl. Contoh No. 2','081300000002','Jaminan Kesehatan','0001234567890','Islam'),
		   ($1,'AP001','Pasien Demo Anak','Banjarbaru','2016-01-20','Perempuan','Jl. Contoh No. 3','081300000003','Umum/Mandiri',NULL,'Kristen')`,
		`INSERT INTO seed_history (name) VALUES ('shina_demo_v1')`,
	}
	for _, sql := range data {
		args := []any{CompanyID}
		if sql == data[len(data)-1] {
			args = nil
		}
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			return err
		}
	}
	return nil
}
