-- Tindak lanjut form "Buat Janji" di landing page oleh petugas pendaftaran.
-- company_id diisi dari LANDING_COMPANY_ID saat permintaan masuk. Baris tanpa company (sebelum
-- variabel itu diisi) hanya terlihat oleh superadmin dan menjadi milik company yang menindaklanjutinya.
ALTER TABLE visit_requests
    ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN company_id uuid REFERENCES companies(id),
    ADD COLUMN status text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'dihubungi', 'terdaftar', 'batal')),
    ADD COLUMN catatan text CHECK (char_length(catatan) <= 1000),
    ADD COLUMN pasien_id uuid,
    ADD COLUMN handled_by uuid REFERENCES users(id),
    ADD COLUMN handled_at timestamptz,
    ADD CONSTRAINT visit_requests_id_key UNIQUE (id),
    ADD CONSTRAINT visit_requests_pasien_fk FOREIGN KEY (company_id, pasien_id)
        REFERENCES pasien (company_id, id) ON DELETE SET NULL (pasien_id);
CREATE INDEX visit_requests_list_idx ON visit_requests (company_id, status, created_at DESC);
