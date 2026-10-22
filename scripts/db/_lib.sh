#!/usr/bin/env bash
# Shared helpers for the local database scripts. Sourced, not executed.
# Requires PostgreSQL 15+ server binaries (initdb, pg_ctl, postgres, psql).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_DIR="${REPO_ROOT}/.local"
BR_PG_DATA="${BR_PG_DATA:-${LOCAL_DIR}/postgres}"
BR_PG_SOCKET_DIR="${BR_PG_SOCKET_DIR:-${LOCAL_DIR}/run}"
BR_PG_PORT="${BR_PG_PORT:-54329}"
BR_PG_LOG="${LOCAL_DIR}/postgres.log"
BR_TEST_DB="${BR_TEST_DB:-base_recruits_test}"

MIGRATIONS_DIR="${REPO_ROOT}/supabase/migrations"
TEST_BOOTSTRAP_DIR="${REPO_ROOT}/supabase/tests/bootstrap"
TEST_DIR="${REPO_ROOT}/supabase/tests/database"

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

# Locate PostgreSQL server binaries: $PG_BIN, PATH, Debian/Ubuntu, Homebrew.
find_pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then
    echo "${PG_BIN}"
    return
  fi
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  local candidate
  for candidate in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V -r) \
                   $(ls -d /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null | sort -V -r); do
    if [[ -x "${candidate}/pg_ctl" ]]; then
      echo "${candidate}"
      return
    fi
  done
  die "PostgreSQL server binaries not found. Install PostgreSQL 15+ or set PG_BIN."
}

PG_BIN_DIR="$(find_pg_bin)"

# PostgreSQL refuses to run as root; use an unprivileged OS account when needed.
as_pg_user() {
  if [[ "$(id -u)" == "0" ]]; then
    local os_user="${BR_PG_OS_USER:-postgres}"
    id "${os_user}" >/dev/null 2>&1 || die "running as root: set BR_PG_OS_USER to an unprivileged OS user"
    runuser -u "${os_user}" -- "$@"
  else
    "$@"
  fi
}

ensure_local_dirs() {
  mkdir -p "${LOCAL_DIR}" "${BR_PG_SOCKET_DIR}"
  if [[ "$(id -u)" == "0" ]]; then
    local os_user="${BR_PG_OS_USER:-postgres}"
    chown "${os_user}" "${BR_PG_SOCKET_DIR}"
    mkdir -p "${BR_PG_DATA}"
    chown "${os_user}" "${BR_PG_DATA}"
    touch "${BR_PG_LOG}"
    chown "${os_user}" "${BR_PG_LOG}"
  fi
}

local_server_running() {
  [[ -f "${BR_PG_DATA}/postmaster.pid" ]] && as_pg_user "${PG_BIN_DIR}/pg_ctl" -D "${BR_PG_DATA}" status >/dev/null 2>&1
}

start_local_server() {
  ensure_local_dirs
  if [[ ! -f "${BR_PG_DATA}/PG_VERSION" ]]; then
    log "Initializing local PostgreSQL cluster in ${BR_PG_DATA}"
    as_pg_user "${PG_BIN_DIR}/initdb" -D "${BR_PG_DATA}" -U postgres --auth=trust \
      --encoding=UTF8 --locale=C >/dev/null
  fi
  if local_server_running; then
    return
  fi
  log "Starting local PostgreSQL on socket ${BR_PG_SOCKET_DIR} port ${BR_PG_PORT}"
  as_pg_user "${PG_BIN_DIR}/pg_ctl" -D "${BR_PG_DATA}" -l "${BR_PG_LOG}" -w \
    -o "-p ${BR_PG_PORT} -k ${BR_PG_SOCKET_DIR} -c listen_addresses=''" start >/dev/null
}

stop_local_server() {
  if local_server_running; then
    as_pg_user "${PG_BIN_DIR}/pg_ctl" -D "${BR_PG_DATA}" -m fast stop >/dev/null
    log "Stopped local PostgreSQL"
  else
    log "Local PostgreSQL is not running"
  fi
}

# psql against the local server: local_psql <database> [psql args...]
local_psql() {
  local db="$1"
  shift
  "${PG_BIN_DIR}/psql" -X -q -v ON_ERROR_STOP=1 -h "${BR_PG_SOCKET_DIR}" -p "${BR_PG_PORT}" -U postgres -d "${db}" "$@"
}

# Recreate the test database, apply the Supabase emulation and all migrations.
create_migrated_test_db() {
  local_psql postgres -c "drop database if exists ${BR_TEST_DB} with (force);" >/dev/null
  local_psql postgres -c "create database ${BR_TEST_DB};" >/dev/null
  local_psql "${BR_TEST_DB}" -f "${TEST_BOOTSTRAP_DIR}/00_supabase_emulation.sql" >/dev/null

  local file version name
  for file in "${MIGRATIONS_DIR}"/*.sql; do
    version="$(basename "${file}" | cut -d_ -f1)"
    name="$(basename "${file}" .sql | cut -d_ -f2-)"
    if ! local_psql "${BR_TEST_DB}" --single-transaction -f "${file}" >/dev/null 2>"${LOCAL_DIR}/migration-error.log"; then
      log "Migration failed: $(basename "${file}")"
      cat "${LOCAL_DIR}/migration-error.log" >&2
      exit 1
    fi
    local_psql "${BR_TEST_DB}" -c \
      "insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');" >/dev/null
    log "  applied ${version} ${name}"
  done
}
