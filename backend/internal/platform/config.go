package platform

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL      string
	DBHost           string
	DBPort           string
	DBUser           string
	DBName           string
	DBPassword       string
	DBSocket         string
	ServerPort       string
	DBSSLMode        string
	DBSSLRootCert    string
	DBConnectTimeout string
	ServerHost       string
	CookieSecure     bool
	SessionDuration  time.Duration
	AutoMigrate      bool
	SeedEnabled      bool
	SeedPassword     string
	FilesDir         string
	LandingCompanyID string // company yang menerima form "Buat Janji" landing page; kosong = belum ditentukan
}

func LoadConfig() (*Config, error) {
	cfg := &Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		DBHost:           getEnv("DB_HOST", "/tmp"),
		DBPort:           getEnv("DB_PORT", "5433"),
		DBUser:           getEnv("DB_USER", "postgres"),
		DBName:           getEnv("DB_NAME", "real_clinic"),
		DBPassword:       getEnv("DB_PASSWORD", ""),
		DBSocket:         os.Getenv("DB_SOCKET"),
		ServerPort:       getEnv("SERVER_PORT", "8080"),
		ServerHost:       os.Getenv("SERVER_HOST"),
		DBSSLMode:        getEnv("DB_SSLMODE", "disable"),
		DBSSLRootCert:    os.Getenv("DB_SSLROOTCERT"),
		DBConnectTimeout: getEnv("DB_CONNECT_TIMEOUT", "5"),
		SeedPassword:     os.Getenv("SEED_PASSWORD"),
		FilesDir:         getEnv("FILES_DIR", "data/files"),
		LandingCompanyID: strings.TrimSpace(os.Getenv("LANDING_COMPANY_ID")),
	}
	for name, value := range map[string]string{"SERVER_PORT": cfg.ServerPort, "DB_PORT": cfg.DBPort} {
		if name == "DB_PORT" && cfg.DatabaseURL != "" {
			continue
		}
		port, err := strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return nil, fmt.Errorf("%s must be a port between 1 and 65535", name)
		}
	}
	var err error
	cfg.AutoMigrate, err = strconv.ParseBool(getEnv("AUTO_MIGRATE", "true"))
	if err != nil {
		return nil, fmt.Errorf("AUTO_MIGRATE must be true or false")
	}
	cfg.SeedEnabled, err = strconv.ParseBool(getEnv("SEED_ENABLED", "false"))
	if err != nil {
		return nil, fmt.Errorf("SEED_ENABLED must be true or false")
	}
	if cfg.SeedEnabled && (len(cfg.SeedPassword) < 8 || len(cfg.SeedPassword) > 72) {
		return nil, fmt.Errorf("SEED_PASSWORD must contain 8 to 72 bytes when SEED_ENABLED=true")
	}
	cfg.CookieSecure, err = strconv.ParseBool(getEnv("COOKIE_SECURE", "false"))
	if err != nil {
		return nil, fmt.Errorf("COOKIE_SECURE must be true or false")
	}
	if cfg.LandingCompanyID != "" && !uuidPattern.MatchString(cfg.LandingCompanyID) {
		return nil, fmt.Errorf("LANDING_COMPANY_ID must be a company UUID")
	}
	cfg.SessionDuration, err = time.ParseDuration(getEnv("SESSION_DURATION", "30m"))
	if err != nil || cfg.SessionDuration < time.Second {
		return nil, fmt.Errorf("SESSION_DURATION must be a duration of at least 1s (for example 30m)")
	}
	return cfg, nil
}

func (c *Config) DBURL() string {
	if c.DatabaseURL != "" {
		return c.DatabaseURL
	}
	host := c.DBHost
	if c.DBSocket != "" {
		host = c.DBSocket
	}
	params := url.Values{
		"host": {host}, "port": {c.DBPort}, "user": {c.DBUser},
		"password": {c.DBPassword}, "dbname": {c.DBName},
		"sslmode": {c.DBSSLMode}, "connect_timeout": {c.DBConnectTimeout},
	}
	if c.DBSSLRootCert != "" {
		params.Set("sslrootcert", c.DBSSLRootCert)
	}
	// PostgreSQL URI decoding treats '+' literally, so spaces must use %20.
	return "postgresql:///?" + strings.ReplaceAll(params.Encode(), "+", "%20")
}

func (c *Config) ServerAddress() string {
	return net.JoinHostPort(c.ServerHost, c.ServerPort)
}

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
