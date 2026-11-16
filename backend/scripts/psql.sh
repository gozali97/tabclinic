#!/usr/bin/env bash
# Run read-only SQL (args passed to psql -c) against the DB in backend/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
export PGPASSWORD="$DB_PASSWORD"
args=()
for q in "$@"; do args+=(-c "$q"); done
psql -X -P pager=off -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -At "${args[@]}"
