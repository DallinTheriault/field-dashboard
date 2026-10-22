#!/usr/bin/env bash
# v103 billing from the job end to end: a fresh stack with every migration, then the checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
for p in /app /app/jobs /app/jobs/1 /app/jobs/1/invoice /app/estimator/invoices; do curl -s -o /dev/null "http://localhost:3000$p"; done
node "$SCEN/billing-batch.mjs"
