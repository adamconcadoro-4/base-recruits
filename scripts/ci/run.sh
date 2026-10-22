#!/usr/bin/env bash
# Run a command in CI; if it fails, publish the tail of its output as a GitHub
# error annotation. Annotations are readable through the checks API, which the
# build workspace can reach, while raw job logs are not.
#
#   scripts/ci/run.sh "<label>" <command> [args...]
#
# The label must not contain ":" or ",".

set -uo pipefail

label="$1"
shift

log_file="$(mktemp)"
"$@" 2>&1 | tee "${log_file}"
status=${PIPESTATUS[0]}

if [[ ${status} -ne 0 ]]; then
  text="$(tail -n "${CI_TAIL_LINES:-80}" "${log_file}" | sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g')"
  text="${text//'%'/'%25'}"
  text="${text//$'\r'/'%0D'}"
  text="${text//$'\n'/'%0A'}"
  echo "::error title=${label} failed (exit ${status})::${text}"
fi
rm -f "${log_file}"
exit "${status}"
