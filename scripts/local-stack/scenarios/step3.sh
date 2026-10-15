#!/usr/bin/env bash
# Step 3 end to end: rebuild at v097, add a Sharpline stand-in, apply v098,
# then run the simple-pricing checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
STACK="$(cd "$SCEN/.." && pwd)"
APPLY_THROUGH=97 "$STACK/up.sh" --fresh
source "$STACK/lib.sh"
psql_pg < "$SCEN/step3-before.sql"
"$STACK/migrate.sh"
node "$SCEN/step3-rates.mjs"
