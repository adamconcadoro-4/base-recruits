-- =============================================================================
-- Assessment: named devices, showcase results and comparison groups
-- =============================================================================
-- Founder's decisions (2026-11-01 and 2026-11-02, F52–F54):
--
-- 1. Device models (F52). Players pick Rapsodo, TrackMan, Blast Motion or
--    Diamond Kinetics by name (names appear only in the device picker). Each
--    observation records which named device it came from, derived from the
--    device kind and name so every entry path agrees. Comparison groups for
--    ball trackers and bat sensors must name one device model, because makers
--    measure "bat speed" and "exit velocity" differently.
--
-- 2. Showcase results (F53). Athletes and families can record numbers from a
--    showcase or event (PBR or another), labelled "entered by the athlete, not
--    checked" until their development coach checks them against the event's
--    published profile. They are kept apart from practice measurements.
--
-- 3. Comparison groups (F54). An athlete may opt in to having their measured
--    results used, without their name, in comparison groups. Under 18, a parent
--    or legal guardian must agree before anything is used. Opting in stays
--    closed until an administrator opens it, after counsel approves the wording.
--    Leaving removes the athlete's values from every group. Administrators build
--    a draft group from opted-in athletes' published results; it still needs 30
--    distinct athletes and an approval before any percentile shows.
--
-- Never collected here: pain, injury, readiness or any other health data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Device models
-- -----------------------------------------------------------------------------

-- The named device a device kind and name refer to, or null. Mirrors
-- deviceModelFor in src/lib/assessment/catalog/devices.ts.
create function private.assessment_device_model(p_kind text, p_label text) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind is null or p_label is null then null
    when p_kind = 'ball_tracking' and lower(p_label) ~ 'rapsodo' then 'rapsodo'
    when p_kind = 'ball_tracking' and lower(p_label) ~ 'track\s*man' then 'trackman'
    when p_kind = 'bat_sensor' and lower(p_label) ~ 'blast' then 'blast_motion'
    when p_kind = 'bat_sensor' and lower(p_label) ~ '(diamond\s*kinetics|swing\s*tracker|\mdk\M)' then 'diamond_kinetics'
  end
$$;
revoke all on function private.assessment_device_model(text, text) from public;

alter table public.assessment_observations
  add column device_model text
    constraint assessment_observations_device_model check (device_model in ('rapsodo', 'trackman', 'blast_motion', 'diamond_kinetics'));
comment on column public.assessment_observations.device_model is
  'The named device this value came from (derived from device_kind and device_label by a trigger); null for any other device.';

update public.assessment_observations o
   set device_model = private.assessment_device_model(o.device_kind, o.device_label)
 where o.device_label is not null;

create function private.set_observation_device_model() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.device_model := private.assessment_device_model(new.device_kind, new.device_label);
  return new;
end;
$$;
revoke all on function private.set_observation_device_model() from public;

create trigger assessment_observations_device_model
  before insert or update on public.assessment_observations
  for each row execute function private.set_observation_device_model();

alter table public.assessment_benchmark_releases
  add column device_model text
    constraint assessment_benchmark_releases_device_model check (device_model in ('rapsodo', 'trackman', 'blast_motion', 'diamond_kinetics')),
  add column built_from text not null default 'outside_source'
    constraint assessment_benchmark_releases_built_from check (built_from in ('outside_source', 'opted_in_athletes')),
  add constraint assessment_benchmark_releases_model_kind check (
    device_model is null
    or (device_model in ('rapsodo', 'trackman') and device_kind = 'ball_tracking')
    or (device_model in ('blast_motion', 'diamond_kinetics') and device_kind = 'bat_sensor'));
-- Existing rows are left alone (none exist in production); new rows must name a model.
alter table public.assessment_benchmark_releases
  add constraint assessment_benchmark_releases_named_model check (
    device_kind is null or device_kind not in ('ball_tracking', 'bat_sensor') or device_model is not null) not valid;
comment on column public.assessment_benchmark_releases.device_model is
  'For ball trackers and bat sensors, the one device model every value came from. Percentiles match it exactly.';
comment on column public.assessment_benchmark_releases.built_from is
  'outside_source: loaded by an administrator from a licensed or published source; opted_in_athletes: built from Base Recruits athletes who opted in to comparison groups.';

-- The percentile now also matches the device model. Same signature, so the
-- calculation (private.assessment_results) is unchanged and still mirrors the
-- TypeScript engine. The model is read from the observations the result used:
-- the eligible values of the metric (or of the metric it is derived from). A
-- result reaches this point only when those values came from one device.
create or replace function private.assessment_percentile(
  p_assessment public.assessments,
  p_definition public.assessment_metric_definitions,
  p_statistic text,
  p_unit text,
  p_pitch_type text,
  p_device_kinds text[],
  p_value numeric
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with models as (
    select coalesce(array_agg(distinct coalesce(o.device_model, '')), '{}') as list
      from public.assessment_observations o
      left join public.assessment_repetitions rep on rep.id = o.repetition_id
     where o.assessment_id = p_assessment.id
       and o.metric_key = coalesce(p_definition.derived_from, p_definition.key)
       and o.value is not null and o.quality_state in ('not_reviewed', 'usable', 'limited')
       and (o.repetition_id is null or rep.status = 'valid')
       and (p_pitch_type is null or rep.pitch_type = p_pitch_type)
  ),
  release as (
    select r.*
      from public.assessment_benchmark_releases r
     where r.status = 'approved' and not r.is_synthetic and r.distinct_athletes >= 30
       and r.metric_key = p_definition.key and r.metric_version = p_definition.version
       and r.protocol_key = p_assessment.protocol_key and r.protocol_version = p_assessment.protocol_version
       and r.statistic = p_statistic and r.unit = p_unit
       and r.pitch_type is not distinct from p_pitch_type
       and (r.age_band is null or r.age_band = p_assessment.age_band)
       and (r.competition_level is null or r.competition_level = p_assessment.competition_level)
       and (r.device_kind is null or p_device_kinds = array[r.device_kind])
       and (r.device_model is null or (select m.list from models m) = array[r.device_model])
     order by (r.age_band is not null)::int + (r.competition_level is not null)::int + (r.device_kind is not null)::int
              + (r.device_model is not null)::int desc,
              r.approved_at desc, r.id
     limit 1
  )
  select jsonb_build_object(
           'release_id', release.id,
           'dataset_version', release.dataset_version,
           'reference_count', counts.n,
           'value', round(100 * (counts.below + 0.5 * counts.equal) / counts.n, 1))
    from release
    cross join lateral (
      select count(*) as n,
             count(*) filter (where v.value < p_value) as below,
             count(*) filter (where v.value = p_value) as equal
        from public.assessment_benchmark_values v where v.release_id = release.id) counts
   where p_value is not null and counts.n > 0
$$;

-- Releases from outside sources can now name a device model.
create or replace function public.admin_create_benchmark_release(p_release jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_definition public.assessment_metric_definitions%rowtype;
  v_id uuid;
begin
  if p_release is null or jsonb_typeof(p_release) <> 'object' then
    raise exception 'release details are missing' using errcode = 'BR003';
  end if;
  select * into v_definition from public.assessment_metric_definitions d
   where d.key = p_release ->> 'metric_key' and d.version = (p_release ->> 'metric_version')::smallint;
  if not found or v_definition.scoring = 'rubric' then
    raise exception 'reference benchmarks apply to measured metrics only' using errcode = 'BR003';
  end if;
  if (p_release ->> 'statistic') is distinct from v_definition.aggregation then
    raise exception 'the statistic must match the metric definition (%)', v_definition.aggregation using errcode = 'BR003';
  end if;
  if (p_release ->> 'unit') is distinct from (case when v_definition.aggregation = 'rate' then 'percent' else v_definition.unit end) then
    raise exception 'the unit must match the metric definition' using errcode = 'BR003';
  end if;
  if v_definition.per_pitch_type <> (nullif(p_release ->> 'pitch_type', '') is not null) and v_definition.aggregation <> 'rate' then
    raise exception 'say which pitch type this reference is for' using errcode = 'BR003';
  end if;
  if nullif(p_release ->> 'device_kind', '') in ('ball_tracking', 'bat_sensor') and nullif(p_release ->> 'device_model', '') is null then
    raise exception 'say which device model produced the reference values' using errcode = 'BR003';
  end if;
  insert into public.assessment_benchmark_releases (
    metric_key, metric_version, protocol_key, protocol_version, unit, statistic, pitch_type, age_band,
    competition_level, device_kind, device_model, source, usage_rights, collected_from, collected_to, cohort_description,
    aggregation_note, dataset_version, is_synthetic, repetition_count, note, created_by)
  values (
    v_definition.key, v_definition.version, p_release ->> 'protocol_key', (p_release ->> 'protocol_version')::smallint,
    p_release ->> 'unit', p_release ->> 'statistic', nullif(p_release ->> 'pitch_type', ''),
    nullif(p_release ->> 'age_band', ''), nullif(p_release ->> 'competition_level', ''),
    nullif(p_release ->> 'device_kind', ''), nullif(p_release ->> 'device_model', ''), p_release ->> 'source',
    p_release ->> 'usage_rights',
    (p_release ->> 'collected_from')::date, (p_release ->> 'collected_to')::date, p_release ->> 'cohort_description',
    p_release ->> 'aggregation_note', p_release ->> 'dataset_version',
    coalesce((p_release ->> 'is_synthetic')::boolean, false), (p_release ->> 'repetition_count')::integer,
    nullif(p_release ->> 'note', ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Showcase results
-- -----------------------------------------------------------------------------
create table public.athlete_showcase_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  event_source text not null
    constraint athlete_showcase_results_source check (event_source in ('pbr', 'other_event')),
  event_name text not null
    constraint athlete_showcase_results_event_name check (char_length(event_name) between 3 and 120),
  event_date date not null
    constraint athlete_showcase_results_event_date check (event_date >= date '2000-01-01'),
  measure text not null
    constraint athlete_showcase_results_measure check (measure in (
      'exit_velocity', 'fastball_velocity', 'infield_velocity', 'outfield_velocity', 'catcher_velocity',
      'bat_speed', 'sixty_yard', 'pop_time')),
  value numeric not null,
  unit text not null generated always as (case when measure in ('sixty_yard', 'pop_time') then 's' else 'mph' end) stored,
  profile_url text
    constraint athlete_showcase_results_profile_url check (profile_url is null or (profile_url ~ '^https://[^\s]+$' and char_length(profile_url) <= 300)),
  source_kind text not null
    constraint athlete_showcase_results_source_kind check (source_kind in ('self', 'development_coach')),
  entered_by uuid references auth.users (id) on delete set null,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_showcase_results_checked check ((checked_by is null) = (checked_at is null)),
  constraint athlete_showcase_results_value check (case measure
    when 'sixty_yard' then value between 5.5 and 10
    when 'pop_time' then value between 1.5 and 3.5
    when 'bat_speed' then value between 20 and 110
    when 'exit_velocity' then value between 30 and 130
    else value between 30 and 110 end)
);
comment on table public.athlete_showcase_results is
  'Numbers from showcases and events, entered by the athlete''s side or their development coach. Kept apart from practice measurements; unchecked until a development coach checks them against the event''s profile.';
create index athlete_showcase_results_athlete_idx on public.athlete_showcase_results (athlete_id, event_date desc);

create trigger athlete_showcase_results_set_updated_at
  before update on public.athlete_showcase_results
  for each row execute function private.set_updated_at();
create trigger athlete_showcase_results_audit
  after insert or update of value, checked_by or delete on public.athlete_showcase_results
  for each row execute function private.audit_row_change('athlete_id', 'id', 'measure', 'value', 'event_source', 'checked_by');

alter table public.athlete_showcase_results enable row level security;
revoke all on table public.athlete_showcase_results from anon, authenticated, service_role;
grant select on table public.athlete_showcase_results to authenticated;
create policy athlete_showcase_results_read on public.athlete_showcase_results
  for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id) or private.is_admin());

create function public.record_showcase_result(
  p_athlete_id uuid,
  p_event_source text,
  p_event_name text,
  p_event_date date,
  p_measure text,
  p_value numeric,
  p_profile_url text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  perform private.require_assessment_enabled();
  if not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'you can''t record results for this athlete' using errcode = 'BR002';
  end if;
  if p_event_date is null or p_event_date > private.today_utc() then
    raise exception 'the event date can''t be in the future' using errcode = 'BR003';
  end if;
  begin
    insert into public.athlete_showcase_results (
      athlete_id, event_source, event_name, event_date, measure, value, profile_url, source_kind, entered_by)
    values (
      p_athlete_id, p_event_source, btrim(p_event_name), p_event_date, p_measure, p_value, nullif(btrim(p_profile_url), ''),
      private.assessment_source_kind(p_athlete_id), v_uid)
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'check the event, the measure and its value (60-yard 5.5–10 s, pop time 1.5–3.5 s, speeds in mph), and that any link starts with https://'
      using errcode = 'BR003';
  end;
  return v_id;
end;
$$;

-- Only the athlete's development coach checks a result against the event's profile.
create function public.check_showcase_result(p_result_id uuid, p_checked boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.athlete_showcase_results%rowtype;
begin
  perform private.require_assessment_enabled();
  select * into v_row from public.athlete_showcase_results r where r.id = p_result_id for update;
  if not found or private.assessment_relation(v_uid, v_row.athlete_id) is distinct from 'development_coach' then
    raise exception 'only the athlete''s development coach can check event results' using errcode = 'BR002';
  end if;
  update public.athlete_showcase_results r
     set checked_by = case when p_checked then v_uid end, checked_at = case when p_checked then now() end
   where r.id = p_result_id;
end;
$$;

create function public.delete_showcase_result(p_result_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.athlete_showcase_results%rowtype;
begin
  select * into v_row from public.athlete_showcase_results r where r.id = p_result_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_row.athlete_id) then
    raise exception 'you can''t remove this result' using errcode = 'BR002';
  end if;
  delete from public.athlete_showcase_results r where r.id = p_result_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Comparison groups: opt-in, parent agreement, building groups
-- -----------------------------------------------------------------------------
create table private.comparison_group_settings (
  id boolean primary key default true
    constraint comparison_group_settings_singleton check (id),
  open boolean not null default false,
  consent_text_version text not null default 'comparison-groups-v1'
    constraint comparison_group_settings_version check (consent_text_version ~ '^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table private.comparison_group_settings is
  'Whether athletes can opt in to comparison groups. Starts closed; an administrator opens it only after counsel approves the wording version named here.';
insert into private.comparison_group_settings (id) values (true);
revoke all on table private.comparison_group_settings from public, anon, authenticated, service_role;

create table public.comparison_group_consents (
  athlete_id uuid primary key references public.athletes (user_id) on delete cascade,
  status text not null
    constraint comparison_group_consents_status check (status in ('pending_guardian', 'active')),
  consent_text_version text not null
    constraint comparison_group_consents_version check (consent_text_version ~ '^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$'),
  joined_by uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  guardian_approved_by uuid references public.profiles (id) on delete set null,
  guardian_approved_at timestamptz,
  constraint comparison_group_consents_approval check ((guardian_approved_by is null) = (guardian_approved_at is null))
);
comment on table public.comparison_group_consents is
  'Athletes who opted in to having their measured results used, without their name, in comparison groups. Leaving deletes the row and the athlete''s values in every group.';

create trigger comparison_group_consents_audit
  after insert or update of status or delete on public.comparison_group_consents
  for each row execute function private.audit_row_change('athlete_id', 'athlete_id', 'status', 'consent_text_version', 'guardian_approved_by');

alter table public.comparison_group_consents enable row level security;
revoke all on table public.comparison_group_consents from anon, authenticated, service_role;

-- Counts toward comparison groups: the athlete opted in and is an adult now, or
-- is under 18 and a parent or legal guardian who can still act for them agreed.
-- (An athlete who opted in at 17 and turns 18 before a parent answers counts:
-- the opt-in was their own.)
create function private.in_comparison_groups(p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comparison_group_consents c
     where c.athlete_id = p_athlete_id
       and (private.is_adult(p_athlete_id)
            or (c.status = 'active' and c.guardian_approved_by is not null
                and private.can_act_as_guardian(c.guardian_approved_by, p_athlete_id))))
    and not private.is_test_account(p_athlete_id)
$$;
revoke all on function private.in_comparison_groups(uuid) from public;

-- A pseudonymous key per athlete per group, so values carry no name and
-- groups can't be joined to each other, yet an athlete who leaves is found.
create function private.comparison_subject_key(p_release_id uuid, p_athlete_id uuid) returns text
language sql
immutable
set search_path = ''
as $$
  select 'oa-' || md5(p_release_id::text || ':' || p_athlete_id::text)
$$;
revoke all on function private.comparison_subject_key(uuid, uuid) from public;

create function public.comparison_group_status(p_athlete_id uuid)
returns table (is_open boolean, consent_text_version text, status text, joined_at timestamptz, is_minor boolean,
               relation text, can_join boolean, can_approve boolean, can_leave boolean, counted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select (select auth.uid()) as uid,
           private.assessment_relation((select auth.uid()), p_athlete_id) as relation,
           (select s.open from private.comparison_group_settings s where s.id) as is_open,
           (select s.consent_text_version from private.comparison_group_settings s where s.id) as version,
           private.is_minor(p_athlete_id) as minor
  )
  select ctx.is_open, ctx.version, c.status, c.joined_at, ctx.minor, ctx.relation,
         ctx.is_open and ctx.relation = 'athlete' and c.athlete_id is null,
         ctx.is_open and c.status = 'pending_guardian' and private.can_act_as_guardian(ctx.uid, p_athlete_id),
         c.athlete_id is not null and (ctx.relation = 'athlete' or private.can_act_as_guardian(ctx.uid, p_athlete_id)),
         private.in_comparison_groups(p_athlete_id)
    from ctx
    left join public.comparison_group_consents c on c.athlete_id = p_athlete_id
   where ctx.relation in ('athlete', 'guardian') or private.can_act_as_guardian(ctx.uid, p_athlete_id)
$$;

-- Opt-ins of the athletes under 18 the signed-in parent or legal guardian acts
-- for: requests waiting for their agreement, and ones they can withdraw.
create function public.my_comparison_group_requests()
returns table (athlete_id uuid, athlete_name text, status text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.athlete_id, p.display_name, c.status, c.joined_at
    from public.comparison_group_consents c
    join public.profiles p on p.id = c.athlete_id
   where private.can_act_as_guardian((select auth.uid()), c.athlete_id)
   order by c.status desc, c.joined_at
$$;

-- The athlete opts in. Adults count at once; under 18 waits for a parent or legal guardian.
create function public.join_comparison_groups(p_consent_text_version text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_settings private.comparison_group_settings%rowtype;
  v_status text;
begin
  select * into v_settings from private.comparison_group_settings s where s.id;
  if not coalesce(v_settings.open, false) then
    raise exception 'comparison groups aren''t open yet' using errcode = 'BR004';
  end if;
  if private.assessment_relation(v_uid, v_uid) is distinct from 'athlete' then
    raise exception 'only the athlete can opt in' using errcode = 'BR002';
  end if;
  if p_consent_text_version is distinct from v_settings.consent_text_version then
    raise exception 'the wording has changed; reload the page and read it again' using errcode = 'BR003';
  end if;
  v_status := case when private.is_minor(v_uid) then 'pending_guardian' else 'active' end;
  insert into public.comparison_group_consents (athlete_id, status, consent_text_version, joined_by)
  values (v_uid, v_status, v_settings.consent_text_version, v_uid)
  on conflict (athlete_id) do nothing;
  if not found then
    raise exception 'you have already opted in' using errcode = 'BR004';
  end if;
  return v_status;
end;
$$;

create function public.approve_comparison_groups(p_athlete_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not coalesce((select s.open from private.comparison_group_settings s where s.id), false) then
    raise exception 'comparison groups aren''t open yet' using errcode = 'BR004';
  end if;
  if not private.can_act_as_guardian(v_uid, p_athlete_id) then
    raise exception 'only a linked parent or legal guardian of an athlete under 18 can agree' using errcode = 'BR002';
  end if;
  update public.comparison_group_consents c
     set status = 'active', guardian_approved_by = v_uid, guardian_approved_at = now()
   where c.athlete_id = p_athlete_id and c.status = 'pending_guardian';
  if not found then
    raise exception 'there is no request waiting for your agreement' using errcode = 'BR004';
  end if;
end;
$$;

-- The athlete, or a parent or legal guardian of a minor, can leave at any time.
-- The athlete's values are removed from every group built from opted-in athletes.
create function public.leave_comparison_groups(p_athlete_id uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_removed integer;
begin
  if not (private.assessment_relation(v_uid, p_athlete_id) = 'athlete' or private.can_act_as_guardian(v_uid, p_athlete_id)) then
    raise exception 'only the athlete or their parent or legal guardian can do this' using errcode = 'BR002';
  end if;
  delete from public.comparison_group_consents c where c.athlete_id = p_athlete_id;
  if not found then
    raise exception 'this athlete isn''t in comparison groups' using errcode = 'BR004';
  end if;
  delete from public.assessment_benchmark_values v
   using public.assessment_benchmark_releases r
   where v.release_id = r.id and r.built_from = 'opted_in_athletes'
     and v.subject_key = private.comparison_subject_key(r.id, p_athlete_id);
  get diagnostics v_removed = row_count;
  update public.assessment_benchmark_releases r
     set distinct_athletes = (select count(*) from public.assessment_benchmark_values v where v.release_id = r.id)
   where r.built_from = 'opted_in_athletes';
  return v_removed;
end;
$$;

create function public.admin_comparison_group_settings()
returns table (is_open boolean, consent_text_version text, opted_in integer, waiting_for_guardian integer, counted integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.open, s.consent_text_version,
         (select count(*)::integer from public.comparison_group_consents),
         (select count(*)::integer from public.comparison_group_consents c where c.status = 'pending_guardian'),
         (select count(*)::integer from public.comparison_group_consents c where private.in_comparison_groups(c.athlete_id))
    from private.comparison_group_settings s
   where s.id and private.is_admin()
$$;

create function public.admin_set_comparison_groups_open(p_open boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
begin
  if p_open is null then
    raise exception 'say whether opting in is open' using errcode = 'BR003';
  end if;
  update private.comparison_group_settings s set open = p_open, updated_at = now(), updated_by = v_uid where s.id;
  perform private.log_audit('assessment.comparison_groups_switched', 'comparison_group_settings', null, null,
                            jsonb_build_object('open', p_open), v_uid);
end;
$$;

-- Builds a draft comparison group from opted-in athletes' published reports:
-- one value per athlete (their most recent matching report in the window).
create function public.admin_build_comparison_group(p_spec jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_definition public.assessment_metric_definitions%rowtype;
  v_kind text := nullif(p_spec ->> 'device_kind', '');
  v_model text := nullif(p_spec ->> 'device_model', '');
  v_pitch text := nullif(p_spec ->> 'pitch_type', '');
  v_age text := nullif(p_spec ->> 'age_band', '');
  v_level text := nullif(p_spec ->> 'competition_level', '');
  v_from date := (p_spec ->> 'collected_from')::date;
  v_to date := (p_spec ->> 'collected_to')::date;
  v_coach_only boolean := coalesce((p_spec ->> 'coach_reviewed_only')::boolean, true);
  v_version text := (select s.consent_text_version from private.comparison_group_settings s where s.id);
  v_id uuid;
  v_count integer;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    raise exception 'group details are missing' using errcode = 'BR003';
  end if;
  select * into v_definition from public.assessment_metric_definitions d
   where d.key = p_spec ->> 'metric_key' and d.version = (p_spec ->> 'metric_version')::smallint;
  if not found or v_definition.scoring = 'rubric' then
    raise exception 'comparison groups apply to measured metrics only' using errcode = 'BR003';
  end if;
  if v_from is null or v_to is null or v_from > v_to then
    raise exception 'give the dates the results were collected between' using errcode = 'BR003';
  end if;
  if v_definition.per_pitch_type and v_definition.aggregation <> 'rate' and v_pitch is null then
    raise exception 'say which pitch type this group is for' using errcode = 'BR003';
  end if;
  if (select d.requires_device from public.assessment_metric_definitions d
       where d.key = coalesce(v_definition.derived_from, v_definition.key) order by d.version desc limit 1) and v_kind is null then
    raise exception 'say which kind of device the group is for' using errcode = 'BR003';
  end if;
  if v_kind in ('ball_tracking', 'bat_sensor') and v_model is null then
    raise exception 'say which device model the group is for' using errcode = 'BR003';
  end if;

  insert into public.assessment_benchmark_releases (
    metric_key, metric_version, protocol_key, protocol_version, unit, statistic, pitch_type, age_band,
    competition_level, device_kind, device_model, built_from, source, usage_rights, collected_from, collected_to,
    cohort_description, aggregation_note, dataset_version, created_by)
  values (
    v_definition.key, v_definition.version, p_spec ->> 'protocol_key', (p_spec ->> 'protocol_version')::smallint,
    case when v_definition.aggregation = 'rate' then 'percent' else v_definition.unit end, v_definition.aggregation,
    v_pitch, v_age, v_level, v_kind, v_model, 'opted_in_athletes',
    'Base Recruits athletes who opted in to comparison groups',
    'Each athlete''s own opt-in (' || v_version || '); a parent or legal guardian agreed for athletes under 18',
    v_from, v_to,
    concat_ws(', ', 'Opted-in athletes', 'age ' || v_age, v_level, v_model, case when v_coach_only then 'coach-reviewed reports only' end),
    'One value per athlete: the result from their most recent matching published report in the window',
    'br-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
    v_uid)
  returning id into v_id;

  insert into public.assessment_benchmark_values (release_id, subject_key, value)
  select v_id, private.comparison_subject_key(v_id, c.athlete_id), c.value
    from (
      select rv.athlete_id, (m ->> 'value')::numeric as value,
             row_number() over (partition by rv.athlete_id
                                order by (rv.snapshot -> 'assessment' ->> 'assessment_date')::date desc, rv.published_at desc) as rn
        from public.assessment_report_revisions rv
        cross join lateral jsonb_array_elements(rv.snapshot -> 'results' -> 'metrics') m
       where rv.status = 'current'
         and rv.protocol_key = p_spec ->> 'protocol_key' and rv.protocol_version = (p_spec ->> 'protocol_version')::smallint
         and (rv.snapshot -> 'assessment' ->> 'assessment_date')::date between v_from and v_to
         and (v_age is null or rv.snapshot -> 'assessment' ->> 'age_band' = v_age)
         and (v_level is null or rv.snapshot -> 'assessment' ->> 'competition_level' = v_level)
         and (not v_coach_only or rv.review_kind = 'coach_reviewed')
         and private.in_comparison_groups(rv.athlete_id)
         and m ->> 'metric_key' = v_definition.key and (m ->> 'metric_version')::smallint = v_definition.version
         and (m ->> 'pitch_type') is not distinct from v_pitch
         and m ->> 'status' = 'ok' and jsonb_typeof(m -> 'value') = 'number'
         and (v_kind is null or m -> 'device_kinds' = jsonb_build_array(v_kind))
         and (v_model is null or (jsonb_array_length(m -> 'devices') = 1
                                  and private.assessment_device_model(v_kind, m -> 'devices' ->> 0) = v_model))
    ) c
   where c.rn = 1;
  get diagnostics v_count = row_count;
  update public.assessment_benchmark_releases r set distinct_athletes = v_count where r.id = v_id;
  return v_id;
end;
$$;

create function public.admin_benchmark_releases()
returns table (id uuid, metric_key text, protocol_key text, protocol_version smallint, pitch_type text, age_band text,
               competition_level text, device_kind text, device_model text, built_from text, status text,
               distinct_athletes integer, dataset_version text, collected_from date, collected_to date, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.metric_key, r.protocol_key, r.protocol_version, r.pitch_type, r.age_band, r.competition_level,
         r.device_kind, r.device_model, r.built_from, r.status, r.distinct_athletes, r.dataset_version,
         r.collected_from, r.collected_to, r.created_at
    from public.assessment_benchmark_releases r
   where private.is_admin()
   order by r.created_at desc
   limit 200
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.record_showcase_result(uuid, text, text, date, text, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.check_showcase_result(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.delete_showcase_result(uuid) from public, anon, authenticated, service_role;
revoke all on function public.comparison_group_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.join_comparison_groups(text) from public, anon, authenticated, service_role;
revoke all on function public.my_comparison_group_requests() from public, anon, authenticated, service_role;
revoke all on function public.approve_comparison_groups(uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_comparison_groups(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_comparison_group_settings() from public, anon, authenticated, service_role;
revoke all on function public.admin_set_comparison_groups_open(boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_build_comparison_group(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_benchmark_releases() from public, anon, authenticated, service_role;

grant execute on function public.record_showcase_result(uuid, text, text, date, text, numeric, text) to authenticated;
grant execute on function public.check_showcase_result(uuid, boolean) to authenticated;
grant execute on function public.delete_showcase_result(uuid) to authenticated;
grant execute on function public.comparison_group_status(uuid) to authenticated;
grant execute on function public.join_comparison_groups(text) to authenticated;
grant execute on function public.my_comparison_group_requests() to authenticated;
grant execute on function public.approve_comparison_groups(uuid) to authenticated;
grant execute on function public.leave_comparison_groups(uuid) to authenticated;
grant execute on function public.admin_comparison_group_settings() to authenticated;
grant execute on function public.admin_set_comparison_groups_open(boolean) to authenticated;
grant execute on function public.admin_build_comparison_group(jsonb) to authenticated;
grant execute on function public.admin_benchmark_releases() to authenticated;
