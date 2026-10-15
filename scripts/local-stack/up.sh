#!/usr/bin/env bash
# Start the local stack: Postgres, Auth (GoTrue), PostgREST, Storage, gateway.
#   up.sh           start (building the database on first run)
#   up.sh --fresh   wipe the database and stored files, rebuild from prod.sql
# APPLY_THROUGH=<n> stops the rebuild after migration v<n>; run migrate.sh
# later to apply the rest on top of existing data.
# The app itself runs separately: `npm run dev` with the .env.local this writes.
source "$(dirname "$0")/lib.sh"

for b in "$BIN/postgrest" "$BIN/auth" "$FIELDSTACK/storage/dist/start/server.js" "$NODE24"; do
  [ -e "$b" ] || { echo "missing $b; run scripts/local-stack/fetch.sh first" >&2; exit 1; }
done

if [ "${1:-}" = "--fresh" ]; then
  "$HERE/down.sh" || true
  rm -rf "$PG_DATA" "$FIELDSTACK/storage-files"
fi

mkdir -p "$PG_RUN" "$LOGS" "$FIELDSTACK/storage-files"
chown postgres "$PG_RUN" "$LOGS"

SECRET="$(jwt_secret)"
ANON_KEY="$(sign_key anon)"
SERVICE_KEY="$(sign_key service_role)"

pid_alive() { [ -s "$PG_RUN/$1.pid" ] && kill -0 "$(cat "$PG_RUN/$1.pid")" 2>/dev/null; }
spawn() { # name, then command; detached so it outlives this shell
  local name="$1"; shift
  if pid_alive "$name"; then return 0; fi
  setsid nohup "$@" >"$LOGS/$name.log" 2>&1 < /dev/null &
  echo $! > "$PG_RUN/$name.pid"
}

# --- Postgres ---------------------------------------------------------------
NEW_DB=0
if [ ! -s "$PG_DATA/PG_VERSION" ]; then
  NEW_DB=1
  mkdir -p "$PG_DATA" && chown postgres "$PG_DATA"
  as_postgres "$PG_BIN/initdb" -D "$PG_DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >"$LOGS/initdb.log"
fi
if ! as_postgres "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; then
  as_postgres "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$LOGS/postgres.log" -w start \
    -o "-p $PG_PORT -k $PG_RUN -c listen_addresses=127.0.0.1 -c shared_preload_libraries=pg_stat_statements -c wal_level=logical -c timezone=UTC"
fi

AUTH_ENV=(
  env -i PATH="$PATH"
  GOTRUE_API_HOST=127.0.0.1 PORT="$AUTH_PORT"
  API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1"
  GOTRUE_SITE_URL="http://localhost:$APP_PORT"
  GOTRUE_URI_ALLOW_LIST="http://localhost:$APP_PORT/**"
  GOTRUE_DB_DRIVER=postgres GOTRUE_DB_NAMESPACE=auth
  DATABASE_URL="$(DB_URL_AS supabase_auth_admin)?search_path=auth&sslmode=disable"
  GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations"
  GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
  # Like prod: invite-only (no public sign-up); password-reset mail goes to
  # the local mail sink ($FIELDSTACK/mail).
  GOTRUE_DISABLE_SIGNUP=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT="$MAIL_PORT" GOTRUE_SMTP_USER=local GOTRUE_SMTP_PASS=local
  GOTRUE_SMTP_ADMIN_EMAIL=auth@field.test GOTRUE_SMTP_SENDER_NAME=Field
  GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
  GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
  GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn
)
STORAGE_ENV=(
  env -i PATH="$PATH" NODE_ENV=production
  SERVER_PORT="$STORAGE_PORT" SERVER_HOST=127.0.0.1
  DATABASE_URL="$(DB_URL_AS supabase_storage_admin)"
  DB_INSTALL_ROLES=false DB_SUPER_USER=supabase_storage_admin
  AUTH_JWT_SECRET="$SECRET" AUTH_JWT_ALGORITHM=HS256
  ANON_KEY="$ANON_KEY" SERVICE_KEY="$SERVICE_KEY"
  STORAGE_BACKEND=file STORAGE_FILE_BACKEND_PATH="$FIELDSTACK/storage-files"
  GLOBAL_S3_BUCKET=local TENANT_ID=local REGION=local
  FILE_SIZE_LIMIT=52428800 IMAGE_TRANSFORMATION_ENABLED=false
  PG_QUEUE_ENABLE=false LOG_LEVEL=warn
)

# Storage reads its migrations relative to its own directory.
start_storage() { (cd "$FIELDSTACK/storage" && spawn storage "${STORAGE_ENV[@]}" "$NODE24" dist/start/server.js); }

if [ "$NEW_DB" = 1 ]; then
  echo "building database from supabase/schema/prod.sql"
  psql_pg -f "$HERE/platform.sql"

  # GoTrue and Storage each create their own schema contents.
  "${AUTH_ENV[@]}" "$BIN/auth" migrate >"$LOGS/auth-migrate.log" 2>&1
  start_storage
  wait_http "http://127.0.0.1:$STORAGE_PORT/status" storage
  psql_pg -c "GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
              GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;
              GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;"

  # Two prod.sql lines don't exist on stock Postgres 16: the supabase_vault
  # extension and the PG17 MAINTAIN privilege.
  sed -e '/CREATE EXTENSION IF NOT EXISTS supabase_vault/d' -e 's/MAINTAIN, //' \
    "$REPO/supabase/schema/prod.sql" | psql_pg -f -

  "$HERE/migrate.sh"

  psql_pg -f "$HERE/seed.sql"
fi

# --- API services -------------------------------------------------------------
cat >"$FIELDSTACK/postgrest.conf" <<EOF
db-uri = "$(DB_URL_AS authenticator)"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
log-level = "warn"
EOF
spawn mail-sink node "$HERE/mail-sink.mjs" "$MAIL_PORT" "$FIELDSTACK/mail"
spawn rest "$BIN/postgrest" "$FIELDSTACK/postgrest.conf"
spawn auth "${AUTH_ENV[@]}" "$BIN/auth"
start_storage
if [ -x "$BIN/stripe-mock" ]; then
  spawn stripe-mock "$BIN/stripe-mock" -http-port "$STRIPE_MOCK_PORT"
  spawn stripe-shim node "$HERE/stripe-shim.mjs" "$STRIPE_SHIM_PORT" "$STRIPE_MOCK_PORT"
fi
spawn gateway node "$HERE/gateway.mjs" "$GATEWAY_PORT" "$REST_PORT" "$AUTH_PORT" "$STORAGE_PORT"

wait_http "http://127.0.0.1:$REST_PORT/" postgrest
wait_http "http://127.0.0.1:$AUTH_PORT/health" auth
wait_http "http://127.0.0.1:$STORAGE_PORT/status" storage
wait_http "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health" gateway

if [ "$NEW_DB" = 1 ]; then
  SUPABASE_URL="http://127.0.0.1:$GATEWAY_PORT" SERVICE_KEY="$SERVICE_KEY" node "$HERE/seed-users.mjs"
fi

# --- App env ------------------------------------------------------------------
ENV_FILE="$REPO/.env.local"
STACK_ENV="NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:$APP_PORT
ESTIMATOR_STRIPE_SECRET_KEY=sk_test_localstack
ESTIMATOR_STRIPE_API_BASE=http://127.0.0.1:$STRIPE_SHIM_PORT
ESTIMATOR_STRIPE_WEBHOOK_SECRET=whsec_localstack
ADMIN_EMAILS=admin@other.test"
if [ ! -e "$ENV_FILE" ] || grep -q "^# local-stack" "$ENV_FILE"; then
  { echo "# local-stack: written by scripts/local-stack/up.sh; safe to delete"; echo "$STACK_ENV"; } >"$ENV_FILE"
  echo "wrote .env.local for the local stack"
else
  echo ".env.local exists and wasn't written by this script; left it alone. Stack values:"
  echo "$STACK_ENV" | sed -E 's/(KEY=).{12}.*/\1…/'
fi

echo "stack up: gateway http://127.0.0.1:$GATEWAY_PORT, postgres 127.0.0.1:$PG_PORT; logs in $LOGS"
