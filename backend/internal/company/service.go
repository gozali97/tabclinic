package company

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nicofx/real-clinic/backend/internal/audit"
)

type Company struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Mode      string    `json:"mode"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type Branch struct {
	ID        string    `json:"id"`
	CompanyID string    `json:"company_id"`
	Name      string    `json:"name"`
	Timezone  string    `json:"timezone"`
	Address   string    `json:"address,omitempty"`
	Phone     string    `json:"phone,omitempty"`
	IsActive  bool      `json:"is_active"`
	MRNPrefix string    `json:"mrn_prefix"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateCompanyRequest struct {
	Name       string `json:"name"`
	Mode       string `json:"mode"`
	BranchName string `json:"branch_name"`
	Timezone   string `json:"timezone"`
	MRNPrefix  string `json:"mrn_prefix"`
}

type Service struct {
	db    *pgxpool.Pool
	audit *audit.Service
}

func NewService(db *pgxpool.Pool, auditSvc *audit.Service) *Service {
	return &Service{db: db, audit: auditSvc}
}

func (s *Service) CreateCompany(ctx context.Context, req CreateCompanyRequest) (*Company, *Branch, error) {
	companyID := uuid.New().String()
	branchID := uuid.New().String()

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	tz := req.Timezone
	if tz == "" {
		tz = "Asia/Jakarta"
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO companies (id, name, mode) VALUES ($1, $2, $3)`,
		companyID, req.Name, req.Mode)
	if err != nil {
		return nil, nil, err
	}

	bName := req.BranchName
	if bName == "" {
		bName = req.Name + " — Cabang Utama"
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO branches (id, company_id, name, timezone, mrn_prefix)
		 VALUES ($1, $2, $3, $4, $5)`,
		branchID, companyID, bName, tz, req.MRNPrefix)
	if err != nil {
		return nil, nil, err
	}

	_ = s.audit.LogTx(ctx, tx, audit.Event{
		CompanyID: companyID, Action: "company.created",
		ObjectType: "company", ObjectID: companyID,
	})

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return &Company{ID: companyID, Name: req.Name, Mode: req.Mode, Status: "active"},
		&Branch{ID: branchID, CompanyID: companyID, Name: bName, Timezone: tz, IsActive: true, MRNPrefix: req.MRNPrefix}, nil
}

func (s *Service) ListCompanies(ctx context.Context) ([]Company, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, mode, status, created_at FROM companies WHERE status='active' ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Company{}
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID, &c.Name, &c.Mode, &c.Status, &c.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (s *Service) GetCompany(ctx context.Context, id string) (*Company, error) {
	var t Company
	err := s.db.QueryRow(ctx,
		`SELECT id, name, mode, status, created_at FROM companies WHERE id=$1`, id).
		Scan(&t.ID, &t.Name, &t.Mode, &t.Status, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) GetBranch(ctx context.Context, companyID, branchID string) (*Branch, error) {
	var b Branch
	err := s.db.QueryRow(ctx,
		`SELECT id, company_id, name, timezone, address, phone, is_active, mrn_prefix, created_at
		 FROM branches WHERE id=$1 AND company_id=$2`, branchID, companyID).
		Scan(&b.ID, &b.CompanyID, &b.Name, &b.Timezone, &b.Address, &b.Phone, &b.IsActive, &b.MRNPrefix, &b.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Service) GetBranches(ctx context.Context, companyID string) ([]Branch, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, company_id, name, timezone, is_active, mrn_prefix FROM branches WHERE company_id=$1`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Branch
	for rows.Next() {
		var b Branch
		if err := rows.Scan(&b.ID, &b.CompanyID, &b.Name, &b.Timezone, &b.IsActive, &b.MRNPrefix); err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, nil
}
