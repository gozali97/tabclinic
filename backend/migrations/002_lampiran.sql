-- Lampiran foto seperti SI-Shina: general consent pasien, foto pemeriksaan dan tindakan per rekam.
-- Nilai kolom adalah path relatif di FILES_DIR ({company_id}/{uuid}.{ext}); file tidak disajikan langsung oleh web server.
ALTER TABLE pasien ADD COLUMN consent_file text;
ALTER TABLE rekam ADD COLUMN pemeriksaan_file text, ADD COLUMN tindakan_file text;
