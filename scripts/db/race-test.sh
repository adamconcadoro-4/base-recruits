#!/usr/bin/env bash
# Concurrency checks for the local test database.
#
# Each scenario runs the same operation from two sessions at once: session A
# holds its transaction open for a moment while session B tries to act on the
# same rows. The database must serialize them so limits and invariants hold.
#
#   scripts/db/race-test.sh

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

BR_TEST_DB="${BR_TEST_DB}_race"
start_local_server
log "Building fresh database ${BR_TEST_DB}"
create_migrated_test_db 2>/dev/null
local_psql "${BR_TEST_DB}" -f "${TEST_BOOTSTRAP_DIR}/10_test_helpers.sql" >/dev/null
local_psql "${BR_TEST_DB}" -f "${TEST_BOOTSTRAP_DIR}/20_registry_fixture.sql" >/dev/null

local_psql "${BR_TEST_DB}" >/dev/null <<'SQL'
create table tests.codes (name text primary key, code text not null);
grant select, insert on tests.codes to public;

select tests.create_user('athlete', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date);
select tests.create_user('inviter', 'athlete', p_date_of_birth => date '2000-01-01');
select tests.create_user('newcomer', null);
select tests.create_user('adm1', 'parent', 'adm1@example.test', p_date_of_birth => date '1980-01-01');
select tests.create_user('adm2', 'parent', 'adm2@example.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('adm1');
select tests.make_admin('adm2');
select tests.create_user('p' || g, 'parent', p_date_of_birth => date '1975-01-01') from generate_series(1, 5) as g;

begin;
select tests.authenticate_as('athlete');
insert into tests.codes select 'c1', code from public.create_family_invite();
insert into tests.codes select 'c2', code from public.create_family_invite();
insert into tests.codes select 'c3', code from public.create_family_invite();
insert into tests.codes select 'c4', code from public.create_family_invite();
insert into tests.codes select 'c5', code from public.create_family_invite();
commit;

-- Three open links already; the athlete may have at most four.
begin; select tests.authenticate_as('p1'); select public.redeem_family_invite((select code from tests.codes where name = 'c1'), 'parent'); commit;
begin; select tests.authenticate_as('p2'); select public.redeem_family_invite((select code from tests.codes where name = 'c2'), 'parent'); commit;
begin; select tests.authenticate_as('p3'); select public.redeem_family_invite((select code from tests.codes where name = 'c3'), 'parent'); commit;

-- Four open invites already; the athlete may have at most five.
begin;
select tests.authenticate_as('inviter');
select public.create_family_invite() from generate_series(1, 4);
commit;

-- A verified coach, and two minor athletes each with an active parent link and
-- a coach_discovery request awaiting that parent's approval.
select tests.create_user('coach', 'coach', 'coach@college.edu', p_date_of_birth => date '1980-01-01');
select tests.create_user('teen_' || x, 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date)
  from unnest(array['a', 'b']) as x;
select tests.create_user('parent_' || x, 'parent', p_date_of_birth => date '1978-01-01')
  from unnest(array['a', 'b']) as x;
SQL

local_psql "${BR_TEST_DB}" >/dev/null <<'SQL'
select tests.verify_coach('coach', 'adm1');
begin; select tests.authenticate_as('teen_a'); insert into tests.codes select 'teen_a', code from public.create_family_invite(); commit;
begin; select tests.authenticate_as('teen_b'); insert into tests.codes select 'teen_b', code from public.create_family_invite(); commit;
begin; select tests.authenticate_as('parent_a'); select public.redeem_family_invite((select code from tests.codes where name = 'teen_a'), 'parent'); commit;
begin; select tests.authenticate_as('parent_b'); select public.redeem_family_invite((select code from tests.codes where name = 'teen_b'), 'parent'); commit;
begin; select tests.authenticate_as('teen_a'); select public.approve_family_link(link_id) from public.list_family_links();
       select public.grant_consent('coach_discovery', 'coach-discovery-v1'); commit;
begin; select tests.authenticate_as('teen_b'); select public.approve_family_link(link_id) from public.list_family_links();
       select public.grant_consent('coach_discovery', 'coach-discovery-v1'); commit;

-- Two premium capabilities that no plan sells yet (catalog race scenarios).
insert into public.capabilities (key, tier, audience, description)
values ('race_capability_x', 'premium', 'registered', 'Race test X.'),
       ('race_capability_y', 'premium', 'registered', 'Race test Y.');
SQL

failures=0
scenarios=0

# race <name> <session A sql> <session B sql> <check sql returning t/f> [b_must_succeed]
race() {
  local name="$1" sql_a="$2" sql_b="$3" check="$4" b_must_succeed="${5:-}"
  local out_a="${LOCAL_DIR}/race-a.log" out_b="${LOCAL_DIR}/race-b.log"
  (printf 'begin;\n%s\nselect pg_sleep(1.5);\ncommit;\n' "${sql_a}" | local_psql "${BR_TEST_DB}" -f - >"${out_a}" 2>&1 || true) &
  local pid=$!
  sleep 0.4
  printf 'begin;\n%s\ncommit;\n' "${sql_b}" | local_psql "${BR_TEST_DB}" -f - >"${out_b}" 2>&1 || true
  wait "${pid}"
  scenarios=$((scenarios + 1))
  local b_ok="yes"
  if [[ -n "${b_must_succeed}" ]] && grep -q "ERROR" "${out_b}"; then
    b_ok="no"
  fi
  if [[ "${b_ok}" == "yes" && "$(local_psql "${BR_TEST_DB}" -At -c "${check}")" == "t" ]]; then
    printf '  ok    %s\n' "${name}"
  else
    printf '  FAIL  %s\n' "${name}"
    sed 's/^/        A: /' "${out_a}" | tail -n 3
    sed 's/^/        B: /' "${out_b}" | tail -n 3
    failures=$((failures + 1))
  fi
}

race "concurrent invite redemptions cannot exceed the four-link limit" \
  "select tests.authenticate_as('p4'); select public.redeem_family_invite((select code from tests.codes where name = 'c4'), 'parent');" \
  "select tests.authenticate_as('p5'); select public.redeem_family_invite((select code from tests.codes where name = 'c5'), 'parent');" \
  "select count(*) = 4 from public.family_links where athlete_id = tests.id('athlete') and status <> 'ended'"

race "concurrent invite creation cannot exceed five open invites" \
  "select tests.authenticate_as('inviter'); select public.create_family_invite();" \
  "select tests.authenticate_as('inviter'); select public.create_family_invite();" \
  "select count(*) = 5 from public.family_invites where athlete_id = tests.id('inviter') and redeemed_at is null and cancelled_at is null"

race "two admins removing each other cannot leave zero admins" \
  "select tests.authenticate_as('adm1'); select public.admin_revoke_role(tests.id('adm2'), 'admin');" \
  "select tests.authenticate_as('adm2'); select public.admin_revoke_role(tests.id('adm1'), 'admin');" \
  "select count(*) = 1 from public.user_roles where role = 'admin'"

race "concurrent onboarding cannot grant two roles" \
  "select tests.authenticate_as('newcomer'); select public.complete_onboarding('athlete');" \
  "select tests.authenticate_as('newcomer'); select public.complete_onboarding('coach');" \
  "select count(*) = 1 from public.user_roles where user_id = tests.id('newcomer')"

race "concurrent identical grants produce one permission and no error" \
  "select tests.authenticate_as('inviter'); select public.grant_consent('coach_discovery', 'coach-discovery-v1');" \
  "select tests.authenticate_as('inviter'); select public.grant_consent('coach_discovery', 'coach-discovery-v1');" \
  "select count(*) = 1 from public.consent_grants where athlete_id = tests.id('inviter') and scope = 'coach_discovery'" \
  b_must_succeed

NO_STALE_APPROVAL="select not private.coach_can_view(tests.id('coach'), tests.id('TEEN'), 'coach_discovery')
    and not exists (select 1 from public.consent_grants g join public.family_links l on l.id = g.guardian_link_id
                     where g.athlete_id = tests.id('TEEN') and g.status = 'active' and l.status <> 'active')"

race "a parent's approval racing the link's end cannot leave the minor visible (approval first)" \
  "select tests.authenticate_as('parent_a'); select public.approve_consent_as_guardian(g.id) from public.consent_grants g where g.status = 'pending_guardian';" \
  "select tests.authenticate_as('teen_a'); select public.end_family_link(link_id) from public.list_family_links();" \
  "${NO_STALE_APPROVAL//TEEN/teen_a}"

race "a parent's approval racing the link's end cannot leave the minor visible (end first)" \
  "select tests.authenticate_as('teen_b'); select public.end_family_link(link_id) from public.list_family_links();" \
  "select tests.authenticate_as('parent_b'); select public.approve_consent_as_guardian(g.id) from public.consent_grants g where g.status = 'pending_guardian';" \
  "${NO_STALE_APPROVAL//TEEN/teen_b}"

NO_CORE_IN_PLANS="select not exists (select 1 from public.plan_capabilities pc join public.capabilities c on c.key = pc.capability_key where c.tier = 'core_free')"

race "re-labelling a capability as core while a plan adds it cannot put core inside a plan (re-label first)" \
  "update public.capabilities set tier = 'core_free', invariant_ref = 4 where key = 'race_capability_x';" \
  "insert into public.plan_capabilities values ('base_recruit', 'race_capability_x');" \
  "${NO_CORE_IN_PLANS}"

race "re-labelling a capability as core while a plan adds it cannot put core inside a plan (plan first)" \
  "insert into public.plan_capabilities values ('base_recruit', 'race_capability_y');" \
  "update public.capabilities set tier = 'core_free', invariant_ref = 4 where key = 'race_capability_y';" \
  "${NO_CORE_IN_PLANS}"

# Registry: two dedicated administrators (the role-removal scenario above
# changes adm1/adm2), one published import, and two reviews of it waiting.
local_psql "${BR_TEST_DB}" >/dev/null <<'SQL'
select tests.create_user('reg' || g, 'parent', 'reg' || g || '@example.test', p_date_of_birth => date '1980-01-01') from generate_series(1, 2) g;
select tests.make_admin('reg1');
select tests.make_admin('reg2');
begin;
select tests.authenticate_as('reg1');
select tests.remember_job('base', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('base'), tests.snapshot_rows());
select public.admin_finalize_import_job(tests.job('base'));
select public.admin_publish_import_job(tests.job('base'));
select tests.remember_job('review_1', public.admin_restage_import_job(tests.job('base')));
select tests.remember_job('review_2', public.admin_restage_import_job(tests.job('base')));
commit;
SQL

race "two administrators starting imports at once leave at most one being staged" \
  "select tests.authenticate_as('reg1'); select tests.create_job(13);" \
  "select tests.authenticate_as('reg2'); select tests.create_job(13);" \
  "select count(*) = 1 from public.data_import_jobs where status = 'staging'"
local_psql "${BR_TEST_DB}" -c "update public.data_import_jobs set status = 'discarded' where status = 'staging';" >/dev/null

race "two reviews published at once: the second is refused as out of date" \
  "select tests.authenticate_as('reg1'); select public.admin_publish_import_job(tests.job('review_1'));" \
  "select tests.authenticate_as('reg2'); select public.admin_publish_import_job(tests.job('review_2'));" \
  "select (select status from public.data_import_jobs where id = tests.job('review_1')) = 'published'
      and (select status from public.data_import_jobs where id = tests.job('review_2')) = 'staged'"

# A review computed while another import is publishing waits for it, so it is
# computed against the published result and stays publishable.
local_psql "${BR_TEST_DB}" >/dev/null <<'SQL'
begin;
select tests.authenticate_as('reg1');
select tests.remember_job('review_3', public.admin_restage_import_job(tests.job('base')));
select tests.remember_job('pending', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('pending'), tests.snapshot_rows());
commit;
SQL

race "a review prepared during a publish is computed after it" \
  "select tests.authenticate_as('reg1'); select public.admin_publish_import_job(tests.job('review_3'));" \
  "select tests.authenticate_as('reg2'); select public.admin_finalize_import_job(tests.job('pending'));" \
  "select (select status from public.data_import_jobs where id = tests.job('review_3')) = 'published'
      and (select base_publish_version from public.data_import_jobs where id = tests.job('pending'))
          = (select publish_version from private.registry_state)" \
  b_must_succeed

local_psql postgres -c "drop database if exists ${BR_TEST_DB} with (force);" >/dev/null

echo
if [[ "${failures}" -gt 0 ]]; then
  echo "Concurrency tests: ${failures} of ${scenarios} scenarios FAILED"
  exit 1
fi
echo "Concurrency tests: ${scenarios} scenarios, all passed"
