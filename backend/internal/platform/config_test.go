package platform

import (
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, name := range []string{
		"DATABASE_URL", "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME",
		"DB_SOCKET", "DB_SSLMODE", "DB_SSLROOTCERT", "DB_CONNECT_TIMEOUT",
		"SERVER_HOST", "SERVER_PORT", "COOKIE_SECURE", "SESSION_DURATION",
		"AUTO_MIGRATE", "SEED_ENABLED", "SEED_PASSWORD", "LANDING_COMPANY_ID",
	} {
		t.Setenv(name, "")
	}
}

func TestLoadConfig(t *testing.T) {
	clearConfigEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DBHost != "/tmp" || cfg.DBPort != "5433" || cfg.DBSocket != "" || cfg.ServerAddress() != ":8080" || cfg.SessionDuration != 30*time.Minute || cfg.CookieSecure {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	t.Setenv("DB_HOST", "db.internal")
	t.Setenv("SERVER_HOST", "::1")
	t.Setenv("SERVER_PORT", "9090")
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("SESSION_DURATION", "1h")
	cfg, err = LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := pgxpool.ParseConfig(cfg.DBURL())
	if err != nil {
		t.Fatal(err)
	}
	if parsed.ConnConfig.Host != "db.internal" || cfg.ServerAddress() != "[::1]:9090" || !cfg.CookieSecure || cfg.SessionDuration != time.Hour {
		t.Fatal("environment overrides were not applied")
	}
}

func TestInvalidConfig(t *testing.T) {
	for _, tc := range []struct{ name, value string }{
		{"SERVER_PORT", "0"}, {"SERVER_PORT", "65536"}, {"DB_PORT", "abc"},
		{"COOKIE_SECURE", "maybe"}, {"SESSION_DURATION", "-1m"}, {"SESSION_DURATION", "500ms"},
		{"AUTO_MIGRATE", "invalid"}, {"SEED_ENABLED", "invalid"}, {"SEED_ENABLED", "true"},
	} {
		t.Run(tc.name+tc.value, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv(tc.name, tc.value)
			if _, err := LoadConfig(); err == nil || (!strings.Contains(err.Error(), tc.name) && !strings.Contains(err.Error(), "SEED_PASSWORD")) {
				t.Fatalf("expected named configuration error, got %v", err)
			}
		})
	}
}

func TestRequestedSeedPassword(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("SEED_ENABLED", "true")
	t.Setenv("SEED_PASSWORD", "password789")
	if _, err := LoadConfig(); err != nil {
		t.Fatal(err)
	}
}

func TestDBURL(t *testing.T) {
	for _, socket := range []string{"", "/tmp/socket dir"} {
		t.Run(socket, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("DB_HOST", "db.internal")
			t.Setenv("DB_SOCKET", socket)
			t.Setenv("DB_USER", "clinic user")
			t.Setenv("DB_PASSWORD", "p a'ss\\@:/?#&=word")
			t.Setenv("DB_NAME", "clinic data")
			cfg, err := LoadConfig()
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := pgxpool.ParseConfig(cfg.DBURL())
			if err != nil {
				t.Fatal("cannot parse encoded database settings")
			}
			host := cfg.DBHost
			if socket != "" {
				host = socket
			}
			conn := parsed.ConnConfig
			if conn.Host != host || conn.User != cfg.DBUser || conn.Password != cfg.DBPassword || conn.Database != cfg.DBName || conn.ConnectTimeout != 5*time.Second {
				t.Fatalf("database encoding mismatch: host=%t user=%t password=%t database=%t timeout=%v", conn.Host == host, conn.User == cfg.DBUser, conn.Password == cfg.DBPassword, conn.Database == cfg.DBName, conn.ConnectTimeout)
			}
		})
	}
}

func TestDatabaseURLPrecedenceAndRedaction(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:secret@remote:5432/clinic?sslmode=disable")
	t.Setenv("DB_PORT", "ignored")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := pgxpool.ParseConfig(cfg.DBURL())
	if err != nil || parsed.ConnConfig.Host != "remote" {
		t.Fatal("DATABASE_URL must override DB_* settings")
	}
	cfg.DatabaseURL = "postgresql://user:secret@remote:invalid/clinic"
	if _, err = NewDBPool(cfg); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal("invalid database configuration must fail without revealing credentials")
	}
}

func TestDatabaseTLSAndValidation(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_SSLMODE", "require")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := pgxpool.ParseConfig(cfg.DBURL())
	if err != nil || parsed.ConnConfig.TLSConfig == nil {
		t.Fatal("TLS setting was not applied")
	}
	for _, setting := range []struct{ name, value string }{
		{"DB_SSLMODE", "invalid"}, {"DB_CONNECT_TIMEOUT", "invalid"},
	} {
		t.Run(setting.name, func(t *testing.T) {
			t.Setenv(setting.name, setting.value)
			cfg, err := LoadConfig()
			if err != nil {
				t.Fatal(err)
			}
			if _, err := NewDBPool(cfg); err == nil {
				t.Fatal("invalid database configuration must fail before connecting")
			}
		})
	}
}

func TestLandingCompanyID(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("LANDING_COMPANY_ID", " 11111111-1111-4111-8111-111111111111 ")
	cfg, err := LoadConfig()
	if err != nil || cfg.LandingCompanyID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("valid id: %v %+v", err, cfg)
	}
	t.Setenv("LANDING_COMPANY_ID", "klinik-demo")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("accepted a non-UUID LANDING_COMPANY_ID")
	}
}
