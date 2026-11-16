package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/nicofx/real-clinic/backend/internal/iam"
	"github.com/nicofx/real-clinic/backend/pkg/response"
)

type contextKey string

const (
	CtxSession    contextKey = "session"
	CtxCompanyID  contextKey = "company_id"
	CtxBranchID   contextKey = "branch_id"
	CtxUserID     contextKey = "user_id"
	CtxRoles      contextKey = "roles"
	CtxRequestID  contextKey = "request_id"
	CtxSuperadmin contextKey = "superadmin"
)

func Auth(iamSvc *iam.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sessionID := ""
			if c, err := r.Cookie("session_id"); err == nil {
				sessionID = c.Value
			}
			if sessionID == "" {
				auth := r.Header.Get("Authorization")
				if strings.HasPrefix(auth, "Bearer ") {
					sessionID = strings.TrimPrefix(auth, "Bearer ")
				}
			}
			if sessionID == "" {
				response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Sesi tidak ditemukan")
				return
			}

			sess, err := iamSvc.GetSession(r.Context(), sessionID)
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Sesi tidak valid atau kedaluwarsa")
				return
			}

			ctx := context.WithValue(r.Context(), CtxSession, sess)
			ctx = context.WithValue(ctx, CtxCompanyID, sess.CompanyID)
			ctx = context.WithValue(ctx, CtxBranchID, sess.BranchID)
			ctx = context.WithValue(ctx, CtxUserID, sess.UserID)
			ctx = context.WithValue(ctx, CtxRoles, sess.Roles)
			ctx = context.WithValue(ctx, CtxSuperadmin, sess.IsSuperadmin)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRoles, _ := r.Context().Value(CtxRoles).([]string)
			for _, ur := range userRoles {
				for _, rr := range roles {
					if ur == rr {
						next.ServeHTTP(w, r)
						return
					}
				}
			}
			response.Forbidden(w)
		})
	}
}

func Authorize(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pattern := mux.Handler(r)
		if pattern == "" {
			http.NotFound(w, r)
			return
		}
		roles, listed := iam.RouteRoles[pattern]
		if !listed {
			response.Forbidden(w)
			return
		}
		if CompanyID(r.Context()) == "" && !iam.NoCompanyRoutes[pattern] {
			response.Error(w, http.StatusConflict, "COMPANY_REQUIRED", "Pilih company terlebih dahulu")
			return
		}
		if IsSuperadmin(r.Context()) {
			mux.ServeHTTP(w, r)
			return
		}
		RequireRole(roles...)(mux).ServeHTTP(w, r)
	})
}

func IsSuperadmin(ctx context.Context) bool {
	v, _ := ctx.Value(CtxSuperadmin).(bool)
	return v
}

func Session(ctx context.Context) *iam.Session {
	v, _ := ctx.Value(CtxSession).(*iam.Session)
	return v
}

func CompanyID(ctx context.Context) string {
	v, _ := ctx.Value(CtxCompanyID).(string)
	return v
}

func BranchID(ctx context.Context) string {
	v, _ := ctx.Value(CtxBranchID).(string)
	return v
}

func UserID(ctx context.Context) string {
	v, _ := ctx.Value(CtxUserID).(string)
	return v
}

func Roles(ctx context.Context) []string {
	v, _ := ctx.Value(CtxRoles).([]string)
	return v
}

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = "req-" + uuid.New().String()
		}
		ctx := context.WithValue(r.Context(), CtxRequestID, reqID)
		w.Header().Set("X-Request-ID", reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
