package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/nicofx/real-clinic/backend/internal/audit"
	"github.com/nicofx/real-clinic/backend/internal/bootstrap"
	"github.com/nicofx/real-clinic/backend/internal/company"
	"github.com/nicofx/real-clinic/backend/internal/iam"
	"github.com/nicofx/real-clinic/backend/internal/klinik"
	"github.com/nicofx/real-clinic/backend/internal/platform"
	"github.com/nicofx/real-clinic/backend/internal/visitrequests"
	"github.com/nicofx/real-clinic/backend/migrations"
	mw "github.com/nicofx/real-clinic/backend/pkg/middleware"
	"github.com/nicofx/real-clinic/backend/pkg/pgerr"
	"github.com/nicofx/real-clinic/backend/pkg/response"
)

func main() {
	cfg, err := platform.LoadConfig()
	if err != nil {
		log.Fatalf("Config: %v", err)
	}
	db, err := platform.NewDBPool(cfg)
	if err != nil {
		log.Fatalf("DB: %v", err)
	}
	defer db.Close()
	startup, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	if cfg.AutoMigrate {
		if err := migrations.Migrate(startup, db); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Print("Database migrations up to date")
	}
	if cfg.SeedEnabled {
		if err := bootstrap.Seed(startup, db, cfg.SeedPassword); err != nil {
			log.Fatalf("Seeder failed: %v", err)
		}
		log.Printf("Demo seed ready; superadmin: %s", bootstrap.SuperadminEmail)
	}
	cancel()

	auditSvc := audit.NewService(db)
	companySvc := company.NewService(db, auditSvc)
	iamSvc := iam.NewService(db, auditSvc, cfg.SessionDuration)
	k := klinik.NewService(db, auditSvc, cfg.FilesDir)

	mux := http.NewServeMux()
	a := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, 200, map[string]string{"status": "ok"})
	})

	userError := func(w http.ResponseWriter, r *http.Request, err error) {
		var ve *iam.UserValidationError
		switch {
		case errors.As(err, &ve):
			response.ValidationError(w, map[string]string{ve.Field: ve.Message})
		case errors.Is(err, iam.ErrUserNotFound):
			response.NotFound(w)
		case errors.Is(err, iam.ErrLastAdmin), errors.Is(err, iam.ErrSelf):
			response.Conflict(w, err.Error())
		case pgerr.IsUniqueViolation(err):
			response.ValidationError(w, map[string]string{"email": "Email sudah dipakai"})
		default:
			response.Internal(w, r, err)
		}
	}
	sessionCookie := func(w http.ResponseWriter, value string, maxAge int) {
		http.SetCookie(w, &http.Cookie{Name: "session_id", Value: value, Path: "/", HttpOnly: true, Secure: cfg.CookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
	}
	writeMe := func(w http.ResponseWriter, r *http.Request, sess *iam.Session) {
		me, err := iamSvc.Me(r.Context(), sess)
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		response.JSON(w, 200, me)
	}

	// ===== PUBLIC =====
	mux.Handle("POST /api/v1/auth/login", mw.RateLimit(10, time.Minute, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req iam.LoginRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
			response.Error(w, 400, "BAD_REQUEST", "Email dan password wajib diisi")
			return
		}
		sess, err := iamSvc.Authenticate(r.Context(), req.Email, req.Password)
		if errors.Is(err, iam.ErrInvalidCredentials) || errors.Is(err, iam.ErrNoAccess) {
			response.Error(w, 401, "UNAUTHORIZED", err.Error())
			return
		}
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		sessionCookie(w, sess.ID, int(cfg.SessionDuration/time.Second))
		writeMe(w, r, sess)
	})))
	// Form "Jadwalkan kunjungan" di landing page.
	mux.Handle("POST /api/v1/visit-requests", mw.RateLimit(10, time.Minute, visitrequests.NewHandler(db, cfg.LandingCompanyID)))

	// ===== SESSION & COMPANY =====
	a.HandleFunc("GET /api/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		writeMe(w, r, mw.Session(r.Context()))
	})
	a.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		_ = iamSvc.RevokeSession(r.Context(), mw.Session(r.Context()).ID)
		sessionCookie(w, "", -1)
		response.JSON(w, 200, map[string]string{"status": "logged_out"})
	})
	// Ganti password sendiri; sesi lain milik user dicabut.
	a.HandleFunc("POST /api/v1/auth/password", mw.RateLimit(10, time.Minute, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			CurrentPassword string `json:"current_password"`
			NewPassword     string `json:"new_password"`
		}
		if !response.Decode(w, r, &req) {
			return
		}
		if err := iamSvc.ChangeOwnPassword(r.Context(), mw.Session(r.Context()), req.CurrentPassword, req.NewPassword); err != nil {
			userError(w, r, err)
			return
		}
		response.JSON(w, 200, map[string]string{"status": "ok"})
	})).ServeHTTP)
	a.HandleFunc("POST /api/v1/auth/select-company", func(w http.ResponseWriter, r *http.Request) {
		sess := mw.Session(r.Context())
		if !sess.IsSuperadmin {
			response.Forbidden(w)
			return
		}
		var req struct {
			CompanyID string `json:"company_id"`
		}
		if !response.Decode(w, r, &req) {
			return
		}
		if req.CompanyID == "" {
			response.Error(w, 400, "BAD_REQUEST", "company_id wajib diisi")
			return
		}
		if err := iamSvc.SelectCompany(r.Context(), sess, req.CompanyID); err != nil {
			response.NotFound(w)
			return
		}
		updated, err := iamSvc.GetSession(r.Context(), sess.ID)
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		writeMe(w, r, updated)
	})
	a.HandleFunc("GET /api/v1/companies", func(w http.ResponseWriter, r *http.Request) {
		list, err := companySvc.ListCompanies(r.Context())
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		if !mw.IsSuperadmin(r.Context()) {
			own := []company.Company{}
			for _, c := range list {
				if c.ID == mw.CompanyID(r.Context()) {
					own = append(own, c)
				}
			}
			list = own
		}
		response.JSON(w, 200, list)
	})
	a.HandleFunc("POST /api/v1/companies", func(w http.ResponseWriter, r *http.Request) {
		var req company.CreateCompanyRequest
		if !response.Decode(w, r, &req) {
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			response.ValidationError(w, map[string]string{"name": "Nama company wajib diisi"})
			return
		}
		req.Mode = "klinik"
		c, b, err := companySvc.CreateCompany(r.Context(), req)
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		response.JSON(w, 201, map[string]any{"company": c, "branch": b})
	})
	// Petugas (pendaftaran/apotek/admin). Akun dokter dibuat lewat menu Dokter.
	a.HandleFunc("POST /api/v1/companies/{companyId}/users", func(w http.ResponseWriter, r *http.Request) {
		cid := r.PathValue("companyId")
		if cid != mw.CompanyID(r.Context()) && !mw.IsSuperadmin(r.Context()) {
			response.NotFound(w)
			return
		}
		if c, err := companySvc.GetCompany(r.Context(), cid); err != nil || c.Status != "active" {
			response.NotFound(w)
			return
		}
		var req iam.CreateUserRequest
		if !response.Decode(w, r, &req) {
			return
		}
		for _, role := range req.Roles {
			if role == iam.RoleDokter {
				response.ValidationError(w, map[string]string{"roles": "Akun dokter dibuat dari menu Dokter"})
				return
			}
		}
		if br, _ := companySvc.GetBranches(r.Context(), cid); len(br) > 0 && req.BranchID == "" {
			req.BranchID = br[0].ID
		}
		u, err := iamSvc.CreateUser(r.Context(), cid, mw.UserID(r.Context()), req)
		if err != nil {
			userError(w, r, err)
			return
		}
		response.JSON(w, 201, u)
	})
	a.HandleFunc("GET /api/v1/users", func(w http.ResponseWriter, r *http.Request) {
		out, err := iamSvc.ListUsers(r.Context(), mw.CompanyID(r.Context()))
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		response.JSON(w, 200, map[string]any{"users": out, "roles": iam.BusinessRoles()})
	})
	a.HandleFunc("PATCH /api/v1/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req iam.UpdateUserRequest
		if !response.Decode(w, r, &req) {
			return
		}
		if req.Roles != nil {
			for _, role := range *req.Roles {
				if role == iam.RoleDokter {
					response.ValidationError(w, map[string]string{"roles": "Peran dokter diatur dari menu Dokter"})
					return
				}
			}
		}
		if err := iamSvc.UpdateUser(r.Context(), mw.CompanyID(r.Context()), r.PathValue("id"), mw.UserID(r.Context()), req); err != nil {
			userError(w, r, err)
			return
		}
		response.JSON(w, 200, map[string]string{"status": "ok"})
	})

	// ===== KLINIK =====
	actor := func(r *http.Request) klinik.Actor {
		return klinik.Actor{CompanyID: mw.CompanyID(r.Context()), UserID: mw.UserID(r.Context()), Roles: mw.Roles(r.Context()), Super: mw.IsSuperadmin(r.Context())}
	}
	fail := func(w http.ResponseWriter, r *http.Request, err error) {
		var ve *klinik.ValidationError
		var ce *klinik.ConflictError
		switch {
		case klinik.IsForbidden(err):
			response.Error(w, http.StatusForbidden, "FORBIDDEN", err.Error())
		case errors.As(err, &ve):
			response.ValidationError(w, map[string]string{ve.Field: ve.Message})
		case errors.As(err, &ce):
			response.Error(w, http.StatusConflict, ce.Code, ce.Message)
		case errors.Is(err, klinik.ErrNotFound):
			response.NotFound(w)
		default:
			response.Internal(w, r, err)
		}
	}
	// reply writes v on success or maps err.
	reply := func(w http.ResponseWriter, r *http.Request, status int, v any, err error) {
		if err != nil {
			fail(w, r, err)
			return
		}
		response.JSON(w, status, v)
	}
	ok := map[string]string{"status": "ok"}
	q := func(r *http.Request, key string) string { return strings.TrimSpace(r.URL.Query().Get(key)) }
	qi := func(r *http.Request, key string) int { n, _ := strconv.Atoi(r.URL.Query().Get(key)); return n }
	created := func(w http.ResponseWriter, r *http.Request, id string, err error) {
		reply(w, r, 201, map[string]string{"id": id}, err)
	}
	// dokterScope limits a dokter-only login to its own rekam, like SI-Shina.
	dokterScope := func(r *http.Request) (string, error) {
		ac := actor(r)
		if ac.Super || ac.Has(iam.RoleAdmin) || ac.Has(iam.RolePendaftaran) || ac.Has(iam.RoleApotek) {
			return "", nil
		}
		id, err := k.DokterForUser(r.Context(), ac.CompanyID, ac.UserID)
		if id == "" && err == nil {
			id = "00000000-0000-0000-0000-000000000000"
		}
		return id, err
	}

	a.HandleFunc("GET /api/v1/dashboard", func(w http.ResponseWriter, r *http.Request) {
		d, err := k.GetDashboard(r.Context(), actor(r))
		reply(w, r, 200, d, err)
	})
	a.HandleFunc("GET /api/v1/kondisi-gigi", func(w http.ResponseWriter, r *http.Request) {
		list, err := k.ListKondisiGigi(r.Context())
		reply(w, r, 200, list, err)
	})

	// -- Poli --
	a.HandleFunc("GET /api/v1/poli", func(w http.ResponseWriter, r *http.Request) {
		list, err := k.ListPoli(r.Context(), mw.CompanyID(r.Context()), q(r, "active") == "1")
		reply(w, r, 200, list, err)
	})
	a.HandleFunc("POST /api/v1/poli", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.PoliInput
		if response.Decode(w, r, &in) {
			id, err := k.SavePoli(r.Context(), actor(r), "", in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("PATCH /api/v1/poli/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.PoliInput
		if response.Decode(w, r, &in) {
			_, err := k.SavePoli(r.Context(), actor(r), r.PathValue("id"), in)
			reply(w, r, 200, ok, err)
		}
	})
	a.HandleFunc("DELETE /api/v1/poli/{id}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeletePoli(r.Context(), actor(r), r.PathValue("id")))
	})

	// -- Dokter --
	a.HandleFunc("GET /api/v1/dokter", func(w http.ResponseWriter, r *http.Request) {
		list, err := k.ListDokter(r.Context(), mw.CompanyID(r.Context()), q(r, "poli_id"), q(r, "active") == "1")
		reply(w, r, 200, list, err)
	})
	a.HandleFunc("POST /api/v1/dokter", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.DokterInput
		if response.Decode(w, r, &in) {
			id, err := k.CreateDokter(r.Context(), actor(r), in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("PATCH /api/v1/dokter/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.DokterInput
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.UpdateDokter(r.Context(), actor(r), r.PathValue("id"), in))
		}
	})

	// -- Pasien --
	a.HandleFunc("GET /api/v1/pasien", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.ListPasien(r.Context(), mw.CompanyID(r.Context()), q(r, "q"), qi(r, "page"), qi(r, "size"))
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("GET /api/v1/pasien/next-rm", func(w http.ResponseWriter, r *http.Request) {
		no, err := k.NextNoRM(r.Context(), mw.CompanyID(r.Context()), q(r, "kategori"), q(r, "nama"))
		reply(w, r, 200, map[string]string{"no_rm": no}, err)
	})
	a.HandleFunc("POST /api/v1/pasien", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.PasienInput
		if response.Decode(w, r, &in) {
			id, err := k.SavePasien(r.Context(), actor(r), "", in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("GET /api/v1/pasien/{id}", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.GetPasien(r.Context(), mw.CompanyID(r.Context()), r.PathValue("id"))
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("PATCH /api/v1/pasien/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.PasienInput
		if response.Decode(w, r, &in) {
			_, err := k.SavePasien(r.Context(), actor(r), r.PathValue("id"), in)
			reply(w, r, 200, ok, err)
		}
	})
	a.HandleFunc("DELETE /api/v1/pasien/{id}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeletePasien(r.Context(), actor(r), r.PathValue("id")))
	})
	a.HandleFunc("GET /api/v1/pasien/{id}/odontogram", func(w http.ResponseWriter, r *http.Request) {
		list, err := k.Odontogram(r.Context(), mw.CompanyID(r.Context()), r.PathValue("id"))
		reply(w, r, 200, list, err)
	})

	// -- Lampiran foto (JPG/PNG, maks 5 MB, field multipart "file") --
	// uploadedFile streams the "file" part; the service enforces type and size.
	uploadedFile := func(w http.ResponseWriter, r *http.Request, save func(io.Reader) error) {
		r.Body = http.MaxBytesReader(w, r.Body, klinik.MaxFileBytes+(64<<10))
		mr, err := r.MultipartReader()
		if err != nil {
			response.ValidationError(w, map[string]string{"file": "Kirim file sebagai multipart/form-data"})
			return
		}
		for {
			part, err := mr.NextPart()
			if err != nil {
				msg := "File wajib diunggah"
				var tooBig *http.MaxBytesError
				if errors.As(err, &tooBig) {
					msg = "Ukuran file maksimal 5 MB"
				}
				response.ValidationError(w, map[string]string{"file": msg})
				return
			}
			if part.FormName() == "file" {
				err = save(part)
				var tooBig *http.MaxBytesError
				if errors.As(err, &tooBig) {
					err = &klinik.ValidationError{Field: "file", Message: "Ukuran file maksimal 5 MB"}
				}
				reply(w, r, 200, ok, err)
				return
			}
		}
	}
	serveFile := func(w http.ResponseWriter, r *http.Request, f *os.File, err error) {
		if err != nil {
			fail(w, r, err)
			return
		}
		defer f.Close()
		st, err := f.Stat()
		if err != nil {
			response.Internal(w, r, err)
			return
		}
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Content-Disposition", "inline")
		http.ServeContent(w, r, st.Name(), st.ModTime(), f)
	}
	a.HandleFunc("GET /api/v1/pasien/{id}/consent", func(w http.ResponseWriter, r *http.Request) {
		f, err := k.ConsentFile(r.Context(), mw.CompanyID(r.Context()), r.PathValue("id"))
		serveFile(w, r, f, err)
	})
	a.HandleFunc("POST /api/v1/pasien/{id}/consent", func(w http.ResponseWriter, r *http.Request) {
		uploadedFile(w, r, func(body io.Reader) error { return k.SetConsent(r.Context(), actor(r), r.PathValue("id"), body) })
	})
	a.HandleFunc("DELETE /api/v1/pasien/{id}/consent", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.SetConsent(r.Context(), actor(r), r.PathValue("id"), nil))
	})
	rekamFileGet := func(kind string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			f, err := k.RekamFile(r.Context(), actor(r), r.PathValue("id"), kind)
			serveFile(w, r, f, err)
		}
	}
	rekamFilePost := func(kind string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			uploadedFile(w, r, func(body io.Reader) error {
				return k.SetRekamFile(r.Context(), actor(r), r.PathValue("id"), kind, body)
			})
		}
	}
	rekamFileDelete := func(kind string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			reply(w, r, 200, ok, k.SetRekamFile(r.Context(), actor(r), r.PathValue("id"), kind, nil))
		}
	}
	a.HandleFunc("GET /api/v1/rekam/{id}/pemeriksaan/file", rekamFileGet("pemeriksaan"))
	a.HandleFunc("POST /api/v1/rekam/{id}/pemeriksaan/file", rekamFilePost("pemeriksaan"))
	a.HandleFunc("DELETE /api/v1/rekam/{id}/pemeriksaan/file", rekamFileDelete("pemeriksaan"))
	a.HandleFunc("GET /api/v1/rekam/{id}/tindakan/file", rekamFileGet("tindakan"))
	a.HandleFunc("POST /api/v1/rekam/{id}/tindakan/file", rekamFilePost("tindakan"))
	a.HandleFunc("DELETE /api/v1/rekam/{id}/tindakan/file", rekamFileDelete("tindakan"))

	// -- Obat --
	a.HandleFunc("GET /api/v1/obat", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.ListObat(r.Context(), mw.CompanyID(r.Context()), q(r, "q"), qi(r, "page"), qi(r, "size"))
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("POST /api/v1/obat", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.ObatInput
		if response.Decode(w, r, &in) {
			id, err := k.SaveObat(r.Context(), actor(r), "", in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("PATCH /api/v1/obat/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.ObatInput
		if response.Decode(w, r, &in) {
			_, err := k.SaveObat(r.Context(), actor(r), r.PathValue("id"), in)
			reply(w, r, 200, ok, err)
		}
	})
	a.HandleFunc("DELETE /api/v1/obat/{id}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteObat(r.Context(), actor(r), r.PathValue("id")))
	})
	a.HandleFunc("GET /api/v1/obat/riwayat", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.RiwayatObat(r.Context(), mw.CompanyID(r.Context()), q(r, "q"), q(r, "from"), q(r, "to"), qi(r, "page"), qi(r, "size"))
		reply(w, r, 200, p, err)
	})

	// -- Tindakan --
	a.HandleFunc("GET /api/v1/tindakan", func(w http.ResponseWriter, r *http.Request) {
		list, err := k.ListTindakan(r.Context(), mw.CompanyID(r.Context()), q(r, "poli_id"))
		reply(w, r, 200, list, err)
	})
	a.HandleFunc("POST /api/v1/tindakan", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.TindakanInput
		if response.Decode(w, r, &in) {
			id, err := k.SaveTindakan(r.Context(), actor(r), "", in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("PATCH /api/v1/tindakan/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.TindakanInput
		if response.Decode(w, r, &in) {
			_, err := k.SaveTindakan(r.Context(), actor(r), r.PathValue("id"), in)
			reply(w, r, 200, ok, err)
		}
	})
	a.HandleFunc("DELETE /api/v1/tindakan/{id}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteTindakan(r.Context(), actor(r), r.PathValue("id")))
	})

	// -- ICD-10 --
	a.HandleFunc("GET /api/v1/icd", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.ListICD(r.Context(), mw.CompanyID(r.Context()), q(r, "q"), qi(r, "page"), qi(r, "size"))
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("POST /api/v1/icd", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.ICD
		if response.Decode(w, r, &in) {
			reply(w, r, 201, ok, k.SaveICD(r.Context(), actor(r), "", in))
		}
	})
	// Body is CSV text: code,name_id,name_en (max 5 MB).
	a.HandleFunc("POST /api/v1/icd/import", func(w http.ResponseWriter, r *http.Request) {
		n, err := k.ImportICD(r.Context(), actor(r), http.MaxBytesReader(w, r.Body, 5<<20))
		reply(w, r, 200, map[string]int{"imported": n}, err)
	})
	a.HandleFunc("PATCH /api/v1/icd/{code}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.ICD
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.SaveICD(r.Context(), actor(r), r.PathValue("code"), in))
		}
	})
	a.HandleFunc("DELETE /api/v1/icd/{code}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteICD(r.Context(), actor(r), r.PathValue("code")))
	})

	// -- Rekam medis --
	a.HandleFunc("GET /api/v1/rekam", func(w http.ResponseWriter, r *http.Request) {
		f := klinik.RekamFilter{Q: q(r, "q"), PasienID: q(r, "pasien_id"), Date: q(r, "date"), Page: qi(r, "page"), Size: qi(r, "size")}
		for _, v := range strings.Split(q(r, "status"), ",") {
			if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 5 {
				f.Status = append(f.Status, n)
			}
		}
		var err error
		if f.DokterID, err = dokterScope(r); err != nil {
			fail(w, r, err)
			return
		}
		p, err := k.ListRekam(r.Context(), mw.CompanyID(r.Context()), f)
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("POST /api/v1/rekam", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.RekamInput
		if response.Decode(w, r, &in) {
			id, err := k.CreateRekam(r.Context(), actor(r), in)
			created(w, r, id, err)
		}
	})
	a.HandleFunc("GET /api/v1/rekam/{id}", func(w http.ResponseWriter, r *http.Request) {
		d, err := k.GetRekamDetail(r.Context(), actor(r), r.PathValue("id"))
		reply(w, r, 200, d, err)
	})
	a.HandleFunc("PATCH /api/v1/rekam/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.RekamInput
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.UpdateRekam(r.Context(), actor(r), r.PathValue("id"), in))
		}
	})
	a.HandleFunc("DELETE /api/v1/rekam/{id}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteRekam(r.Context(), actor(r), r.PathValue("id")))
	})
	type textBody struct {
		Text        string   `json:"text"`
		TindakanIDs []string `json:"tindakan_ids"`
	}
	a.HandleFunc("PUT /api/v1/rekam/{id}/pemeriksaan", func(w http.ResponseWriter, r *http.Request) {
		var in textBody
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.SetPemeriksaan(r.Context(), actor(r), r.PathValue("id"), in.Text))
		}
	})
	a.HandleFunc("PUT /api/v1/rekam/{id}/tindakan", func(w http.ResponseWriter, r *http.Request) {
		var in textBody
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.SetTindakan(r.Context(), actor(r), r.PathValue("id"), in.Text, in.TindakanIDs))
		}
	})
	a.HandleFunc("PUT /api/v1/rekam/{id}/resep", func(w http.ResponseWriter, r *http.Request) {
		var in textBody
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.SetResep(r.Context(), actor(r), r.PathValue("id"), in.Text))
		}
	})
	a.HandleFunc("POST /api/v1/rekam/{id}/diagnosa", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ICDCode string `json:"icd_code"`
		}
		if response.Decode(w, r, &in) {
			reply(w, r, 201, ok, k.AddDiagnosa(r.Context(), actor(r), r.PathValue("id"), in.ICDCode))
		}
	})
	a.HandleFunc("DELETE /api/v1/rekam/{id}/diagnosa/{diagnosaId}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteDiagnosa(r.Context(), actor(r), r.PathValue("id"), r.PathValue("diagnosaId")))
	})
	a.HandleFunc("POST /api/v1/rekam/{id}/gigi", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.GigiInput
		if response.Decode(w, r, &in) {
			reply(w, r, 201, ok, k.SaveGigi(r.Context(), actor(r), r.PathValue("id"), in))
		}
	})
	a.HandleFunc("DELETE /api/v1/rekam/{id}/gigi/{gigiId}", func(w http.ResponseWriter, r *http.Request) {
		reply(w, r, 200, ok, k.DeleteGigi(r.Context(), actor(r), r.PathValue("id"), r.PathValue("gigiId")))
	})
	a.HandleFunc("POST /api/v1/rekam/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Status int `json:"status"`
		}
		if response.Decode(w, r, &in) {
			reply(w, r, 200, map[string]int{"status": in.Status}, k.SetStatus(r.Context(), actor(r), r.PathValue("id"), in.Status))
		}
	})
	a.HandleFunc("POST /api/v1/rekam/{id}/obat", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Items []klinik.DispenseItem `json:"items"`
		}
		if response.Decode(w, r, &in) {
			next, err := k.Dispense(r.Context(), actor(r), r.PathValue("id"), in.Items)
			reply(w, r, 200, map[string]int{"status": next}, err)
		}
	})
	a.HandleFunc("POST /api/v1/rekam/{id}/pembayaran", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.BayarInput
		if response.Decode(w, r, &in) {
			p, err := k.Bayar(r.Context(), actor(r), r.PathValue("id"), in)
			reply(w, r, 201, p, err)
		}
	})
	a.HandleFunc("GET /api/v1/pembayaran", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.ListPembayaran(r.Context(), mw.CompanyID(r.Context()), q(r, "q"), q(r, "from"), q(r, "to"), qi(r, "page"), qi(r, "size"))
		reply(w, r, 200, p, err)
	})

	// -- Permintaan janji dari landing page --
	a.HandleFunc("GET /api/v1/permintaan-janji", func(w http.ResponseWriter, r *http.Request) {
		p, err := k.ListPermintaan(r.Context(), actor(r), klinik.PermintaanFilter{Q: q(r, "q"), Status: q(r, "status"), Page: qi(r, "page"), Size: qi(r, "size")})
		reply(w, r, 200, p, err)
	})
	a.HandleFunc("PATCH /api/v1/permintaan-janji/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in klinik.PermintaanInput
		if response.Decode(w, r, &in) {
			reply(w, r, 200, ok, k.UpdatePermintaan(r.Context(), actor(r), r.PathValue("id"), in))
		}
	})

	// Mount
	authHandler := mw.Auth(iamSvc)(mw.Authorize(a))
	mux.Handle("/api/v1/", mw.RequestID(authHandler))

	// CSRF: stdlib rejects cross-site POST/PATCH/PUT/DELETE using Sec-Fetch-Site/Origin (no token needed).
	csrf := http.NewCrossOriginProtection()
	csrf.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, http.StatusForbidden, "CSRF", "Permintaan lintas situs ditolak")
	}))
	safe := csrf.Handler(mux)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cache-Control", "no-store")
		safe.ServeHTTP(w, r)
	})

	addr := cfg.ServerAddress()
	log.Printf("TabMedik API starting on %s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}
