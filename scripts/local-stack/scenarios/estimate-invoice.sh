#!/usr/bin/env bash
# v105 end to end: a fresh stack with every migration, every embed in the app
# still resolving, then an accepted estimate through the job's invoice.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
# Compile the routes the checks use before timing anything.
for p in /app /app/jobs/1 /app/jobs/1/invoice /app/estimator/new?job=1 /app/estimator/invoices; do curl -s -o /dev/null "http://localhost:3000$p"; done
status=0
node "$SCEN/embed-check.mjs" || status=$?
node "$SCEN/estimate-invoice.mjs" || status=$?
exit $status
