# Shared config for the local stack. Sourced by up.sh / down.sh / fetch.sh.
# Everything runs as plain processes (no Docker); state lives under $FIELDSTACK.

set -euo pipefail

FIELDSTACK="${FIELDSTACK:-/opt/fieldstack}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$REPO/scripts/local-stack"

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_DATA="$FIELDSTACK/pgdata"
PG_RUN="$FIELDSTACK/run"
LOGS="$FIELDSTACK/logs"
BIN="$FIELDSTACK/bin"
NODE24="$FIELDSTACK/node24/node_modules/node-linux-x64/bin/node"

# prod.sql includes every migration up to and including this one. Bump it when
# prod.sql is refreshed; newer files in supabase/migrations apply on top.
SNAPSHOT_THROUGH=92

PG_PORT=54329
GATEWAY_PORT=54321
REST_PORT=54330
AUTH_PORT=54340
STORAGE_PORT=54350
STRIPE_MOCK_PORT=12111
STRIPE_SHIM_PORT=12112
MAIL_PORT=12125
ANTHROPIC_MOCK_PORT=12113
GEO_MOCK_PORT=12114
APP_PORT="${APP_PORT:-3000}"

# Local-only password for the platform roles. Nothing here is reachable off-box:
# Postgres listens on 127.0.0.1 and the socket dir only.
PG_PASS=postgres
DB_URL_AS() { echo "postgres://$1:$PG_PASS@127.0.0.1:$PG_PORT/postgres"; }

# One HS256 secret signs every local JWT (auth sessions, anon key, service key).
# Generated once, kept outside the repo.
jwt_secret() {
  local f="$FIELDSTACK/jwt-secret"
  if [ ! -s "$f" ]; then
    mkdir -p "$FIELDSTACK"
    head -c 48 /dev/urandom | base64 | tr -d '\n/+=' > "$f"
    chmod 600 "$f"
  fi
  cat "$f"
}

sign_key() { node "$HERE/keys.mjs" "$(jwt_secret)" "$1"; }

as_postgres() { runuser -u postgres -- "$@"; }
psql_pg() { as_postgres env PGOPTIONS="-c client_min_messages=warning" "$PG_BIN/psql" -h "$PG_RUN" -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

wait_http() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$url"; then return 0; fi
    sleep 0.5
  done
  echo "$name did not come up; see $LOGS" >&2
  return 1
}
