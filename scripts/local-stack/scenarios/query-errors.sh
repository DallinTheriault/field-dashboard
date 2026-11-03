#!/usr/bin/env bash
# Every page's queries succeed: restart the gateway logging each request's
# status, walk every page as owner and member, then put the gateway back.
# Needs the app on :3000 against the local stack.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
source "$SCEN/../lib.sh"

log="$LOGS/query-errors-gateway.log"
: > "$log"
restart_gateway GATEWAY_LOG="$log"
status=0
node "$SCEN/query-errors.mjs" "$log" || status=$?
restart_gateway
exit $status
