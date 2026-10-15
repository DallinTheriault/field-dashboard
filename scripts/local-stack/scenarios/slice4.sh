#!/usr/bin/env bash
# Slice 4 end to end: rebuild at v096, add prod-shaped paid invoices and
# Sharpline's two letterheads, apply v097, then run the payment checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
STACK="$(cd "$SCEN/.." && pwd)"
APPLY_THROUGH=96 "$STACK/up.sh" --fresh
source "$STACK/lib.sh"
psql_pg < "$SCEN/slice4-before.sql"
"$STACK/migrate.sh"
node "$SCEN/slice4-payments.mjs"
