#!/usr/bin/env bash
# Runs the database tests on a throwaway local PostgreSQL cluster.
#
# For every supabase/tests/sql/*.test.sql file: create a fresh database, load
# the base schema fixture, apply every migration in supabase/migrations in
# order, load the helpers, run the test file, then report its t_results rows.
#
# Optional seed hook: if supabase/tests/sql/<test name>.before-<version>.sql
# exists, it runs on that test's database just before the migration whose file
# name starts with <version>, so a test can create data with functions that the
# migration later removes and then check what the migration kept.
#
# Never touches the linked Supabase project. Requires PostgreSQL client and
# server binaries (initdb, pg_ctl, psql); set PG_BIN to their directory if
# they are not on PATH. Usage: bash supabase/tests/run.sh [name-filter]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TESTS="$ROOT/supabase/tests"
FILTER="${1:-}"

if [[ -z "${PG_BIN:-}" ]]; then
  if command -v initdb >/dev/null 2>&1; then
    PG_BIN="$(dirname "$(command -v initdb)")"
  else
    shopt -s nullglob
    for candidate in /Library/PostgreSQL/*/bin /opt/homebrew/opt/postgresql*/bin /usr/lib/postgresql/*/bin; do
      [[ -x "$candidate/initdb" ]] && PG_BIN="$candidate"
    done
    shopt -u nullglob
  fi
fi
[[ -x "$PG_BIN/initdb" ]] || { echo "PostgreSQL binaries not found; set PG_BIN" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ip-dbtest.XXXXXX")"
PORT="${PGTEST_PORT:-$((55000 + RANDOM % 1000))}"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" \
  -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -w start >/dev/null

pg() { "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

pg -d postgres -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;"

total=0; failed=0
shopt -s nullglob
for test_file in "$TESTS"/sql/*.test.sql; do
  name="$(basename "$test_file" .test.sql)"
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue
  db="t_$(echo "$name" | tr -c 'a-zA-Z0-9_\n' '_' | tr 'A-Z' 'a-z')"
  pg -d postgres -c "CREATE DATABASE $db" >/dev/null
  pg -d "$db" -f "$TESTS/fixtures/base_schema.sql" >/dev/null
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    seed="$TESTS/sql/$name.before-$(basename "$migration" | cut -d_ -f1).sql"
    if [[ -f "$seed" ]] && ! pg -d "$db" -f "$seed" >/dev/null 2>"$WORK/err"; then
      echo "FAIL [$name] seed $(basename "$seed"): $(cat "$WORK/err")"
      failed=$((failed + 1)); total=$((total + 1)); continue 2
    fi
    if ! pg -d "$db" -f "$migration" >/dev/null 2>"$WORK/err"; then
      echo "FAIL [$name] migration $(basename "$migration"): $(cat "$WORK/err")"
      failed=$((failed + 1)); total=$((total + 1)); continue 2
    fi
  done
  pg -d "$db" -f "$TESTS/fixtures/helpers.sql" >/dev/null
  if ! pg -d "$db" -f "$test_file" >/dev/null 2>"$WORK/err"; then
    echo "FAIL [$name] test script error: $(cat "$WORK/err")"
    failed=$((failed + 1)); total=$((total + 1)); continue
  fi
  while IFS='|' read -r ok label detail; do
    total=$((total + 1))
    if [[ "$ok" == "t" ]]; then
      [[ -n "${VERBOSE:-}" ]] && echo "PASS [$name] $label"
    else
      failed=$((failed + 1)); echo "FAIL [$name] $label :: $detail"
    fi
  done < <(pg -d "$db" -At -F'|' -c "SELECT ok, label, regexp_replace(coalesce(detail, ''), '[[:space:]]+', ' ', 'g') FROM public.t_results ORDER BY n")
done

echo "database tests: $((total - failed)) passed, $failed failed, $total total"
[[ "$failed" -eq 0 && "$total" -gt 0 ]]
