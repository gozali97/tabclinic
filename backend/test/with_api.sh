#!/usr/bin/env bash
# Run a smoke script against a freshly built API on a spare port, independent of air.
# Usage: bash test/with_api.sh test/smoke_flow.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
PORT=${SMOKE_PORT:-18071}
BIN=$(mktemp)
go build -o "$BIN" ./cmd/api
SERVER_PORT=$PORT SEED_ENABLED=false "$BIN" > /tmp/tabmedik-smoke-api.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$BIN"' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null && break; sleep 0.5; done
API_BASE_URL="http://127.0.0.1:$PORT/api/v1" bash "$1"
