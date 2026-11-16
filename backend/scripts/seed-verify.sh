#!/usr/bin/env bash
# Run migrations + seed with backend/.env, then print a short DB summary.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
go run ./cmd/seed 2>&1 | tail -3
export PGPASSWORD="$DB_PASSWORD"
psql -X -P pager=off -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -At \
  -c "SELECT 'migrations', string_agg(name, ',' ORDER BY name) FROM schema_migrations" \
  -c "SELECT 'seeds', string_agg(name, ',' ORDER BY name) FROM seed_history" \
  -c "SELECT 'poli', nama, is_gigi, biaya_pemeriksaan FROM poli ORDER BY nama" \
  -c "SELECT 'akun', u.email, r.role FROM users u JOIN user_roles r ON r.user_id=u.id ORDER BY r.role, u.email" \
  -c "SELECT 'icd', count(*) FROM icd"
