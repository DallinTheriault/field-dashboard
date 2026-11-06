#!/usr/bin/env bash
# A save's second step that fails is said on screen. Fails one table's PATCHes
# at a time at the gateway, then puts the gateway back. App on :3000.
set -uo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
source "$SCEN/../lib.sh"
status=0
restart_gateway GATEWAY_FAIL='^/jobs\b' GATEWAY_FAIL_METHOD=PATCH
node "$SCEN/second-steps.mjs" jobs || status=1
restart_gateway GATEWAY_FAIL='^/contacts\b' GATEWAY_FAIL_METHOD=PATCH
node "$SCEN/second-steps.mjs" contacts || status=1
restart_gateway
exit $status
