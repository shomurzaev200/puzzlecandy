#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
file="${1:?usage: restore_db.sh backup.sql}"
psql "$DATABASE_URL" < "$file"
echo "Restored $file"
