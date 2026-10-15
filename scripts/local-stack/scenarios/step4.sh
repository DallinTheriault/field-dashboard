#!/usr/bin/env bash
# Step 4 end to end: a fresh stack with every migration, then the checks.
set -euo pipefail
SCEN="$(cd "$(dirname "$0")" && pwd)"
"$SCEN/../up.sh" --fresh
node "$SCEN/step4-cleanup.mjs"
