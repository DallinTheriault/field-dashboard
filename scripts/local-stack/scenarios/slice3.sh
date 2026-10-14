#!/usr/bin/env bash
# Slice 3 end to end: rebuild at v095, leave a "needs a price" line the
# slice-2 way, apply v096 on top, then run the invoice-from-job checks.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APPLY_THROUGH=95 "$HERE/../up.sh" --fresh
PHASE=before node "$HERE/slice3-invoice.mjs"
"$HERE/../migrate.sh"
node "$HERE/slice3-invoice.mjs"
