#!/usr/bin/env bash
# Job billing badge end to end: a fresh stack with every migration, then the checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
# Compile the routes the checks use before timing anything.
for p in /app /app/jobs /app/jobs/1 /app/estimator/mileage; do curl -s -o /dev/null "http://localhost:3000$p"; done
node "$SCEN/job-billing.mjs"
