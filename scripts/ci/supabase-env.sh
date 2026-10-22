#!/usr/bin/env bash
# Print the local Supabase stack's settings (`supabase start`) as KEY=value
# lines for $GITHUB_ENV or a .env.local file. The keys are the CLI's fixed local
# development keys, not secrets.

set -euo pipefail

status="$(supabase status -o env 2>/dev/null)"

get() {
  printf '%s\n' "${status}" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -n 1
}

api_url="$(get API_URL)"
public_key="$(get ANON_KEY)"
[[ -n "${public_key}" ]] || public_key="$(get PUBLISHABLE_KEY)"
secret_key="$(get SERVICE_ROLE_KEY)"
[[ -n "${secret_key}" ]] || secret_key="$(get SECRET_KEY)"
db_url="$(get DB_URL)"
mail_url="$(get MAILPIT_URL)"
[[ -n "${mail_url}" ]] || mail_url="$(get INBUCKET_URL)"

if [[ -z "${api_url}" || -z "${public_key}" || -z "${secret_key}" || -z "${db_url}" ]]; then
  echo "Could not read the local Supabase settings. Variables reported:" >&2
  printf '%s\n' "${status}" | cut -d= -f1 >&2
  exit 1
fi

cat <<EOF
NEXT_PUBLIC_SUPABASE_URL=${api_url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${public_key}
SUPABASE_SECRET_KEY=${secret_key}
DATABASE_URL=${db_url}
MAILPIT_URL=${mail_url:-http://127.0.0.1:54324}
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_APP_ENV=test
EOF
