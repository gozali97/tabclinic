-- Skema awal SI-Shina (rekam medis klinik pratama) dengan isolasi per company.
-- Uang dalam rupiah (bigint). Semua tabel data memakai company_id; FK komposit
-- (company_id, id) memastikan referensi tidak pernah menyeberang company.

-- ===== Platform: company, user, sesi, audit =====
CREATE TABLE companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    mode text NOT NULL DEFAULT 'klinik',
    slug text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'offboarded')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_slug_key ON companies (slug) WHERE slug IS NOT NULL;

CREATE TABLE branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'Asia/Jakarta',
    address text,
    phone text,
    is_active boolean NOT NULL DEFAULT true,
    mrn_prefix text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(id),
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    phone text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    failed_logins integer NOT NULL DEFAULT 0,
    is_superadmin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (is_superadmin OR company_id IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE UNIQUE INDEX users_company_id_id_key ON users (company_id, id);

CREATE TABLE user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    company_id uuid NOT NULL REFERENCES companies(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    role text NOT NULL CHECK (role IN ('admin', 'pendaftaran', 'dokter', 'apotek')),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_roles_user_idx ON user_roles (user_id) WHERE valid_until IS NULL;

CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    company_id uuid REFERENCES companies(id),
    branch_id uuid REFERENCES branches(id),
    roles text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE NOT revoked;

CREATE TABLE audit_events (
    id bigserial PRIMARY KEY,
    company_id uuid NOT NULL,
    branch_id uuid,
    actor_id uuid,
    actor_roles text[],
    action text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    ip_address inet,
    user_agent text,
    reason text,
    request_id text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_company_time_idx ON audit_events (company_id, created_at DESC);
CREATE RULE audit_events_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE RULE audit_events_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;

CREATE TABLE seed_history (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- Form "Jadwalkan kunjungan" di landing page (publik, belum terikat company).
CREATE TABLE visit_requests (
    idempotency_key uuid PRIMARY KEY,
    full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
    phone text NOT NULL CHECK (phone ~ '^\+?[0-9]{8,15}$'),
    service text NOT NULL CHECK (service IN ('Konsultasi Umum', 'Kesehatan Gigi', 'Pemeriksaan Kesehatan', 'Perawatan Preventif')),
    preferred_day text NOT NULL CHECK (preferred_day IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')),
    consent boolean NOT NULL CHECK (consent),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Master data =====
CREATE TABLE poli (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    nama text NOT NULL CHECK (btrim(nama) <> ''),
    is_gigi boolean NOT NULL DEFAULT false,
    biaya_pemeriksaan bigint NOT NULL DEFAULT 0 CHECK (biaya_pemeriksaan >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX poli_nama_key ON poli (company_id, lower(nama));

-- Setiap dokter punya akun login dengan peran dokter.
CREATE TABLE dokter (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    user_id uuid NOT NULL UNIQUE,
    poli_id uuid NOT NULL,
    nip text,
    nama text NOT NULL CHECK (btrim(nama) <> ''),
    no_hp text NOT NULL,
    alamat text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id),
    FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id),
    FOREIGN KEY (company_id, poli_id) REFERENCES poli (company_id, id)
);

CREATE TABLE pasien (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    no_rm text NOT NULL CHECK (btrim(no_rm) <> ''),
    nama text NOT NULL CHECK (btrim(nama) <> ''),
    tmp_lahir text,
    tgl_lahir date,
    jk text NOT NULL CHECK (jk IN ('Laki-Laki', 'Perempuan')),
    alamat_lengkap text,
    kelurahan text,
    kecamatan text,
    kabupaten text,
    kodepos text,
    agama text,
    status_menikah text CHECK (status_menikah IN ('Menikah', 'Belum Menikah', 'Janda', 'Duda')),
    pendidikan text,
    pekerjaan text,
    kewarganegaraan text NOT NULL DEFAULT 'WNI' CHECK (kewarganegaraan IN ('WNI', 'WNA')),
    no_hp text NOT NULL,
    cara_bayar text NOT NULL DEFAULT 'Umum/Mandiri' CHECK (cara_bayar IN ('Umum/Mandiri', 'Jaminan Kesehatan')),
    no_bpjs text,
    alergi text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id),
    UNIQUE (company_id, no_rm)
);
CREATE UNIQUE INDEX pasien_bpjs_key ON pasien (company_id, no_bpjs) WHERE no_bpjs IS NOT NULL;
CREATE INDEX pasien_nama_idx ON pasien (company_id, lower(nama));

CREATE TABLE obat (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    kd_obat text,
    nama text NOT NULL CHECK (btrim(nama) <> ''),
    satuan text NOT NULL,
    stok integer NOT NULL DEFAULT 0 CHECK (stok >= 0),
    harga bigint NOT NULL DEFAULT 0 CHECK (harga >= 0),
    is_bpjs boolean NOT NULL DEFAULT true,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX obat_kode_key ON obat (company_id, kd_obat) WHERE kd_obat IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE tindakan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    poli_id uuid NOT NULL,
    kode text NOT NULL CHECK (btrim(kode) <> ''),
    nama text NOT NULL CHECK (btrim(nama) <> ''),
    harga bigint NOT NULL DEFAULT 0 CHECK (harga >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id),
    UNIQUE (company_id, kode),
    FOREIGN KEY (company_id, poli_id) REFERENCES poli (company_id, id)
);

CREATE TABLE icd (
    company_id uuid NOT NULL REFERENCES companies(id),
    code text NOT NULL CHECK (btrim(code) <> ''),
    name_id text,
    name_en text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, code)
);
CREATE INDEX icd_search_idx ON icd (company_id, lower(coalesce(name_id, '') || ' ' || coalesce(name_en, '')));

-- Kode kondisi odontogram (standar, sama untuk semua company).
CREATE TABLE kondisi_gigi (
    kode text PRIMARY KEY,
    nama text
);
INSERT INTO kondisi_gigi (kode, nama) VALUES
('sou', 'sound'), ('non', 'no information'), ('une', 'unerupted'), ('pre', 'present'),
('imx', 'impacted non-visible'), ('ano', 'anomali'), ('dia', 'diastema'), ('abr', 'abrasion'),
('car', 'caries'), ('cfr', 'crown fractured'), ('nvt', 'non-vital tooth'), ('rrx', 'retained root'),
('mis', 'missing'), ('att', 'attrition'), ('amf', 'amalgam filling'), ('gif', 'glass ionomer filling'),
('cof', 'composite filling'), ('fis', 'fissure sealant'), ('inl', 'inlay'), ('onl', 'onlay'),
('fmc', 'full metal crown'), ('poc', 'porcelain crown'), ('mpc', 'metal porcelain crown'),
('gmc', 'gold metal crown'), ('rct', 'root canal treatment'), ('ipx', 'implant'),
('meb', 'metal bridge'), ('pob', 'porcelain bridge'), ('pon', 'pontic'), ('abu', 'abutment');

-- ===== Rekam medis =====
-- status: 1 Antrian, 2 Pemeriksaan, 3 Di Apotek, 4 Pembayaran, 5 Selesai.
CREATE TABLE rekam (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    no_rekam text NOT NULL,
    tgl_rekam date NOT NULL,
    pasien_id uuid NOT NULL,
    dokter_id uuid NOT NULL,
    poli_id uuid NOT NULL,
    keluhan text NOT NULL CHECK (btrim(keluhan) <> ''),
    pemeriksaan text,
    tindakan text,
    resep_obat text,
    cara_bayar text NOT NULL CHECK (cara_bayar IN ('Umum/Mandiri', 'Jaminan Kesehatan')),
    biaya_pemeriksaan bigint NOT NULL DEFAULT 0 CHECK (biaya_pemeriksaan >= 0),
    status smallint NOT NULL DEFAULT 1 CHECK (status BETWEEN 1 AND 5),
    petugas_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id),
    UNIQUE (company_id, no_rekam),
    FOREIGN KEY (company_id, pasien_id) REFERENCES pasien (company_id, id),
    FOREIGN KEY (company_id, dokter_id) REFERENCES dokter (company_id, id),
    FOREIGN KEY (company_id, poli_id) REFERENCES poli (company_id, id)
);
-- Pasien hanya boleh punya satu rekam yang belum selesai.
CREATE UNIQUE INDEX rekam_one_open_key ON rekam (pasien_id) WHERE status < 5;
CREATE INDEX rekam_list_idx ON rekam (company_id, status, tgl_rekam DESC);

CREATE TABLE rekam_diagnosa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    rekam_id uuid NOT NULL,
    pasien_id uuid NOT NULL,
    icd_code text NOT NULL,
    icd_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rekam_id, icd_code),
    FOREIGN KEY (company_id, rekam_id) REFERENCES rekam (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, pasien_id) REFERENCES pasien (company_id, id)
);

-- Tindakan bertarif yang dipilih dokter dari master (dasar biaya tindakan).
CREATE TABLE rekam_tindakan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    rekam_id uuid NOT NULL,
    tindakan_id uuid NOT NULL,
    nama text NOT NULL,
    harga bigint NOT NULL CHECK (harga >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rekam_id, tindakan_id),
    FOREIGN KEY (company_id, rekam_id) REFERENCES rekam (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, tindakan_id) REFERENCES tindakan (company_id, id)
);

-- Pemeriksaan per elemen gigi (odontogram) untuk poli gigi.
CREATE TABLE rekam_gigi (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    rekam_id uuid NOT NULL,
    pasien_id uuid NOT NULL,
    elemen_gigi text NOT NULL CHECK (elemen_gigi ~ '^[1-8][1-8]$'),
    kondisi text NOT NULL REFERENCES kondisi_gigi(kode),
    diagnosa text NOT NULL CHECK (btrim(diagnosa) <> ''),
    tindakan_id uuid,
    tindakan_nama text,
    harga bigint NOT NULL DEFAULT 0 CHECK (harga >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rekam_id, elemen_gigi),
    FOREIGN KEY (company_id, rekam_id) REFERENCES rekam (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, pasien_id) REFERENCES pasien (company_id, id),
    FOREIGN KEY (company_id, tindakan_id) REFERENCES tindakan (company_id, id)
);
CREATE INDEX rekam_gigi_pasien_idx ON rekam_gigi (company_id, pasien_id);

CREATE TABLE pengeluaran_obat (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    rekam_id uuid NOT NULL,
    pasien_id uuid NOT NULL,
    obat_id uuid NOT NULL,
    jumlah integer NOT NULL CHECK (jumlah > 0),
    satuan text,
    harga bigint NOT NULL CHECK (harga >= 0),
    subtotal bigint NOT NULL CHECK (subtotal = harga * jumlah),
    keterangan text,
    petugas_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (company_id, rekam_id) REFERENCES rekam (company_id, id),
    FOREIGN KEY (company_id, pasien_id) REFERENCES pasien (company_id, id),
    FOREIGN KEY (company_id, obat_id) REFERENCES obat (company_id, id)
);
CREATE INDEX pengeluaran_obat_time_idx ON pengeluaran_obat (company_id, created_at DESC);

-- Satu pembayaran per rekam (pasien Umum/Mandiri).
CREATE TABLE pembayaran (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    rekam_id uuid NOT NULL,
    biaya_pemeriksaan bigint NOT NULL CHECK (biaya_pemeriksaan >= 0),
    biaya_tindakan bigint NOT NULL CHECK (biaya_tindakan >= 0),
    biaya_obat bigint NOT NULL CHECK (biaya_obat >= 0),
    total bigint NOT NULL CHECK (total = biaya_pemeriksaan + biaya_tindakan + biaya_obat),
    dibayar bigint NOT NULL CHECK (dibayar >= total),
    kembalian bigint NOT NULL CHECK (kembalian = dibayar - total),
    metode text NOT NULL CHECK (metode IN ('Tunai', 'Transfer', 'Kartu Debit', 'QRIS')),
    petugas_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, id),
    UNIQUE (rekam_id),
    FOREIGN KEY (company_id, rekam_id) REFERENCES rekam (company_id, id)
);
