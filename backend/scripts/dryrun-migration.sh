#!/usr/bin/env bash
# Apply one migration file inside a transaction that is always rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
export PGPASSWORD="$DB_PASSWORD"
{ echo 'BEGIN;'; cat "$1"; echo "SELECT 'DRYRUN_OK';"; echo 'ROLLBACK;'; } |
  psql -X -P pager=off -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -At 2>&1 | tail -4
