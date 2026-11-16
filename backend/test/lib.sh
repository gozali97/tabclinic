#!/usr/bin/env bash
# Shared helpers for smoke scripts. Each "(want X)" line is checked by CI.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a; source .env; set +a
BASE="${API_BASE_URL:-http://127.0.0.1:${SERVER_PORT:-8080}/api/v1}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# req JAR [curl args...] -> prints HTTP code, body in $TMP/body
req() { local jar=$1; shift; curl -s -o "$TMP/body" -w '%{http_code}' -b "$TMP/$jar" -c "$TMP/$jar" -H 'Content-Type: application/json' "$@"; }
j() { python3 -c "import json;d=json.load(open('$TMP/body'));print($1)"; }
login() { req "$1" -X POST "$BASE/auth/login" -d "$(python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$2" "${3:-$SEED_PASSWORD}")"; }
RUN=$(date +%s%N | cut -c1-13)
TODAY=$(TZ=Asia/Jakarta date +%F)
