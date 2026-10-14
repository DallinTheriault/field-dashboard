#!/usr/bin/env bash
# Slice 2 end to end: rebuild at v094, add a task the old way, apply v095 on
# top of it, then run the priced-task and scope-builder checks.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APPLY_THROUGH=94 "$HERE/../up.sh" --fresh
PHASE=before node "$HERE/slice2-scope.mjs"
"$HERE/../migrate.sh"
node "$HERE/slice2-scope.mjs"
