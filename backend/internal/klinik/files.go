package klinik

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// MaxFileBytes is the upload limit for one attachment.
const MaxFileBytes = 5 << 20

// SI-Shina menerima jpg/png; tipe ditentukan dari isi file, bukan nama atau header klien.
var allowedFileTypes = map[string]string{"image/jpeg": ".jpg", "image/png": ".png"}

// rekamFileSlots maps the URL kind to its column and the statuses in which it may change.
// pemeriksaan follows SetPemeriksaan (status 1-2), tindakan follows SetTindakan (status 2).
var rekamFileSlots = map[string]struct {
	column  string
	allowed []int
}{
	"pemeriksaan": {"pemeriksaan_file", []int{StatusAntrian, StatusPemeriksaan}},
	"tindakan":    {"tindakan_file", []int{StatusPemeriksaan}},
}

// storeFile validates the upload and writes it under FILES_DIR/{company}/; it returns the stored name.
func (s *Service) storeFile(companyID string, r io.Reader) (string, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxFileBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", invalid("file", "File wajib diunggah")
	}
	if len(data) > MaxFileBytes {
		return "", invalid("file", "Ukuran file maksimal 5 MB")
	}
	ext, ok := allowedFileTypes[http.DetectContentType(data)]
	if !ok {
		return "", invalid("file", "File harus berupa gambar JPG atau PNG")
	}
	if !isUUID(companyID) {
		return "", errors.New("company id tidak valid")
	}
	if err := os.MkdirAll(filepath.Join(s.filesDir, companyID), 0o700); err != nil {
		return "", err
	}
	name := companyID + "/" + uuid.NewString() + ext
	f, err := os.OpenFile(filepath.Join(s.filesDir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", err
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(filepath.Join(s.filesDir, name))
		return "", err
	}
	return name, nil
}

// removeFile deletes a stored file; failures are only logged because the DB no longer points to it.
func (s *Service) removeFile(name *string) {
	if name == nil || *name == "" {
		return
	}
	if err := os.Remove(filepath.Join(s.filesDir, filepath.FromSlash(*name))); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("remove attachment: %v", err)
	}
}

func (s *Service) openFile(name *string) (*os.File, error) {
	if name == nil || *name == "" {
		return nil, ErrNotFound
	}
	f, err := os.Open(filepath.Join(s.filesDir, filepath.FromSlash(*name)))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return f, err
}

// ===== Rekam: foto pemeriksaan / tindakan =====

// SetRekamFile replaces (r != nil) or removes (r == nil) the pemeriksaan/tindakan photo of a rekam.
func (s *Service) SetRekamFile(ctx context.Context, a Actor, id, kind string, r io.Reader) error {
	slot, ok := rekamFileSlots[kind]
	if !ok {
		return ErrNotFound
	}
	var newName *string
	if r != nil {
		name, err := s.storeFile(a.CompanyID, r)
		if err != nil {
			return err
		}
		newName = &name
	}
	var old *string
	action := "rekam." + kind + "_file"
	if r == nil {
		action += "_deleted"
	}
	err := s.withRekam(ctx, a, id, action, slot.allowed, func(tx pgx.Tx, _ *Rekam) error {
		// slot.column comes from the fixed map above, never from the request.
		if err := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM rekam WHERE id::text=$1`, slot.column), id).Scan(&old); err != nil {
			return err
		}
		if r == nil && old == nil {
			return ErrNotFound
		}
		_, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE rekam SET %s=$2, updated_at=now() WHERE id::text=$1`, slot.column), id, newName)
		return err
	})
	if err != nil {
		s.removeFile(newName)
		return err
	}
	s.removeFile(old)
	return nil
}

// RekamFile opens the photo; dokter logins only reach their own patients' rekam.
func (s *Service) RekamFile(ctx context.Context, a Actor, id, kind string) (*os.File, error) {
	slot, ok := rekamFileSlots[kind]
	if !ok {
		return nil, ErrNotFound
	}
	rk, err := s.getRekam(ctx, nil, a.CompanyID, id, false)
	if err != nil {
		return nil, err
	}
	if err := s.canSee(ctx, a, rk); err != nil {
		return nil, err
	}
	var name *string
	if err := s.db.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM rekam WHERE company_id=$1 AND id::text=$2`, slot.column), a.CompanyID, id).Scan(&name); err != nil {
		return nil, err
	}
	return s.openFile(name)
}

// ===== Pasien: general consent =====

// SetConsent replaces (r != nil) or removes (r == nil) the patient's general consent photo.
func (s *Service) SetConsent(ctx context.Context, a Actor, id string, r io.Reader) error {
	if !isUUID(id) {
		return ErrNotFound
	}
	var newName *string
	if r != nil {
		name, err := s.storeFile(a.CompanyID, r)
		if err != nil {
			return err
		}
		newName = &name
	}
	old, err := s.swapConsent(ctx, a, id, newName)
	if err != nil {
		s.removeFile(newName)
		return err
	}
	s.removeFile(old)
	return nil
}

func (s *Service) swapConsent(ctx context.Context, a Actor, id string, newName *string) (*string, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var old *string
	err = tx.QueryRow(ctx, `SELECT consent_file FROM pasien WHERE company_id=$1 AND id=$2 FOR UPDATE`, a.CompanyID, id).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && newName == nil && old == nil) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE pasien SET consent_file=$3, updated_at=now() WHERE company_id=$1 AND id=$2`, a.CompanyID, id, newName); err != nil {
		return nil, err
	}
	action := "pasien.consent_uploaded"
	if newName == nil {
		action = "pasien.consent_deleted"
	}
	if err = s.log(ctx, tx, a, action, "pasien", id, nil); err != nil {
		return nil, err
	}
	return old, tx.Commit(ctx)
}

func (s *Service) ConsentFile(ctx context.Context, companyID, id string) (*os.File, error) {
	if !isUUID(id) {
		return nil, ErrNotFound
	}
	var name *string
	err := s.db.QueryRow(ctx, `SELECT consent_file FROM pasien WHERE company_id=$1 AND id=$2`, companyID, id).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.openFile(name)
}
