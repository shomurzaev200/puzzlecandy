#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
out="${1:-backup-$(date +%Y%m%d-%H%M%S).sql}"
pg_dump "$DATABASE_URL" > "$out"
echo "Wrote $out"
