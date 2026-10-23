-- =============================================================================
-- Base Recruits — Discovery pilot remediation (audit of 2026-10-23)
--
--  1. Current admissions policies, kept apart from historical admissions
--     statistics (BR-04). A school's IPEDS test policy describes a past
--     entering class; a current policy is a separate, checked fact with its
--     applicant type, entry year, exceptions and official source.
--  2. Saved schools for free accounts (BR-02): unlimited, idempotent, never
--     gated by a plan.
--  3. Correction reports (BR-09): signed-in users report a wrong or missing
--     fact; administrators resolve them.
--  4. Free public reads used by those features: school summaries by slug and
--     current policies by slug (SECURITY INVOKER, row-level security applies).
--  5. Coverage counts that include checked current policies.
--
-- Additive only: no existing table, column or function signature changes.
-- Rollback: see docs/remediation/discovery-pilot.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Current admissions policies
-- -----------------------------------------------------------------------------
-- public.applicant_type ('first_year', 'transfer') already exists (foundation migration).

create table public.admissions_policies (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  applicant_type public.applicant_type not null,
  -- The fall the applicant would enroll, e.g. 2026 = students entering in fall 2026.
  entry_year smallint not null constraint admissions_policies_entry_year check (entry_year between 2020 and 2100),
  test_policy public.test_policy not null,
  exceptions text constraint admissions_policies_exceptions check (exceptions is null or length(exceptions) between 3 and 1000),
  source_url text not null constraint admissions_policies_source_url check (private.is_web_url(source_url, true)),
  source_title text constraint admissions_policies_source_title check (source_title is null or length(source_title) between 3 and 200),
  verified_at timestamptz not null default now(),
  verified_by uuid,
  note text constraint admissions_policies_note check (note is null or length(note) <= 1000),
  is_current boolean not null default true,
  superseded_at timestamptz,
  constraint admissions_policies_superseded check (is_current = (superseded_at is null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.admissions_policies is
  'Testing policies checked by an administrator against the school''s official admissions page, for one applicant type and entry year. Separate from admissions_statistics, which describe a past entering class.';
create unique index admissions_policies_one_current
  on public.admissions_policies (institution_id, applicant_type, entry_year) where is_current;
create index admissions_policies_institution_idx on public.admissions_policies (institution_id) where is_current;

create trigger admissions_policies_updated_at before update on public.admissions_policies
  for each row execute function private.set_updated_at();

alter table public.registry_revisions drop constraint registry_revisions_entity;
alter table public.registry_revisions add constraint registry_revisions_entity
  check (entity_type in ('institution', 'alias', 'baseball_program', 'admissions', 'costs', 'admissions_policy'));
create trigger admissions_policies_revision after insert or update or delete on public.admissions_policies
  for each row execute function private.record_registry_revision('admissions_policy');

alter table public.admissions_policies enable row level security;
revoke all on public.admissions_policies from anon, authenticated, service_role;
-- Who checked a policy and their internal note stay out of the Data API.
grant select (id, institution_id, applicant_type, entry_year, test_policy, exceptions, source_url, source_title,
              verified_at, is_current, superseded_at, created_at, updated_at)
  on public.admissions_policies to anon, authenticated;
create policy admissions_policies_visible on public.admissions_policies for select to anon, authenticated
  using (exists (select 1 from public.institutions i where i.id = institution_id));

-- Records a checked policy. A policy already on record for the same school,
-- applicant type and entry year is kept in history and marked superseded.
create function public.admin_set_admissions_policy(
  p_institution_id uuid,
  p_applicant_type public.applicant_type,
  p_entry_year integer,
  p_test_policy public.test_policy,
  p_exceptions text,
  p_source_url text,
  p_source_title text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_this_year integer := extract(year from private.today_utc())::integer;
  v_id uuid;
begin
  if p_institution_id is null or p_applicant_type is null or p_test_policy is null or p_entry_year is null then
    raise exception 'school, applicant type, entry year and policy are required' using errcode = 'BR003';
  end if;
  if p_entry_year < v_this_year - 1 or p_entry_year > v_this_year + 3 then
    raise exception 'entry year must be between last year and three years from now' using errcode = 'BR003';
  end if;
  if not private.is_web_url(p_source_url, true) then
    raise exception 'an https link to the school''s official admissions page is required' using errcode = 'BR003';
  end if;
  if not exists (select 1 from public.institutions i where i.id = p_institution_id) then
    raise exception 'unknown school' using errcode = 'BR003';
  end if;

  perform private.set_registry_context(null, coalesce(nullif(btrim(p_note), ''), 'Admissions policy checked against the official page'));
  -- Serialize changes to the same school's policies.
  perform 1 from public.institutions i where i.id = p_institution_id for update;

  update public.admissions_policies
     set is_current = false, superseded_at = now()
   where institution_id = p_institution_id and applicant_type = p_applicant_type
     and entry_year = p_entry_year and is_current;

  insert into public.admissions_policies (institution_id, applicant_type, entry_year, test_policy, exceptions,
                                          source_url, source_title, verified_by, note)
  values (p_institution_id, p_applicant_type, p_entry_year, p_test_policy, nullif(btrim(p_exceptions), ''),
          btrim(p_source_url), nullif(btrim(p_source_title), ''), v_admin, nullif(btrim(p_note), ''))
  returning id into v_id;

  perform private.log_audit('registry.admissions_policy_set', 'admissions_policy', v_id::text, null,
                            jsonb_build_object('institution_id', p_institution_id, 'applicant_type', p_applicant_type,
                                               'entry_year', p_entry_year, 'test_policy', p_test_policy), v_admin);
  return v_id;
end;
$$;

-- Withdraws a policy recorded by mistake (it stays in history).
create function public.admin_retire_admissions_policy(p_policy_id uuid, p_note text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'say why the policy is withdrawn' using errcode = 'BR003';
  end if;
  perform private.set_registry_context(null, btrim(p_note));
  update public.admissions_policies set is_current = false, superseded_at = now()
   where id = p_policy_id and is_current;
  if not found then
    raise exception 'no current policy with that id' using errcode = 'BR004';
  end if;
  perform private.log_audit('registry.admissions_policy_retired', 'admissions_policy', p_policy_id::text, null,
                            '{}'::jsonb, v_admin);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Saved schools (free accounts; no plan, quota or trial ever applies)
-- -----------------------------------------------------------------------------
create table public.saved_schools (
  user_id uuid not null references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  saved_at timestamptz not null default clock_timestamp(),
  primary key (user_id, institution_id)
);
comment on table public.saved_schools is
  'Schools a signed-in user saved. Unlimited and free (product invariant 4); saves are never removed by plan changes.';
create index saved_schools_institution_idx on public.saved_schools (institution_id);

alter table public.saved_schools enable row level security;
revoke all on public.saved_schools from anon, authenticated, service_role;
grant select (user_id, institution_id, saved_at) on public.saved_schools to authenticated;
create policy saved_schools_own on public.saved_schools for select to authenticated
  using (user_id = (select auth.uid()));

-- Saves any number of schools by slug (at most 1,000 per call). Idempotent:
-- saving a school twice keeps the first save. Used both for single saves and
-- for moving a browser's guest list into an account.
create function public.save_schools(p_slugs text[]) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slugs text[];
  v_added integer;
  v_found text[];
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if p_slugs is null or cardinality(p_slugs) = 0 then
    return jsonb_build_object('added', 0, 'saved', '[]'::jsonb, 'unknown', '[]'::jsonb);
  end if;
  if cardinality(p_slugs) > 1000 then
    raise exception 'send at most 1,000 schools at a time' using errcode = 'BR003';
  end if;
  select coalesce(array_agg(distinct lower(btrim(s))), '{}') into v_slugs
    from unnest(p_slugs) s where s is not null and length(s) <= 120;

  select coalesce(array_agg(i.slug), '{}') into v_found
    from public.institutions i where i.slug = any (v_slugs) and i.is_listed;

  insert into public.saved_schools (user_id, institution_id)
  select v_uid, i.id from public.institutions i where i.slug = any (v_found)
  on conflict (user_id, institution_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object(
    'added', v_added,
    'saved', to_jsonb(v_found),
    'unknown', to_jsonb(array(select s from unnest(v_slugs) s where s <> all (v_found) order by s)));
end;
$$;

create function public.unsave_school(p_slug text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  delete from public.saved_schools s
   using public.institutions i
   where s.user_id = v_uid and s.institution_id = i.id and i.slug = lower(btrim(p_slug));
  return found;
end;
$$;

-- The caller's saved schools, newest first. Schools an administrator has
-- unlisted are not shown but stay saved.
create function public.my_saved_schools() returns table (slug text, saved_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.slug, s.saved_at
    from public.saved_schools s join public.institutions i on i.id = s.institution_id
   where s.user_id = (select auth.uid())
   order by s.saved_at desc, i.slug
$$;

-- -----------------------------------------------------------------------------
-- 3. Correction reports
-- -----------------------------------------------------------------------------
create type public.correction_topic as enum
  ('division', 'conference', 'baseball_links', 'admissions', 'test_policy', 'cost', 'school_details', 'other');
create type public.correction_status as enum ('open', 'resolved', 'dismissed');

create table public.correction_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  topic public.correction_topic not null,
  details text not null constraint correction_reports_details check (length(btrim(details)) between 10 and 2000),
  evidence_url text constraint correction_reports_evidence check (evidence_url is null or private.is_web_url(evidence_url, false)),
  status public.correction_status not null default 'open',
  resolution_note text constraint correction_reports_resolution check (resolution_note is null or length(resolution_note) <= 1000),
  resolved_by uuid,
  resolved_at timestamptz,
  constraint correction_reports_resolved check ((status = 'open') = (resolved_at is null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.correction_reports is
  'Reports of a wrong or missing registry fact. Nothing changes until an administrator checks an official source and corrects the record.';
create index correction_reports_open_idx on public.correction_reports (created_at) where status = 'open';
create index correction_reports_reporter_idx on public.correction_reports (reporter_id, created_at desc);
create trigger correction_reports_updated_at before update on public.correction_reports
  for each row execute function private.set_updated_at();

alter table public.correction_reports enable row level security;
revoke all on public.correction_reports from anon, authenticated, service_role;
grant select (id, institution_id, reporter_id, topic, details, evidence_url, status, resolution_note, resolved_at,
              created_at, updated_at)
  on public.correction_reports to authenticated;
create policy correction_reports_own_or_admin on public.correction_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

create function public.submit_correction_report(
  p_slug text,
  p_topic public.correction_topic,
  p_details text,
  p_evidence_url text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_institution uuid;
  v_recent integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if private.is_age_blocked(v_uid) then
    raise exception 'account not allowed' using errcode = 'BR002';
  end if;
  if p_topic is null or p_details is null or length(btrim(p_details)) not between 10 and 2000 then
    raise exception 'describe the problem in 10 to 2,000 characters' using errcode = 'BR003';
  end if;
  if nullif(btrim(p_evidence_url), '') is not null and not private.is_web_url(btrim(p_evidence_url), false) then
    raise exception 'the evidence link must be a web address' using errcode = 'BR003';
  end if;
  select i.id into v_institution from public.institutions i where i.slug = lower(btrim(p_slug)) and i.is_listed;
  if v_institution is null then
    raise exception 'unknown school' using errcode = 'BR003';
  end if;

  -- At most 20 reports a day per person (check-then-write under a per-user lock).
  perform pg_advisory_xact_lock(hashtextextended('base_recruits.correction_reports:' || v_uid::text, 0));
  select count(*) into v_recent from public.correction_reports r
   where r.reporter_id = v_uid and r.created_at > now() - interval '1 day';
  if v_recent >= 20 then
    raise exception 'too many reports today; try again tomorrow' using errcode = 'BR005';
  end if;

  insert into public.correction_reports (institution_id, reporter_id, topic, details, evidence_url)
  values (v_institution, v_uid, p_topic, btrim(p_details), nullif(btrim(p_evidence_url), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.admin_resolve_correction_report(
  p_report_id uuid,
  p_status public.correction_status,
  p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  if p_status is null or p_status = 'open' then
    raise exception 'choose resolved or dismissed' using errcode = 'BR003';
  end if;
  update public.correction_reports
     set status = p_status, resolution_note = nullif(btrim(p_note), ''), resolved_by = v_admin, resolved_at = now()
   where id = p_report_id and status = 'open';
  if not found then
    raise exception 'report not found or already closed' using errcode = 'BR004';
  end if;
  perform private.log_audit('registry.correction_report_closed', 'correction_report', p_report_id::text, null,
                            jsonb_build_object('status', p_status), v_admin);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Free public reads
-- -----------------------------------------------------------------------------

-- Search-result summaries for a list of schools, in the order given (saved
-- schools, a guest's browser list, score comparison candidates). Same columns
-- as search_schools. Unknown and unlisted schools are left out.
create function public.schools_by_slugs(p_slugs text[])
returns table (
  slug text,
  name text,
  city text,
  state text,
  control public.institution_control,
  level public.institution_level,
  setting public.campus_setting,
  undergraduate_enrollment integer,
  enrollment_term text,
  association_code text,
  association_short_name text,
  division_code text,
  division_name text,
  two_year_association boolean,
  conference text,
  program_season text,
  verification public.program_verification,
  admissions_term text,
  admission_rate numeric,
  sat_erw_25 smallint,
  sat_erw_75 smallint,
  sat_math_25 smallint,
  sat_math_75 smallint,
  act_composite_25 smallint,
  act_composite_75 smallint,
  test_policy public.test_policy,
  cost_year text,
  cost_of_attendance integer,
  tuition_in_state integer,
  tuition_out_of_state integer,
  relevance real,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with wanted as (
    select distinct on (lower(btrim(x.slug))) lower(btrim(x.slug)) as slug, x.position
      from unnest(p_slugs[1:1000]) with ordinality as x(slug, position)
     where x.slug is not null
     order by lower(btrim(x.slug)), x.position
  ), found_rows as (
    select i.slug, i.name, i.city, i.state, i.control, i.level, i.setting, i.undergraduate_enrollment, i.enrollment_term,
           p.association_code, aa.short_name as association_short_name, p.division_code, d.name as division_name,
           aa.two_year as two_year_association, p.conference, p.season as program_season, p.verification,
           a.term as admissions_term, a.admission_rate, a.sat_erw_25, a.sat_erw_75, a.sat_math_25, a.sat_math_75,
           a.act_composite_25, a.act_composite_75, a.test_policy,
           c.academic_year as cost_year, c.cost_of_attendance, c.tuition_in_state, c.tuition_out_of_state,
           w.position
      from wanted w
      join public.institutions i on i.slug = w.slug and i.is_listed
      join public.baseball_programs p on p.institution_id = i.id
      join public.athletic_divisions d on d.code = p.division_code
      join public.athletic_associations aa on aa.code = p.association_code
      left join lateral (select s.term, s.admission_rate, s.sat_erw_25, s.sat_erw_75, s.sat_math_25, s.sat_math_75,
                                s.act_composite_25, s.act_composite_75, s.test_policy
                           from public.admissions_statistics s
                          where s.institution_id = i.id order by s.term_year desc limit 1) a on true
      left join lateral (select k.academic_year, k.cost_of_attendance, k.tuition_in_state, k.tuition_out_of_state
                           from public.institution_costs k
                          where k.institution_id = i.id order by k.academic_year desc limit 1) c on true
  )
  select r.slug, r.name, r.city, r.state, r.control, r.level, r.setting, r.undergraduate_enrollment, r.enrollment_term,
         r.association_code, r.association_short_name, r.division_code, r.division_name, r.two_year_association,
         r.conference, r.program_season, r.verification, r.admissions_term, r.admission_rate,
         r.sat_erw_25, r.sat_erw_75, r.sat_math_25, r.sat_math_75, r.act_composite_25, r.act_composite_75, r.test_policy,
         r.cost_year, r.cost_of_attendance, r.tuition_in_state, r.tuition_out_of_state, 0::real,
         count(*) over ()
    from found_rows r
   order by r.position
$$;
comment on function public.schools_by_slugs(text[]) is
  'Free summaries for up to 1,000 schools by slug, in the order given. Unknown and unlisted schools are left out.';

-- Checked current policies for a list of schools (up to 1,000), newest entry year first.
create function public.current_admissions_policies(p_slugs text[])
returns table (
  slug text,
  applicant_type public.applicant_type,
  entry_year smallint,
  test_policy public.test_policy,
  exceptions text,
  source_url text,
  source_title text,
  verified_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.slug, p.applicant_type, p.entry_year, p.test_policy, p.exceptions, p.source_url, p.source_title, p.verified_at
    from public.admissions_policies p
    join public.institutions i on i.id = p.institution_id
   where p.is_current
     and i.slug = any (select lower(btrim(s)) from unnest(p_slugs[1:1000]) s where s is not null)
   order by i.slug, p.applicant_type, p.entry_year desc
$$;
comment on function public.current_admissions_policies(text[]) is
  'Admissions testing policies checked against official pages, by school. A school with none has no checked current policy.';

-- -----------------------------------------------------------------------------
-- 5. Coverage: the same listed, active programs visitors see, plus checked policies
-- -----------------------------------------------------------------------------
create or replace function public.registry_coverage() returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with listed as (
    select i.id, i.level, p.status, p.division_code, p.association_code, p.verification, p.conference, p.season,
           p.source_retrieved_at,
           (select s.term from public.admissions_statistics s where s.institution_id = i.id order by s.term_year desc limit 1) as adm_term,
           (select s.term_year from public.admissions_statistics s where s.institution_id = i.id order by s.term_year desc limit 1) as adm_year,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id and s.admission_rate is not null) as has_rate,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id
                    and (s.sat_math_25 is not null or s.act_composite_25 is not null)) as has_scores,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id and s.test_policy is not null) as has_policy,
           exists (select 1 from public.institution_costs c where c.institution_id = i.id and c.cost_of_attendance is not null) as has_cost,
           exists (select 1 from public.admissions_policies ap where ap.institution_id = i.id and ap.is_current
                    and ap.applicant_type = 'first_year') as has_current_policy
      from public.institutions i join public.baseball_programs p on p.institution_id = i.id
     where i.is_listed
  ), active as (select * from listed where status = 'active'),
  newest as (select max(adm_year) as y from active)
  select jsonb_build_object(
    'active_programs', (select count(*) from active),
    'programs_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                             from (select status, count(*) n from listed group by status) x),
    'by_division', (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'association', d.association_code,
                                                                   'count', (select count(*) from active a where a.division_code = d.code))
                                              order by d.sort_order), '[]'::jsonb)
                      from public.athletic_divisions d),
    'seasons', (select coalesce(jsonb_agg(distinct season), '[]'::jsonb) from active),
    'with_admission_rate', (select count(*) from active where has_rate),
    'with_test_scores', (select count(*) from active where has_scores),
    'with_test_policy', (select count(*) from active where has_policy),
    'with_current_test_policy', (select count(*) from active where has_current_policy),
    'with_cost_of_attendance', (select count(*) from active where has_cost),
    'with_gpa', 0,
    'four_year_without_admissions', (select count(*) from active where level = 'four_year' and adm_term is null),
    'stale_admissions', (select count(*) from active, newest where adm_year is not null and adm_year < newest.y),
    'latest_admissions_term', (select max(adm_term) from active),
    'latest_cost_year', (select max(c.academic_year) from public.institution_costs c
                          join active a on a.id = c.institution_id),
    'association_or_school_verified', (select count(*) from active where verification <> 'federal_report'),
    'federal_report_only', (select count(*) from active where verification = 'federal_report'),
    'reported_as_other', (select count(*) from active where division_code = 'other'),
    'with_conference', (select count(*) from active where conference is not null),
    'last_retrieved_at', (select max(source_retrieved_at) from active))
$$;

-- -----------------------------------------------------------------------------
-- Privileges: every function starts closed, then opens to exactly who needs it.
-- -----------------------------------------------------------------------------
revoke all on function public.admin_set_admissions_policy(uuid, public.applicant_type, integer, public.test_policy, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_retire_admissions_policy(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.save_schools(text[]) from public, anon, authenticated, service_role;
revoke all on function public.unsave_school(text) from public, anon, authenticated, service_role;
revoke all on function public.my_saved_schools() from public, anon, authenticated, service_role;
revoke all on function public.submit_correction_report(text, public.correction_topic, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_resolve_correction_report(uuid, public.correction_status, text)
  from public, anon, authenticated, service_role;
revoke all on function public.schools_by_slugs(text[]) from public, anon, authenticated, service_role;
revoke all on function public.current_admissions_policies(text[]) from public, anon, authenticated, service_role;
revoke all on function public.registry_coverage() from public, anon, authenticated, service_role;

grant execute on function public.admin_set_admissions_policy(uuid, public.applicant_type, integer, public.test_policy, text, text, text, text)
  to authenticated;
grant execute on function public.admin_retire_admissions_policy(uuid, text) to authenticated;
grant execute on function public.save_schools(text[]) to authenticated;
grant execute on function public.unsave_school(text) to authenticated;
grant execute on function public.my_saved_schools() to authenticated;
grant execute on function public.submit_correction_report(text, public.correction_topic, text, text) to authenticated;
grant execute on function public.admin_resolve_correction_report(uuid, public.correction_status, text) to authenticated;
grant execute on function public.schools_by_slugs(text[]) to anon, authenticated;
grant execute on function public.current_admissions_policies(text[]) to anon, authenticated;
grant execute on function public.registry_coverage() to anon, authenticated;
