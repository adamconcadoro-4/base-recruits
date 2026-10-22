#!/usr/bin/env bash
# Run the database security test suite.
#
#   scripts/db/test.sh                 local throwaway PostgreSQL (default)
#   scripts/db/test.sh 004             only test files whose name contains "004"
#   DATABASE_URL=postgres://… scripts/db/test.sh
#                                      an existing database where the migrations
#                                      are already applied (e.g. `supabase start`).
#                                      Every test runs inside a transaction that
#                                      is rolled back, so nothing is left behind.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

FILTER="${1:-}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_psql() { "${PG_BIN_DIR}/psql" -X -q -v ON_ERROR_STOP=1 "${DATABASE_URL}" "$@"; }
  has_auth="$(run_psql -At -c "select to_regclass('auth.users') is not null and to_regclass('public.profiles') is not null;")"
  [[ "${has_auth}" == "t" ]] || die "DATABASE_URL must point at a database with Supabase Auth and the Base Recruits migrations applied"
  log "Using existing database from DATABASE_URL (migrations assumed applied)"
else
  start_local_server
  log "Building fresh test database ${BR_TEST_DB}"
  create_migrated_test_db
  run_psql() { local_psql "${BR_TEST_DB}" "$@"; }
fi

total_files=0
failed_files=0
total_assertions=0
output_file="${LOCAL_DIR:-/tmp}/db-test-output.log"
mkdir -p "$(dirname "${output_file}")"

shopt -s nullglob
for test_file in "${TEST_DIR}"/*.test.sql; do
  name="$(basename "${test_file}")"
  if [[ -n "${FILTER}" && "${name}" != *"${FILTER}"* ]]; then
    continue
  fi
  total_files=$((total_files + 1))

  if {
       echo "begin;"
       cat "${TEST_BOOTSTRAP_DIR}/10_test_helpers.sql"
       echo "reset role;"
       cat "${test_file}"
       echo "select tests.finish();"
       echo "rollback;"
     } | run_psql -f - >"${output_file}" 2>&1; then
    passed="$(grep -c 'NOTICE:  PASS:' "${output_file}" || true)"
    total_assertions=$((total_assertions + passed))
    printf '  ok    %-48s %3d assertions\n' "${name}" "${passed}"
  else
    failed_files=$((failed_files + 1))
    passed="$(grep -c 'NOTICE:  PASS:' "${output_file}" || true)"
    total_assertions=$((total_assertions + passed))
    printf '  FAIL  %-48s after %d passing assertions\n' "${name}" "${passed}"
    grep -E 'ERROR|FAIL|DETAIL|CONTEXT' "${output_file}" | head -n 12 | sed 's/^/        /'
  fi
done

echo
if [[ "${total_files}" -eq 0 ]]; then
  die "no test files matched"
fi
if [[ "${failed_files}" -gt 0 ]]; then
  echo "Database tests: ${failed_files} of ${total_files} files FAILED (${total_assertions} assertions passed before failures)"
  exit 1
fi
echo "Database tests: ${total_files} files, ${total_assertions} assertions, all passed"
