package iam

// Akses mengikuti SI-Shina: Admin (master data + semua menu), Pendaftaran (pasien, rekam, pembayaran),
// Dokter (pemeriksaan pasiennya sendiri), Apotek (obat dan pengeluaran obat).
// Route yang tidak tercantum ditolak untuk semua pengguna, termasuk superadmin.

var allRoles = BusinessRoles()

var (
	admin       = []string{RoleAdmin}
	frontDesk   = []string{RoleAdmin, RolePendaftaran}
	klinis      = []string{RoleAdmin, RolePendaftaran, RoleDokter}
	pharmacy    = []string{RoleAdmin, RoleApotek}
	dokterOnly  = []string{RoleDokter}
	drugReaders = []string{RoleAdmin, RoleApotek, RoleDokter}
)

// superadminOnly routes have no role grant; only the superadmin flag passes them.
var superadminOnly = []string{}

// NoCompanyRoutes work before a superadmin has selected a company.
var NoCompanyRoutes = map[string]bool{
	"GET /api/v1/auth/me":              true,
	"POST /api/v1/auth/logout":         true,
	"POST /api/v1/auth/password":       true,
	"POST /api/v1/auth/select-company": true,
	"GET /api/v1/companies":            true,
	"POST /api/v1/companies":           true,
}

var RouteRoles = map[string][]string{
	"GET /api/v1/auth/me":                      allRoles,
	"POST /api/v1/auth/logout":                 allRoles,
	"POST /api/v1/auth/password":               allRoles,
	"POST /api/v1/auth/select-company":         allRoles,
	"GET /api/v1/companies":                    allRoles,
	"POST /api/v1/companies":                   superadminOnly,
	"POST /api/v1/companies/{companyId}/users": admin,
	"GET /api/v1/users":                        admin,
	"PATCH /api/v1/users/{id}":                 admin,

	"GET /api/v1/dashboard":    allRoles,
	"GET /api/v1/kondisi-gigi": allRoles,

	"GET /api/v1/poli":         allRoles,
	"POST /api/v1/poli":        admin,
	"PATCH /api/v1/poli/{id}":  admin,
	"DELETE /api/v1/poli/{id}": admin,

	"GET /api/v1/dokter":        allRoles,
	"POST /api/v1/dokter":       admin,
	"PATCH /api/v1/dokter/{id}": admin,

	"GET /api/v1/pasien":                 frontDesk,
	"GET /api/v1/pasien/next-rm":         frontDesk,
	"POST /api/v1/pasien":                frontDesk,
	"GET /api/v1/pasien/{id}":            allRoles,
	"PATCH /api/v1/pasien/{id}":          frontDesk,
	"DELETE /api/v1/pasien/{id}":         frontDesk,
	"GET /api/v1/pasien/{id}/odontogram": allRoles,
	"GET /api/v1/pasien/{id}/consent":    allRoles,
	"POST /api/v1/pasien/{id}/consent":   frontDesk,
	"DELETE /api/v1/pasien/{id}/consent": frontDesk,

	"GET /api/v1/obat":             drugReaders,
	"POST /api/v1/obat":            pharmacy,
	"PATCH /api/v1/obat/{id}":      pharmacy,
	"DELETE /api/v1/obat/{id}":     pharmacy,
	"GET /api/v1/obat/riwayat":     pharmacy,
	"GET /api/v1/tindakan":         allRoles,
	"POST /api/v1/tindakan":        admin,
	"PATCH /api/v1/tindakan/{id}":  admin,
	"DELETE /api/v1/tindakan/{id}": admin,

	"GET /api/v1/icd":           {RoleAdmin, RoleDokter},
	"POST /api/v1/icd":          admin,
	"POST /api/v1/icd/import":   admin,
	"PATCH /api/v1/icd/{code}":  admin,
	"DELETE /api/v1/icd/{code}": admin,

	"GET /api/v1/rekam":                               allRoles,
	"POST /api/v1/rekam":                              frontDesk,
	"GET /api/v1/rekam/{id}":                          allRoles,
	"PATCH /api/v1/rekam/{id}":                        frontDesk,
	"DELETE /api/v1/rekam/{id}":                       frontDesk,
	"PUT /api/v1/rekam/{id}/pemeriksaan":              klinis,
	"PUT /api/v1/rekam/{id}/tindakan":                 dokterOnly,
	"PUT /api/v1/rekam/{id}/resep":                    dokterOnly,
	"POST /api/v1/rekam/{id}/diagnosa":                dokterOnly,
	"DELETE /api/v1/rekam/{id}/diagnosa/{diagnosaId}": dokterOnly,
	"POST /api/v1/rekam/{id}/gigi":                    dokterOnly,
	"DELETE /api/v1/rekam/{id}/gigi/{gigiId}":         dokterOnly,
	"POST /api/v1/rekam/{id}/status":                  klinis,
	"GET /api/v1/rekam/{id}/pemeriksaan/file":         allRoles,
	"POST /api/v1/rekam/{id}/pemeriksaan/file":        klinis,
	"DELETE /api/v1/rekam/{id}/pemeriksaan/file":      klinis,
	"GET /api/v1/rekam/{id}/tindakan/file":            allRoles,
	"POST /api/v1/rekam/{id}/tindakan/file":           dokterOnly,
	"DELETE /api/v1/rekam/{id}/tindakan/file":         dokterOnly,
	"POST /api/v1/rekam/{id}/obat":                    pharmacy,
	"POST /api/v1/rekam/{id}/pembayaran":              frontDesk,
	"GET /api/v1/pembayaran":                          frontDesk,
	"GET /api/v1/permintaan-janji":                    frontDesk,
	"PATCH /api/v1/permintaan-janji/{id}":             frontDesk,
}
