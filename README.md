# TabMedik

Backend Go, frontend Vite, database PostgreSQL. Konfigurasi lokal memakai file env; deployment memasok environment variables melalui service/container. Secret hanya berada di backend.

## Menjalankan lokal

Salin contoh konfigurasi sekali, lalu edit sesuai PostgreSQL yang tersedia:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Contoh backend memakai TCP `127.0.0.1:5432`. Untuk PostgreSQL lokal proyek ini yang memakai socket `/tmp` port `5433`, ubah:

```dotenv
DB_HOST=/tmp
DB_PORT=5433
DB_SOCKET=
```

Database harus sudah dibuat. Secara default (`AUTO_MIGRATE=true`), API menjalankan migrasi tabel/kolom sebelum menerima request. Aplikasi tidak membuat database PostgreSQL-nya sendiri.

Dari folder `backend`, jalankan `air`. Air membaca `.env`. Setelah mengubah env, hentikan dan jalankan ulang Air agar nilai baru terbaca.

Air memakai polling setiap 1 detik agar tidak bergantung pada kuota watcher inotify Linux yang dapat memunculkan error `too many open files`. Auto-rebuild tetap aktif, dengan jeda deteksi perubahan hingga sekitar 1 detik ditambah debounce/build.

Dari folder `frontend`, jalankan `npm install` lalu `npm run dev`. Vite membaca `.env` dan mem-proxy `/api` ke `API_PROXY_TARGET`. Jika port backend berubah, sesuaikan target proxy dan restart Vite.

Watcher development Vite juga memakai polling setiap 1 detik untuk menghindari error `EMFILE: too many open files`. Konfigurasi yang dimuat oleh perintah `vite` saat ini adalah `frontend/vite.config.js`.

File `.env` diabaikan Git; `.env.example` adalah template tanpa kredensial produksi. Jangan menyalin file contoh ke `.env` yang sudah berisi konfigurasi sendiri.

## Konfigurasi backend

| Variabel             | Default tanpa env        | Kegunaan                                                                             |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `SERVER_HOST`        | kosong (semua interface) | Alamat bind; gunakan `127.0.0.1` di belakang proxy satu host, `0.0.0.0` di container |
| `SERVER_PORT`        | `8080`                   | Port HTTP API                                                                        |
| `DATABASE_URL`       | kosong                   | Connection string PostgreSQL lengkap; jika diisi, seluruh `DB_*` diabaikan           |
| `DB_HOST`            | `/tmp`                   | Host TCP atau direktori Unix socket; default lama lokal dipertahankan                |
| `DB_PORT`            | `5433`                   | Port PostgreSQL; contoh env memakai port standar `5432`                              |
| `DB_USER`            | `postgres`               | Pengguna PostgreSQL                                                                  |
| `DB_PASSWORD`        | kosong                   | Password, termasuk untuk socket bila diperlukan                                      |
| `DB_NAME`            | `real_clinic`            | Nama database                                                                        |
| `DB_SOCKET`          | kosong                   | Override direktori socket; kosongkan untuk memakai `DB_HOST`                         |
| `DB_SSLMODE`         | `disable`                | Mode TLS pgx/PostgreSQL; deployment TLS sebaiknya memakai `verify-full`              |
| `DB_SSLROOTCERT`     | kosong                   | Path sertifikat CA PostgreSQL jika diperlukan                                        |
| `DB_CONNECT_TIMEOUT` | `5`                      | Timeout koneksi dalam detik                                                          |
| `COOKIE_SECURE`      | `false`                  | Set `true` untuk HTTPS agar cookie sesi hanya dikirim melalui HTTPS                  |
| `SESSION_DURATION`   | `30m`                    | Masa berlaku sesi database dan cookie; format durasi Go, minimum `1s`                |
| `AUTO_MIGRATE`       | `true`                   | Jalankan migrasi SQL tertunda saat startup; startup berhenti jika migrasi gagal      |
| `SEED_ENABLED`       | `false`                  | Buat company, akun role dan data demo sekali                                         |
| `SEED_PASSWORD`      | kosong                   | Password awal akun demo, wajib 8–72 byte jika seeder aktif                           |
| `FILES_DIR`          | `data/files`             | Folder lampiran foto (relatif ke working directory); jangan disajikan web server     |
| `LANDING_COMPANY_ID` | kosong                   | UUID company penerima form "Buat Janji" landing page; kosong = hanya superadmin yang melihat |

Contoh nilai password yang mengandung spasi atau `#` dalam file env harus diberi kutip sesuai format dotenv. Nilai env biasa `DB_PASSWORD` tidak perlu di-URL-encode. Untuk `DATABASE_URL`, encode karakter khusus pada username/password sesuai aturan URL.

`JWT_SECRET` tidak dipakai: autentikasi aplikasi saat ini menggunakan sesi database, bukan JWT.

## Konfigurasi frontend

| Variabel           | Default                 | Kegunaan                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`     | `/api/v1`               | Base URL API pada bundle browser; ditetapkan saat build       |
| `API_PROXY_TARGET` | `http://127.0.0.1:8080` | Target proxy `/api` untuk development, tanpa suffix `/api/v1` |
| `DEV_HOST`         | `127.0.0.1`             | Bind server development Vite                                  |
| `DEV_PORT`         | `5173`                  | Port development; gagal jika port sudah terpakai              |

Semua `VITE_*` dapat dibaca publik di bundle. Jangan menaruh password database, token privat atau secret di sana. Perubahan `VITE_API_URL` memerlukan build ulang. Gunakan `/api/v1` dan reverse proxy origin yang sama untuk deployment agar cookie sesi bekerja tanpa tambahan CORS.

## Deployment

Build dari folder masing-masing:

```sh
# backend/
go build -o api ./cmd/api

# frontend/
npm ci
npm run build
```

Jika toolchain mengeluhkan metadata Git tidak tersedia, tambahkan `-buildvcs=false` pada perintah build Go.

Binary Go membaca environment proses dan tidak otomatis membaca `.env`. Jalankan melalui service manager/container yang memasok env. Untuk systemd, contoh bagian service (sesuaikan path):

```ini
[Service]
WorkingDirectory=/srv/real-clinic/backend
EnvironmentFile=/etc/real-clinic/backend.env
ExecStart=/srv/real-clinic/backend/api
Restart=on-failure
```

File environment produksi dapat mengikuti `backend/.env.example`, dengan host/password database produksi, `DB_SSLMODE=verify-full` dan CA yang sesuai layanan database, `COOKIE_SECURE=true`, serta host/port sesuai jaringan deployment. Batasi akses file secret ke pengguna service. Environment produksi tidak memerlukan Air.

Sajikan `frontend/dist` melalui web server HTTPS dengan fallback SPA ke `index.html`. Proxy `/api/` ke host/port backend sambil mempertahankan prefix `/api/`. Proxy Vite hanya berlaku untuk development; `vite preview` bukan server produksi dan tidak dikonfigurasi proxy di proyek ini.

Keamanan bawaan: cookie sesi `HttpOnly` + `SameSite=Strict` (+ `Secure` bila `COOKIE_SECURE=true`, wajib di produksi), CSRF ditolak oleh `http.CrossOriginProtection` (POST/PATCH/DELETE lintas situs mendapat 403 `CSRF`), header `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store`. Frontend dan API harus satu origin (proxy `/api/`).

Backup: `bash backend/scripts/backup.sh [folder]` membuat `pg_dump`, merestore ke database sementara, mencocokkan jumlah baris tabel inti, lalu menghapus database sementara; dump lebih tua dari `BACKUP_KEEP_DAYS` (default 14) dihapus. Jadwalkan lewat cron, salin hasilnya ke lokasi lain dan terenkripsi. Untuk produksi tetap gunakan PITR/WAL dari layanan database.

Periksa `GET /api/v1/health` setelah service aktif. Dengan `AUTO_MIGRATE=true`, kredensial startup harus berhak menjalankan DDL dan membuat extension yang digunakan migrasi. Gunakan `AUTO_MIGRATE=false` hanya bila database sudah dimigrasikan dengan versi aplikasi ini. Jangan menjalankan skrip E2E terhadap data produksi.

## Pemeriksaan

```sh
# backend/
bash scripts/check.sh          # gofmt, vet, go test
bash test/run_all.sh           # smoke_auth, smoke_flow, smoke_lampiran, smoke_permintaan, smoke_isolation di API sementara (port 18071)

# frontend/
npx tsc --noEmit -p . && npm run build
```

`test/run_all.sh` gagal bila ada baris `(want X)` yang tidak terpenuhi atau baris `LEAK`. `test/smoke_isolation.sh` memanggil setiap route `{id}` di `iam/access.go` sebagai admin company lain memakai ID milik company demo; respons 2xx berisi data dianggap bocor. Route baru otomatis ikut diuji. CI (`.github/workflows/ci.yml`, aktif setelah repo di-push ke GitHub) menjalankan pemeriksaan yang sama dari database kosong, ditambah `npm audit`.

UI memakai Tailwind CSS v4 (`@tailwindcss/vite`): token di `frontend/src/styles/globals.css`, komponen dasar di `frontend/src/components/ui`, shell di `frontend/src/components/layout/AdminLayout.tsx`. Landing page (`/`) tetap memakai CSS module miliknya.

## Migrasi otomatis

Urutan startup: baca env → koneksi PostgreSQL → migrasi → seeder bila aktif → server HTTP. Migrasi dan seeder yang gagal menghentikan startup.

File `backend/migrations/*.sql` di-embed ke binary, diurutkan berdasarkan nama, lalu dicatat di `public.schema_migrations` beserta SHA-256. Advisory lock mencegah dua instance menjalankan migrasi bersamaan; seluruh batch berada dalam satu transaksi.

Skema saat ini: `001_init.sql` (reset 2026-11-15 mengikuti SI-Shina), `002_lampiran.sql` dan `003_permintaan_janji.sql`. Setiap tabel data memakai `company_id`, dan FK komposit `(company_id, id)` mencegah referensi lintas company. Untuk perubahan berikutnya buat file baru (`002_....sql`); jangan mengubah migrasi yang sudah diterapkan dan jangan menulis `BEGIN`/`COMMIT`. Uji tanpa efek: `bash scripts/dryrun-migration.sh <file>`.

## Login dan company

Login cukup email dan password (`POST /api/v1/auth/login`); sesi disimpan di cookie HttpOnly `session_id`.

- **User biasa** terikat ke satu company dan langsung masuk ke company tersebut.
- **Superadmin** (`users.is_superadmin = true`) memilih company setelah login (`GET /api/v1/companies` → `POST /api/v1/auth/select-company`). Sebelum memilih, endpoint data mengembalikan `409 COMPANY_REQUIRED`. Company baru dibuat lewat `POST /api/v1/companies`.

Kebijakan endpoint berada di `backend/internal/iam/access.go`. Endpoint tanpa kebijakan ditolak untuk semua pengguna, termasuk superadmin.

## Alur rekam medis (mengikuti SI-Shina)

Peran: **Admin** (master data dan semua menu), **Pendaftaran** (pasien, pendaftaran rekam, pembayaran), **Dokter** (pemeriksaan pasiennya sendiri), **Apotek** (obat dan pengeluaran obat).

| Status | Arti | Pindah oleh |
|---|---|---|
| 1 Antrian | Pasien didaftarkan ke poli dan dokter | `POST /rekam` (pendaftaran) |
| 2 Pemeriksaan | Di dokter | Pendaftaran; Poli Umum wajib mengisi pemeriksaan/anamnesa dulu (`409 PEMERIKSAAN_REQUIRED`) |
| 3 Di Apotek | Menunggu obat | Dokter; Poli Umum wajib tindakan + diagnosa ICD (`409 TINDAKAN_REQUIRED`), Poli Gigi wajib odontogram (`409 GIGI_REQUIRED`) |
| 4 Pembayaran | Menunggu bayar | Otomatis saat apotek mengeluarkan obat (pasien umum) |
| 5 Selesai | Selesai | Otomatis saat dibayar, atau langsung dari apotek untuk pasien BPJS |

- Tagihan = biaya pemeriksaan poli + tindakan + obat yang dikeluarkan. Pembayaran kurang dari tagihan ditolak; kembalian dihitung. Kuitansi dicetak dari `/app/pembayaran/{id}/cetak`.
- Pengeluaran obat mengurangi stok (`409 INSUFFICIENT_STOCK` bila kurang) dan hanya bisa sekali per rekam. Riwayat di menu Obat → Riwayat.
- Diagnosa, tindakan dan resep terkunci setelah rekam dikirim ke apotek. Dokter hanya melihat dan mengubah rekam pasiennya sendiri.
- Poli Gigi memakai odontogram (nomor gigi FDI, kondisi dari tabel `kondisi_gigi`); riwayat odontogram per pasien di `GET /pasien/{id}/odontogram`.
- Lampiran foto (JPG/PNG, maks 5 MB, tipe dicek dari isi file): general consent pasien (`/pasien/{id}/consent`, diunggah pendaftaran/admin), foto pemeriksaan (`/rekam/{id}/pemeriksaan/file`, status 1–2) dan foto tindakan (`/rekam/{id}/tindakan/file`, dokter, status 2). Unggah lewat `POST` multipart field `file`, lihat lewat `GET`, hapus lewat `DELETE`. File disimpan di `FILES_DIR/{company_id}/` dan hanya bisa diambil lewat API sesuai company dan akses dokter; file ikut terhapus saat pasien/rekam dihapus. `backup.sh` hanya membackup database, jadi salin `FILES_DIR` terpisah.
- Permintaan janji: form "Buat Janji" di landing page (Konsultasi Umum / Kesehatan Gigi) masuk ke menu **Permintaan Janji** (admin, pendaftaran) milik company `LANDING_COMPANY_ID`. Status: Baru → Dihubungi → Terdaftar (wajib ditautkan ke pasien) atau Batal. "Daftarkan" memilih pasien lama atau membuka form Pasien Baru dengan nama dan nomor WhatsApp terisi. Ini bukan penjadwalan: slot tidak dikunci. Bila `LANDING_COMPANY_ID` kosong, permintaan hanya terlihat oleh superadmin dan menjadi milik company yang ia pilih saat menindaklanjuti. Dashboard menampilkan jumlah permintaan baru.
- Ganti password sendiri: menu pengguna → Ganti password (`POST /auth/password` dengan `current_password` dan `new_password`). Sesi di perangkat lain dicabut.
- Master data: poli, dokter (tertaut ke akun user), tindakan per poli, ICD-10 (impor via `POST /icd/import`; seed hanya contoh, gunakan daftar resmi yang lisensinya dimiliki fasilitas), petugas.

## Seeder dan akun awal

Dari folder `backend`: `bash scripts/seed-verify.sh`. Seed membuat company `TabMedik Demo` (`11111111-1111-4111-8111-111111111111`), cabang `Klinik Utama`, Poli Umum (Rp50.000) dan Poli Gigi (Rp75.000), enam tindakan, lima obat, sepuluh kode ICD contoh dan tiga pasien demo. Penanda `shina_demo_v1` di `seed_history` mencegah seed berulang; mengganti `SEED_PASSWORD` tidak mereset password.

```dotenv
AUTO_MIGRATE=true
SEED_ENABLED=true
SEED_PASSWORD=password789
```

| Email | Peran |
|---|---|
| `superadmin@gmail.com` | Superadmin, pilih company setelah login |
| `admin@demo.local` | Admin |
| `pendaftaran@demo.local` | Pendaftaran |
| `dokter.umum@demo.local` | Dokter Poli Umum |
| `dokter.gigi@demo.local` | Dokter Poli Gigi |
| `apotek@demo.local` | Apotek |

## Pengujian migrasi dan seed

Tes integrasi membuat database acak terisolasi lalu menghapus hanya database yang dibuatnya. Jalankan pada PostgreSQL pengujian dengan izin `CREATEDB`:

```sh
# backend/, gunakan server pengujian, bukan database produksi
TEST_DATABASE_URL='postgresql://test_user:password@localhost:5432/postgres?sslmode=disable' go test ./migrations -v
```

Jika `TEST_DATABASE_URL` tidak diset, tes integrasi dilaporkan SKIP.

## Backup sebelum reset

Kode sebelum reset: `../real-clinic-backup-20261115.tar.gz`. Database dev sebelum reset: `../real-clinic-db-20261115.dump` (format `pg_dump -Fc`, pulihkan dengan `pg_restore` ke database baru).
