-- =============================================================================
-- SeamState / Migration 2: automated swing analysis (docs/seamstate.md)
--
-- * Consent: scope seamstate_analysis (audience outside_service). The athlete
--   allows still frames from their clips to be sent to the AI analysis
--   provider; a linked parent or legal guardian must approve for under-18s;
--   at most 365 days; revocable. Separate from any permission to train models,
--   which Base Recruits does not ask for. Wording pending counsel (L12).
-- * Switch: SeamState analysis is OFF until an administrator turns it on, and
--   needs Assessment and its video switch on too. A per-person daily limit and
--   a site-wide monthly limit (0 = none allowed) control spending.
-- * Records: capture context per clip, decoded-media inspection, analysis
--   jobs and attempts, immutable analysis revisions with their evidence
--   packet, findings, and append-only reviews.
-- * The worker never touches the database. The app server calls six
--   service-role functions after verifying the worker's signature; every one
--   refuses stale attempts and cancelled or deleted jobs.
-- * Removing a clip removes its SeamState records; its stored artifacts are
--   deleted by the server under the clip's prefix in seamstate-artifacts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Consent
-- -----------------------------------------------------------------------------
alter table public.consent_scope_rules drop constraint consent_scope_rules_audience_matches_grantee;
alter table public.consent_scope_rules
  add constraint consent_scope_rules_audience_matches_grantee check (
    (audience in ('verified_coaches', 'outside_service') and grantee_kind is null)
    or (audience = 'specific_user' and grantee_kind is not null)
  );

insert into public.consent_scope_rules
  (scope, audience, grantee_kind, requires_guardian_approval_for_minor, max_duration, description)
values
  ('seamstate_analysis', 'outside_service', null, true, interval '365 days',
   'Let Base Recruits send still frames from your swing videos, cropped to the hitter and without your name, to its AI analysis provider to create SeamState swing reports.');

-- Audience-wide grants (verified coaches, an outside service) have no named grantee.
create or replace function private.has_active_grant(
  p_athlete_id uuid,
  p_scope public.consent_scope,
  p_audience public.consent_audience,
  p_grantee_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consent_grants g
     where g.athlete_id = p_athlete_id
       and g.scope = p_scope
       and g.audience = p_audience
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
       and (p_audience in ('verified_coaches', 'outside_service') or g.grantee_id = p_grantee_id)
       and (not private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
            or private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id))
  )
$$;

-- -----------------------------------------------------------------------------
-- Switch and spending limits
-- -----------------------------------------------------------------------------
create table private.seamstate_settings (
  id boolean primary key default true
    constraint seamstate_settings_singleton check (id),
  analysis_enabled boolean not null default false,
  per_person_daily_limit integer not null default 5
    constraint seamstate_settings_daily check (per_person_daily_limit between 0 and 100),
  monthly_limit integer not null default 0
    constraint seamstate_settings_monthly check (monthly_limit between 0 and 100000),
  -- Clips of athletes under 18 wait for counsel's review (decision L12), with a guardian's approval as well.
  minors_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table private.seamstate_settings is
  'SeamState switch and spending limits. Off, with a monthly limit of 0, until an administrator changes them.';
insert into private.seamstate_settings (id) values (true);
revoke all on table private.seamstate_settings from public, anon, authenticated, service_role;

create function private.seamstate_enabled() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.assessment_video_enabled()
     and coalesce((select s.analysis_enabled from private.seamstate_settings s where s.id), false)
$$;
revoke all on function private.seamstate_enabled() from public;

-- Whether SeamState is open to this athlete: adults always, minors only once switched on for them.
create function private.seamstate_open_to(p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_minor(p_athlete_id)
      or coalesce((select s.minors_enabled from private.seamstate_settings s where s.id), false)
$$;
revoke all on function private.seamstate_open_to(uuid) from public;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.seamstate_captures (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  media_id uuid not null references public.assessment_media (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  protocol_version text not null constraint seamstate_captures_protocol check (protocol_version = 'seamstate-capture-v1'),
  setting text not null constraint seamstate_captures_setting check (setting in ('tee', 'front_toss', 'overhand_bp', 'machine')),
  batting_side text not null constraint seamstate_captures_side check (batting_side in ('right', 'left')),
  camera_view text not null
    constraint seamstate_captures_view check (camera_view in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other')),
  -- The setting's own answers (src/lib/seamstate/capture.ts), checked by private.seamstate_context_problem.
  setting_details jsonb not null default '{}'::jsonb,
  task text constraint seamstate_captures_task check (char_length(task) between 1 and 80),
  devices text[] not null default '{}' constraint seamstate_captures_devices check (cardinality(devices) <= 5),
  limitations text constraint seamstate_captures_limitations check (char_length(limitations) between 1 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.seamstate_captures is
  'Capture context for one SeamState clip. Values the person typed (a machine setting, an intended zone) are context, never measurements.';
create index seamstate_captures_media_idx on public.seamstate_captures (media_id);
create index seamstate_captures_athlete_idx on public.seamstate_captures (athlete_id, created_at desc);

create table public.seamstate_media_inspections (
  media_id uuid primary key references public.assessment_media (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  sha256 text not null constraint seamstate_inspections_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  container text not null constraint seamstate_inspections_container check (char_length(container) between 1 and 40),
  video_codec text not null constraint seamstate_inspections_codec check (char_length(video_codec) between 1 and 40),
  width integer not null constraint seamstate_inspections_width check (width between 1 and 10000),
  height integer not null constraint seamstate_inspections_height check (height between 1 and 10000),
  rotation integer not null default 0 constraint seamstate_inspections_rotation check (rotation in (0, 90, 180, 270)),
  measured_fps numeric constraint seamstate_inspections_fps check (measured_fps > 0 and measured_fps <= 1000),
  variable_frame_rate boolean not null,
  frame_count integer not null constraint seamstate_inspections_frames check (frame_count >= 0),
  duration_ms integer not null constraint seamstate_inspections_duration check (duration_ms between 0 and 3600000),
  inspector_version text not null constraint seamstate_inspections_version check (char_length(inspector_version) between 1 and 40),
  inspected_at timestamptz not null default now()
);
comment on table public.seamstate_media_inspections is
  'Decoded facts about a clip, read by the worker from the file itself (never from its name or container claims alone).';

create table public.seamstate_jobs (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.seamstate_captures (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  idempotency_key text not null constraint seamstate_jobs_key check (idempotency_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  state text not null default 'queued'
    constraint seamstate_jobs_state check (state in ('queued', 'preprocessing', 'analyzing', 'needs_input', 'complete', 'partial', 'failed', 'cancelled')),
  failure_kind text constraint seamstate_jobs_failure_kind check (failure_kind in ('service', 'footage')),
  failure_code text constraint seamstate_jobs_failure_code check (failure_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  pipeline_version text not null constraint seamstate_jobs_pipeline check (char_length(pipeline_version) between 1 and 40),
  current_attempt_id uuid,
  attempt_count integer not null default 0 constraint seamstate_jobs_attempts check (attempt_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  finished_at timestamptz,
  constraint seamstate_jobs_failure_pair check ((state = 'failed') = (failure_kind is not null)),
  constraint seamstate_jobs_idempotency unique (requested_by, idempotency_key)
);
comment on table public.seamstate_jobs is
  'One SeamState analysis request. Progress is reported by stage; there is no estimated percentage.';
create index seamstate_jobs_capture_idx on public.seamstate_jobs (capture_id);
create index seamstate_jobs_athlete_idx on public.seamstate_jobs (athlete_id, created_at desc);
create index seamstate_jobs_requester_idx on public.seamstate_jobs (requested_by, created_at desc);
create index seamstate_jobs_open_idx on public.seamstate_jobs (state, updated_at)
  where state in ('queued', 'preprocessing', 'analyzing');

create table public.seamstate_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.seamstate_jobs (id) on delete cascade,
  attempt_number integer not null constraint seamstate_attempts_number check (attempt_number between 1 and 3),
  worker_version text constraint seamstate_attempts_worker check (char_length(worker_version) between 1 and 40),
  stage text not null default 'dispatched'
    constraint seamstate_attempts_stage check (stage in ('dispatched', 'inspecting', 'tracking', 'extracting', 'interpreting', 'validating', 'saving', 'done', 'failed')),
  -- Timings and counts only (no media, prompt text or model output).
  stage_metrics jsonb not null default '{}'::jsonb
    constraint seamstate_attempts_metrics check (jsonb_typeof(stage_metrics) = 'object' and pg_column_size(stage_metrics) < 4000),
  error_code text constraint seamstate_attempts_error check (error_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  started_at timestamptz not null default now(),
  last_report_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint seamstate_attempts_unique unique (job_id, attempt_number)
);
alter table public.seamstate_jobs
  add constraint seamstate_jobs_current_attempt_fk foreign key (current_attempt_id) references public.seamstate_job_attempts (id) on delete set null;

create table public.seamstate_analyses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.seamstate_jobs (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  revision integer not null constraint seamstate_analyses_revision check (revision >= 1),
  parent_id uuid references public.seamstate_analyses (id) on delete set null,
  cause text not null constraint seamstate_analyses_cause check (cause in ('initial', 'correction', 'reanalysis')),
  status text not null default 'current' constraint seamstate_analyses_status check (status in ('current', 'superseded')),
  clip_verdict text not null
    constraint seamstate_analyses_verdict check (clip_verdict in ('suitable', 'limited', 'retake_recommended', 'no_swing_detected', 'subject_selection_required')),
  pipeline_version text not null constraint seamstate_analyses_pipeline check (char_length(pipeline_version) between 1 and 40),
  catalog_version text not null constraint seamstate_analyses_catalog check (char_length(catalog_version) between 1 and 40),
  policy_version text not null constraint seamstate_analyses_policy check (char_length(policy_version) between 1 and 40),
  schema_version text not null constraint seamstate_analyses_schema check (char_length(schema_version) between 1 and 40),
  -- Null when no model ran (no swing, a retake, or the provider was not configured).
  model_id text constraint seamstate_analyses_model check (char_length(model_id) between 1 and 80),
  -- The evidence packet the interpretation was checked against (schema in src/lib/seamstate/packet.ts).
  packet jsonb not null constraint seamstate_analyses_packet check (jsonb_typeof(packet) = 'object' and pg_column_size(packet) < 500000),
  -- Unable-to-assess items, eligibility, rejection counts and drill suggestions.
  result jsonb not null constraint seamstate_analyses_result check (jsonb_typeof(result) = 'object' and pg_column_size(result) < 200000),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint seamstate_analyses_unique unique (job_id, revision)
);
comment on table public.seamstate_analyses is
  'Immutable SeamState analysis revisions. A correction or reanalysis adds a revision; the original AI result is never rewritten.';
create index seamstate_analyses_athlete_idx on public.seamstate_analyses (athlete_id, created_at desc);
create unique index seamstate_analyses_one_current on public.seamstate_analyses (job_id) where status = 'current';

create table public.seamstate_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.seamstate_analyses (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  position integer not null constraint seamstate_findings_position check (position between 0 and 50),
  mechanic_key text not null constraint seamstate_findings_mechanic check (mechanic_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  mechanic_version integer not null constraint seamstate_findings_mechanic_version check (mechanic_version >= 1),
  pillar text not null
    constraint seamstate_findings_pillar check (pillar in ('load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output')),
  category text not null constraint seamstate_findings_category check (category in ('strength', 'adjustment', 'neutral')),
  priority boolean not null default false,
  swing_indexes integer[] not null constraint seamstate_findings_swings check (cardinality(swing_indexes) between 1 and 50),
  observation text not null constraint seamstate_findings_observation check (char_length(observation) between 1 and 400),
  interpretation text constraint seamstate_findings_interpretation check (char_length(interpretation) between 1 and 400),
  suggested_experiment text constraint seamstate_findings_experiment check (char_length(suggested_experiment) between 1 and 300),
  reassessment text constraint seamstate_findings_reassessment check (char_length(reassessment) between 1 and 300),
  cue text constraint seamstate_findings_cue check (char_length(cue) between 1 and 80),
  evidence_frame_ids text[] not null constraint seamstate_findings_evidence check (cardinality(evidence_frame_ids) between 1 and 12),
  limitations text[] not null default '{}',
  alternative_explanations text[] not null default '{}',
  eligible_swing_count integer not null,
  observed_swing_count integer not null,
  evidence_grade text not null constraint seamstate_findings_grade check (evidence_grade in ('strong', 'moderate', 'limited')),
  evidence_grade_reasons text[] not null default '{}',
  drill_suggestions jsonb not null default '[]'::jsonb constraint seamstate_findings_drills check (jsonb_typeof(drill_suggestions) = 'array'),
  review_state text not null default 'provisional'
    constraint seamstate_findings_review check (review_state in ('provisional', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  constraint seamstate_findings_counts check (observed_swing_count between 1 and eligible_swing_count),
  constraint seamstate_findings_unique unique (analysis_id, position),
  constraint seamstate_findings_adjustment_only check (category = 'adjustment' or (cue is null and suggested_experiment is null and not priority))
);
comment on table public.seamstate_findings is
  'Validated SeamState findings. Provisional AI assessment until a development coach reviews them; the wording is never edited.';
create index seamstate_findings_analysis_idx on public.seamstate_findings (analysis_id, position);

create table public.seamstate_reviews (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.seamstate_analyses (id) on delete cascade,
  finding_id uuid references public.seamstate_findings (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  action text not null constraint seamstate_reviews_action check (action in ('approve', 'reject', 'note')),
  note text constraint seamstate_reviews_note check (char_length(note) between 1 and 1000),
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewer_relation text not null constraint seamstate_reviews_relation check (reviewer_relation in ('athlete', 'guardian', 'development_coach')),
  created_at timestamptz not null default now(),
  constraint seamstate_reviews_note_needed check (action <> 'note' or note is not null)
);
comment on table public.seamstate_reviews is 'Append-only review history for SeamState analyses and findings.';
create index seamstate_reviews_analysis_idx on public.seamstate_reviews (analysis_id, created_at);

-- -----------------------------------------------------------------------------
-- Protection, updated_at and audit
-- -----------------------------------------------------------------------------
create trigger seamstate_jobs_set_updated_at before update on public.seamstate_jobs
  for each row execute function private.set_updated_at();

create function private.protect_seamstate_analysis() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.packet is distinct from old.packet or new.result is distinct from old.result
     or new.job_id <> old.job_id or new.athlete_id <> old.athlete_id or new.revision <> old.revision
     or new.cause <> old.cause or new.clip_verdict <> old.clip_verdict or new.model_id is distinct from old.model_id
     or new.pipeline_version <> old.pipeline_version or new.catalog_version <> old.catalog_version
     or new.policy_version <> old.policy_version or new.schema_version <> old.schema_version
     or new.created_at <> old.created_at
     or (old.status = 'superseded' and new.status <> 'superseded') then
    raise exception 'SeamState analyses cannot be changed; a correction adds a new revision' using errcode = 'BR002';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_seamstate_analysis() from public;
create trigger seamstate_analyses_frozen before update on public.seamstate_analyses
  for each row execute function private.protect_seamstate_analysis();

-- Only the review state of a finding can change; what the analysis said stays as it was.
create function private.protect_seamstate_finding() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['review_state', 'reviewed_by', 'reviewed_at'])
     is distinct from (to_jsonb(old) - array['review_state', 'reviewed_by', 'reviewed_at']) then
    raise exception 'SeamState findings cannot be rewritten; add a review instead' using errcode = 'BR002';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_seamstate_finding() from public;
create trigger seamstate_findings_frozen before update on public.seamstate_findings
  for each row execute function private.protect_seamstate_finding();

create function private.refuse_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'BR002';
end;
$$;
revoke all on function private.refuse_change() from public;
create trigger seamstate_reviews_append_only before update on public.seamstate_reviews
  for each row execute function private.refuse_change();

create trigger seamstate_jobs_audit
  after insert or update of state or delete on public.seamstate_jobs
  for each row execute function private.audit_row_change('athlete_id', 'id', 'state', 'failure_kind', 'failure_code');
create trigger seamstate_analyses_audit
  after insert or update of status or delete on public.seamstate_analyses
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'revision', 'cause', 'clip_verdict');
create trigger seamstate_findings_audit
  after update of review_state on public.seamstate_findings
  for each row execute function private.audit_row_change('athlete_id', 'id', 'review_state');
create trigger seamstate_reviews_audit
  after insert on public.seamstate_reviews
  for each row execute function private.audit_row_change('athlete_id', 'id', 'action', 'reviewer_relation');

-- -----------------------------------------------------------------------------
-- Row-level security: read only, for people who can work on the athlete's assessments
-- -----------------------------------------------------------------------------
alter table public.seamstate_captures enable row level security;
alter table public.seamstate_media_inspections enable row level security;
alter table public.seamstate_jobs enable row level security;
alter table public.seamstate_job_attempts enable row level security;
alter table public.seamstate_analyses enable row level security;
alter table public.seamstate_findings enable row level security;
alter table public.seamstate_reviews enable row level security;

revoke all on table public.seamstate_captures, public.seamstate_media_inspections, public.seamstate_jobs,
  public.seamstate_job_attempts, public.seamstate_analyses, public.seamstate_findings, public.seamstate_reviews
  from anon, authenticated, service_role;
grant select on table public.seamstate_captures, public.seamstate_media_inspections, public.seamstate_jobs,
  public.seamstate_job_attempts, public.seamstate_analyses, public.seamstate_findings, public.seamstate_reviews
  to authenticated;

create function private.can_see_seamstate_job(p_job_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.seamstate_jobs j
                  where j.id = p_job_id and private.can_work_on_assessments((select auth.uid()), j.athlete_id))
$$;
revoke all on function private.can_see_seamstate_job(uuid) from public;
grant execute on function private.can_see_seamstate_job(uuid) to authenticated;

create policy seamstate_captures_read on public.seamstate_captures for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy seamstate_media_inspections_read on public.seamstate_media_inspections for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy seamstate_jobs_read on public.seamstate_jobs for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy seamstate_job_attempts_read on public.seamstate_job_attempts for select to authenticated
  using (private.can_see_seamstate_job(job_id));
create policy seamstate_analyses_read on public.seamstate_analyses for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy seamstate_findings_read on public.seamstate_findings for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy seamstate_reviews_read on public.seamstate_reviews for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));

-- -----------------------------------------------------------------------------
-- Usage records for the spending limits. Kept apart from the jobs so removing
-- a clip (which removes its jobs) never gives back used analyses.
-- -----------------------------------------------------------------------------
create table private.seamstate_request_log (
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index seamstate_request_log_idx on private.seamstate_request_log (requested_by, requested_at desc);
revoke all on table private.seamstate_request_log from public, anon, authenticated, service_role;

create table private.seamstate_monthly_usage (
  month date primary key,
  analyses integer not null default 0 constraint seamstate_monthly_usage_count check (analyses >= 0)
);
revoke all on table private.seamstate_monthly_usage from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Capture context check (mirrors src/lib/seamstate/capture.ts)
-- -----------------------------------------------------------------------------
create function private.seamstate_zone_ok(p_value jsonb) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or p_value = 'null'::jsonb
      or (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[1-9]$')
$$;

create function private.seamstate_choice_ok(p_value jsonb, p_choices text[]) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or p_value = 'null'::jsonb
      or (jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') = any (p_choices))
$$;

create function private.seamstate_text_ok(p_value jsonb, p_max integer) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or p_value = 'null'::jsonb
      or (jsonb_typeof(p_value) = 'string' and char_length(btrim(p_value #>> '{}')) between 1 and p_max)
$$;

-- Plain-language problem with a SeamState capture context, or null.
create function private.seamstate_context_problem(p_context jsonb) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_setting jsonb := p_context -> 'setting';
  v_kind text := p_context #>> '{setting,setting}';
  v_assignments constant text[] := array['swing_all', 'selective', 'take_all', 'none'];
  v_pitches constant text[] := array['four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball',
                                     'changeup', 'splitter', 'knuckleball', 'other'];
  v_allowed text[];
  v_key text;
begin
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    return 'the swing details are missing';
  end if;
  for v_key in select jsonb_object_keys(p_context) loop
    if v_key <> all (array['protocolVersion', 'battingSide', 'cameraView', 'setting', 'task', 'devices', 'limitations']) then
      return 'unknown swing detail: ' || v_key;
    end if;
  end loop;
  if p_context ->> 'protocolVersion' is distinct from 'seamstate-capture-v1' then
    return 'this version of the app is out of date; refresh the page and try again';
  end if;
  if p_context ->> 'battingSide' is null or p_context ->> 'battingSide' not in ('right', 'left') then
    return 'say whether the hitter bats right or left';
  end if;
  if p_context ->> 'cameraView' is null
     or p_context ->> 'cameraView' not in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other') then
    return 'choose a camera view from the list';
  end if;
  if jsonb_typeof(v_setting) is distinct from 'object' or v_kind is null
     or v_kind not in ('tee', 'front_toss', 'overhand_bp', 'machine') then
    return 'choose tee, front toss, overhand BP or machine';
  end if;
  v_allowed := case v_kind
    when 'tee' then array['setting', 'teeZone']
    when 'front_toss' then array['setting', 'locationAnnounced', 'intendedZone', 'assignment']
    when 'overhand_bp' then array['setting', 'delivery', 'pitchMix', 'pitchType', 'assignment']
    else array['setting', 'machineSettingAsEntered', 'placement', 'pitchType'] end;
  for v_key in select jsonb_object_keys(v_setting) loop
    if v_key <> all (v_allowed) then
      return 'unknown detail for this setting: ' || v_key;
    end if;
  end loop;
  if not private.seamstate_zone_ok(v_setting -> 'teeZone') or not private.seamstate_zone_ok(v_setting -> 'intendedZone') then
    return 'zones are numbered 1 to 9';
  end if;
  if v_setting ? 'locationAnnounced' and jsonb_typeof(v_setting -> 'locationAnnounced') not in ('boolean', 'null') then
    return 'say yes, no or not sure for whether the location was called';
  end if;
  if not private.seamstate_choice_ok(v_setting -> 'assignment', v_assignments) then
    return 'choose a swing assignment from the list';
  end if;
  if v_kind = 'overhand_bp' and not coalesce(v_setting ->> 'delivery' in ('coach_bp', 'live_pitcher'), false) then
    return 'say whether this was coach BP or a live pitcher';
  end if;
  if not private.seamstate_choice_ok(v_setting -> 'pitchMix', array['known', 'mixed', 'unknown'])
     or not private.seamstate_choice_ok(v_setting -> 'placement', array['fixed', 'variable', 'unknown'])
     or not private.seamstate_choice_ok(v_setting -> 'pitchType', v_pitches) then
    return 'choose the pitch details from the lists';
  end if;
  if not private.seamstate_text_ok(v_setting -> 'machineSettingAsEntered', 40) then
    return 'the machine setting can be up to 40 characters';
  end if;
  if not private.seamstate_text_ok(p_context -> 'task', 80) then
    return 'the task can be up to 80 characters';
  end if;
  if not private.seamstate_text_ok(p_context -> 'limitations', 200) then
    return 'the filming notes can be up to 200 characters';
  end if;
  if p_context ? 'devices' and (
       jsonb_typeof(p_context -> 'devices') <> 'array'
       or jsonb_array_length(p_context -> 'devices') > 5
       or exists (select 1 from jsonb_array_elements(p_context -> 'devices') d
                   where d = 'null'::jsonb or not private.seamstate_text_ok(d, 40))) then
    return 'list up to 5 devices, each up to 40 characters';
  end if;
  return null;
end;
$$;

revoke all on function private.seamstate_zone_ok(jsonb) from public;
revoke all on function private.seamstate_choice_ok(jsonb, text[]) from public;
revoke all on function private.seamstate_text_ok(jsonb, integer) from public;
revoke all on function private.seamstate_context_problem(jsonb) from public;

-- Job transitions (mirrors src/lib/seamstate/jobs.ts).
create function private.seamstate_can_transition(p_from text, p_to text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'queued' then p_to in ('preprocessing', 'failed', 'cancelled')
    when 'preprocessing' then p_to in ('queued', 'analyzing', 'needs_input', 'complete', 'partial', 'failed', 'cancelled')
    when 'needs_input' then p_to in ('queued', 'cancelled')
    when 'analyzing' then p_to in ('queued', 'complete', 'partial', 'failed', 'cancelled')
    else false end
$$;
revoke all on function private.seamstate_can_transition(text, text) from public;

-- -----------------------------------------------------------------------------
-- Switch, limits and administration
-- -----------------------------------------------------------------------------
create function public.seamstate_switches()
returns table (enabled boolean, daily_limit integer, monthly_limit integer, used_today integer, used_this_month integer,
               minors_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.seamstate_enabled(),
         s.per_person_daily_limit,
         s.monthly_limit,
         (select count(*)::integer from private.seamstate_request_log l
           where l.requested_by = (select auth.uid()) and l.requested_at > now() - interval '24 hours'),
         -- Site-wide usage is for administrators only.
         case when private.has_role((select auth.uid()), 'admin') then
           coalesce((select u.analyses from private.seamstate_monthly_usage u
                      where u.month = date_trunc('month', now() at time zone 'utc')::date), 0) end,
         s.minors_enabled
    from private.seamstate_settings s
   where s.id
$$;
comment on function public.seamstate_switches() is
  'Whether SeamState analysis is on, the limits, and how many analyses the caller requested in the last 24 hours.';

-- Whether the athlete has allowed SeamState analysis, for people who can work on their assessments.
create function public.seamstate_permission(p_athlete_id uuid) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if p_athlete_id is null or not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR002';
  end if;
  if not private.seamstate_open_to(p_athlete_id) then
    return 'not_open_to_minors';
  end if;
  if private.has_active_grant(p_athlete_id, 'seamstate_analysis', 'outside_service') then
    return 'allowed';
  end if;
  -- The same test as my_consent_grants.waiting_for_guardian.
  if exists (select 1 from public.consent_grants g
              where g.athlete_id = p_athlete_id and g.scope = 'seamstate_analysis'
                and (g.status = 'pending_guardian'
                     or (g.status = 'active' and (g.expires_at is null or g.expires_at > now())
                         and private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
                         and not private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)))) then
    return 'waiting_for_guardian';
  end if;
  return 'not_allowed';
end;
$$;
comment on function public.seamstate_permission(uuid) is
  'not_open_to_minors, allowed, waiting_for_guardian or not_allowed: whether SeamState can analyze this athlete''s clips.';

create function public.admin_set_seamstate_settings(
  p_enabled boolean, p_daily_limit integer, p_monthly_limit integer, p_minors_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
begin
  if p_enabled is null or p_daily_limit is null or p_monthly_limit is null or p_minors_enabled is null then
    raise exception 'the switches and both limits need a value' using errcode = 'BR003';
  end if;
  if p_daily_limit not between 0 and 100 then
    raise exception 'the daily limit per person must be 0 to 100' using errcode = 'BR003';
  end if;
  if p_monthly_limit not between 0 and 100000 then
    raise exception 'the monthly limit must be 0 to 100,000' using errcode = 'BR003';
  end if;
  if p_enabled and not private.assessment_video_enabled() then
    raise exception 'turn on Assessment and its video uploads first' using errcode = 'BR003';
  end if;
  update private.seamstate_settings s
     set analysis_enabled = p_enabled, per_person_daily_limit = p_daily_limit, monthly_limit = p_monthly_limit,
         minors_enabled = p_minors_enabled, updated_at = now(), updated_by = v_uid
   where s.id;
  perform private.log_audit('seamstate.settings_changed', 'seamstate_settings', null, null,
                            jsonb_build_object('enabled', p_enabled, 'daily_limit', p_daily_limit,
                                               'monthly_limit', p_monthly_limit, 'minors_enabled', p_minors_enabled), v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- Requests, cancellation and review (signed-in people)
-- -----------------------------------------------------------------------------
create function public.seamstate_request_analysis(p_media_id uuid, p_context jsonb, p_idempotency_key text)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_media public.assessment_media%rowtype;
  v_assessment public.assessments%rowtype;
  v_settings private.seamstate_settings%rowtype;
  v_problem text;
  v_job public.seamstate_jobs%rowtype;
  v_capture uuid;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status <> 'removed';
  v_assessment := private.assessment_for_work(v_media.assessment_id, false);
  if not private.seamstate_enabled() then
    raise exception 'SeamState swing analysis is not switched on yet' using errcode = 'BR004';
  end if;
  if v_assessment.discipline <> 'hitting' then
    raise exception 'SeamState analyzes hitting clips only for now' using errcode = 'BR003';
  end if;
  if not private.seamstate_open_to(v_media.athlete_id) then
    raise exception 'SeamState analyzes clips of hitters 18 and older for now' using errcode = 'BR004';
  end if;
  if v_media.status <> 'uploaded' then
    raise exception 'the video has not finished uploading' using errcode = 'BR004';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'request key is missing; refresh the page and try again' using errcode = 'BR003';
  end if;
  v_problem := private.seamstate_context_problem(p_context);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;

  -- Serialize requests per athlete.
  perform 1 from public.athletes a where a.user_id = v_media.athlete_id for update;

  -- The same request sent twice (a double tap, a retried network call).
  select * into v_job from public.seamstate_jobs j where j.requested_by = v_uid and j.idempotency_key = p_idempotency_key;
  if found then
    if (select c.media_id from public.seamstate_captures c where c.id = v_job.capture_id) is distinct from p_media_id then
      raise exception 'this request was already used for another clip; refresh the page and try again' using errcode = 'BR003';
    end if;
    job_id := v_job.id;
    created := false;
    return next;
    return;
  end if;

  -- An analysis of this clip is already under way.
  select j.* into v_job
    from public.seamstate_jobs j join public.seamstate_captures c on c.id = j.capture_id
   where c.media_id = p_media_id and j.state in ('queued', 'preprocessing', 'analyzing', 'needs_input')
   order by j.created_at desc
   limit 1;
  if found then
    job_id := v_job.id;
    created := false;
    return next;
    return;
  end if;

  if not private.has_active_grant(v_media.athlete_id, 'seamstate_analysis', 'outside_service') then
    if exists (select 1 from public.consent_grants g
                where g.athlete_id = v_media.athlete_id and g.scope = 'seamstate_analysis' and g.status = 'pending_guardian') then
      raise exception 'a parent or legal guardian needs to approve SeamState analysis first' using errcode = 'BR004';
    end if;
    raise exception 'the athlete has not allowed SeamState analysis yet' using errcode = 'BR004';
  end if;

  select * into v_settings from private.seamstate_settings s where s.id;
  if (select count(*) from private.seamstate_request_log l
       where l.requested_by = v_uid and l.requested_at > now() - interval '24 hours') >= v_settings.per_person_daily_limit then
    raise exception 'you have reached today''s limit of % swing analyses; please try again tomorrow', v_settings.per_person_daily_limit
      using errcode = 'BR005';
  end if;
  insert into private.seamstate_monthly_usage (month) values (v_month) on conflict (month) do nothing;
  select u.analyses into v_used from private.seamstate_monthly_usage u where u.month = v_month for update;
  if v_used >= v_settings.monthly_limit then
    raise exception 'SeamState has reached its analysis limit for this month; please try again later' using errcode = 'BR005';
  end if;
  update private.seamstate_monthly_usage u set analyses = u.analyses + 1 where u.month = v_month;
  insert into private.seamstate_request_log (requested_by) values (v_uid);

  insert into public.seamstate_captures
    (assessment_id, media_id, athlete_id, protocol_version, setting, batting_side, camera_view, setting_details,
     task, devices, limitations, created_by)
  values
    (v_assessment.id, p_media_id, v_media.athlete_id, p_context ->> 'protocolVersion', p_context #>> '{setting,setting}',
     p_context ->> 'battingSide', p_context ->> 'cameraView', (p_context -> 'setting') - 'setting',
     nullif(btrim(p_context ->> 'task'), ''),
     coalesce(array(select btrim(d) from jsonb_array_elements_text(coalesce(nullif(p_context -> 'devices', 'null'::jsonb), '[]'::jsonb)) d),
              '{}'::text[]),
     nullif(btrim(p_context ->> 'limitations'), ''), v_uid)
  returning id into v_capture;

  insert into public.seamstate_jobs (capture_id, athlete_id, requested_by, idempotency_key, pipeline_version)
  values (v_capture, v_media.athlete_id, v_uid, p_idempotency_key, 'seamstate-v1')
  returning id into v_id;

  job_id := v_id;
  created := true;
  return next;
end;
$$;

create function public.seamstate_cancel_analysis(p_job_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.seamstate_jobs%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select * into v_job from public.seamstate_jobs j where j.id = p_job_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_job.athlete_id) then
    raise exception 'analysis not found' using errcode = 'BR003';
  end if;
  if not private.seamstate_can_transition(v_job.state, 'cancelled') then
    raise exception 'this analysis has already finished' using errcode = 'BR004';
  end if;
  update public.seamstate_jobs j
     set state = 'cancelled', cancelled_at = now(), finished_at = now()
   where j.id = p_job_id;
  update public.seamstate_job_attempts a
     set stage = 'failed', error_code = 'cancelled', finished_at = now()
   where a.id = v_job.current_attempt_id and a.finished_at is null;
end;
$$;

-- Approve or reject a finding (the athlete's development coach only), or add a
-- note (anyone working on the athlete's assessments). Returns the review id.
create function public.seamstate_review_finding(p_finding_id uuid, p_action text, p_note text default null) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_finding public.seamstate_findings%rowtype;
  v_analysis public.seamstate_analyses%rowtype;
  v_relation text;
  v_note text := nullif(btrim(p_note), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select * into v_finding from public.seamstate_findings f where f.id = p_finding_id for update;
  v_relation := private.assessment_relation(v_uid, v_finding.athlete_id);
  if not found or v_relation is null then
    raise exception 'finding not found' using errcode = 'BR003';
  end if;
  select * into v_analysis from public.seamstate_analyses a where a.id = v_finding.analysis_id;
  if p_action is null or p_action not in ('approve', 'reject', 'note') then
    raise exception 'choose approve, reject or note' using errcode = 'BR003';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'the note is longer than 1,000 characters' using errcode = 'BR003';
  end if;
  if p_action = 'note' and v_note is null then
    raise exception 'write a note first' using errcode = 'BR003';
  end if;
  if p_action in ('approve', 'reject') then
    if v_relation <> 'development_coach' then
      raise exception 'only the athlete''s development coach can approve or reject a finding' using errcode = 'BR002';
    end if;
    if v_analysis.status <> 'current' then
      raise exception 'this analysis has been replaced by a newer one' using errcode = 'BR004';
    end if;
    update public.seamstate_findings f
       set review_state = case p_action when 'approve' then 'approved' else 'rejected' end,
           reviewed_by = v_uid, reviewed_at = now()
     where f.id = p_finding_id;
  end if;
  insert into public.seamstate_reviews (analysis_id, finding_id, athlete_id, action, note, reviewer_id, reviewer_relation)
  values (v_finding.analysis_id, p_finding_id, v_finding.athlete_id, p_action, v_note, v_uid, v_relation)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Worker callbacks (service role only). The app server calls these after it
-- has checked the worker's signature. Every one re-checks that the attempt is
-- still the job's current one, that SeamState is still on, and that the
-- athlete's permission is still active; otherwise nothing is written.
-- -----------------------------------------------------------------------------

-- Locks the job behind an attempt and decides whether the attempt may still
-- write. Turning SeamState off fails the job; withdrawn permission cancels it.
create function private.seamstate_live_job(p_attempt_id uuid) returns public.seamstate_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
begin
  select j.* into v_job
    from public.seamstate_jobs j
   where j.id = (select a.job_id from public.seamstate_job_attempts a where a.id = p_attempt_id)
   for update;
  if not found or v_job.current_attempt_id is distinct from p_attempt_id
     or v_job.state not in ('preprocessing', 'analyzing') then
    return null;
  end if;
  if not private.seamstate_enabled() or not private.seamstate_open_to(v_job.athlete_id) then
    update public.seamstate_jobs j
       set state = 'failed', failure_kind = 'service', failure_code = 'switched_off', finished_at = now()
     where j.id = v_job.id;
    update public.seamstate_job_attempts a set stage = 'failed', error_code = 'switched_off', finished_at = now()
     where a.id = p_attempt_id;
    return null;
  end if;
  if not private.has_active_grant(v_job.athlete_id, 'seamstate_analysis', 'outside_service') then
    update public.seamstate_jobs j set state = 'cancelled', cancelled_at = now(), finished_at = now() where j.id = v_job.id;
    update public.seamstate_job_attempts a set stage = 'failed', error_code = 'consent_withdrawn', finished_at = now()
     where a.id = p_attempt_id;
    perform private.log_audit('seamstate.cancelled_without_consent', 'seamstate_job', v_job.id::text, v_job.athlete_id);
    return null;
  end if;
  return v_job;
end;
$$;
revoke all on function private.seamstate_live_job(uuid) from public;

-- Starts the next attempt of a queued job. No rows: the job cannot start (it
-- was cancelled or failed, SeamState is off, or permission was withdrawn).
create function public.seamstate_worker_begin_attempt(p_job_id uuid, p_worker_version text)
returns table (attempt_id uuid, attempt_number integer, media_id uuid, storage_path text, capture jsonb, timing jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
  v_capture public.seamstate_captures%rowtype;
  v_media public.assessment_media%rowtype;
  v_attempt uuid;
begin
  if p_worker_version is null or char_length(p_worker_version) not between 1 and 40 then
    raise exception 'worker version is required' using errcode = 'BR003';
  end if;
  select * into v_job from public.seamstate_jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'analysis not found' using errcode = 'BR003';
  end if;
  if v_job.state <> 'queued' then
    return;
  end if;
  if not private.seamstate_enabled() or not private.seamstate_open_to(v_job.athlete_id) or v_job.attempt_count >= 3 then
    update public.seamstate_jobs j
       set state = 'failed', failure_kind = 'service',
           failure_code = case when v_job.attempt_count >= 3 then 'too_many_attempts' else 'switched_off' end,
           finished_at = now()
     where j.id = p_job_id;
    return;
  end if;
  if not private.has_active_grant(v_job.athlete_id, 'seamstate_analysis', 'outside_service') then
    update public.seamstate_jobs j set state = 'cancelled', cancelled_at = now(), finished_at = now() where j.id = p_job_id;
    perform private.log_audit('seamstate.cancelled_without_consent', 'seamstate_job', p_job_id::text, v_job.athlete_id);
    return;
  end if;
  select * into v_capture from public.seamstate_captures c where c.id = v_job.capture_id;
  select * into v_media from public.assessment_media m where m.id = v_capture.media_id and m.status = 'uploaded';
  if not found then
    update public.seamstate_jobs j
       set state = 'failed', failure_kind = 'footage', failure_code = 'clip_unavailable', finished_at = now()
     where j.id = p_job_id;
    return;
  end if;

  insert into public.seamstate_job_attempts (job_id, attempt_number, worker_version)
  values (p_job_id, v_job.attempt_count + 1, p_worker_version)
  returning id into v_attempt;
  update public.seamstate_jobs j
     set state = 'preprocessing', current_attempt_id = v_attempt, attempt_count = v_job.attempt_count + 1
   where j.id = p_job_id;

  attempt_id := v_attempt;
  attempt_number := v_job.attempt_count + 1;
  media_id := v_media.id;
  storage_path := v_media.storage_path;
  -- The capture context in the app's shape (src/lib/seamstate/capture.ts).
  capture := jsonb_build_object('protocolVersion', v_capture.protocol_version, 'battingSide', v_capture.batting_side,
                                'cameraView', v_capture.camera_view,
                                'setting', jsonb_build_object('setting', v_capture.setting) || v_capture.setting_details,
                                'task', v_capture.task, 'devices', to_jsonb(v_capture.devices),
                                'limitations', v_capture.limitations);
  timing := jsonb_build_object('timingBasis', v_media.timing_basis, 'slowdownFactor', v_media.slowdown_factor);
  return next;
end;
$$;

-- Records progress on a stage and, optionally, moves the job to analyzing,
-- needs_input or failed, or gives it back to the queue (stage failed with a
-- code, e.g. the worker was busy). False: the attempt may no longer write.
create function public.seamstate_worker_report(
  p_attempt_id uuid,
  p_stage text,
  p_metrics jsonb default '{}'::jsonb,
  p_state text default null,
  p_failure_kind text default null,
  p_failure_code text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
begin
  if p_stage is null or p_stage not in ('inspecting', 'tracking', 'extracting', 'interpreting', 'validating', 'saving', 'failed') then
    raise exception 'unknown stage' using errcode = 'BR003';
  end if;
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' or pg_column_size(p_metrics) >= 2000 then
    raise exception 'stage metrics must be a small object' using errcode = 'BR003';
  end if;
  if p_state is not null and p_state not in ('queued', 'analyzing', 'needs_input', 'failed') then
    raise exception 'a report can move the job to queued, analyzing, needs_input or failed only' using errcode = 'BR003';
  end if;
  if (p_stage = 'failed') <> coalesce(p_state in ('failed', 'queued'), false)
     or (p_state = 'queued' and p_failure_code is null)
     or (p_state = 'failed') <> (p_failure_kind is not null)
     or (p_failure_kind is not null and (p_failure_kind not in ('service', 'footage') or p_failure_code is null))
     or (p_failure_code is not null and p_failure_code !~ '^[a-z][a-z0-9_]{1,59}$') then
    raise exception 'a failure needs its kind and a code, and only a failure has them' using errcode = 'BR003';
  end if;

  v_job := private.seamstate_live_job(p_attempt_id);
  if v_job.id is null then
    return false;
  end if;
  if p_state is not null and p_state <> v_job.state and not private.seamstate_can_transition(v_job.state, p_state) then
    raise exception 'the analysis cannot move from % to %', v_job.state, p_state using errcode = 'BR004';
  end if;

  update public.seamstate_job_attempts a
     set stage = p_stage,
         stage_metrics = a.stage_metrics || jsonb_build_object(p_stage, p_metrics),
         error_code = coalesce(p_failure_code, a.error_code),
         last_report_at = now(),
         finished_at = case when p_stage = 'failed' then now() end
   where a.id = p_attempt_id;
  if p_state = 'queued' then
    -- Clearing the current attempt makes any later answer from it be refused.
    update public.seamstate_jobs j set state = 'queued', current_attempt_id = null where j.id = v_job.id;
  elsif p_state is not null and p_state <> v_job.state then
    update public.seamstate_jobs j
       set state = p_state, failure_kind = p_failure_kind, failure_code = p_failure_code,
           finished_at = case when p_state = 'failed' then now() end
     where j.id = v_job.id;
  end if;
  return true;
end;
$$;

-- Where this attempt's stills go in seamstate-artifacts
-- (athlete/media/job/attempt), or null when the attempt may no longer write.
create function public.seamstate_worker_artifact_path(p_attempt_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
begin
  v_job := private.seamstate_live_job(p_attempt_id);
  if v_job.id is null then
    return null;
  end if;
  return (select v_job.athlete_id || '/' || c.media_id || '/' || v_job.id || '/' || p_attempt_id
            from public.seamstate_captures c where c.id = v_job.capture_id);
end;
$$;

-- Facts read from the decoded file. False: the attempt may no longer write.
create function public.seamstate_worker_record_inspection(p_attempt_id uuid, p_inspection jsonb) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
  v_capture public.seamstate_captures%rowtype;
  v_key text;
begin
  if p_inspection is null or jsonb_typeof(p_inspection) <> 'object' then
    raise exception 'inspection is missing' using errcode = 'BR003';
  end if;
  for v_key in select jsonb_object_keys(p_inspection) loop
    if v_key <> all (array['sha256', 'container', 'video_codec', 'width', 'height', 'rotation', 'measured_fps',
                           'variable_frame_rate', 'frame_count', 'duration_ms', 'inspector_version']) then
      raise exception 'unknown inspection field: %', v_key using errcode = 'BR003';
    end if;
  end loop;
  v_job := private.seamstate_live_job(p_attempt_id);
  if v_job.id is null then
    return false;
  end if;
  select * into v_capture from public.seamstate_captures c where c.id = v_job.capture_id;
  insert into public.seamstate_media_inspections
    (media_id, athlete_id, sha256, container, video_codec, width, height, rotation, measured_fps, variable_frame_rate,
     frame_count, duration_ms, inspector_version)
  select v_capture.media_id, v_job.athlete_id, r.sha256, r.container, r.video_codec, r.width, r.height,
         coalesce(r.rotation, 0), r.measured_fps, r.variable_frame_rate, r.frame_count, r.duration_ms, r.inspector_version
    from jsonb_populate_record(null::public.seamstate_media_inspections, p_inspection) r
  on conflict (media_id) do update
     set sha256 = excluded.sha256, container = excluded.container, video_codec = excluded.video_codec,
         width = excluded.width, height = excluded.height, rotation = excluded.rotation,
         measured_fps = excluded.measured_fps, variable_frame_rate = excluded.variable_frame_rate,
         frame_count = excluded.frame_count, duration_ms = excluded.duration_ms,
         inspector_version = excluded.inspector_version, inspected_at = now();
  return true;
end;
$$;

-- Saves the validated analysis and its findings, and finishes the job as
-- complete or partial. Null: the attempt may no longer write.
create function public.seamstate_worker_save_analysis(
  p_attempt_id uuid,
  p_state text,
  p_analysis jsonb,
  p_findings jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.seamstate_jobs%rowtype;
  v_revision integer;
  v_previous uuid;
  v_id uuid;
  v_key text;
begin
  if p_state is null or p_state not in ('complete', 'partial') then
    raise exception 'a saved analysis is complete or partial' using errcode = 'BR003';
  end if;
  if p_analysis is null or jsonb_typeof(p_analysis) <> 'object' then
    raise exception 'analysis is missing' using errcode = 'BR003';
  end if;
  for v_key in select jsonb_object_keys(p_analysis) loop
    if v_key <> all (array['clip_verdict', 'pipeline_version', 'catalog_version', 'policy_version', 'schema_version',
                           'model_id', 'packet', 'result']) then
      raise exception 'unknown analysis field: %', v_key using errcode = 'BR003';
    end if;
  end loop;
  if p_findings is null or jsonb_typeof(p_findings) <> 'array' or jsonb_array_length(p_findings) > 50 then
    raise exception 'findings must be a list of at most 50' using errcode = 'BR003';
  end if;
  -- Every cited still must be one of the analysis's own evidence frames.
  if exists (
    select 1 from jsonb_array_elements(p_findings) f, jsonb_array_elements_text(coalesce(f -> 'evidence_frame_ids', '[]'::jsonb)) id
     where id not in (select fr ->> 'frameId' from jsonb_array_elements(coalesce(p_analysis #> '{packet,frames}', '[]'::jsonb)) fr)) then
    raise exception 'a finding cites a still that is not in the evidence packet' using errcode = 'BR003';
  end if;

  v_job := private.seamstate_live_job(p_attempt_id);
  if v_job.id is null then
    return null;
  end if;

  select coalesce(max(a.revision), 0) + 1 into v_revision from public.seamstate_analyses a where a.job_id = v_job.id;
  update public.seamstate_analyses a set status = 'superseded', superseded_at = now()
   where a.job_id = v_job.id and a.status = 'current'
  returning a.id into v_previous;

  insert into public.seamstate_analyses
    (job_id, athlete_id, revision, parent_id, cause, clip_verdict, pipeline_version, catalog_version, policy_version,
     schema_version, model_id, packet, result)
  values
    (v_job.id, v_job.athlete_id, v_revision, v_previous, case when v_revision = 1 then 'initial' else 'reanalysis' end,
     p_analysis ->> 'clip_verdict', p_analysis ->> 'pipeline_version', p_analysis ->> 'catalog_version',
     p_analysis ->> 'policy_version', p_analysis ->> 'schema_version', p_analysis ->> 'model_id',
     p_analysis -> 'packet', p_analysis -> 'result')
  returning id into v_id;

  insert into public.seamstate_findings
    (analysis_id, athlete_id, position, mechanic_key, mechanic_version, pillar, category, priority, swing_indexes,
     observation, interpretation, suggested_experiment, reassessment, cue, evidence_frame_ids, limitations,
     alternative_explanations, eligible_swing_count, observed_swing_count, evidence_grade, evidence_grade_reasons,
     drill_suggestions)
  select v_id, v_job.athlete_id, r.position, r.mechanic_key, r.mechanic_version, r.pillar, r.category,
         coalesce(r.priority, false), r.swing_indexes, r.observation, r.interpretation, r.suggested_experiment,
         r.reassessment, r.cue, r.evidence_frame_ids, coalesce(r.limitations, '{}'), coalesce(r.alternative_explanations, '{}'),
         r.eligible_swing_count, r.observed_swing_count, r.evidence_grade, coalesce(r.evidence_grade_reasons, '{}'),
         coalesce(r.drill_suggestions, '[]'::jsonb)
    from jsonb_populate_recordset(null::public.seamstate_findings, p_findings) r;

  update public.seamstate_job_attempts a set stage = 'done', last_report_at = now(), finished_at = now()
   where a.id = p_attempt_id;
  update public.seamstate_jobs j set state = p_state, finished_at = now() where j.id = v_job.id;
  return v_id;
end;
$$;

-- Requeues attempts that stopped reporting (or fails the job after the last
-- attempt), then lists queued jobs whose retry wait has passed.
create function public.seamstate_worker_due_jobs(p_stall_seconds integer default 600, p_limit integer default 10)
returns table (job_id uuid, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stalled record;
begin
  if p_stall_seconds is null or p_stall_seconds not between 60 and 86400 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'stall time must be 60 to 86,400 seconds and the limit 1 to 100' using errcode = 'BR003';
  end if;
  for v_stalled in
    select j.id, j.attempt_count, j.current_attempt_id
      from public.seamstate_jobs j
      join public.seamstate_job_attempts a on a.id = j.current_attempt_id
     where j.state in ('preprocessing', 'analyzing')
       and a.last_report_at < now() - make_interval(secs => p_stall_seconds)
     for update of j
  loop
    update public.seamstate_job_attempts a set stage = 'failed', error_code = 'stalled', finished_at = now()
     where a.id = v_stalled.current_attempt_id;
    if v_stalled.attempt_count >= 3 then
      update public.seamstate_jobs j
         set state = 'failed', failure_kind = 'service', failure_code = 'stalled', finished_at = now()
       where j.id = v_stalled.id;
    else
      -- Clearing the current attempt makes any late answer from it be refused.
      update public.seamstate_jobs j set state = 'queued', current_attempt_id = null where j.id = v_stalled.id;
    end if;
  end loop;

  if not private.seamstate_enabled() then
    return;
  end if;
  return query
    select j.id, j.attempt_count
      from public.seamstate_jobs j
     where j.state = 'queued'
       -- Backoff before attempt n (n >= 2): 30 s x 2^(n - 2), counted from when the previous attempt ended.
       and (j.attempt_count = 0
            or (select max(a.finished_at) from public.seamstate_job_attempts a where a.job_id = j.id)
               <= now() - make_interval(secs => 30 * power(2, j.attempt_count - 1)))
     order by j.created_at
     limit p_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Removing a clip removes its SeamState records (captures cascade to jobs,
-- attempts, analyses, findings and reviews). The server deletes the clip's
-- stored artifacts under athlete_id/media_id/ in seamstate-artifacts.
-- -----------------------------------------------------------------------------
create function private.remove_seamstate_records() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    delete from public.seamstate_captures c where c.media_id = new.id;
    delete from public.seamstate_media_inspections i where i.media_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.remove_seamstate_records() from public;
create trigger assessment_media_remove_seamstate
  after update of status on public.assessment_media
  for each row execute function private.remove_seamstate_records();

-- -----------------------------------------------------------------------------
-- Private artifact storage (bucket "seamstate-artifacts"): evidence stills and
-- the packet, at athlete_id/media_id/job_id/attempt_id/<file>. Only the server
-- writes (service role); people who can see the job can read.
-- -----------------------------------------------------------------------------
create function private.seamstate_object_access(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$'
     and exists (
       select 1 from public.seamstate_jobs j join public.seamstate_captures c on c.id = j.capture_id
        where j.id::text = split_part(p_name, '/', 3)
          and j.athlete_id::text = split_part(p_name, '/', 1)
          and c.media_id::text = split_part(p_name, '/', 2)
          and private.can_work_on_assessments((select auth.uid()), j.athlete_id))
$$;
revoke all on function private.seamstate_object_access(text) from public;
grant execute on function private.seamstate_object_access(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping the seamstate-artifacts bucket and its policy';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('seamstate-artifacts', 'seamstate-artifacts', false)
  on conflict (id) do nothing;
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $sql$update storage.buckets set file_size_limit = 10485760 where id = 'seamstate-artifacts'$sql$;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $sql$update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/webp', 'application/json']
                  where id = 'seamstate-artifacts'$sql$;
  end if;
  execute $sql$create policy seamstate_artifacts_select on storage.objects for select to authenticated
    using (bucket_id = 'seamstate-artifacts' and private.seamstate_object_access(name))$sql$;
end
$storage$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.seamstate_switches() from public, anon, authenticated, service_role;
revoke all on function public.seamstate_permission(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_seamstate_settings(boolean, integer, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_request_analysis(uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_cancel_analysis(uuid) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_review_finding(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_begin_attempt(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_report(uuid, text, jsonb, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_record_inspection(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_save_analysis(uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_due_jobs(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.seamstate_worker_artifact_path(uuid) from public, anon, authenticated, service_role;

grant execute on function public.seamstate_switches() to authenticated;
grant execute on function public.seamstate_permission(uuid) to authenticated;
grant execute on function public.admin_set_seamstate_settings(boolean, integer, integer, boolean) to authenticated;
grant execute on function public.seamstate_request_analysis(uuid, jsonb, text) to authenticated;
grant execute on function public.seamstate_cancel_analysis(uuid) to authenticated;
grant execute on function public.seamstate_review_finding(uuid, text, text) to authenticated;
-- The app server only, after verifying the worker's signature.
grant execute on function public.seamstate_worker_begin_attempt(uuid, text) to service_role;
grant execute on function public.seamstate_worker_report(uuid, text, jsonb, text, text, text) to service_role;
grant execute on function public.seamstate_worker_record_inspection(uuid, jsonb) to service_role;
grant execute on function public.seamstate_worker_save_analysis(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.seamstate_worker_due_jobs(integer, integer) to service_role;
grant execute on function public.seamstate_worker_artifact_path(uuid) to service_role;
