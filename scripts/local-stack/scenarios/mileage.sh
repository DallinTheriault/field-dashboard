#!/usr/bin/env bash
# Mileage end to end: a fresh stack with every migration, then the checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
for p in /app /app/estimator/mileage /app/estimator/mileage/catch-up /app/jobs/1 /app/estimator/expenses /app/estimator/new?job=1; do
  curl -s -o /dev/null "http://localhost:3000$p"
done
node "$SCEN/mileage.mjs"
node "$SCEN/geo-throttle.mjs"
node "$SCEN/mileage-batches.mjs"
