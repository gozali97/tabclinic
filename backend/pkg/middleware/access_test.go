package middleware

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/nicofx/real-clinic/backend/internal/iam"
)

func TestRoleBoundaries(t *testing.T) {
	for _, tc := range []struct {
		pattern, role string
		allowed       bool
	}{
		{"POST /api/v1/companies", iam.RoleAdmin, false},
		{"POST /api/v1/companies/{companyId}/users", iam.RoleAdmin, true},
		{"POST /api/v1/companies/{companyId}/users", iam.RolePendaftaran, false},
		{"GET /api/v1/auth/me", iam.RoleApotek, true},
		{"POST /api/v1/poli", iam.RoleAdmin, true},
		{"POST /api/v1/poli", iam.RolePendaftaran, false},
		{"POST /api/v1/pasien", iam.RolePendaftaran, true},
		{"POST /api/v1/pasien", iam.RoleDokter, false},
		{"POST /api/v1/pasien", iam.RoleApotek, false},
		{"GET /api/v1/pasien", iam.RoleApotek, false},
		{"POST /api/v1/rekam", iam.RolePendaftaran, true},
		{"POST /api/v1/rekam", iam.RoleDokter, false},
		{"PUT /api/v1/rekam/{id}/tindakan", iam.RoleDokter, true},
		{"PUT /api/v1/rekam/{id}/tindakan", iam.RolePendaftaran, false},
		{"POST /api/v1/rekam/{id}/diagnosa", iam.RoleAdmin, false},
		{"POST /api/v1/rekam/{id}/obat", iam.RoleApotek, true},
		{"POST /api/v1/rekam/{id}/obat", iam.RoleDokter, false},
		{"POST /api/v1/rekam/{id}/pembayaran", iam.RolePendaftaran, true},
		{"POST /api/v1/rekam/{id}/pembayaran", iam.RoleApotek, false},
		{"POST /api/v1/obat", iam.RoleApotek, true},
		{"POST /api/v1/obat", iam.RoleDokter, false},
		{"POST /api/v1/icd/import", iam.RoleAdmin, true},
		{"POST /api/v1/icd/import", iam.RoleDokter, false},
		{"GET /api/v1/new-route", iam.RoleAdmin, false},
	} {
		t.Run(tc.role+tc.pattern, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc(tc.pattern, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
			method, path, _ := strings.Cut(tc.pattern, " ")
			path = strings.NewReplacer("{id}", "test", "{companyId}", "c1", "{code}", "A09").Replace(path)
			r := httptest.NewRequest(method, path, nil)
			ctx := context.WithValue(r.Context(), CtxRoles, []string{tc.role})
			r = r.WithContext(context.WithValue(ctx, CtxCompanyID, "c1"))
			response := httptest.NewRecorder()
			Authorize(mux).ServeHTTP(response, r)
			want := http.StatusForbidden
			if tc.allowed {
				want = 204
			}
			if response.Code != want {
				t.Fatalf("got %d, want %d", response.Code, want)
			}
		})
	}
}

func TestSuperadminAndCompanyGate(t *testing.T) {
	for _, tc := range []struct {
		name, pattern, company string
		superadmin             bool
		want                   int
	}{
		{"superadmin passes listed route", "POST /api/v1/rekam/{id}/obat", "c1", true, 204},
		{"superadmin passes superadmin-only route", "POST /api/v1/companies", "", true, 204},
		{"superadmin still denied unlisted route", "GET /api/v1/new-route", "c1", true, http.StatusForbidden},
		{"no company blocks company route", "GET /api/v1/pasien", "", true, http.StatusConflict},
		{"no company allows company list", "GET /api/v1/companies", "", true, 204},
		{"no company allows me", "GET /api/v1/auth/me", "", true, 204},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc(tc.pattern, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
			method, path, _ := strings.Cut(tc.pattern, " ")
			r := httptest.NewRequest(method, strings.ReplaceAll(path, "{id}", "x"), nil)
			ctx := context.WithValue(r.Context(), CtxSuperadmin, tc.superadmin)
			r = r.WithContext(context.WithValue(ctx, CtxCompanyID, tc.company))
			res := httptest.NewRecorder()
			Authorize(mux).ServeHTTP(res, r)
			if res.Code != tc.want {
				t.Fatalf("got %d, want %d", res.Code, tc.want)
			}
		})
	}
}

func TestEveryProtectedRouteHasPolicy(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../../cmd/api/main.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "HandleFunc" {
			return true
		}
		receiver, ok := selector.X.(*ast.Ident)
		if !ok || receiver.Name != "a" {
			return true
		}
		literal, ok := call.Args[0].(*ast.BasicLit)
		if !ok {
			t.Fatal("protected routes must have explicit patterns")
		}
		pattern, err := strconv.Unquote(literal.Value)
		if err != nil {
			t.Fatal(err)
		}
		roles, listed := iam.RouteRoles[pattern]
		if !listed {
			t.Errorf("no policy for %s", pattern)
		}
		for _, role := range roles {
			if !iam.ValidRoles[role] {
				t.Errorf("unknown role %s", role)
			}
		}
		count++
		return true
	})
	if count != len(iam.RouteRoles) {
		t.Fatalf("%d registered routes, %d policies", count, len(iam.RouteRoles))
	}
}
