#!/usr/bin/env bash
# Download the stack's services into $FIELDSTACK/bin. Run once per machine.
# Needs network access to GitHub release downloads and the npm registry.
source "$(dirname "$0")/lib.sh"

POSTGREST_VERSION=12.2.3
AUTH_VERSION=2.197.0
STORAGE_VERSION=1.81.4
NODE24_VERSION=24.19.0 # Storage requires Node >= 24

mkdir -p "$BIN" "$FIELDSTACK/dl"

if [ ! -x "$BIN/postgrest" ]; then
  curl -fsSL -o "$FIELDSTACK/dl/postgrest.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v$POSTGREST_VERSION/postgrest-v$POSTGREST_VERSION-linux-static-x64.tar.xz"
  tar -xJf "$FIELDSTACK/dl/postgrest.tar.xz" -C "$BIN"
fi

if [ ! -x "$BIN/auth" ]; then
  curl -fsSL -o "$FIELDSTACK/dl/auth.tar.gz" \
    "https://github.com/supabase/auth/releases/download/v$AUTH_VERSION/auth-v$AUTH_VERSION-x86.tar.gz"
  tar -xzf "$FIELDSTACK/dl/auth.tar.gz" -C "$BIN"
fi

if [ ! -x "$NODE24" ]; then
  mkdir -p "$FIELDSTACK/node24"
  (cd "$FIELDSTACK/node24" && npm init -y >/dev/null && npm install --no-audit --no-fund "node-linux-x64@$NODE24_VERSION")
fi

if [ ! -e "$FIELDSTACK/storage/dist/start/server.js" ]; then
  [ -d "$FIELDSTACK/storage" ] ||
    git clone --depth 1 --branch "v$STORAGE_VERSION" https://github.com/supabase/storage "$FIELDSTACK/storage"
  (cd "$FIELDSTACK/storage" && PATH="$(dirname "$NODE24"):$PATH" &&
    npx -y npm@11.12.1 ci && npx -y npm@11.12.1 run build)
fi

# Browser driver for scenarios/; Chromium itself comes from the machine
# (CHROMIUM=/path/to/chrome, default is the Claude Code cloud image's copy).
if [ ! -d "$FIELDSTACK/e2e/node_modules/playwright-core" ]; then
  mkdir -p "$FIELDSTACK/e2e"
  (cd "$FIELDSTACK/e2e" && npm init -y >/dev/null && npm install --no-audit --no-fund playwright-core@1.56.1)
fi

command -v "$PG_BIN/postgres" >/dev/null || echo "also install PostgreSQL 16 (PG_BIN=$PG_BIN)" >&2
echo "fetched into $FIELDSTACK"
