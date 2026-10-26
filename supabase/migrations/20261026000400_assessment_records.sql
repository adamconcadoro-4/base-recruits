-- =============================================================================
-- Base Recruits Assessment / Migration 4: assessment records
--
-- assessments                 one capture session for one athlete and discipline
-- assessment_repetitions      swings or pitches (valid or excluded, with reasons)
-- assessment_media            private video clips (storage bucket assessment-media)
-- assessment_annotations      Film Room event markers, notes and drawings
-- assessment_import_batches   CSV imports and their outcome
-- assessment_observations     every recorded value, with evidence, entry method,
--                             source, device, quality and review
-- assessment_targets          coach-defined targets per athlete and metric
--
-- Who can work on an athlete's assessments is decided at read time by
-- private.can_work_on_assessments (the athlete; their development coach;
-- a linked parent/guardian the athlete shared assessments with). Signed-in
-- users only read through row-level security; every write goes through a
-- checked function below. Nothing here is visible to college coaches.
-- =============================================================================

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  discipline text not null constraint assessments_discipline check (discipline in ('hitting', 'pitching')),
  mode text not null constraint assessments_mode check (mode in ('video_coach', 'instrumented', 'lab')),
  protocol_key text not null,
  protocol_version smallint not null,
  status text not null default 'draft'
    constraint assessments_status check (status in ('draft', 'ready_for_review', 'reviewed', 'published')),
  assessment_date date not null,
  age_band text not null
    constraint assessments_age_band check (age_band in ('13_14', '15_16', '17_18', '19_22', '23_plus', 'unknown')),
  competition_level text constraint assessments_competition_level check (competition_level in (
    'youth', 'high_school', 'travel', 'junior_college', 'four_year_college', 'adult', 'other')),
  bats text constraint assessments_bats check (bats in ('right', 'left', 'switch')),
  throws text constraint assessments_throws check (throws in ('right', 'left')),
  drill_type text constraint assessments_drill_type check (drill_type in (
    'tee', 'front_toss', 'overhand_bp', 'machine', 'live_bp', 'game', 'flat_ground', 'bullpen')),
  equipment text constraint assessments_equipment_length check (char_length(equipment) <= 200),
  bat_details text constraint assessments_bat_details_length check (char_length(bat_details) <= 120),
  camera_views text[] not null default '{}'
    constraint assessments_camera_views check (camera_views <@ array['side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other']::text[]),
  environment text constraint assessments_environment check (environment in ('indoor', 'outdoor')),
  surface text constraint assessments_surface_length check (char_length(surface) <= 80),
  capture_limitations text constraint assessments_limitations_length check (char_length(capture_limitations) <= 1000),
  notes text constraint assessments_notes_length check (char_length(notes) <= 2000),
  rep_goal smallint not null constraint assessments_rep_goal check (rep_goal between 1 and 200),
  baseline_assessment_id uuid references public.assessments (id) on delete set null,
  reassessment_of_id uuid references public.assessments (id) on delete set null,
  reassessment_due_on date,
  draft_version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  review_requested_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (protocol_key, protocol_version) references public.assessment_protocols (key, version),
  constraint assessments_not_own_baseline check (baseline_assessment_id is null or baseline_assessment_id <> id)
);
comment on table public.assessments is
  'One capture session. Private to the athlete, their development coach and family members they shared assessments with.';
comment on column public.assessments.age_band is
  'Age band on the assessment date, derived from the date of birth (which is never copied here).';
create index assessments_athlete_idx on public.assessments (athlete_id, assessment_date desc);

create table public.assessment_repetitions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  seq smallint not null constraint assessment_repetitions_seq check (seq between 1 and 500),
  pitch_type text constraint assessment_repetitions_pitch_type check (pitch_type in (
    'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other')),
  status text not null default 'valid' constraint assessment_repetitions_status check (status in ('valid', 'excluded')),
  exclusion_reason text constraint assessment_repetitions_reason_length check (char_length(exclusion_reason) between 3 and 200),
  media_id uuid,
  clip_time_ms integer constraint assessment_repetitions_clip_time check (clip_time_ms >= 0),
  note text constraint assessment_repetitions_note_length check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, seq),
  constraint assessment_repetitions_excluded_has_reason check ((status = 'excluded') = (exclusion_reason is not null))
);
comment on table public.assessment_repetitions is 'Swings or pitches. Excluded repetitions are kept with their reason.';

create table public.assessment_media (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  storage_path text not null unique,
  original_name text constraint assessment_media_name_length check (char_length(original_name) <= 160),
  mime_type text not null constraint assessment_media_mime check (mime_type in ('video/mp4', 'video/quicktime', 'video/webm')),
  byte_size bigint not null constraint assessment_media_size check (byte_size between 1 and 209715200),
  duration_ms integer constraint assessment_media_duration check (duration_ms between 1 and 3600000),
  camera_view text constraint assessment_media_camera_view check (camera_view in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other')),
  timing_basis text not null default 'unknown'
    constraint assessment_media_timing_basis check (timing_basis in ('real_time', 'slow_motion', 'unknown')),
  slowdown_factor numeric constraint assessment_media_slowdown check (slowdown_factor between 2 and 32),
  label text constraint assessment_media_label_length check (char_length(label) <= 80),
  status text not null default 'pending' constraint assessment_media_status check (status in ('pending', 'uploaded', 'removed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  removed_at timestamptz,
  constraint assessment_media_slow_motion_factor check ((timing_basis = 'slow_motion') = (slowdown_factor is not null))
);
comment on table public.assessment_media is
  'Private clips in the assessment-media storage bucket. Played back through short-lived signed links; never transcoded.';
create index assessment_media_assessment_idx on public.assessment_media (assessment_id, created_at);
create index assessment_media_athlete_idx on public.assessment_media (athlete_id, created_at desc);

alter table public.assessment_repetitions
  add constraint assessment_repetitions_media_fk foreign key (media_id) references public.assessment_media (id) on delete set null;

create table public.assessment_annotations (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.assessment_media (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  repetition_id uuid references public.assessment_repetitions (id) on delete set null,
  kind text not null constraint assessment_annotations_kind check (kind in ('event', 'note', 'drawing')),
  event_type text constraint assessment_annotations_event_type check (event_type in (
    'load_start', 'foot_contact', 'swing_start', 'contact', 'finish', 'first_move', 'leg_lift_peak', 'release')),
  time_ms integer not null constraint assessment_annotations_time check (time_ms between 0 and 3600000),
  note text constraint assessment_annotations_note_length check (char_length(note) between 1 and 1000),
  drawing jsonb,
  author_id uuid references auth.users (id) on delete set null,
  author_kind text not null constraint assessment_annotations_author_kind check (author_kind in ('self', 'development_coach')),
  created_at timestamptz not null default now(),
  constraint assessment_annotations_event_has_type check ((kind = 'event') = (event_type is not null)),
  constraint assessment_annotations_drawing_has_shape check ((kind = 'drawing') = (drawing is not null)),
  constraint assessment_annotations_note_has_text check (kind <> 'note' or note is not null)
);
comment on column public.assessment_annotations.time_ms is
  'Media time in milliseconds, from the browser''s playback position. Precision depends on the clip and the browser''s seeking.';
comment on column public.assessment_annotations.drawing is
  'Shape with coordinates normalized to the video frame (0–1), so it stays on the same spot at any size.';
create index assessment_annotations_media_idx on public.assessment_annotations (media_id, time_ms);

create table public.assessment_import_batches (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  file_name text not null constraint assessment_import_batches_name_length check (char_length(file_name) between 1 and 160),
  file_sha256 text not null constraint assessment_import_batches_sha check (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null default 0,
  accepted_count integer not null default 0,
  duplicate_count integer not null default 0,
  rejected_count integer not null default 0,
  rejected_rows jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column public.assessment_import_batches.rejected_rows is 'Row numbers and reasons only; rejected values are never stored.';

create table public.assessment_observations (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  repetition_id uuid references public.assessment_repetitions (id) on delete cascade,
  metric_key text not null,
  metric_version smallint not null,
  value numeric,
  unit text not null,
  source_value numeric,
  source_unit text,
  evidence_category text not null
    constraint assessment_observations_evidence check (evidence_category in ('sensor_measurement', 'video_estimate', 'observation')),
  entry_method text not null
    constraint assessment_observations_entry_method check (entry_method in ('manual_entry', 'file_import', 'device_connection', 'in_app_review')),
  source_kind text not null constraint assessment_observations_source check (source_kind in ('self', 'development_coach')),
  quality_state text not null default 'not_reviewed'
    constraint assessment_observations_quality check (quality_state in ('not_reviewed', 'usable', 'limited', 'excluded', 'unable_to_assess')),
  quality_reason text constraint assessment_observations_quality_reason_length check (char_length(quality_reason) between 3 and 300),
  device_kind text constraint assessment_observations_device_kind check (device_kind in (
    'radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other')),
  device_label text constraint assessment_observations_device_label_length check (char_length(device_label) between 1 and 80),
  media_id uuid references public.assessment_media (id) on delete set null,
  start_annotation_id uuid references public.assessment_annotations (id) on delete set null,
  end_annotation_id uuid references public.assessment_annotations (id) on delete set null,
  import_batch_id uuid references public.assessment_import_batches (id) on delete set null,
  source_row integer,
  dedupe_key text,
  source_timestamp timestamptz,
  note text constraint assessment_observations_note_length check (char_length(note) <= 500),
  entered_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (metric_key, metric_version) references public.assessment_metric_definitions (key, version),
  constraint assessment_observations_missing_is_unable check ((quality_state = 'unable_to_assess') = (value is null)),
  constraint assessment_observations_reason_required check (
    quality_state not in ('limited', 'excluded', 'unable_to_assess') or quality_reason is not null)
);
comment on table public.assessment_observations is
  'Every recorded value with its evidence category, entry method, source (self or development coach), device and quality. Missing values are rows that do not exist, never zeros.';
create unique index assessment_observations_one_rating_per_source
  on public.assessment_observations (assessment_id, metric_key, source_kind) where repetition_id is null;
create unique index assessment_observations_one_per_repetition
  on public.assessment_observations (repetition_id, metric_key) where repetition_id is not null;
create unique index assessment_observations_dedupe
  on public.assessment_observations (assessment_id, dedupe_key) where dedupe_key is not null;
create index assessment_observations_assessment_idx on public.assessment_observations (assessment_id, metric_key);

create table public.assessment_targets (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  metric_key text not null,
  metric_version smallint not null,
  pitch_type text constraint assessment_targets_pitch_type check (pitch_type in (
    'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other')),
  kind text not null constraint assessment_targets_kind check (kind in ('higher_is_better', 'lower_is_better', 'target_range')),
  value_a numeric not null,
  value_b numeric not null,
  value_c numeric,
  source text not null constraint assessment_targets_source_length check (char_length(source) between 3 and 200),
  set_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users (id) on delete set null,
  foreign key (metric_key, metric_version) references public.assessment_metric_definitions (key, version),
  constraint assessment_targets_shape check (
    value_a < value_b
    and ((kind = 'target_range' and value_c > 0) or (kind <> 'target_range' and value_c is null)))
);
comment on table public.assessment_targets is
  'Targets a development coach set for one athlete. No target is ever prefilled from college or professional data.';
create unique index assessment_targets_one_active
  on public.assessment_targets (athlete_id, metric_key, coalesce(pitch_type, '')) where retired_at is null;

-- -----------------------------------------------------------------------------
-- Triggers: updated_at and audit (values are never written to the audit log)
-- -----------------------------------------------------------------------------
create trigger assessments_set_updated_at before update on public.assessments
  for each row execute function private.set_updated_at();
create trigger assessment_repetitions_set_updated_at before update on public.assessment_repetitions
  for each row execute function private.set_updated_at();
create trigger assessment_observations_set_updated_at before update on public.assessment_observations
  for each row execute function private.set_updated_at();

create trigger assessments_audit
  after insert or update of status, baseline_assessment_id, reassessment_due_on or delete on public.assessments
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'discipline', 'protocol_key');
create trigger assessment_media_audit
  after insert or update of status or delete on public.assessment_media
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'assessment_id');
create trigger assessment_targets_audit
  after insert or update of retired_at or delete on public.assessment_targets
  for each row execute function private.audit_row_change('athlete_id', 'id', 'metric_key', 'kind', 'retired_at');

-- Observation changes: who, which metric and which quality state — the value only as "changed".
create function private.audit_assessment_observation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessment_observations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_athlete uuid;
begin
  select a.athlete_id into v_athlete from public.assessments a where a.id = v_row.assessment_id;
  perform private.log_audit(
    'row.' || lower(tg_op), 'assessment_observation', v_row.id::text, v_athlete,
    jsonb_build_object('table', 'assessment_observations', 'metric_key', v_row.metric_key,
                       'quality_state', v_row.quality_state, 'source_kind', v_row.source_kind,
                       'value', case when tg_op = 'UPDATE' and old.value is not distinct from new.value then 'unchanged' else 'changed' end),
    null);
  return null;
end;
$$;
revoke all on function private.audit_assessment_observation() from public;
create trigger assessment_observations_audit
  after insert or update of value, quality_state, source_kind or delete on public.assessment_observations
  for each row execute function private.audit_assessment_observation();

-- -----------------------------------------------------------------------------
-- Row-level security: read only, for people who can work on the athlete's assessments
-- -----------------------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.assessment_repetitions enable row level security;
alter table public.assessment_media enable row level security;
alter table public.assessment_annotations enable row level security;
alter table public.assessment_import_batches enable row level security;
alter table public.assessment_observations enable row level security;
alter table public.assessment_targets enable row level security;

revoke all on table public.assessments, public.assessment_repetitions, public.assessment_media,
  public.assessment_annotations, public.assessment_import_batches, public.assessment_observations,
  public.assessment_targets from anon, authenticated, service_role;
grant select on table public.assessments, public.assessment_repetitions, public.assessment_media,
  public.assessment_annotations, public.assessment_import_batches, public.assessment_observations,
  public.assessment_targets to authenticated;

create function private.can_work_on_assessment(p_assessment_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.assessments a
                  where a.id = p_assessment_id and private.can_work_on_assessments((select auth.uid()), a.athlete_id))
$$;
revoke all on function private.can_work_on_assessment(uuid) from public;
grant execute on function private.can_work_on_assessment(uuid) to authenticated;

create policy assessments_read on public.assessments for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy assessment_repetitions_read on public.assessment_repetitions for select to authenticated
  using (private.can_work_on_assessment(assessment_id));
create policy assessment_media_read on public.assessment_media for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy assessment_annotations_read on public.assessment_annotations for select to authenticated
  using (private.can_work_on_assessment(assessment_id));
create policy assessment_import_batches_read on public.assessment_import_batches for select to authenticated
  using (private.can_work_on_assessment(assessment_id));
create policy assessment_observations_read on public.assessment_observations for select to authenticated
  using (private.can_work_on_assessment(assessment_id));
create policy assessment_targets_read on public.assessment_targets for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));

-- -----------------------------------------------------------------------------
-- Internal helpers for the write functions
-- -----------------------------------------------------------------------------

-- Age band on a date from the private date of birth ('unknown' if not recorded).
create function private.assessment_age_band(p_athlete_id uuid, p_on date) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when y < 13 then 'unknown'
      when y <= 14 then '13_14'
      when y <= 16 then '15_16'
      when y <= 18 then '17_18'
      when y <= 22 then '19_22'
      else '23_plus' end
      from (select private.age_in_years(p.date_of_birth, p_on) as y
              from public.profiles p where p.id = p_athlete_id and p.date_of_birth is not null) ages), 'unknown')
$$;

-- Locks an assessment the caller may work on. p_editable: refuse published
-- assessments (they must be reopened, so published reports stay frozen).
create function private.assessment_for_work(p_assessment_id uuid, p_editable boolean) returns public.assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select * into v_row from public.assessments a where a.id = p_assessment_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_row.athlete_id) then
    raise exception 'assessment not found' using errcode = 'BR003';
  end if;
  if p_editable and v_row.status = 'published' then
    raise exception 'this assessment is published; reopen it to make corrections' using errcode = 'BR004';
  end if;
  return v_row;
end;
$$;

create function private.assessment_source_kind(p_athlete_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.assessment_relation((select auth.uid()), p_athlete_id) = 'development_coach'
              then 'development_coach' else 'self' end
$$;

-- Plain-language problem with an assessment context, or null.
create function private.assessment_context_problem(p_discipline text, p_context jsonb) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_text_keys constant text[] := array['competition_level', 'bats', 'throws', 'drill_type', 'equipment', 'bat_details',
                                       'environment', 'surface', 'capture_limitations', 'notes'];
begin
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    return 'assessment details are missing';
  end if;
  for v_key in select jsonb_object_keys(p_context) loop
    if v_key <> all (v_text_keys || array['camera_views', 'rep_goal']) then
      return 'unknown assessment detail: ' || v_key;
    end if;
    if v_key = any (v_text_keys) and jsonb_typeof(p_context -> v_key) not in ('string', 'null') then
      return v_key || ' must be text';
    end if;
  end loop;
  if jsonb_typeof(p_context -> 'rep_goal') is distinct from 'number'
     or (p_context ->> 'rep_goal') !~ '^[0-9]+$' or (p_context ->> 'rep_goal')::integer not between 1 and 200 then
    return 'the repetition goal must be a whole number from 1 to 200';
  end if;
  if p_context ? 'camera_views' and jsonb_typeof(p_context -> 'camera_views') not in ('array', 'null') then
    return 'camera views must be a list';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(nullif(p_context -> 'camera_views', 'null'::jsonb), '[]'::jsonb)) e
              where jsonb_typeof(e) <> 'string'
                 or e #>> '{}' not in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other')) then
    return 'choose camera views from the list';
  end if;
  if nullif(p_context ->> 'competition_level', '') not in ('youth', 'high_school', 'travel', 'junior_college', 'four_year_college', 'adult', 'other') then
    return 'choose a competition level from the list';
  end if;
  if nullif(p_context ->> 'bats', '') not in ('right', 'left', 'switch') then
    return 'batting side must be right, left or switch';
  end if;
  if nullif(p_context ->> 'throws', '') not in ('right', 'left') then
    return 'throwing hand must be right or left';
  end if;
  if nullif(p_context ->> 'environment', '') not in ('indoor', 'outdoor') then
    return 'environment must be indoor or outdoor';
  end if;
  if nullif(p_context ->> 'drill_type', '') is not null and not (
       (p_discipline = 'hitting' and p_context ->> 'drill_type' in ('tee', 'front_toss', 'overhand_bp', 'machine', 'live_bp', 'game'))
    or (p_discipline = 'pitching' and p_context ->> 'drill_type' in ('flat_ground', 'bullpen', 'live_bp', 'game'))) then
    return 'choose a drill type for this discipline';
  end if;
  if char_length(coalesce(p_context ->> 'equipment', '')) > 200 then return 'equipment is longer than 200 characters'; end if;
  if char_length(coalesce(p_context ->> 'bat_details', '')) > 120 then return 'bat details are longer than 120 characters'; end if;
  if char_length(coalesce(p_context ->> 'surface', '')) > 80 then return 'surface is longer than 80 characters'; end if;
  if char_length(coalesce(p_context ->> 'capture_limitations', '')) > 1000 then return 'capture limitations are longer than 1,000 characters'; end if;
  if char_length(coalesce(p_context ->> 'notes', '')) > 2000 then return 'notes are longer than 2,000 characters'; end if;
  return null;
end;
$$;

create function private.assessment_text(p_context jsonb, p_key text) returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_context ->> p_key), '')
$$;

create function private.assessment_camera_views(p_context jsonb) returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select distinct e from jsonb_array_elements_text(
           coalesce(nullif(p_context -> 'camera_views', 'null'::jsonb), '[]'::jsonb)) e order by e), '{}'::text[])
$$;

-- Drawings: {"shape": line|arrow|circle|box, "points": [[x, y], [x, y]], "color": yellow|red|blue|white}
-- with every coordinate normalized to the video frame (0 to 1).
create function private.assessment_drawing_ok(p_drawing jsonb) returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_drawing) = 'object'
     and (select count(*) from jsonb_object_keys(p_drawing)) = 3
     and p_drawing ->> 'shape' in ('line', 'arrow', 'circle', 'box')
     and p_drawing ->> 'color' in ('yellow', 'red', 'blue', 'white')
     and jsonb_typeof(p_drawing -> 'points') = 'array'
     and jsonb_array_length(p_drawing -> 'points') = 2
     and not exists (
       select 1 from jsonb_array_elements(p_drawing -> 'points') point
        where jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 2
           or jsonb_typeof(point -> 0) <> 'number' or jsonb_typeof(point -> 1) <> 'number'
           or (point ->> 0)::numeric not between 0 and 1 or (point ->> 1)::numeric not between 0 and 1)
$$;

revoke all on function private.assessment_age_band(uuid, date) from public;
revoke all on function private.assessment_for_work(uuid, boolean) from public;
revoke all on function private.assessment_source_kind(uuid) from public;
revoke all on function private.assessment_context_problem(text, jsonb) from public;
revoke all on function private.assessment_text(jsonb, text) from public;
revoke all on function private.assessment_camera_views(jsonb) from public;
revoke all on function private.assessment_drawing_ok(jsonb) from public;

-- -----------------------------------------------------------------------------
-- Athletes the signed-in person can work on
-- -----------------------------------------------------------------------------
create function public.assessment_athletes()
returns table (athlete_id uuid, athlete_name text, relation text)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select (select auth.uid()) as athlete_id
    union
    select g.athlete_id from public.consent_grants g
     where g.grantee_id = (select auth.uid()) and g.scope = 'development_coach_access' and g.status = 'active'
    union
    select l.athlete_id from public.family_links l
     where l.guardian_id = (select auth.uid()) and l.status = 'active'
  )
  select c.athlete_id, p.display_name, private.assessment_relation((select auth.uid()), c.athlete_id)
    from candidates c join public.profiles p on p.id = c.athlete_id
   where private.assessment_relation((select auth.uid()), c.athlete_id) is not null
   order by case private.assessment_relation((select auth.uid()), c.athlete_id) when 'athlete' then 0 else 1 end,
            p.display_name
$$;

-- -----------------------------------------------------------------------------
-- Assessments
-- -----------------------------------------------------------------------------
create function public.create_assessment(
  p_athlete_id uuid,
  p_protocol_key text,
  p_protocol_version integer,
  p_assessment_date date,
  p_context jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_protocol public.assessment_protocols%rowtype;
  v_problem text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR003';
  end if;
  select * into v_protocol from public.assessment_protocols p
   where p.key = p_protocol_key and p.version = p_protocol_version and p.active;
  if not found then
    raise exception 'choose a protocol from the list' using errcode = 'BR003';
  end if;
  if v_protocol.mode = 'lab' then
    raise exception 'lab assessments are not available' using errcode = 'BR003';
  end if;
  if p_assessment_date is null or p_assessment_date > private.today_utc() + 1
     or p_assessment_date < private.today_utc() - interval '5 years' then
    raise exception 'the assessment date must be within the last five years and not in the future' using errcode = 'BR003';
  end if;
  v_problem := private.assessment_context_problem(v_protocol.discipline, p_context);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;

  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;
  if (select count(*) from public.assessments a
       where a.athlete_id = p_athlete_id and a.status <> 'published') >= 30 then
    raise exception 'too many unfinished assessments; publish or delete some first' using errcode = 'BR005';
  end if;

  insert into public.assessments (
    athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date, age_band,
    competition_level, bats, throws, drill_type, equipment, bat_details, camera_views, environment, surface,
    capture_limitations, notes, rep_goal, created_by)
  values (
    p_athlete_id, v_protocol.discipline, v_protocol.mode, v_protocol.key, v_protocol.version, p_assessment_date,
    private.assessment_age_band(p_athlete_id, p_assessment_date),
    private.assessment_text(p_context, 'competition_level'), private.assessment_text(p_context, 'bats'),
    private.assessment_text(p_context, 'throws'), private.assessment_text(p_context, 'drill_type'),
    private.assessment_text(p_context, 'equipment'), private.assessment_text(p_context, 'bat_details'),
    private.assessment_camera_views(p_context), private.assessment_text(p_context, 'environment'),
    private.assessment_text(p_context, 'surface'), private.assessment_text(p_context, 'capture_limitations'),
    private.assessment_text(p_context, 'notes'), (p_context ->> 'rep_goal')::smallint, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

-- Autosave of the assessment details. p_expected_version guards against two
-- windows overwriting each other; the new version is returned.
create function public.update_assessment_context(
  p_assessment_id uuid,
  p_expected_version integer,
  p_assessment_date date,
  p_context jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
  v_problem text;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  if p_expected_version is distinct from v_row.draft_version then
    raise exception 'this assessment changed in another window; reload to see the latest version' using errcode = 'BR004';
  end if;
  if p_assessment_date is null or p_assessment_date > private.today_utc() + 1
     or p_assessment_date < private.today_utc() - interval '5 years' then
    raise exception 'the assessment date must be within the last five years and not in the future' using errcode = 'BR003';
  end if;
  v_problem := private.assessment_context_problem(v_row.discipline, p_context);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;

  update public.assessments a
     set assessment_date = p_assessment_date,
         age_band = private.assessment_age_band(a.athlete_id, p_assessment_date),
         competition_level = private.assessment_text(p_context, 'competition_level'),
         bats = private.assessment_text(p_context, 'bats'),
         throws = private.assessment_text(p_context, 'throws'),
         drill_type = private.assessment_text(p_context, 'drill_type'),
         equipment = private.assessment_text(p_context, 'equipment'),
         bat_details = private.assessment_text(p_context, 'bat_details'),
         camera_views = private.assessment_camera_views(p_context),
         environment = private.assessment_text(p_context, 'environment'),
         surface = private.assessment_text(p_context, 'surface'),
         capture_limitations = private.assessment_text(p_context, 'capture_limitations'),
         notes = private.assessment_text(p_context, 'notes'),
         rep_goal = (p_context ->> 'rep_goal')::smallint,
         draft_version = a.draft_version + 1
   where a.id = p_assessment_id;
  return v_row.draft_version + 1;
end;
$$;

-- draft ⇄ ready_for_review; a development coach marks reviewed; reviewed → draft.
create function public.set_assessment_status(p_assessment_id uuid, p_status text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_coach boolean;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  v_coach := private.assessment_relation(v_uid, v_row.athlete_id) = 'development_coach';
  if p_status = 'ready_for_review' and v_row.status = 'draft' then
    update public.assessments a set status = 'ready_for_review', review_requested_at = now() where a.id = p_assessment_id;
  elsif p_status = 'draft' and v_row.status in ('ready_for_review', 'reviewed') then
    update public.assessments a set status = 'draft', reviewed_by = null, reviewed_at = null where a.id = p_assessment_id;
  elsif p_status = 'reviewed' and v_row.status in ('draft', 'ready_for_review') then
    if not v_coach then
      raise exception 'only the athlete''s development coach can mark an assessment reviewed' using errcode = 'BR002';
    end if;
    update public.assessments a set status = 'reviewed', reviewed_by = v_uid, reviewed_at = now() where a.id = p_assessment_id;
  else
    raise exception 'that status change is not available' using errcode = 'BR004';
  end if;
end;
$$;

-- Only drafts that were never published, and only once their clips are removed
-- (so no video is left behind in storage).
create function public.delete_assessment(p_assessment_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  if exists (select 1 from public.assessment_media m where m.assessment_id = p_assessment_id and m.status in ('pending', 'uploaded')) then
    raise exception 'remove this assessment''s clips first' using errcode = 'BR004';
  end if;
  if exists (select 1 from public.assessment_report_revisions r where r.assessment_id = p_assessment_id) then
    raise exception 'published assessments are kept; reopen it to make corrections instead' using errcode = 'BR004';
  end if;
  delete from public.assessments a where a.id = p_assessment_id;
  perform private.log_audit('assessment.deleted', 'assessment', p_assessment_id::text, v_row.athlete_id, '{}'::jsonb, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Repetitions
-- -----------------------------------------------------------------------------
create function public.add_assessment_repetitions(p_assessment_id uuid, p_count integer, p_pitch_type text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
  v_next integer;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  if p_count is null or p_count not between 1 and 50 then
    raise exception 'add between 1 and 50 repetitions at a time' using errcode = 'BR003';
  end if;
  if p_pitch_type is not null and v_row.discipline <> 'pitching' then
    raise exception 'pitch types apply to pitching assessments only' using errcode = 'BR003';
  end if;
  if p_pitch_type is not null and p_pitch_type not in (
       'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other') then
    raise exception 'choose a pitch type from the list' using errcode = 'BR003';
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_next from public.assessment_repetitions r where r.assessment_id = p_assessment_id;
  if v_next + p_count - 1 > 500 then
    raise exception 'an assessment can have at most 500 repetitions' using errcode = 'BR003';
  end if;
  insert into public.assessment_repetitions (assessment_id, seq, pitch_type)
  select p_assessment_id, s, p_pitch_type from generate_series(v_next, v_next + p_count - 1) s;
  return v_next;
end;
$$;

create function public.update_assessment_repetition(
  p_repetition_id uuid,
  p_pitch_type text,
  p_media_id uuid,
  p_clip_time_ms integer,
  p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment uuid;
  v_row public.assessments%rowtype;
begin
  select r.assessment_id into v_assessment from public.assessment_repetitions r where r.id = p_repetition_id;
  v_row := private.assessment_for_work(v_assessment, true);
  if p_pitch_type is not null and (v_row.discipline <> 'pitching' or p_pitch_type not in (
       'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other')) then
    raise exception 'choose a pitch type from the list (pitching only)' using errcode = 'BR003';
  end if;
  if p_media_id is not null and not exists (
       select 1 from public.assessment_media m where m.id = p_media_id and m.assessment_id = v_row.id and m.status = 'uploaded') then
    raise exception 'that clip is not part of this assessment' using errcode = 'BR003';
  end if;
  if p_clip_time_ms is not null and p_clip_time_ms not between 0 and 3600000 then
    raise exception 'the clip time is out of range' using errcode = 'BR003';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'the note is longer than 300 characters' using errcode = 'BR003';
  end if;
  update public.assessment_repetitions r
     set pitch_type = p_pitch_type, media_id = p_media_id, clip_time_ms = p_clip_time_ms, note = nullif(btrim(p_note), '')
   where r.id = p_repetition_id;
end;
$$;

create function public.set_assessment_repetition_status(p_repetition_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  select r.assessment_id into v_assessment from public.assessment_repetitions r where r.id = p_repetition_id;
  perform private.assessment_for_work(v_assessment, true);
  if p_status = 'excluded' and (v_reason is null or char_length(v_reason) not between 3 and 200) then
    raise exception 'say why this repetition is excluded (3 to 200 characters)' using errcode = 'BR003';
  end if;
  if p_status not in ('valid', 'excluded') then
    raise exception 'a repetition is valid or excluded' using errcode = 'BR003';
  end if;
  update public.assessment_repetitions r
     set status = p_status, exclusion_reason = case when p_status = 'excluded' then v_reason end
   where r.id = p_repetition_id;
end;
$$;

create function public.delete_assessment_repetition(p_repetition_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment uuid;
begin
  select r.assessment_id into v_assessment from public.assessment_repetitions r where r.id = p_repetition_id;
  perform private.assessment_for_work(v_assessment, true);
  if exists (select 1 from public.assessment_observations o where o.repetition_id = p_repetition_id) then
    raise exception 'this repetition has recorded values; exclude it with a reason instead' using errcode = 'BR004';
  end if;
  delete from public.assessment_repetitions r where r.id = p_repetition_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Observations
-- -----------------------------------------------------------------------------

-- Problem with a value for a metric definition, or null.
create function private.assessment_value_problem(p_definition public.assessment_metric_definitions, p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'enter a value'
    when p_definition.value_kind = 'rating' and (p_value <> trunc(p_value) or p_value not between 1 and 5)
      then 'a rating is a whole number from 1 to 5'
    when p_definition.value_kind = 'boolean' and p_value not in (0, 1) then 'a charted outcome is yes or no'
    when p_definition.integer_only and p_value <> trunc(p_value) then 'enter a whole number'
    when (p_definition.min_value is not null and p_value < p_definition.min_value)
      or (p_definition.max_value is not null and p_value > p_definition.max_value)
      then format('the value must be between %s and %s', p_definition.min_value, p_definition.max_value)
  end
$$;
revoke all on function private.assessment_value_problem(public.assessment_metric_definitions, numeric) from public;

create function private.assessment_protocol_metric(p_assessment public.assessments, p_metric_key text)
returns public.assessment_metric_definitions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_definition public.assessment_metric_definitions%rowtype;
begin
  select d.* into v_definition
    from public.assessment_protocol_metrics pm
    join public.assessment_metric_definitions d on d.key = pm.metric_key and d.version = pm.metric_version
   where pm.protocol_key = p_assessment.protocol_key and pm.protocol_version = p_assessment.protocol_version
     and pm.metric_key = p_metric_key;
  if not found then
    raise exception 'that metric is not part of this assessment' using errcode = 'BR003';
  end if;
  if v_definition.derived_from is not null then
    raise exception 'derived values are calculated by Base Recruits and cannot be entered' using errcode = 'BR003';
  end if;
  return v_definition;
end;
$$;
revoke all on function private.assessment_protocol_metric(public.assessments, text) from public;

-- Records (or replaces) one value. Ratings are one per source (self or coach)
-- per assessment; repetition values are one per repetition and metric.
-- "Unable to assess" stores no value and needs a reason.
create function public.record_assessment_observation(
  p_assessment_id uuid,
  p_metric_key text,
  p_repetition_id uuid,
  p_value numeric,
  p_unable_to_assess boolean,
  p_quality_reason text,
  p_evidence_category text,
  p_device_kind text,
  p_device_label text,
  p_source_timestamp timestamptz,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_rep public.assessment_repetitions%rowtype;
  v_source text;
  v_unable boolean := coalesce(p_unable_to_assess, false);
  v_value numeric := p_value;
  v_evidence text := p_evidence_category;
  v_reason text := nullif(btrim(p_quality_reason), '');
  v_problem text;
  v_id uuid;
  v_quality text;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  v_definition := private.assessment_protocol_metric(v_row, p_metric_key);
  v_source := private.assessment_source_kind(v_row.athlete_id);

  if v_evidence is null and cardinality(v_definition.evidence) = 1 then
    v_evidence := v_definition.evidence[1];
  end if;
  if v_evidence is null or not (v_evidence = any (v_definition.evidence)) then
    raise exception 'that kind of evidence is not accepted for this metric' using errcode = 'BR003';
  end if;

  if v_definition.granularity = 'assessment' then
    if p_repetition_id is not null then
      raise exception 'this metric is rated once for the whole assessment' using errcode = 'BR003';
    end if;
  else
    select * into v_rep from public.assessment_repetitions r where r.id = p_repetition_id and r.assessment_id = p_assessment_id;
    if not found then
      raise exception 'choose a repetition in this assessment' using errcode = 'BR003';
    end if;
    if v_definition.per_pitch_type and v_rep.pitch_type is null then
      raise exception 'set the pitch type for this repetition first' using errcode = 'BR003';
    end if;
  end if;

  if v_unable then
    v_value := null;
    if v_reason is null or char_length(v_reason) not between 3 and 300 then
      raise exception 'say why this could not be assessed (3 to 300 characters)' using errcode = 'BR003';
    end if;
    v_quality := 'unable_to_assess';
  else
    v_problem := private.assessment_value_problem(v_definition, v_value);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'BR003';
    end if;
    v_reason := null;
    -- A development coach's own entry counts as reviewed; self-entered values wait for review.
    v_quality := case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end;
  end if;

  if v_definition.requires_device and not v_unable then
    if p_device_kind is null or p_device_kind not in ('radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other')
       or char_length(coalesce(btrim(p_device_label), '')) not between 1 and 80 then
      raise exception 'measured values need the kind of device and its name' using errcode = 'BR003';
    end if;
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'the note is longer than 500 characters' using errcode = 'BR003';
  end if;

  if v_definition.granularity = 'assessment' then
    select o.id into v_id from public.assessment_observations o
     where o.assessment_id = p_assessment_id and o.metric_key = p_metric_key
       and o.source_kind = v_source and o.repetition_id is null
     for update;
  else
    select o.id into v_id from public.assessment_observations o
     where o.repetition_id = p_repetition_id and o.metric_key = p_metric_key
     for update;
  end if;

  if v_id is null then
    insert into public.assessment_observations (
      assessment_id, repetition_id, metric_key, metric_version, value, unit, evidence_category, entry_method,
      source_kind, quality_state, quality_reason, device_kind, device_label, source_timestamp, note, entered_by,
      reviewed_by, reviewed_at)
    values (
      p_assessment_id, p_repetition_id, v_definition.key, v_definition.version, v_value, v_definition.unit, v_evidence,
      'manual_entry', v_source, v_quality, v_reason,
      case when v_definition.requires_device and not v_unable then p_device_kind end,
      case when v_definition.requires_device and not v_unable then btrim(p_device_label) end,
      p_source_timestamp, nullif(btrim(p_note), ''), v_uid,
      case when v_source = 'development_coach' then v_uid end,
      case when v_source = 'development_coach' then now() end)
    returning id into v_id;
  else
    update public.assessment_observations o
       set value = v_value, metric_version = v_definition.version, unit = v_definition.unit,
           evidence_category = v_evidence, entry_method = 'manual_entry', source_kind = v_source,
           quality_state = v_quality, quality_reason = v_reason,
           device_kind = case when v_definition.requires_device and not v_unable then p_device_kind end,
           device_label = case when v_definition.requires_device and not v_unable then btrim(p_device_label) end,
           source_value = null, source_unit = null, media_id = null, start_annotation_id = null,
           end_annotation_id = null, import_batch_id = null, source_row = null, dedupe_key = null,
           source_timestamp = p_source_timestamp, note = nullif(btrim(p_note), ''), entered_by = v_uid,
           reviewed_by = case when v_source = 'development_coach' then v_uid end,
           reviewed_at = case when v_source = 'development_coach' then now() end
     where o.id = v_id;
  end if;
  return v_id;
end;
$$;

-- Quality review. A development coach can review any value; the athlete's side
-- can mark only its own entries. "Unable to assess" is chosen when entering a value.
create function public.set_observation_quality(p_observation_id uuid, p_quality_state text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_observation public.assessment_observations%rowtype;
  v_row public.assessments%rowtype;
  v_coach boolean;
  v_reason text := nullif(btrim(p_reason), '');
begin
  select * into v_observation from public.assessment_observations o where o.id = p_observation_id;
  v_row := private.assessment_for_work(v_observation.assessment_id, true);
  v_coach := private.assessment_relation(v_uid, v_row.athlete_id) = 'development_coach';
  if p_quality_state not in ('not_reviewed', 'usable', 'limited', 'excluded') then
    raise exception 'choose not reviewed, usable, limited or excluded' using errcode = 'BR003';
  end if;
  if v_observation.quality_state = 'unable_to_assess' then
    raise exception 'enter a value before reviewing it' using errcode = 'BR004';
  end if;
  if not v_coach and v_observation.source_kind <> 'self' then
    raise exception 'only the development coach can review the coach''s values' using errcode = 'BR002';
  end if;
  if p_quality_state in ('limited', 'excluded') and (v_reason is null or char_length(v_reason) not between 3 and 300) then
    raise exception 'say why (3 to 300 characters)' using errcode = 'BR003';
  end if;
  update public.assessment_observations o
     set quality_state = p_quality_state,
         quality_reason = case when p_quality_state in ('limited', 'excluded') then v_reason end,
         reviewed_by = case when v_coach then v_uid else o.reviewed_by end,
         reviewed_at = case when v_coach then now() else o.reviewed_at end
   where o.id = p_observation_id;
end;
$$;

create function public.delete_assessment_observation(p_observation_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_observation public.assessment_observations%rowtype;
  v_row public.assessments%rowtype;
begin
  select * into v_observation from public.assessment_observations o where o.id = p_observation_id;
  v_row := private.assessment_for_work(v_observation.assessment_id, true);
  if private.assessment_relation(v_uid, v_row.athlete_id) <> 'development_coach' and v_observation.source_kind <> 'self' then
    raise exception 'only the development coach can delete the coach''s values' using errcode = 'BR002';
  end if;
  delete from public.assessment_observations o where o.id = p_observation_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Coach-defined targets
-- -----------------------------------------------------------------------------
create function public.set_assessment_target(
  p_athlete_id uuid,
  p_metric_key text,
  p_pitch_type text,
  p_kind text,
  p_value_a numeric,
  p_value_b numeric,
  p_value_c numeric,
  p_source text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_definition public.assessment_metric_definitions%rowtype;
  v_source text := nullif(btrim(p_source), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if private.assessment_relation(v_uid, p_athlete_id) is distinct from 'development_coach' then
    raise exception 'only the athlete''s development coach can set targets' using errcode = 'BR002';
  end if;
  select * into v_definition from public.assessment_metric_definitions d
   where d.key = p_metric_key and d.active order by d.version desc limit 1;
  if not found or v_definition.scoring <> 'targetable' then
    raise exception 'this metric is not scored against targets' using errcode = 'BR003';
  end if;
  if p_kind is null or not (p_kind = any (v_definition.target_kinds)) then
    raise exception 'that kind of target does not fit this metric' using errcode = 'BR003';
  end if;
  if p_pitch_type is not null then
    if not v_definition.per_pitch_type or p_pitch_type not in (
         'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other') then
      raise exception 'choose a pitch type this metric is kept separate for' using errcode = 'BR003';
    end if;
  elsif v_definition.per_pitch_type and v_definition.aggregation <> 'rate' then
    raise exception 'choose the pitch type this target is for' using errcode = 'BR003';
  end if;
  if v_source is null or char_length(v_source) not between 3 and 200 then
    raise exception 'say where the target comes from (3 to 200 characters)' using errcode = 'BR003';
  end if;
  if p_value_a is null or p_value_b is null or (p_kind = 'target_range' and p_value_c is null) then
    raise exception 'enter every number for the target' using errcode = 'BR003';
  end if;
  if not (p_value_a < p_value_b) then
    raise exception '%', case p_kind
      when 'higher_is_better' then 'the goal must be higher than the zero-score floor'
      when 'lower_is_better' then 'the goal must be lower than the zero-score ceiling'
      else 'the range must have a low value below its high value (a zero-width range is not allowed)' end
      using errcode = 'BR003';
  end if;
  if p_kind = 'target_range' and not (p_value_c > 0) then
    raise exception 'the tolerance must be greater than zero' using errcode = 'BR003';
  end if;
  if p_kind = 'lower_is_better' and p_value_a < 0 then
    raise exception 'the goal cannot be negative' using errcode = 'BR003';
  end if;
  -- Rates are scored as percentages (0–100); other metrics in their stored unit.
  if (case when v_definition.aggregation = 'rate' then least(p_value_a, p_value_b) < 0
           else v_definition.min_value is not null and least(p_value_a, p_value_b) < v_definition.min_value end)
     or (case when v_definition.aggregation = 'rate' then greatest(p_value_a, p_value_b) > 100
              else v_definition.max_value is not null and greatest(p_value_a, p_value_b) > v_definition.max_value end) then
    raise exception 'target values must be inside the metric''s valid range' using errcode = 'BR003';
  end if;

  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;
  update public.assessment_targets t
     set retired_at = now(), retired_by = v_uid
   where t.athlete_id = p_athlete_id and t.metric_key = v_definition.key
     and t.pitch_type is not distinct from p_pitch_type and t.retired_at is null;
  insert into public.assessment_targets
    (athlete_id, metric_key, metric_version, pitch_type, kind, value_a, value_b, value_c, source, set_by)
  values
    (p_athlete_id, v_definition.key, v_definition.version, p_pitch_type, p_kind, p_value_a, p_value_b,
     case when p_kind = 'target_range' then p_value_c end, v_source, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.retire_assessment_target(p_target_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target public.assessment_targets%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select * into v_target from public.assessment_targets t where t.id = p_target_id and t.retired_at is null for update;
  if not found or private.assessment_relation(v_uid, v_target.athlete_id) is distinct from 'development_coach' then
    raise exception 'target not found' using errcode = 'BR003';
  end if;
  update public.assessment_targets t set retired_at = now(), retired_by = v_uid where t.id = p_target_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Media (private storage) and Film Room annotations
-- -----------------------------------------------------------------------------
create function public.begin_assessment_upload(
  p_assessment_id uuid,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_camera_view text,
  p_timing_basis text,
  p_slowdown_factor numeric,
  p_label text
) returns table (media_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  v_row := private.assessment_for_work(p_assessment_id, false);
  if not private.assessment_video_enabled() then
    raise exception 'video uploads are not switched on yet' using errcode = 'BR004';
  end if;
  if p_mime_type is null or p_mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
    raise exception 'upload an MP4, MOV or WebM video' using errcode = 'BR003';
  end if;
  if p_byte_size is null or p_byte_size not between 1 and 209715200 then
    raise exception 'videos can be up to 200 MB' using errcode = 'BR003';
  end if;
  if p_camera_view is not null and p_camera_view not in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other') then
    raise exception 'choose a camera view from the list' using errcode = 'BR003';
  end if;
  if coalesce(p_timing_basis, '') not in ('real_time', 'slow_motion', 'unknown') then
    raise exception 'say whether the clip plays at real speed' using errcode = 'BR003';
  end if;
  if (p_timing_basis = 'slow_motion') <> (p_slowdown_factor is not null)
     or (p_slowdown_factor is not null and p_slowdown_factor not between 2 and 32) then
    raise exception 'for slow motion, enter how many times slower it plays (2 to 32)' using errcode = 'BR003';
  end if;
  if char_length(coalesce(p_label, '')) > 80 or char_length(coalesce(p_file_name, '')) > 160 then
    raise exception 'the clip name is too long' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_media m where m.assessment_id = p_assessment_id and m.status <> 'removed') >= 30 then
    raise exception 'an assessment can have at most 30 clips' using errcode = 'BR005';
  end if;
  if (select count(*) from public.assessment_media m
       where m.created_by = v_uid and m.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'too many uploads in the last hour; please wait and try again' using errcode = 'BR005';
  end if;

  v_path := v_row.athlete_id::text || '/' || v_row.id::text || '/' || v_id::text || '.'
            || case p_mime_type when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' else 'webm' end;
  insert into public.assessment_media
    (id, assessment_id, athlete_id, storage_path, original_name, mime_type, byte_size, camera_view, timing_basis,
     slowdown_factor, label, created_by)
  values
    (v_id, v_row.id, v_row.athlete_id, v_path, nullif(btrim(p_file_name), ''), p_mime_type, p_byte_size, p_camera_view,
     p_timing_basis, p_slowdown_factor, nullif(btrim(p_label), ''), v_uid);
  media_id := v_id;
  storage_path := v_path;
  return next;
end;
$$;

-- Confirms the upload reached storage with an acceptable size and type.
create function public.complete_assessment_upload(p_media_id uuid, p_duration_ms integer default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_media public.assessment_media%rowtype;
  v_metadata jsonb;
  v_exists boolean;
begin
  select * into v_media from public.assessment_media m where m.id = p_media_id;
  perform private.assessment_for_work(v_media.assessment_id, false);
  if v_media.created_by is distinct from v_uid or v_media.status <> 'pending' then
    raise exception 'upload not found' using errcode = 'BR003';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'video storage is not available' using errcode = 'BR004';
  end if;
  execute 'select true, o.metadata from storage.objects o where o.bucket_id = $1 and o.name = $2'
    into v_exists, v_metadata using 'assessment-media', v_media.storage_path;
  if v_exists is null then
    raise exception 'the video has not finished uploading' using errcode = 'BR004';
  end if;
  if coalesce((v_metadata ->> 'size')::bigint, v_media.byte_size) not between 1 and 209715200
     or coalesce(v_metadata ->> 'mimetype', v_media.mime_type) not in ('video/mp4', 'video/quicktime', 'video/webm') then
    raise exception 'the uploaded file is not an accepted video' using errcode = 'BR003';
  end if;
  if p_duration_ms is not null and p_duration_ms not between 1 and 3600000 then
    raise exception 'the clip length is out of range' using errcode = 'BR003';
  end if;
  update public.assessment_media m
     set status = 'uploaded', uploaded_at = now(), duration_ms = p_duration_ms
   where m.id = p_media_id;
end;
$$;

create function public.update_assessment_media(
  p_media_id uuid,
  p_label text,
  p_camera_view text,
  p_timing_basis text,
  p_slowdown_factor numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.assessment_media%rowtype;
begin
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status <> 'removed';
  perform private.assessment_for_work(v_media.assessment_id, false);
  if p_camera_view is not null and p_camera_view not in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other') then
    raise exception 'choose a camera view from the list' using errcode = 'BR003';
  end if;
  if coalesce(p_timing_basis, '') not in ('real_time', 'slow_motion', 'unknown')
     or (p_timing_basis = 'slow_motion') <> (p_slowdown_factor is not null)
     or (p_slowdown_factor is not null and p_slowdown_factor not between 2 and 32) then
    raise exception 'say whether the clip plays at real speed, or how many times slower (2 to 32)' using errcode = 'BR003';
  end if;
  if (p_timing_basis is distinct from v_media.timing_basis or p_slowdown_factor is distinct from v_media.slowdown_factor)
     and exists (select 1 from public.assessment_observations o where o.media_id = p_media_id and o.entry_method = 'in_app_review') then
    raise exception 'timing estimates use this clip''s speed; delete them before changing it' using errcode = 'BR004';
  end if;
  if char_length(coalesce(p_label, '')) > 80 then
    raise exception 'the clip name is longer than 80 characters' using errcode = 'BR003';
  end if;
  update public.assessment_media m
     set label = nullif(btrim(p_label), ''), camera_view = p_camera_view, timing_basis = p_timing_basis,
         slowdown_factor = p_slowdown_factor
   where m.id = p_media_id;
end;
$$;

-- Marks a clip removed and returns its storage path so the app can delete the
-- file (the storage policy allows deleting removed clips only).
create function public.remove_assessment_media(p_media_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.assessment_media%rowtype;
begin
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status <> 'removed';
  perform private.assessment_for_work(v_media.assessment_id, false);
  update public.assessment_media m set status = 'removed', removed_at = now() where m.id = p_media_id;
  update public.assessment_repetitions r set media_id = null where r.media_id = p_media_id;
  return v_media.storage_path;
end;
$$;

create function public.add_assessment_annotation(
  p_media_id uuid,
  p_kind text,
  p_event_type text,
  p_time_ms integer,
  p_note text,
  p_drawing jsonb,
  p_repetition_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_media public.assessment_media%rowtype;
  v_row public.assessments%rowtype;
  v_id uuid;
begin
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status = 'uploaded';
  v_row := private.assessment_for_work(v_media.assessment_id, false);
  if p_kind not in ('event', 'note', 'drawing') then
    raise exception 'add an event marker, a note or a drawing' using errcode = 'BR003';
  end if;
  if p_kind = 'event' and not (
       (v_row.discipline = 'hitting' and p_event_type in ('load_start', 'foot_contact', 'swing_start', 'contact', 'finish'))
    or (v_row.discipline = 'pitching' and p_event_type in ('first_move', 'leg_lift_peak', 'foot_contact', 'release', 'finish'))) then
    raise exception 'choose an event for this discipline' using errcode = 'BR003';
  end if;
  if p_time_ms is null or p_time_ms < 0 or p_time_ms > coalesce(v_media.duration_ms, 3600000) then
    raise exception 'the marker time is outside the clip' using errcode = 'BR003';
  end if;
  if p_kind = 'note' and char_length(coalesce(btrim(p_note), '')) not between 1 and 1000 then
    raise exception 'write a note of up to 1,000 characters' using errcode = 'BR003';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'the note is longer than 1,000 characters' using errcode = 'BR003';
  end if;
  if p_kind = 'drawing' and not private.assessment_drawing_ok(p_drawing) then
    raise exception 'that drawing is not valid' using errcode = 'BR003';
  end if;
  if p_repetition_id is not null and not exists (
       select 1 from public.assessment_repetitions r where r.id = p_repetition_id and r.assessment_id = v_row.id) then
    raise exception 'choose a repetition in this assessment' using errcode = 'BR003';
  end if;
  insert into public.assessment_annotations
    (media_id, assessment_id, repetition_id, kind, event_type, time_ms, note, drawing, author_id, author_kind)
  values
    (p_media_id, v_row.id, p_repetition_id, p_kind, case when p_kind = 'event' then p_event_type end, p_time_ms,
     nullif(btrim(p_note), ''), case when p_kind = 'drawing' then p_drawing end, v_uid,
     private.assessment_source_kind(v_row.athlete_id))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.delete_assessment_annotation(p_annotation_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_annotation public.assessment_annotations%rowtype;
begin
  select * into v_annotation from public.assessment_annotations n where n.id = p_annotation_id;
  perform private.assessment_for_work(v_annotation.assessment_id, false);
  if v_annotation.author_id is distinct from v_uid then
    raise exception 'only the person who added it can delete this' using errcode = 'BR002';
  end if;
  if exists (select 1 from public.assessment_observations o
              where p_annotation_id in (o.start_annotation_id, o.end_annotation_id)) then
    raise exception 'a timing estimate uses this marker; delete the estimate first' using errcode = 'BR004';
  end if;
  delete from public.assessment_annotations n where n.id = p_annotation_id;
end;
$$;

-- A video timing estimate from two event markers on the same clip. The media
-- time difference is divided by the clip's slow-motion factor; clips whose
-- speed is unknown cannot produce timing estimates.
create function public.record_interval_from_markers(
  p_repetition_id uuid,
  p_metric_key text,
  p_start_annotation_id uuid,
  p_end_annotation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rep public.assessment_repetitions%rowtype;
  v_row public.assessments%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_start public.assessment_annotations%rowtype;
  v_end public.assessment_annotations%rowtype;
  v_media public.assessment_media%rowtype;
  v_source text;
  v_interval numeric;
  v_problem text;
  v_id uuid;
begin
  select * into v_rep from public.assessment_repetitions r where r.id = p_repetition_id;
  v_row := private.assessment_for_work(v_rep.assessment_id, true);
  v_definition := private.assessment_protocol_metric(v_row, p_metric_key);
  if v_definition.marker_start is null then
    raise exception 'this metric is not measured from video markers' using errcode = 'BR003';
  end if;
  select * into v_start from public.assessment_annotations n where n.id = p_start_annotation_id and n.assessment_id = v_row.id;
  select * into v_end from public.assessment_annotations n where n.id = p_end_annotation_id and n.assessment_id = v_row.id;
  if v_start.id is null or v_end.id is null or v_start.media_id <> v_end.media_id
     or v_start.event_type is distinct from v_definition.marker_start or v_end.event_type is distinct from v_definition.marker_end then
    raise exception 'choose the two required markers on the same clip' using errcode = 'BR003';
  end if;
  select * into v_media from public.assessment_media m where m.id = v_start.media_id and m.status = 'uploaded';
  if not found then
    raise exception 'that clip is no longer available' using errcode = 'BR004';
  end if;
  if v_media.timing_basis = 'unknown' then
    raise exception 'say whether this clip plays at real speed before measuring timing from it' using errcode = 'BR004';
  end if;
  if v_end.time_ms <= v_start.time_ms then
    raise exception 'the second marker must come after the first' using errcode = 'BR003';
  end if;
  v_interval := round((v_end.time_ms - v_start.time_ms)::numeric / coalesce(v_media.slowdown_factor, 1), 1);
  v_problem := private.assessment_value_problem(v_definition, v_interval);
  if v_problem is not null then
    raise exception 'the marked interval is not plausible: %', v_problem using errcode = 'BR003';
  end if;
  v_source := private.assessment_source_kind(v_row.athlete_id);

  select o.id into v_id from public.assessment_observations o
   where o.repetition_id = p_repetition_id and o.metric_key = p_metric_key for update;
  if v_id is null then
    insert into public.assessment_observations (
      assessment_id, repetition_id, metric_key, metric_version, value, unit, evidence_category, entry_method,
      source_kind, quality_state, media_id, start_annotation_id, end_annotation_id, entered_by, reviewed_by, reviewed_at)
    values (
      v_row.id, p_repetition_id, v_definition.key, v_definition.version, v_interval, v_definition.unit, 'video_estimate',
      'in_app_review', v_source, case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end,
      v_media.id, v_start.id, v_end.id, v_uid,
      case when v_source = 'development_coach' then v_uid end, case when v_source = 'development_coach' then now() end)
    returning id into v_id;
  else
    update public.assessment_observations o
       set value = v_interval, metric_version = v_definition.version, unit = v_definition.unit,
           evidence_category = 'video_estimate', entry_method = 'in_app_review', source_kind = v_source,
           quality_state = case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end,
           quality_reason = null, device_kind = null, device_label = null, source_value = null, source_unit = null,
           media_id = v_media.id, start_annotation_id = v_start.id, end_annotation_id = v_end.id,
           import_batch_id = null, source_row = null, dedupe_key = null, entered_by = v_uid,
           reviewed_by = case when v_source = 'development_coach' then v_uid end,
           reviewed_at = case when v_source = 'development_coach' then now() end
     where o.id = v_id;
  end if;
  update public.assessment_repetitions r set media_id = coalesce(r.media_id, v_media.id) where r.id = p_repetition_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Generic CSV import (see src/lib/assessment/csv.ts for the file format).
-- Every row is validated again here. Accepted rows are committed together;
-- duplicates of earlier imports are skipped; rejected rows are reported with
-- their row numbers and reasons (never their values).
-- -----------------------------------------------------------------------------
create function public.import_assessment_measurements(
  p_assessment_id uuid,
  p_file_name text,
  p_file_sha256 text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_batch uuid;
  v_source text;
  v_item jsonb;
  v_index bigint;
  v_line integer;
  v_rep_number integer;
  v_pitch text;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_acquisition text;
  v_device_kind text;
  v_device_label text;
  v_recorded timestamptz;
  v_definition public.assessment_metric_definitions%rowtype;
  v_canonical numeric;
  v_rep public.assessment_repetitions%rowtype;
  v_key text;
  v_problem text;
  v_accepted integer := 0;
  v_duplicates integer := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_total integer;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  v_source := private.assessment_source_kind(v_row.athlete_id);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'there are no rows to import' using errcode = 'BR003';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total not between 1 and 2000 then
    raise exception 'import between 1 and 2,000 rows at a time' using errcode = 'BR003';
  end if;
  if char_length(coalesce(btrim(p_file_name), '')) not between 1 and 160 or coalesce(p_file_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'the file name or checksum is missing' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_import_batches b
       where b.created_by = v_uid and b.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many imports in the last hour; please wait and try again' using errcode = 'BR005';
  end if;

  insert into public.assessment_import_batches (assessment_id, file_name, file_sha256, row_count, created_by)
  values (p_assessment_id, btrim(p_file_name), p_file_sha256, v_total, v_uid)
  returning id into v_batch;

  for v_item, v_index in select e, o from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    v_problem := null;
    v_line := v_index::integer + 1;
    begin
      if jsonb_typeof(v_item) <> 'object' then
        v_problem := 'this row could not be read';
      else
        if jsonb_typeof(v_item -> 'row') = 'number' then v_line := (v_item ->> 'row')::integer; end if;
        v_rep_number := case when jsonb_typeof(v_item -> 'rep') = 'number' and (v_item ->> 'rep') ~ '^[0-9]{1,3}$'
                             then (v_item ->> 'rep')::integer end;
        v_pitch := nullif(v_item ->> 'pitch_type', '');
        v_metric := v_item ->> 'metric_key';
        v_value := case when jsonb_typeof(v_item -> 'value') = 'number' then (v_item ->> 'value')::numeric end;
        v_unit := private.assessment_normalize_unit(v_item ->> 'unit');
        v_acquisition := v_item ->> 'acquisition';
        v_device_kind := nullif(v_item ->> 'device_kind', '');
        v_device_label := nullif(btrim(v_item ->> 'device_label'), '');
        v_recorded := null;
        if nullif(v_item ->> 'recorded_at', '') is not null then
          if (v_item ->> 'recorded_at') !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$' then
            raise exception 'recorded_at must be an ISO 8601 date and time' using errcode = 'BR003';
          end if;
          v_recorded := (v_item ->> 'recorded_at')::timestamptz;
        end if;

        select d.* into v_definition
          from public.assessment_protocol_metrics pm
          join public.assessment_metric_definitions d on d.key = pm.metric_key and d.version = pm.metric_version
         where pm.protocol_key = v_row.protocol_key and pm.protocol_version = v_row.protocol_version and pm.metric_key = v_metric;
        if not found then
          v_problem := 'that metric is not part of this assessment''s protocol';
        elsif v_definition.granularity <> 'repetition' or v_definition.derived_from is not null then
          v_problem := 'ratings and derived values cannot be imported';
        elsif v_rep_number is null or v_rep_number not between 1 and 500 then
          v_problem := 'the repetition must be a whole number from 1 to 500';
        elsif v_acquisition is null or not (v_acquisition = any (v_definition.evidence)) then
          v_problem := 'that kind of evidence is not accepted for this metric';
        elsif v_pitch is not null and (v_row.discipline <> 'pitching' or v_pitch not in (
                'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other')) then
          v_problem := 'not a recognized pitch type for this assessment';
        elsif v_definition.per_pitch_type and v_pitch is null then
          v_problem := 'this metric needs a pitch type';
        elsif v_definition.requires_device and (v_device_kind is null or v_device_kind not in (
                'radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other')
              or v_device_label is null or char_length(v_device_label) > 80) then
          v_problem := 'measured values need the kind of device and its name';
        else
          if v_definition.value_kind = 'boolean' then
            v_canonical := case when coalesce(v_unit, 'yes_no') = 'yes_no' and v_value in (0, 1) then v_value end;
            if v_canonical is null then v_problem := 'a charted outcome is yes or no'; end if;
          else
            v_canonical := private.assessment_convert_unit(v_value, v_unit, v_definition.unit);
            if v_value is null then
              v_problem := 'the value must be a number';
            elsif v_canonical is null then
              v_problem := 'that unit is not accepted for this metric';
            end if;
          end if;
          if v_problem is null then
            v_problem := private.assessment_value_problem(v_definition, v_canonical);
          end if;
        end if;
      end if;
    exception
      when sqlstate 'BR003' then
        v_problem := sqlerrm;
      when others then
        v_problem := 'this row could not be read';
    end;

    if v_problem is null then
      select * into v_rep from public.assessment_repetitions r where r.assessment_id = p_assessment_id and r.seq = v_rep_number;
      if not found then
        insert into public.assessment_repetitions (assessment_id, seq, pitch_type)
        values (p_assessment_id, v_rep_number, v_pitch)
        returning * into v_rep;
      elsif v_pitch is not null and v_rep.pitch_type is not null and v_rep.pitch_type <> v_pitch then
        v_problem := format('repetition %s already has a different pitch type', v_rep_number);
      elsif v_pitch is not null and v_rep.pitch_type is null then
        update public.assessment_repetitions r set pitch_type = v_pitch where r.id = v_rep.id;
      end if;
    end if;

    if v_problem is null then
      v_key := md5(concat_ws('|', v_definition.key, v_rep_number, coalesce(v_pitch, ''), v_canonical::text,
                             coalesce(private.assessment_normalize_device_label(v_device_label), ''),
                             coalesce(to_char(v_recorded at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')));
      if exists (select 1 from public.assessment_observations o where o.assessment_id = p_assessment_id and o.dedupe_key = v_key) then
        v_duplicates := v_duplicates + 1;
        continue;
      end if;
      if exists (select 1 from public.assessment_observations o where o.repetition_id = v_rep.id and o.metric_key = v_definition.key) then
        v_problem := format('repetition %s already has a value for this metric', v_rep_number);
      end if;
    end if;

    if v_problem is not null then
      if jsonb_array_length(v_rejected) < 200 then
        v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('row', v_line, 'reason', v_problem));
      end if;
      continue;
    end if;

    insert into public.assessment_observations (
      assessment_id, repetition_id, metric_key, metric_version, value, unit, source_value, source_unit,
      evidence_category, entry_method, source_kind, quality_state, device_kind, device_label,
      import_batch_id, source_row, dedupe_key, source_timestamp, entered_by)
    values (
      p_assessment_id, v_rep.id, v_definition.key, v_definition.version, v_canonical, v_definition.unit, v_value,
      coalesce(v_unit, 'yes_no'), v_acquisition, 'file_import', v_source, 'not_reviewed',
      case when v_definition.requires_device then v_device_kind end,
      case when v_definition.requires_device then v_device_label end,
      v_batch, v_line, v_key, v_recorded, v_uid);
    v_accepted := v_accepted + 1;
  end loop;

  update public.assessment_import_batches b
     set accepted_count = v_accepted, duplicate_count = v_duplicates,
         rejected_count = v_total - v_accepted - v_duplicates, rejected_rows = v_rejected
   where b.id = v_batch;
  perform private.log_audit('assessment.measurements_imported', 'assessment_import_batch', v_batch::text, v_row.athlete_id,
                            jsonb_build_object('accepted', v_accepted, 'duplicates', v_duplicates,
                                               'rejected', v_total - v_accepted - v_duplicates), v_uid);
  return jsonb_build_object('batch_id', v_batch, 'accepted', v_accepted, 'duplicates', v_duplicates,
                            'rejected_count', v_total - v_accepted - v_duplicates, 'rejected', v_rejected);
end;
$$;

-- -----------------------------------------------------------------------------
-- Private video storage (Supabase Storage bucket "assessment-media").
-- Uploads go straight from the browser to storage with a signed upload link;
-- these policies decide who may create, read and delete each file, using the
-- assessment_media row that begin_assessment_upload() created.
-- -----------------------------------------------------------------------------
create function private.assessment_object_access(p_name text, p_action text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessment_media m
     where m.storage_path = p_name
       and private.can_work_on_assessments((select auth.uid()), m.athlete_id)
       and case p_action
             when 'insert' then m.status = 'pending' and m.created_by = (select auth.uid())
                                and m.created_at > now() - interval '2 hours' and private.assessment_video_enabled()
             when 'select' then m.status in ('pending', 'uploaded')
             when 'delete' then m.status in ('pending', 'removed')
             else false end)
$$;
revoke all on function private.assessment_object_access(text, text) from public;
grant execute on function private.assessment_object_access(text, text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping the assessment-media bucket and its policies';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('assessment-media', 'assessment-media', false)
  on conflict (id) do nothing;
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $sql$update storage.buckets set file_size_limit = 209715200 where id = 'assessment-media'$sql$;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $sql$update storage.buckets set allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm']
                  where id = 'assessment-media'$sql$;
  end if;
  execute $sql$create policy assessment_media_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'assessment-media' and private.assessment_object_access(name, 'insert'))$sql$;
  execute $sql$create policy assessment_media_select on storage.objects for select to authenticated
    using (bucket_id = 'assessment-media' and private.assessment_object_access(name, 'select'))$sql$;
  execute $sql$create policy assessment_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'assessment-media' and private.assessment_object_access(name, 'delete'))$sql$;
end
$storage$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.assessment_athletes() from public, anon, authenticated, service_role;
revoke all on function public.create_assessment(uuid, text, integer, date, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_assessment_context(uuid, integer, date, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.set_assessment_status(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_assessment(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_assessment_repetitions(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.update_assessment_repetition(uuid, text, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.set_assessment_repetition_status(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_assessment_repetition(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_assessment_observation(uuid, text, uuid, numeric, boolean, text, text, text, text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.set_observation_quality(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_assessment_observation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_assessment_target(uuid, text, text, text, numeric, numeric, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.retire_assessment_target(uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_assessment_upload(uuid, text, text, bigint, text, text, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_assessment_upload(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.update_assessment_media(uuid, text, text, text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.remove_assessment_media(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_assessment_annotation(uuid, text, text, integer, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_assessment_annotation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_interval_from_markers(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.import_assessment_measurements(uuid, text, text, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.assessment_athletes() to authenticated;
grant execute on function public.create_assessment(uuid, text, integer, date, jsonb) to authenticated;
grant execute on function public.update_assessment_context(uuid, integer, date, jsonb) to authenticated;
grant execute on function public.set_assessment_status(uuid, text) to authenticated;
grant execute on function public.delete_assessment(uuid) to authenticated;
grant execute on function public.add_assessment_repetitions(uuid, integer, text) to authenticated;
grant execute on function public.update_assessment_repetition(uuid, text, uuid, integer, text) to authenticated;
grant execute on function public.set_assessment_repetition_status(uuid, text, text) to authenticated;
grant execute on function public.delete_assessment_repetition(uuid) to authenticated;
grant execute on function public.record_assessment_observation(uuid, text, uuid, numeric, boolean, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.set_observation_quality(uuid, text, text) to authenticated;
grant execute on function public.delete_assessment_observation(uuid) to authenticated;
grant execute on function public.set_assessment_target(uuid, text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.retire_assessment_target(uuid) to authenticated;
grant execute on function public.begin_assessment_upload(uuid, text, text, bigint, text, text, numeric, text) to authenticated;
grant execute on function public.complete_assessment_upload(uuid, integer) to authenticated;
grant execute on function public.update_assessment_media(uuid, text, text, text, numeric) to authenticated;
grant execute on function public.remove_assessment_media(uuid) to authenticated;
grant execute on function public.add_assessment_annotation(uuid, text, text, integer, text, jsonb, uuid) to authenticated;
grant execute on function public.delete_assessment_annotation(uuid) to authenticated;
grant execute on function public.record_interval_from_markers(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.import_assessment_measurements(uuid, text, text, jsonb) to authenticated;
