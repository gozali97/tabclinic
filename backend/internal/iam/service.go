package iam

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/nicofx/real-clinic/backend/internal/audit"
)

type Service struct {
	db              *pgxpool.Pool
	audit           *audit.Service
	sessionDuration time.Duration
}

func NewService(db *pgxpool.Pool, auditSvc *audit.Service, sessionDuration time.Duration) *Service {
	return &Service{db: db, audit: auditSvc, sessionDuration: sessionDuration}
}

func (s *Service) CreateUser(ctx context.Context, companyID, actorID string, req CreateUserRequest) (*User, error) {
	req.Email, req.FullName = strings.TrimSpace(req.Email), strings.TrimSpace(req.FullName)
	address, err := mail.ParseAddress(req.Email)
	switch {
	case err != nil || address.Address != req.Email:
		return nil, &UserValidationError{"email", "Email tidak valid"}
	case req.FullName == "":
		return nil, &UserValidationError{"full_name", "Nama wajib diisi"}
	case len(req.Roles) == 0:
		return nil, &UserValidationError{"roles", "Minimal satu peran"}
	case len(req.Password) < 8 || len(req.Password) > 72:
		return nil, &UserValidationError{"password", "Password 8–72 karakter"}
	}
	for _, role := range req.Roles {
		if !ValidRoles[role] {
			return nil, &UserValidationError{"roles", "Peran tidak dikenal: " + role}
		}
	}
	var taken bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=lower($1))`, req.Email).Scan(&taken); err != nil {
		return nil, err
	}
	if taken {
		return nil, &UserValidationError{"email", "Email sudah dipakai"}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	userID := uuid.New().String()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var validBranch bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branches WHERE id=$1 AND company_id=$2 AND is_active)`, req.BranchID, companyID).Scan(&validBranch); err != nil {
		return nil, err
	}
	if !validBranch {
		return nil, fmt.Errorf("branch does not belong to company or is inactive")
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO users (id, company_id, email, password_hash, full_name)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, companyID, req.Email, string(hash), req.FullName)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	branchID := req.BranchID
	for _, role := range req.Roles {
		if !ValidRoles[role] {
			return nil, fmt.Errorf("invalid role: %s", role)
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO user_roles (user_id, company_id, branch_id, role)
			 VALUES ($1, $2, $3, $4)`,
			userID, companyID, branchID, role)
		if err != nil {
			return nil, fmt.Errorf("assign role: %w", err)
		}
	}

	if actorID == "" {
		actorID = userID
	}
	_ = s.audit.LogTx(ctx, tx, audit.Event{
		CompanyID: companyID, ActorID: actorID,
		Action: "user.created", ObjectType: "user", ObjectID: userID,
		Metadata: map[string]interface{}{"roles": req.Roles},
	})

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &User{
		ID: userID, CompanyID: companyID, Email: req.Email,
		FullName: req.FullName, Status: "active",
	}, nil
}

var ErrInvalidCredentials = errors.New("email atau password salah")
var ErrNoAccess = errors.New("akun tidak memiliki akses aktif")

// BusinessRoles is every role a superadmin acts with once a company is selected.
func BusinessRoles() []string {
	roles := make([]string, 0, len(ValidRoles))
	for r := range ValidRoles {
		roles = append(roles, r)
	}
	sort.Strings(roles)
	return roles
}

func (s *Service) Authenticate(ctx context.Context, email, password string) (*Session, error) {
	var userID, status, pwHash string
	var companyID *string
	var superadmin bool
	err := s.db.QueryRow(ctx,
		`SELECT id::text, company_id::text, status, password_hash, is_superadmin
		 FROM users WHERE lower(email)=lower($1)`, strings.TrimSpace(email)).
		Scan(&userID, &companyID, &status, &pwHash, &superadmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(pwHash), []byte(password)) != nil {
		s.db.Exec(ctx, `UPDATE users SET failed_logins = failed_logins+1 WHERE id=$1`, userID)
		return nil, ErrInvalidCredentials
	}
	if status != "active" {
		return nil, ErrNoAccess
	}
	s.db.Exec(ctx, `UPDATE users SET failed_logins = 0 WHERE id=$1`, userID)

	sess := &Session{ID: uuid.New().String(), UserID: userID, Roles: []string{}, IsSuperadmin: superadmin, ExpiresAt: time.Now().Add(s.sessionDuration)}
	if !superadmin {
		if companyID == nil {
			return nil, ErrNoAccess
		}
		roles, branchID, err := s.getUserRoles(ctx, userID, *companyID)
		if err != nil {
			return nil, err
		}
		if len(roles) == 0 {
			return nil, ErrNoAccess
		}
		sess.CompanyID, sess.BranchID, sess.Roles = *companyID, branchID, roles
	}

	_, err = s.db.Exec(ctx,
		`INSERT INTO sessions (id, user_id, company_id, branch_id, roles, expires_at)
		 VALUES ($1, $2, NULLIF($3,'')::uuid, NULLIF($4,'')::uuid, $5, $6)`,
		sess.ID, sess.UserID, sess.CompanyID, sess.BranchID, sess.Roles, sess.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	if sess.CompanyID != "" {
		_ = s.audit.Log(ctx, audit.Event{CompanyID: sess.CompanyID, ActorID: userID, Action: "user.login", ObjectType: "session", ObjectID: sess.ID})
	}
	return sess, nil
}

func (s *Service) GetSession(ctx context.Context, sessionID string) (*Session, error) {
	var sess Session
	var companyID, branchID *string
	err := s.db.QueryRow(ctx,
		`SELECT s.id::text, s.user_id::text, s.company_id::text, s.branch_id::text, u.is_superadmin, s.expires_at,
		 ARRAY(SELECT DISTINCT ra.role FROM user_roles ra
		       WHERE ra.user_id=s.user_id AND ra.company_id=s.company_id AND ra.branch_id=s.branch_id
		       AND ra.valid_from <= now() AND (ra.valid_until IS NULL OR ra.valid_until > now()))
		 FROM sessions s
		 JOIN users u ON u.id=s.user_id AND u.status='active' AND (u.is_superadmin OR u.company_id=s.company_id)
		 LEFT JOIN companies c ON c.id=s.company_id
		 LEFT JOIN branches b ON b.id=s.branch_id AND b.company_id=s.company_id
		 WHERE s.id=$1 AND NOT s.revoked AND s.expires_at > now()
		   AND (s.company_id IS NULL OR (c.status='active' AND b.is_active))`,
		sessionID).Scan(&sess.ID, &sess.UserID, &companyID, &branchID, &sess.IsSuperadmin, &sess.ExpiresAt, &sess.Roles)
	if err != nil {
		return nil, err
	}
	if companyID != nil {
		sess.CompanyID = *companyID
	}
	if branchID != nil {
		sess.BranchID = *branchID
	}
	if sess.IsSuperadmin {
		sess.Roles = nil
		if sess.CompanyID != "" {
			sess.Roles = BusinessRoles()
		}
		return &sess, nil
	}
	if sess.CompanyID == "" || len(sess.Roles) == 0 {
		return nil, ErrNoAccess
	}
	return &sess, nil
}

// SelectCompany binds a superadmin session to a company and its first active branch.
func (s *Service) SelectCompany(ctx context.Context, sess *Session, companyID string) error {
	if !sess.IsSuperadmin {
		return ErrNoAccess
	}
	var branchID string
	err := s.db.QueryRow(ctx,
		`SELECT b.id::text FROM branches b JOIN companies c ON c.id=b.company_id
		 WHERE c.id::text=$1 AND c.status='active' AND b.is_active ORDER BY b.created_at LIMIT 1`, companyID).Scan(&branchID)
	if err != nil {
		return err
	}
	if _, err = s.db.Exec(ctx, `UPDATE sessions SET company_id=$1, branch_id=$2 WHERE id=$3`, companyID, branchID, sess.ID); err != nil {
		return err
	}
	_ = s.audit.Log(ctx, audit.Event{CompanyID: companyID, ActorID: sess.UserID, Action: "session.company_selected", ObjectType: "session", ObjectID: sess.ID})
	return nil
}

func (s *Service) Me(ctx context.Context, sess *Session) (*Me, error) {
	me := &Me{UserID: sess.UserID, IsSuperadmin: sess.IsSuperadmin, Roles: sess.Roles, ExpiresAt: sess.ExpiresAt}
	if me.Roles == nil {
		me.Roles = []string{}
	}
	var companyName *string
	err := s.db.QueryRow(ctx,
		`SELECT u.email, u.full_name, (SELECT name FROM companies WHERE id::text=$2) FROM users u WHERE u.id::text=$1`,
		sess.UserID, sess.CompanyID).Scan(&me.Email, &me.FullName, &companyName)
	if err != nil {
		return nil, err
	}
	if sess.CompanyID != "" {
		cid, bid := sess.CompanyID, sess.BranchID
		me.CompanyID, me.BranchID, me.CompanyName = &cid, &bid, companyName
	}
	return me, nil
}

var ErrReauthFailed = errors.New("password salah")

// VerifyPassword re-authenticates the signed-in user before sensitive actions (SEC-003, VIS-007).
func (s *Service) VerifyPassword(ctx context.Context, userID, password string) error {
	var hash string
	if err := s.db.QueryRow(ctx, `SELECT password_hash FROM users WHERE id::text=$1 AND status='active'`, userID).Scan(&hash); err != nil {
		return ErrReauthFailed
	}
	if password == "" || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		s.db.Exec(ctx, `UPDATE users SET failed_logins = failed_logins+1 WHERE id::text=$1`, userID)
		return ErrReauthFailed
	}
	return nil
}

func (s *Service) RevokeSession(ctx context.Context, sessionID string) error {
	_, err := s.db.Exec(ctx, `UPDATE sessions SET revoked=true WHERE id=$1`, sessionID)
	return err
}

func (s *Service) getUserRoles(ctx context.Context, userID, companyID string) ([]string, string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT ra.role, ra.branch_id FROM user_roles ra
		 JOIN branches b ON b.id=ra.branch_id AND b.company_id=ra.company_id AND b.is_active
		 JOIN companies t ON t.id=ra.company_id AND t.status='active'
		 WHERE ra.user_id=$1 AND ra.company_id=$2 AND ra.valid_from <= now()
		 AND (ra.valid_until IS NULL OR ra.valid_until > now()) ORDER BY ra.branch_id, ra.role`,
		userID, companyID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var roles []string
	var branchID string
	for rows.Next() {
		var role, bid string
		if err := rows.Scan(&role, &bid); err != nil {
			return nil, "", err
		}
		if branchID != "" && branchID != bid {
			continue
		}
		roles = append(roles, role)
		branchID = bid
	}
	return roles, branchID, rows.Err()
}

func (s *Service) HasRole(roles []string, required ...string) bool {
	for _, r := range roles {
		for _, req := range required {
			if r == req {
				return true
			}
		}
	}
	return false
}

func (s *Service) GetUserByID(ctx context.Context, companyID, userID string) (*User, error) {
	var u User
	err := s.db.QueryRow(ctx,
		`SELECT id, company_id, email, full_name, status, created_at
		 FROM users WHERE id=$1 AND company_id=$2`, userID, companyID).
		Scan(&u.ID, &u.CompanyID, &u.Email, &u.FullName, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
