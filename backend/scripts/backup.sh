#!/usr/bin/env bash
# Backup the DB, then prove it restores: dump -> restore into a scratch DB -> compare row counts -> drop scratch.
# Usage: bash scripts/backup.sh [backup_dir]   (default ../backups, keeps BACKUP_KEEP_DAYS days, default 14)
# ponytail: local pg_dump only; for production use managed PITR/WAL + off-site encrypted copies.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
export PGPASSWORD="$DB_PASSWORD" PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER"
DIR=${1:-../../backups}
mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"
SCRATCH="${DB_NAME}_restore_check_$$"

umask 077
pg_dump -Fc -d "$DB_NAME" -f "$FILE"
echo "dump: $FILE ($(du -h "$FILE" | cut -f1))"

trap 'dropdb --if-exists "$SCRATCH" 2>/dev/null || true' EXIT
createdb "$SCRATCH"
pg_restore --no-owner -d "$SCRATCH" "$FILE"

counts() {
  psql -X -At -d "$1" -c "SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
    SELECT 'pasien' t, count(*) n FROM pasien UNION ALL SELECT 'rekam', count(*) FROM rekam
    UNION ALL SELECT 'rekam_diagnosa', count(*) FROM rekam_diagnosa UNION ALL SELECT 'rekam_gigi', count(*) FROM rekam_gigi
    UNION ALL SELECT 'pengeluaran_obat', count(*) FROM pengeluaran_obat UNION ALL SELECT 'pembayaran', count(*) FROM pembayaran
    UNION ALL SELECT 'audit_events', count(*) FROM audit_events UNION ALL SELECT 'schema_migrations', count(*) FROM schema_migrations) x"
}
# Source keeps receiving writes, so compare the restored copy with the dump's own table of contents only via counts taken right after.
SRC=$(counts "$DB_NAME")
DST=$(counts "$SCRATCH")
echo "source : $SRC"
echo "restore: $DST"
if [ "$SRC" != "$DST" ]; then
  echo "RESTORE CHECK: counts differ (expected only if the DB was written during the backup)"; exit 1
fi
echo "RESTORE CHECK OK"

find "$DIR" -name "${DB_NAME}_*.dump" -mtime "+${BACKUP_KEEP_DAYS:-14}" -delete
