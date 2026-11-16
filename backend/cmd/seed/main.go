package main

import (
	"context"
	"log"
	"time"

	"github.com/nicofx/real-clinic/backend/internal/bootstrap"
	"github.com/nicofx/real-clinic/backend/internal/platform"
	"github.com/nicofx/real-clinic/backend/migrations"
)

func main() {
	cfg, err := platform.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}
	db, err := platform.NewDBPool(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	connection := db.Config().ConnConfig
	log.Printf("Seed target: host=%s port=%d database=%s", connection.Host, connection.Port, connection.Database)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := migrations.Migrate(ctx, db); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
	if err := bootstrap.Seed(ctx, db, cfg.SeedPassword); err != nil {
		log.Fatalf("Seed failed: %v", err)
	}
	var database string
	var users, dokter, pasien, obat, admins int
	err = db.QueryRow(ctx, `SELECT current_database(),
		(SELECT count(*) FROM users WHERE company_id=$1),
		(SELECT count(*) FROM dokter WHERE company_id=$1),
		(SELECT count(*) FROM pasien WHERE company_id=$1),
		(SELECT count(*) FROM obat WHERE company_id=$1),
		(SELECT count(*) FROM users WHERE is_superadmin AND lower(email)=lower($2))`, bootstrap.CompanyID, bootstrap.SuperadminEmail).
		Scan(&database, &users, &dokter, &pasien, &obat, &admins)
	if err != nil {
		log.Fatalf("Seed verification failed: %v", err)
	}
	if admins != 1 {
		log.Fatal("Seed verification failed: superadmin is missing")
	}
	log.Printf("Seed verified: database=%s users=%d dokter=%d pasien=%d obat=%d", database, users, dokter, pasien, obat)
}
