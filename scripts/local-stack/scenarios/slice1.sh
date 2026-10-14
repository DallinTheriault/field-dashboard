#!/usr/bin/env bash
# Slice 1 end to end: rebuild at v092, make an estimate the old way, apply
# v093 on top of it, then run the price-book scenarios.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APPLY_THROUGH=92 "$HERE/../up.sh" --fresh
node "$HERE/seed-estimate.mjs"
"$HERE/../migrate.sh"
node "$HERE/slice1-price-book.mjs"
