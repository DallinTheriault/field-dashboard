#!/usr/bin/env bash
# Stop the local stack. Data stays in $FIELDSTACK; `up.sh --fresh` wipes it.
source "$(dirname "$0")/lib.sh"

for name in gateway storage auth rest stripe-shim stripe-mock mail-sink; do
  f="$PG_RUN/$name.pid"
  if [ -s "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  fi
done
if [ -s "$PG_DATA/PG_VERSION" ]; then
  as_postgres "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
fi
echo "stack stopped"
