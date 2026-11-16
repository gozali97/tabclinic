package iam

import "time"

type User struct {
	ID           string    `json:"id"`
	CompanyID    string    `json:"company_id"`
	Email        string    `json:"email"`
	FullName     string    `json:"full_name"`
	Status       string    `json:"status"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type RoleAssignment struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	CompanyID  string     `json:"company_id"`
	BranchID   string     `json:"branch_id"`
	Role       string     `json:"role"`
	ValidFrom  time.Time  `json:"valid_from"`
	ValidUntil *time.Time `json:"valid_until,omitempty"`
}

// Session is internal; API responses use Me so the session id stays in the cookie.
type Session struct {
	ID           string
	UserID       string
	CompanyID    string // "" until a superadmin selects a company
	BranchID     string
	Roles        []string
	IsSuperadmin bool
	ExpiresAt    time.Time
}

type Me struct {
	UserID       string    `json:"user_id"`
	Email        string    `json:"email"`
	FullName     string    `json:"full_name"`
	IsSuperadmin bool      `json:"is_superadmin"`
	CompanyID    *string   `json:"company_id"`
	CompanyName  *string   `json:"company_name"`
	BranchID     *string   `json:"branch_id"`
	Roles        []string  `json:"roles"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CreateUserRequest struct {
	Email    string   `json:"email"`
	Password string   `json:"password"`
	FullName string   `json:"full_name"`
	Roles    []string `json:"roles"`
	BranchID string   `json:"branch_id"`
}

// Peran mengikuti SI-Shina: Admin, Pendaftaran, Dokter, Apotek.
const (
	RoleAdmin       = "admin"
	RolePendaftaran = "pendaftaran"
	RoleDokter      = "dokter"
	RoleApotek      = "apotek"
)

var ValidRoles = map[string]bool{
	RoleAdmin: true, RolePendaftaran: true, RoleDokter: true, RoleApotek: true,
}
