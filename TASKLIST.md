# Tasklist TabMedik (alur SI-Shina)

Reset 15 November 2026: fitur admin dan prosesnya dibangun ulang mengikuti SI-Shina (`/media/gozali/storage/rekam-medis-master`). Landing page dipertahankan. Tasklist dan PRD sebelum reset tersimpan di `../real-clinic-backup-20261115.tar.gz` (`real-clinic/TASKLIST.md`, `real-clinic/PRD.md`); PRD.md dan RENCANA_IMPLEMENTASI.md di folder ini masih versi lama dan tidak lagi menjadi acuan alur.

## Status saat ini

| Area | Status | Catatan |
|---|---|---|
| Fondasi Go/Vite/PostgreSQL, migrasi, seeder | Ada | Skema baru `001_init.sql`; seed `shina_demo_v1` |
| Login sesi, company, superadmin | Ada | Cookie `HttpOnly`/`SameSite=Strict`, CSRF `http.CrossOriginProtection`, rate limit login |
| Peran Admin, Pendaftaran, Dokter, Apotek | Ada | Kebijakan per route di `iam/access.go` |
| Pasien, rekam medis, status 1–5 | Ada | Syarat per status sama dengan SI-Shina |
| Odontogram Poli Gigi | Ada | Nomor gigi FDI, tabel `kondisi_gigi` |
| Apotek: obat, resep, pengeluaran, riwayat | Ada | Stok berkurang saat pengeluaran, sekali per rekam |
| Pembayaran + kuitansi | Ada | Tambahan dari SI-Shina (di sana masih kosong) |
| Master: poli, dokter, tindakan, ICD, petugas | Ada | Impor ICD via CSV |
| Lampiran file (consent, pemeriksaan, tindakan) | Ada | JPG/PNG maks 5 MB di `FILES_DIR`, migrasi `002_lampiran.sql` |
| Ganti password sendiri | Ada | Menu pengguna → Ganti password |
| Permintaan janji dari landing page | Ada | Menu Permintaan Janji; isi `LANDING_COMPANY_ID`, lihat S2-05 |

## S1. Reset mengikuti SI-Shina (selesai)

- [x] S1-01 Backup kode (`real-clinic-backup-20261115.tar.gz`) dan database dev (`real-clinic-db-20261115.dump`) sebelum reset.
- [x] S1-02 Skema baru `001_init.sql`: platform (company, user, sesi, audit) dan klinik (poli, dokter, pasien, obat, tindakan, icd, kondisi_gigi, rekam, rekam_diagnosa, rekam_tindakan, rekam_gigi, pengeluaran_obat, pembayaran). FK komposit `(company_id, id)` di semua tabel data.
- [x] S1-03 Empat peran dan kebijakan endpoint; dokter hanya melihat dan mengubah rekam pasiennya sendiri.
- [x] S1-04 Pasien: CRUD, nomor RM otomatis, kategori, cara bayar umum/BPJS; pasien yang punya rekam tidak bisa dihapus.
- [x] S1-05 Rekam: daftar ke poli dan dokter, pemeriksaan, tindakan per poli, resep, diagnosa ICD; terkunci setelah dikirim ke apotek.
- [x] S1-06 Status: 1 Antrian → 2 Pemeriksaan (Poli Umum wajib pemeriksaan) → 3 Di Apotek (wajib tindakan + diagnosa, atau odontogram untuk Poli Gigi) → 4 Pembayaran → 5 Selesai. Pasien BPJS langsung selesai dari apotek.
- [x] S1-07 Odontogram Poli Gigi dan riwayat odontogram per pasien.
- [x] S1-08 Apotek: data obat, antrean resep, pengeluaran obat dengan cek stok, riwayat pengeluaran.
- [x] S1-09 Pembayaran: tagihan = biaya poli + tindakan + obat, tolak pembayaran kurang, hitung kembalian, cetak kuitansi.
- [x] S1-10 Master data: poli, dokter (tertaut akun), tindakan, ICD (impor CSV), petugas.
- [x] S1-11 Dashboard per peran, mengikuti penghitung SI-Shina.
- [x] S1-12 Frontend Tailwind: menu dan halaman per modul di `frontend/src/pages`.
- [x] S1-13 Smoke test baru (`smoke_auth`, `smoke_flow`, `smoke_isolation`) lewat `test/run_all.sh`: 85 cek, 54 panggilan isolasi tanpa kebocoran.
- [x] S1-14 CI dan README diperbarui untuk alur baru.

## S2. Fitur SI-Shina yang belum ada (selesai 15 November 2026)

- [x] S2-01 Upload foto general consent pasien (SI-Shina: `pasien.general_uncent`, jpg/png). Validasi tipe dari isi file, batas ukuran, simpan di luar web root, akses lewat API sesuai company.
- [x] S2-02 Lampiran foto pemeriksaan dan tindakan per rekam (SI-Shina: `pemeriksaan_file`, `tindakan_file`), dengan aturan yang sama dengan S2-01. Terkunci bersama tindakan setelah status 3.
- [x] S2-05 Permintaan janji landing page: daftar dan tindak lanjut untuk pendaftaran (Baru/Dihubungi/Terdaftar/Batal), tautan ke pasien, isian otomatis Pasien Baru, jumlah di dashboard. Migrasi `003_permintaan_janji.sql`, smoke `smoke_permintaan.sh` (30 cek).
- [x] S2-04 Smoke `smoke_lampiran.sh` (45 cek) masuk `run_all.sh`; uji isolasi memakai pasien/rekam yang punya lampiran.
- [x] S2-03 Ganti password sendiri dari menu pengguna, wajib password lama dan konfirmasi; sesi lain dicabut setelah berhasil.

## S3. Verifikasi yang belum dilakukan

- [ ] S3-01 Uji klik di browser untuk alur harian lengkap per peran: daftar pasien → rekam → pemeriksaan → dokter → apotek → pembayaran → kuitansi, untuk Poli Umum, Poli Gigi dan pasien BPJS.
- [ ] S3-02 Uji cetak kuitansi di printer yang akan dipakai klinik.
- [ ] S3-03 `git init` dan push ke GitHub supaya CI berjalan.

## S4. Sebelum data pasien nyata (pilot)

- [ ] S4-01 Server produksi: isi `LANDING_COMPANY_ID` dengan company klinik pilot; HTTPS, `COOKIE_SECURE=true`, `DB_SSLMODE=verify-full`, file env hanya bisa dibaca user service.
- [ ] S4-02 Jadwalkan `backend/scripts/backup.sh` (backup ini hanya database; salin juga folder `FILES_DIR`) lewat cron, salin hasil terenkripsi ke lokasi lain; gunakan PITR/WAL dari layanan database.
- [ ] S4-03 Data klinik pilot: poli, tarif, tindakan, formularium obat dan daftar ICD-10 resmi yang lisensinya dimiliki fasilitas.
- [ ] S4-04 Kajian aturan rekam medis elektronik dan perjanjian pemrosesan data dengan klinik.
- [ ] S4-05 UAT dengan staf klinik untuk setiap peran.

## Ditunda (dihapus saat reset, bisa dihidupkan lagi bila diminta)

Lab dan non-lab, SATUSEHAT, shift kasir, antrean bernomor per poli, void/refund/diskon pembayaran, gabung pasien, alergi, wali dan persetujuan, laporan, MFA, booking publik. Kode lamanya ada di backup `real-clinic-backup-20261115.tar.gz`.
