#!/usr/bin/env bash
# A failed read shows an error, never an empty page: for each table, restart
# the gateway failing its reads (GATEWAY_FAIL), check the pages that use it,
# then put the gateway back. Needs the app on :3000 against the local stack.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
source "$SCEN/../lib.sh"

status=0
for table in expenses mileage_entries payments time_entries pricing_settings notifications; do
  restart_gateway GATEWAY_FAIL="^/$table\\b"
  node "$SCEN/failed-reads.mjs" "$table" || status=1
done
restart_gateway
exit $status
