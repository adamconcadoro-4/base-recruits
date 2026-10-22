#!/usr/bin/env bash
# Manage the local throwaway PostgreSQL used for database tests.
#
#   scripts/db/local.sh start     start (initialising on first run)
#   scripts/db/local.sh stop
#   scripts/db/local.sh reset     recreate the test database with all migrations
#   scripts/db/local.sh psql      open psql on the test database
#
# This is a plain PostgreSQL server with Supabase's roles and auth functions
# emulated for testing. For full local Supabase (Auth, Data API, Studio), use
# the Supabase CLI instead: `supabase start` (requires Docker).

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

case "${1:-}" in
  start)
    start_local_server
    ;;
  stop)
    stop_local_server
    ;;
  reset)
    start_local_server
    create_migrated_test_db
    log "Test database ${BR_TEST_DB} is ready"
    ;;
  psql)
    start_local_server
    shift
    local_psql "${BR_TEST_DB}" "$@"
    ;;
  *)
    echo "usage: $0 {start|stop|reset|psql}" >&2
    exit 64
    ;;
esac
