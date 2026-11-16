package audit

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	CompanyID  string
	BranchID   string
	ActorID    string
	ActorRoles []string
	Action     string
	ObjectType string
	ObjectID   string
	IPAddress  string
	UserAgent  string
	Reason     string
	RequestID  string
	Metadata   map[string]interface{}
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Log writes an audit event. Can use a tx or pool connection.
func (s *Service) Log(ctx context.Context, e Event) error {
	return s.LogTx(ctx, nil, e)
}

func (s *Service) LogTx(ctx context.Context, tx pgx.Tx, e Event) error {
	q := `INSERT INTO audit_events
		(company_id, branch_id, actor_id, actor_roles, action, object_type, object_id,
		 ip_address, user_agent, reason, request_id, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	args := []interface{}{
		nilIfEmpty(e.CompanyID), nilIfEmpty(e.BranchID), nilIfEmpty(e.ActorID),
		e.ActorRoles, e.Action, e.ObjectType, e.ObjectID,
		nilIfEmpty(e.IPAddress), e.UserAgent, nilIfEmpty(e.Reason),
		nilIfEmpty(e.RequestID), e.Metadata,
	}

	if tx != nil {
		_, err := tx.Exec(ctx, q, args...)
		return err
	}
	_, err := s.db.Exec(ctx, q, args...)
	return err
}

func (s *Service) LogEntityChange(ctx context.Context, tx pgx.Tx, companyID, entityType, entityID, field, oldVal, newVal, actorID, reason, reqID string) error {
	q := `INSERT INTO audit_entity_history
		(company_id, entity_type, entity_id, field_name, old_value, new_value, actor_id, reason, request_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	if tx != nil {
		_, err := tx.Exec(ctx, q, companyID, entityType, entityID, field, oldVal, newVal, nilIfEmpty(actorID), nilIfEmpty(reason), nilIfEmpty(reqID))
		return err
	}
	_, err := s.db.Exec(ctx, q, companyID, entityType, entityID, field, oldVal, newVal, nilIfEmpty(actorID), nilIfEmpty(reason), nilIfEmpty(reqID))
	return err
}

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
