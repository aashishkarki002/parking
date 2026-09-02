#!/usr/bin/env bash
# Restore a Postgres dump (custom-format .dump or plain .sql) into the local
# 'parking' database, matching the DB settings Django reads from
# parkingcore/settings.py / .env (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT).
#
# Always takes a safety backup of the current local DB into backend/db_backups/
# before dropping anything, then restores and runs migrate so the schema
# matches the checked-out code.
#
# Usage:
#   backend/scripts/restore_db.sh path/to/snapshot.dump
#   backend/scripts/restore_db.sh path/to/snapshot.sql
set -euo pipefail

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" ]]; then
    echo "Usage: $0 <path-to-dump-or-sql-file>" >&2
    exit 1
fi
if [[ ! -f "$DUMP_FILE" ]]; then
    echo "File not found: $DUMP_FILE" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$BACKEND_DIR/db_backups"
mkdir -p "$BACKUP_DIR"

# Pull the same defaults Django falls back to (parkingcore/settings.py) so
# this works out of the box; override any of these via env vars or .env.
if [[ -f "$BACKEND_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$BACKEND_DIR/.env"
    set +a
fi
DB_NAME="${DB_NAME:-parking}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-1234}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

export PGPASSWORD="$DB_PASSWORD"
PSQL=(psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT")

echo "==> Target DB: $DB_NAME@$DB_HOST:$DB_PORT (user: $DB_USER)"

DB_EXISTS=$("${PSQL[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

TS="$(date +%Y%m%d_%H%M%S)"
if [[ "$DB_EXISTS" == "1" ]]; then
    ACTIVE=$("${PSQL[@]}" -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname='$DB_NAME'")
    if [[ "$ACTIVE" != "0" ]]; then
        echo "==> Terminating $ACTIVE active connection(s) to $DB_NAME"
        "${PSQL[@]}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null
    fi

    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_pre_restore_${TS}.dump"
    echo "==> Backing up current $DB_NAME to $BACKUP_FILE"
    pg_dump -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d "$DB_NAME" -F c -f "$BACKUP_FILE"

    echo "==> Dropping $DB_NAME"
    "${PSQL[@]}" -c "DROP DATABASE $DB_NAME;" >/dev/null
fi

echo "==> Creating $DB_NAME"
"${PSQL[@]}" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null

echo "==> Restoring $DUMP_FILE into $DB_NAME"
if [[ "$DUMP_FILE" == *.sql ]]; then
    "${PSQL[@]}" -d "$DB_NAME" -f "$DUMP_FILE"
else
    pg_restore -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d "$DB_NAME" --no-owner --no-acl "$DUMP_FILE"
fi

echo "==> Running Django migrations"
(cd "$BACKEND_DIR" && python manage.py migrate)

echo "==> Done. $DB_NAME restored from $(basename "$DUMP_FILE")."
