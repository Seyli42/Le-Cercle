#!/usr/bin/env bash
# Runs the migrations and the pgTAP tests on a throwaway database of a plain Postgres.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres ./scripts/test-db.sh
# With Docker + Supabase CLI you can use `npx supabase test db` instead.
set -euo pipefail

ADMIN_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="le_cercle_test_$$"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$ADMIN_URL" -qc "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

run supabase/tests/supabase_stub.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done

status=0
for test in supabase/tests/database/*.test.sql; do
  echo "▶ $test"
  output=$(psql "$TEST_URL" -v ON_ERROR_STOP=1 -X -q -t -A -f "$test" 2>&1) || status=1
  echo "$output"
  if grep -qE '^not ok|Looks like you failed|ERROR' <<<"$output"; then status=1; fi
done

if [ "$status" -ne 0 ]; then echo "❌ Tests base de données en échec"; else echo "✅ Tests base de données OK"; fi
exit "$status"
