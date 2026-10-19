#!/usr/bin/env bash
# Receipts v2 end to end: a fresh stack with every migration, then the checks.
# HEIC_SAMPLE=/path/to/photo.heic also runs the HEIC conversion check.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
# Compile the routes the checks use before timing anything.
for p in /app /app/estimator/purchases /app/estimator/purchases/1 /app/jobs/1 /app/estimator/new?job=1 /app/estimator/settings; do
  curl -s -o /dev/null "http://localhost:3000$p"
done
node "$SCEN/receipts.mjs"
