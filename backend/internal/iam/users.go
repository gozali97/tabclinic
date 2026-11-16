package iam

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/nicofx/real-clinic/backend/internal/audit"
)

var (
	ErrUserNotFound = errors.New("pengguna tidak ditemukan")
	ErrLastAdmin    = errors.New("minimal harus ada satu admin aktif")
	ErrSelf         = errors.New("tidak bisa menonaktifkan atau mencabut admin akun sendiri")
)

// UserValidationError is a client mistake on user management; handlers map it to 422.
type UserValidationError struct{ Field, Message string }

func (e *UserValidationError) Error() string { return e.Message }

type UserRow struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Status    string    `json:"status"`
	Roles     []string  `json:"roles"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Service) ListUsers(ctx context.Context, companyID string) ([]UserRow, error) {
	rows, err := s.db.Query(ctx,
		`SELECT u.id::text, u.email, u.full_name, u.status, u.created_at,
		   COALESCE(ARRAY(SELECT DISTINCT r.role FROM user_roles r WHERE r.user_id=u.id AND r.company_id=u.company_id
		     AND r.valid_from <= now() AND (r.valid_until IS NULL OR r.valid_until > now()) ORDER BY r.role), '{}')
		 FROM users u WHERE u.company_id=$1 AND NOT u.is_superadmin ORDER BY u.status, u.full_name`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Status, &u.CreatedAt, &u.Roles); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

type UpdateUserRequest struct {
	FullName *string   `json:"full_name"`
	Status   *string   `json:"status"`
	Roles    *[]string `json:"roles"`
	Password *string   `json:"password"`
}

// UpdateUser edits name/status/roles/password; deactivation and role changes revoke the user's sessions.
func (s *Service) UpdateUser(ctx context.Context, companyID, userID, actorID string, req UpdateUserRequest) error {
	if req.FullName != nil && strings.TrimSpace(*req.FullName) == "" {
		return &UserValidationError{"full_name", "Nama wajib diisi"}
	}
	if req.Status != nil && *req.Status != "active" && *req.Status != "inactive" {
		return &UserValidationError{"status", "Status harus active atau inactive"}
	}
	if req.Password != nil && (len(*req.Password) < 8 || len(*req.Password) > 72) {
		return &UserValidationError{"password", "Password 8\u201372 karakter"}
	}
	var roles []string
	if req.Roles != nil {
		seen := map[string]bool{}
		for _, r := range *req.Roles {
			if !ValidRoles[r] {
				return &UserValidationError{"roles", "Peran tidak dikenal: " + r}
			}
			if !seen[r] {
				seen[r] = true
				roles = append(roles, r)
			}
		}
		if len(roles) == 0 {
			return &UserValidationError{"roles", "Minimal satu peran"}
		}
		sort.Strings(roles)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Serialises user edits per company so two admins cannot demote each other at the same time.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('users:' || $1))`, companyID); err != nil {
		return err
	}
	var branchID string
	err = tx.QueryRow(ctx,
		`SELECT COALESCE((SELECT branch_id::text FROM user_roles WHERE user_id=u.id ORDER BY created_at LIMIT 1),
		   (SELECT id::text FROM branches WHERE company_id=u.company_id AND is_active ORDER BY created_at LIMIT 1))
		 FROM users u WHERE u.id::text=$1 AND u.company_id=$2 AND NOT u.is_superadmin FOR UPDATE`, userID, companyID).Scan(&branchID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}
	removesAdmin := (req.Status != nil && *req.Status == "inactive") || (req.Roles != nil && !contains(roles, RoleAdmin))
	if removesAdmin && userID == actorID {
		return ErrSelf
	}

	if req.FullName != nil {
		if _, err = tx.Exec(ctx, `UPDATE users SET full_name=$1, updated_at=now() WHERE id::text=$2`, strings.TrimSpace(*req.FullName), userID); err != nil {
			return err
		}
	}
	if req.Status != nil {
		if _, err = tx.Exec(ctx, `UPDATE users SET status=$1, failed_logins=0, updated_at=now() WHERE id::text=$2`, *req.Status, userID); err != nil {
			return err
		}
	}
	if req.Password != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE users SET password_hash=$1, updated_at=now() WHERE id::text=$2`, string(hash), userID); err != nil {
			return err
		}
	}
	if req.Roles != nil {
		if _, err = tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id::text=$1 AND company_id=$2`, userID, companyID); err != nil {
			return err
		}
		for _, r := range roles {
			if _, err = tx.Exec(ctx, `INSERT INTO user_roles (user_id, company_id, branch_id, role) VALUES ($1,$2,$3,$4)`,
				userID, companyID, branchID, r); err != nil {
				return err
			}
		}
	}
	if removesAdmin {
		var admins int
		if err = tx.QueryRow(ctx,
			`SELECT count(DISTINCT u.id) FROM users u JOIN user_roles r ON r.user_id=u.id AND r.company_id=u.company_id
			 WHERE u.company_id=$1 AND u.status='active' AND r.role='admin'`, companyID).Scan(&admins); err != nil {
			return err
		}
		if admins == 0 {
			return ErrLastAdmin
		}
	}
	if req.Status != nil || req.Roles != nil || req.Password != nil {
		if _, err = tx.Exec(ctx, `UPDATE sessions SET revoked=true WHERE user_id::text=$1 AND NOT revoked`, userID); err != nil {
			return err
		}
	}
	meta := map[string]interface{}{}
	if req.Status != nil {
		meta["status"] = *req.Status
	}
	if req.Roles != nil {
		meta["roles"] = roles
	}
	if req.Password != nil {
		meta["password_reset"] = true
	}
	if err = s.audit.LogTx(ctx, tx, audit.Event{CompanyID: companyID, ActorID: actorID, Action: "user.updated",
		ObjectType: "user", ObjectID: userID, Metadata: meta}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// ChangeOwnPassword sets a new password after checking the current one (SI-Shina "ganti password").
// Every other session of the user is revoked; the current session stays signed in.
func (s *Service) ChangeOwnPassword(ctx context.Context, sess *Session, current, next string) error {
	if len(next) < 8 || len(next) > 72 {
		return &UserValidationError{"new_password", "Password baru 8–72 karakter"}
	}
	if next == current {
		return &UserValidationError{"new_password", "Password baru harus berbeda dari password lama"}
	}
	if err := s.VerifyPassword(ctx, sess.UserID, current); err != nil {
		return &UserValidationError{"current_password", "Password lama salah"}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE users SET password_hash=$1, failed_logins=0, updated_at=now() WHERE id::text=$2`, string(hash), sess.UserID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE sessions SET revoked=true WHERE user_id::text=$1 AND id<>$2 AND NOT revoked`, sess.UserID, sess.ID); err != nil {
		return err
	}
	if err = s.audit.LogTx(ctx, tx, audit.Event{CompanyID: sess.CompanyID, ActorID: sess.UserID, ActorRoles: sess.Roles,
		Action: "user.password_changed", ObjectType: "user", ObjectID: sess.UserID}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
