#!/usr/bin/env bash
# Session checks for in-memory verification: restart the stack with 3-minute
# sessions, run the checks (about 7 minutes of waiting for tokens to expire),
# then restart it with hour-long sessions again. Data is kept.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../down.sh"
LOCAL_JWT_EXP=180 "$SCEN/../up.sh"
status=0
node "$SCEN/session-checks.mjs" || status=$?
"$SCEN/../down.sh"
"$SCEN/../up.sh"
exit $status
