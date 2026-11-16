package pgerr

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// ConstraintName returns the violated constraint/index name, or "".
func ConstraintName(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.ConstraintName
	}
	return ""
}

// IsUniqueViolation reports SQLSTATE 23505 anywhere in the error chain.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
