-- Base Recruits Assessment: 9-Zone Hitting Development.
--
-- Content (imported from the 9-Zone Hitting workbook, versioned, read-only):
--   zone_content_releases, zone_definitions, zone_drills, zone_stages,
--   zone_pairings, zone_constraints
-- Records (private to the people who can work on the athlete's assessments):
--   zone_sessions        a training session and its post-session evaluation
--   zone_rounds          rounds within a session (stage, delivery, constraint, cue)
--   zone_assignments     versioned swing/take assignments; events keep the one
--                        they were judged against, so later edits never rewrite history
--   zone_events          pitches, tee swings and dry rehearsals with observations
--   zone_progress        stage history per athlete and zone (advance / hold / simplify)
--
-- Results are calculated in the app from these observations (zone-calc-v1);
-- nothing here changes an assessment score. Writes go only through the checked
-- functions below and stop while Assessment is switched off.

-- =============================================================================
-- Content
-- =============================================================================
create table public.zone_content_releases (
  version text primary key,
  source_file text not null,
  source_sha256 text not null constraint zone_content_releases_sha check (source_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now()
);

create table public.zone_definitions (
  zone smallint primary key constraint zone_definitions_zone check (zone between 1 and 9),
  content_version text not null references public.zone_content_releases (version),
  location text not null,
  placement text not null,
  depth_cue text not null,
  target_lane text not null,
  cue text not null,
  desired_result text not null,
  common_misses text not null,
  source_row smallint not null
);

create table public.zone_drills (
  key text not null,
  version smallint not null,
  source_id text not null,
  content_version text not null references public.zone_content_releases (version),
  zone smallint not null references public.zone_definitions (zone),
  name text not null,
  level text not null,
  setup text not null,
  suggested_volume text not null,
  execution text not null,
  depth_cue text not null,
  target_lane text not null,
  cue text not null,
  track text not null,
  watch_for text not null,
  source_sheet text not null,
  source_row smallint not null,
  active boolean not null default true,
  primary key (key, version),
  unique (source_id, version)
);

create table public.zone_stages (
  stage smallint primary key constraint zone_stages_stage check (stage between 1 and 9),
  content_version text not null references public.zone_content_releases (version),
  name text not null,
  source text not null,
  new_demand text not null,
  suggested_volume text not null,
  instructions text not null,
  measures text not null,
  next_step text not null,
  source_row smallint not null
);

create table public.zone_pairings (
  key text primary key,
  content_version text not null references public.zone_content_releases (version),
  zones smallint[] not null constraint zone_pairings_zones check (zones <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  name text not null,
  purpose text not null,
  source_row smallint not null
);

create table public.zone_constraints (
  key text primary key,
  content_version text not null references public.zone_content_releases (version),
  category text not null,
  name text not null,
  delivery_setup text not null,
  hitter_assignment text not null,
  measure text not null,
  volume_note text not null,
  source_row smallint not null
);

comment on table public.zone_drills is
  'Drills imported from the 9-Zone Hitting workbook (source id, sheet and row kept). Read-only; coach choices live on sessions and rounds.';

-- The imported payloads, kept so an import can be checked or re-run.
create table private.zone_content_payloads (
  version text primary key references public.zone_content_releases (version),
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

-- Idempotent: re-running an import adds what is missing and changes nothing
-- that exists (no duplicates, no overwrites).
create function private.import_zone_content(p_content jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := p_content ->> 'version';
  v_counts jsonb;
  v_n integer;
  v_result jsonb := '{}'::jsonb;
begin
  if v_version is null or v_version !~ '^zone-v[0-9]+$' then
    raise exception 'zone content needs a version like zone-v1' using errcode = 'BR003';
  end if;
  insert into public.zone_content_releases (version, source_file, source_sha256)
  values (v_version, p_content -> 'source' ->> 'file', p_content -> 'source' ->> 'sha256')
  on conflict (version) do nothing;

  insert into public.zone_definitions (zone, content_version, location, placement, depth_cue, target_lane, cue,
                                       desired_result, common_misses, source_row)
  select (z ->> 'zone')::smallint, v_version, z ->> 'location', z ->> 'placement', z ->> 'depthCue', z ->> 'targetLane',
         z ->> 'cue', z ->> 'desiredResult', z ->> 'commonMisses', (z ->> 'sourceRow')::smallint
    from jsonb_array_elements(p_content -> 'zones') z
  on conflict (zone) do nothing;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('zones', v_n);

  insert into public.zone_drills (key, version, source_id, content_version, zone, name, level, setup, suggested_volume,
                                  execution, depth_cue, target_lane, cue, track, watch_for, source_sheet, source_row)
  select d ->> 'key', (d ->> 'version')::smallint, d ->> 'sourceId', v_version, (d ->> 'zone')::smallint, d ->> 'name',
         d ->> 'level', d ->> 'setup', d ->> 'suggestedVolume', d ->> 'execution', d ->> 'depthCue', d ->> 'targetLane',
         d ->> 'cue', d ->> 'track', d ->> 'watchFor', d ->> 'sourceSheet', (d ->> 'sourceRow')::smallint
    from jsonb_array_elements(p_content -> 'drills') d
  on conflict (key, version) do nothing;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('drills', v_n);

  insert into public.zone_stages (stage, content_version, name, source, new_demand, suggested_volume, instructions,
                                  measures, next_step, source_row)
  select (s ->> 'stage')::smallint, v_version, s ->> 'name', s ->> 'source', s ->> 'newDemand', s ->> 'suggestedVolume',
         s ->> 'instructions', s ->> 'measures', s ->> 'nextStep', (s ->> 'sourceRow')::smallint
    from jsonb_array_elements(p_content -> 'stages') s
  on conflict (stage) do nothing;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('stages', v_n);

  insert into public.zone_pairings (key, content_version, zones, name, purpose, source_row)
  select p ->> 'key', v_version, array(select (e #>> '{}')::smallint from jsonb_array_elements(p -> 'zones') e),
         p ->> 'name', p ->> 'purpose', (p ->> 'sourceRow')::smallint
    from jsonb_array_elements(p_content -> 'pairings') p
  on conflict (key) do nothing;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('pairings', v_n);

  insert into public.zone_constraints (key, content_version, category, name, delivery_setup, hitter_assignment, measure,
                                       volume_note, source_row)
  select c ->> 'key', v_version, c ->> 'category', c ->> 'name', c ->> 'deliverySetup', c ->> 'hitterAssignment',
         c ->> 'measure', c ->> 'volumeNote', (c ->> 'sourceRow')::smallint
    from jsonb_array_elements(p_content -> 'constraints') c
  on conflict (key) do nothing;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('constraints', v_n);

  insert into private.zone_content_payloads (version, payload) values (v_version, p_content)
  on conflict (version) do nothing;
  return v_result;
end;
$$;
revoke all on function private.import_zone_content(jsonb) from public;

-- =============================================================================
-- Records
-- =============================================================================
create table public.zone_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  session_date date not null,
  batting_side text not null constraint zone_sessions_side check (batting_side in ('right', 'left')),
  assessment_id uuid references public.assessments (id) on delete set null,
  plan_id uuid references public.assessment_training_plans (id) on delete set null,
  focus_zones smallint[] not null constraint zone_sessions_focus check (
    cardinality(focus_zones) between 1 and 2 and focus_zones <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  drill_key text,
  drill_version smallint,
  pairing_key text references public.zone_pairings (key),
  stage smallint not null references public.zone_stages (stage),
  delivery_source text not null constraint zone_sessions_delivery check (delivery_source in ('tee', 'toss', 'coach', 'machine', 'live')),
  primary_cue text constraint zone_sessions_cue check (char_length(primary_cue) <= 120),
  target_lane text constraint zone_sessions_lane check (char_length(target_lane) <= 80),
  constraint_key text references public.zone_constraints (key),
  planned_reps smallint constraint zone_sessions_reps check (planned_reps between 1 and 200),
  contact_quality_definition text constraint zone_sessions_quality check (char_length(contact_quality_definition) <= 200),
  equipment text constraint zone_sessions_equipment check (char_length(equipment) <= 200),
  capture_conditions text constraint zone_sessions_conditions check (char_length(capture_conditions) <= 300),
  notes text constraint zone_sessions_notes check (char_length(notes) <= 1000),
  status text not null default 'active' constraint zone_sessions_status check (status in ('active', 'reviewed')),
  hitter_self_assessment text constraint zone_sessions_self check (char_length(hitter_self_assessment) <= 1000),
  coach_assessment text constraint zone_sessions_coach check (char_length(coach_assessment) <= 1000),
  best_process_win text constraint zone_sessions_win check (char_length(best_process_win) <= 300),
  repeated_breakdown text constraint zone_sessions_breakdown check (char_length(repeated_breakdown) <= 500),
  decision text constraint zone_sessions_decision check (decision in ('advance', 'hold', 'simplify')),
  next_zones smallint[] not null default '{}' constraint zone_sessions_next_zones check (
    cardinality(next_zones) <= 2 and next_zones <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  next_cue text constraint zone_sessions_next_cue check (char_length(next_cue) <= 120),
  next_constraint_key text references public.zone_constraints (key),
  next_volume text constraint zone_sessions_next_volume check (char_length(next_volume) <= 120),
  success_criterion text constraint zone_sessions_criterion check (char_length(success_criterion) <= 300),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  next_plan_approved_by uuid references auth.users (id) on delete set null,
  next_plan_approved_at timestamptz,
  source_kind text not null constraint zone_sessions_source check (source_kind in ('self', 'development_coach')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (drill_key, drill_version) references public.zone_drills (key, version)
);
create index zone_sessions_athlete_idx on public.zone_sessions (athlete_id, session_date desc, created_at desc);

create table public.zone_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.zone_sessions (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  seq smallint not null constraint zone_rounds_seq check (seq between 1 and 50),
  batting_side text not null constraint zone_rounds_side check (batting_side in ('right', 'left')),
  stage smallint not null references public.zone_stages (stage),
  delivery_source text not null constraint zone_rounds_delivery check (delivery_source in ('tee', 'toss', 'coach', 'machine', 'live')),
  drill_key text,
  drill_version smallint,
  constraint_key text references public.zone_constraints (key),
  primary_cue text constraint zone_rounds_cue check (char_length(primary_cue) <= 120),
  target_lane text constraint zone_rounds_lane check (char_length(target_lane) <= 80),
  planned_reps smallint constraint zone_rounds_reps check (planned_reps between 1 and 200),
  intended_zones smallint[] not null default '{}'
    constraint zone_rounds_intended check (intended_zones <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  hitter_feedback text constraint zone_rounds_feedback check (char_length(hitter_feedback) <= 500),
  coach_notes text constraint zone_rounds_notes check (char_length(coach_notes) <= 1000),
  response text constraint zone_rounds_response check (response in ('advance', 'hold', 'simplify', 'stop')),
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, seq),
  foreign key (drill_key, drill_version) references public.zone_drills (key, version)
);

create table public.zone_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.zone_rounds (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  version smallint not null constraint zone_assignments_version check (version between 1 and 100),
  kind text not null constraint zone_assignments_kind check (kind in ('free', 'selective', 'mandatory_swing', 'forced_take')),
  swing_zones smallint[] not null default '{}'
    constraint zone_assignments_zones check (swing_zones <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  recognition_required boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (round_id, version),
  constraint zone_assignments_selective check ((kind = 'selective') = (cardinality(swing_zones) > 0))
);
comment on table public.zone_assignments is
  'Versioned swing/take assignments. Each event keeps the version it was judged against; changing the assignment adds a version.';

create table public.zone_events (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.zone_rounds (id) on delete cascade,
  session_id uuid not null references public.zone_sessions (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  seq integer not null constraint zone_events_seq check (seq between 1 and 1000),
  kind text not null constraint zone_events_kind check (kind in ('pitch', 'tee_swing', 'dry_rep')),
  assignment_id uuid not null references public.zone_assignments (id) on delete cascade,
  batting_side text not null constraint zone_events_side check (batting_side in ('right', 'left')),
  intended_zone smallint constraint zone_events_intended check (intended_zone between 1 and 9),
  location text not null constraint zone_events_location check (location in (
    'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'out_high', 'out_low', 'out_in', 'out_away', 'unknown')),
  pitch_class text constraint zone_events_class check (pitch_class in ('strike', 'ball')),
  pitch_type text constraint zone_events_pitch_type check (pitch_type in (
    'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other')),
  response text constraint zone_events_response check (response in ('swing', 'take')),
  contact text constraint zone_events_contact check (contact in ('miss', 'foul', 'fair', 'unknown')),
  hard_targeted boolean,
  depth_correct boolean,
  lane_correct boolean,
  posture_error boolean,
  recognition_call text constraint zone_events_recognition check (recognition_call in ('strike', 'ball')),
  off_plan boolean not null default false,
  off_plan_reason text constraint zone_events_off_plan_reason check (char_length(off_plan_reason) <= 200),
  forced_take boolean not null default false,
  voided boolean not null default false,
  void_reason text constraint zone_events_void_reason check (char_length(void_reason) <= 200),
  media_id uuid references public.assessment_media (id) on delete set null,
  clip_time_ms integer constraint zone_events_clip_time check (clip_time_ms between 0 and 3600000),
  note text constraint zone_events_note check (char_length(note) <= 300),
  evidence_method text not null default 'live' constraint zone_events_evidence check (evidence_method in ('live', 'video')),
  source_kind text not null constraint zone_events_source check (source_kind in ('self', 'development_coach')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (round_id, seq),
  -- Ball/strike is derived from the location; an explicit class is kept only when the location is unknown.
  constraint zone_events_class_only_unknown check (pitch_class is null or location = 'unknown'),
  constraint zone_events_pitch_only check (kind = 'pitch' or (
    pitch_class is null and recognition_call is null and not forced_take and intended_zone is null
    and not off_plan and pitch_type is null)),
  constraint zone_events_tee check (kind <> 'tee_swing' or (response = 'swing' and (location like 'z%' or location = 'unknown'))),
  constraint zone_events_dry check (kind <> 'dry_rep' or (
    response is null and contact is null and hard_targeted is null and depth_correct is null and lane_correct is null
    and (location like 'z%' or location = 'unknown'))),
  constraint zone_events_contact_on_swing check (contact is null or response = 'swing'),
  constraint zone_events_lane_on_fair check (lane_correct is null or contact = 'fair'),
  constraint zone_events_quality_on_swing check ((hard_targeted is null and depth_correct is null) or response = 'swing'),
  constraint zone_events_posture check (posture_error is null or response = 'swing' or kind = 'dry_rep'),
  constraint zone_events_forced_take check (not forced_take or response = 'take'),
  constraint zone_events_off_plan check (off_plan or off_plan_reason is null),
  constraint zone_events_void check ((not voided and void_reason is null) or (voided and char_length(btrim(void_reason)) >= 3))
);
create index zone_events_session_idx on public.zone_events (session_id, round_id, seq);
create index zone_events_athlete_idx on public.zone_events (athlete_id, created_at desc);

create table public.zone_progress (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  zone smallint not null constraint zone_progress_zone check (zone between 1 and 9),
  stage smallint not null references public.zone_stages (stage),
  decision text not null constraint zone_progress_decision check (decision in ('set', 'advance', 'hold', 'simplify')),
  reason text not null constraint zone_progress_reason check (char_length(btrim(reason)) between 3 and 500),
  evidence text constraint zone_progress_evidence check (char_length(evidence) <= 500),
  session_id uuid references public.zone_sessions (id) on delete set null,
  source_kind text not null constraint zone_progress_source check (source_kind in ('self', 'development_coach')),
  decided_by uuid references auth.users (id) on delete set null,
  -- clock_timestamp(), not now(): two decisions in one transaction still order correctly.
  created_at timestamptz not null default clock_timestamp()
);
create index zone_progress_athlete_idx on public.zone_progress (athlete_id, zone, created_at desc);
comment on table public.zone_progress is
  'Stage history by athlete and zone. The current stage is the newest row; every change keeps its reason and evidence.';

-- =============================================================================
-- Row-level security: content readable when signed in; records only for people
-- who can work on the athlete's assessments.
-- =============================================================================
alter table public.zone_content_releases enable row level security;
alter table public.zone_definitions enable row level security;
alter table public.zone_drills enable row level security;
alter table public.zone_stages enable row level security;
alter table public.zone_pairings enable row level security;
alter table public.zone_constraints enable row level security;
alter table public.zone_sessions enable row level security;
alter table public.zone_rounds enable row level security;
alter table public.zone_assignments enable row level security;
alter table public.zone_events enable row level security;
alter table public.zone_progress enable row level security;

revoke all on table public.zone_content_releases, public.zone_definitions, public.zone_drills, public.zone_stages,
  public.zone_pairings, public.zone_constraints, public.zone_sessions, public.zone_rounds, public.zone_assignments,
  public.zone_events, public.zone_progress from anon, authenticated, service_role;
grant select on table public.zone_content_releases, public.zone_definitions, public.zone_drills, public.zone_stages,
  public.zone_pairings, public.zone_constraints, public.zone_sessions, public.zone_rounds, public.zone_assignments,
  public.zone_events, public.zone_progress to authenticated;

create policy zone_content_releases_read on public.zone_content_releases for select to authenticated using (true);
create policy zone_definitions_read on public.zone_definitions for select to authenticated using (true);
create policy zone_drills_read on public.zone_drills for select to authenticated using (true);
create policy zone_stages_read on public.zone_stages for select to authenticated using (true);
create policy zone_pairings_read on public.zone_pairings for select to authenticated using (true);
create policy zone_constraints_read on public.zone_constraints for select to authenticated using (true);
create policy zone_sessions_read on public.zone_sessions for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy zone_rounds_read on public.zone_rounds for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy zone_assignments_read on public.zone_assignments for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy zone_events_read on public.zone_events for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy zone_progress_read on public.zone_progress for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));

-- =============================================================================
-- Helpers
-- =============================================================================
-- Text from a payload: trimmed, empty → null, refused when longer than p_max.
create function private.zone_text(p jsonb, p_key text, p_max integer, p_label text) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p ->> p_key), '');
begin
  if p ? p_key and jsonb_typeof(p -> p_key) not in ('string', 'null') then
    raise exception '% must be text', p_label using errcode = 'BR003';
  end if;
  if char_length(v) > p_max then
    raise exception '% is longer than % characters', p_label, p_max using errcode = 'BR003';
  end if;
  return v;
end;
$$;

-- A list of distinct zones 1–9 from a payload.
create function private.zone_list(p jsonb, p_key text, p_max integer, p_label text) returns smallint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v smallint[];
begin
  if not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(p -> p_key) <> 'array' or exists (
       select 1 from jsonb_array_elements(p -> p_key) e
        where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[1-9]$') then
    raise exception 'choose % from zones 1 to 9', p_label using errcode = 'BR003';
  end if;
  v := array(select distinct (e #>> '{}')::smallint from jsonb_array_elements(p -> p_key) e order by 1);
  if cardinality(v) > p_max then
    raise exception 'choose at most % zones for %', p_max, p_label using errcode = 'BR003';
  end if;
  return v;
end;
$$;

-- Optional whole number in a range.
create function private.zone_int(p jsonb, p_key text, p_min integer, p_max integer, p_label text) returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p -> p_key) <> 'number' or (p ->> p_key) !~ '^[0-9]{1,9}$'
     or (p ->> p_key)::integer not between p_min and p_max then
    raise exception '% must be a whole number from % to %', p_label, p_min, p_max using errcode = 'BR003';
  end if;
  return (p ->> p_key)::integer;
end;
$$;

-- Optional id.
create function private.zone_uuid(p jsonb, p_key text, p_label text) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p ->> p_key), '');
begin
  if v is null then
    return null;
  end if;
  if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'choose % from the list', p_label using errcode = 'BR003';
  end if;
  return v::uuid;
end;
$$;

-- Optional true/false.
create function private.zone_bool(p jsonb, p_key text) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p -> p_key) <> 'boolean' then
    raise exception '% must be true or false', p_key using errcode = 'BR003';
  end if;
  return (p ->> p_key)::boolean;
end;
$$;

-- A value from a fixed list (or null).
create function private.zone_choice(p jsonb, p_key text, p_allowed text[], p_label text) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p ->> p_key), '');
begin
  if v is not null and not (v = any (p_allowed)) then
    raise exception 'choose % from the list', p_label using errcode = 'BR003';
  end if;
  return v;
end;
$$;

revoke all on function private.zone_text(jsonb, text, integer, text) from public;
revoke all on function private.zone_list(jsonb, text, integer, text) from public;
revoke all on function private.zone_int(jsonb, text, integer, integer, text) from public;
revoke all on function private.zone_uuid(jsonb, text, text) from public;
revoke all on function private.zone_bool(jsonb, text) from public;
revoke all on function private.zone_choice(jsonb, text, text[], text) from public;

-- The session, locked, after checking the switch and who is asking.
create function private.zone_session_for_work(p_session_id uuid) returns public.zone_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.zone_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select * into v_row from public.zone_sessions s where s.id = p_session_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_row.athlete_id) then
    raise exception 'session not found' using errcode = 'BR003';
  end if;
  return v_row;
end;
$$;

create function private.zone_round_for_work(p_round_id uuid) returns public.zone_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.zone_rounds%rowtype;
begin
  select * into v_round from public.zone_rounds r where r.id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = 'BR003';
  end if;
  perform private.zone_session_for_work(v_round.session_id);
  select * into v_round from public.zone_rounds r where r.id = p_round_id for update;
  return v_round;
end;
$$;

revoke all on function private.zone_session_for_work(uuid) from public;
revoke all on function private.zone_round_for_work(uuid) from public;

-- Drill key → newest active version, refused when unknown.
create function private.zone_drill_version(p_key text) returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v smallint;
begin
  if p_key is null then
    return null;
  end if;
  select max(d.version) into v from public.zone_drills d where d.key = p_key and d.active;
  if v is null then
    raise exception 'choose a drill from the 9-Zone library' using errcode = 'BR003';
  end if;
  return v;
end;
$$;
revoke all on function private.zone_drill_version(text) from public;

-- Round settings shared by the first round of a session and later rounds.
create type private.zone_round_values as (
  batting_side text,
  stage smallint,
  delivery_source text,
  drill_key text,
  drill_version smallint,
  constraint_key text,
  primary_cue text,
  target_lane text,
  planned_reps smallint,
  intended_zones smallint[]
);

create function private.zone_round_from(p jsonb) returns private.zone_round_values
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.zone_round_values;
begin
  v.batting_side := private.zone_choice(p, 'batting_side', array['right', 'left'], 'the batting side');
  if v.batting_side is null then
    raise exception 'choose the batting side' using errcode = 'BR003';
  end if;
  v.stage := private.zone_int(p, 'stage', 1, 9, 'The stage');
  if v.stage is null then
    raise exception 'choose a stage from 1 to 9' using errcode = 'BR003';
  end if;
  v.delivery_source := private.zone_choice(p, 'delivery_source', array['tee', 'toss', 'coach', 'machine', 'live'], 'the delivery');
  if v.delivery_source is null then
    raise exception 'choose how balls are delivered' using errcode = 'BR003';
  end if;
  v.drill_key := private.zone_text(p, 'drill_key', 20, 'The drill');
  v.drill_version := private.zone_drill_version(v.drill_key);
  v.constraint_key := private.zone_text(p, 'constraint_key', 80, 'The constraint');
  if v.constraint_key is not null and not exists (select 1 from public.zone_constraints c where c.key = v.constraint_key) then
    raise exception 'choose a constraint from the list' using errcode = 'BR003';
  end if;
  v.primary_cue := private.zone_text(p, 'primary_cue', 120, 'The cue');
  v.target_lane := private.zone_text(p, 'target_lane', 80, 'The target lane');
  v.planned_reps := private.zone_int(p, 'planned_reps', 1, 200, 'Planned repetitions');
  v.intended_zones := private.zone_list(p, 'intended_zones', 9, 'the planned zones');
  return v;
end;
$$;
revoke all on function private.zone_round_from(jsonb) from public;

-- A new version of a round's assignment.
create function private.zone_add_assignment(p_round public.zone_rounds, p jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := private.zone_choice(p, 'kind', array['free', 'selective', 'mandatory_swing', 'forced_take'], 'the assignment');
  v_zones smallint[] := private.zone_list(p, 'swing_zones', 9, 'the swing zones');
  v_recognition boolean := coalesce(private.zone_bool(p, 'recognition_required'), false);
  v_version smallint;
  v_id uuid;
begin
  if v_kind is null then
    raise exception 'choose the round''s swing/take assignment' using errcode = 'BR003';
  end if;
  if v_kind = 'selective' and cardinality(v_zones) = 0 then
    raise exception 'a selective assignment needs the zones the hitter may swing at' using errcode = 'BR003';
  end if;
  if v_kind <> 'selective' then
    v_zones := '{}';
  end if;
  select coalesce(max(a.version), 0) + 1 into v_version from public.zone_assignments a where a.round_id = p_round.id;
  insert into public.zone_assignments (round_id, athlete_id, version, kind, swing_zones, recognition_required, created_by)
  values (p_round.id, p_round.athlete_id, v_version, v_kind, v_zones, v_recognition, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.zone_add_assignment(public.zone_rounds, jsonb) from public;

-- =============================================================================
-- Sessions and rounds
-- =============================================================================
create function public.create_zone_session(p_athlete_id uuid, p_session jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_round_values private.zone_round_values;
  v_date date;
  v_focus smallint[];
  v_assessment uuid;
  v_plan uuid;
  v_pairing text;
  v_id uuid;
  v_round public.zone_rounds%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR003';
  end if;
  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception 'session details are missing' using errcode = 'BR003';
  end if;
  begin
    v_date := (p_session ->> 'session_date')::date;
  exception when others then
    v_date := null;
  end;
  if v_date is null or v_date > private.today_utc() + 1 or v_date < private.today_utc() - 730 then
    raise exception 'choose a session date within the last two years and not in the future' using errcode = 'BR003';
  end if;
  v_focus := private.zone_list(p_session, 'focus_zones', 2, 'the focus zones');
  if cardinality(v_focus) = 0 then
    raise exception 'choose one or two focus zones' using errcode = 'BR003';
  end if;
  v_round_values := private.zone_round_from(p_session);
  v_assessment := private.zone_uuid(p_session, 'assessment_id', 'the hitting assessment');
  if v_assessment is not null and not exists (
       select 1 from public.assessments a where a.id = v_assessment and a.athlete_id = p_athlete_id and a.discipline = 'hitting') then
    raise exception 'link one of this athlete''s hitting assessments' using errcode = 'BR003';
  end if;
  v_plan := private.zone_uuid(p_session, 'plan_id', 'the hitting plan');
  if v_plan is not null and not exists (
       select 1 from public.assessment_training_plans t where t.id = v_plan and t.athlete_id = p_athlete_id and t.discipline = 'hitting') then
    raise exception 'link one of this athlete''s hitting plans' using errcode = 'BR003';
  end if;
  v_pairing := private.zone_text(p_session, 'pairing_key', 20, 'The pairing');
  if v_pairing is not null and not exists (select 1 from public.zone_pairings z where z.key = v_pairing) then
    raise exception 'choose a pairing from the list' using errcode = 'BR003';
  end if;

  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;
  if (select count(*) from public.zone_sessions s where s.athlete_id = p_athlete_id and s.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many sessions started in the last hour; please wait and try again' using errcode = 'BR005';
  end if;

  insert into public.zone_sessions (
    athlete_id, session_date, batting_side, assessment_id, plan_id, focus_zones, drill_key, drill_version, pairing_key,
    stage, delivery_source, primary_cue, target_lane, constraint_key, planned_reps, contact_quality_definition, equipment,
    capture_conditions, notes, source_kind, created_by)
  values (
    p_athlete_id, v_date, v_round_values.batting_side, v_assessment, v_plan, v_focus, v_round_values.drill_key,
    v_round_values.drill_version, v_pairing, v_round_values.stage, v_round_values.delivery_source,
    v_round_values.primary_cue, v_round_values.target_lane, v_round_values.constraint_key, v_round_values.planned_reps,
    private.zone_text(p_session, 'contact_quality_definition', 200, 'The contact-quality definition'),
    private.zone_text(p_session, 'equipment', 200, 'Equipment'),
    private.zone_text(p_session, 'capture_conditions', 300, 'Capture conditions'),
    private.zone_text(p_session, 'notes', 1000, 'Notes'),
    private.assessment_source_kind(p_athlete_id), v_uid)
  returning id into v_id;

  insert into public.zone_rounds (session_id, athlete_id, seq, batting_side, stage, delivery_source, drill_key, drill_version,
                                  constraint_key, primary_cue, target_lane, planned_reps, intended_zones, created_by)
  values (v_id, p_athlete_id, 1, v_round_values.batting_side, v_round_values.stage, v_round_values.delivery_source,
          v_round_values.drill_key, v_round_values.drill_version, v_round_values.constraint_key, v_round_values.primary_cue,
          v_round_values.target_lane, v_round_values.planned_reps,
          case when cardinality(v_round_values.intended_zones) > 0 then v_round_values.intended_zones else v_focus end, v_uid)
  returning * into v_round;
  perform private.zone_add_assignment(v_round, coalesce(p_session -> 'assignment', '{}'::jsonb));

  perform private.log_audit('zone.session_created', 'zone_session', v_id::text, p_athlete_id, '{}'::jsonb, v_uid);
  return v_id;
end;
$$;

create function public.add_zone_round(p_session_id uuid, p_round jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.zone_sessions%rowtype;
  v_values private.zone_round_values;
  v_seq smallint;
  v_round public.zone_rounds%rowtype;
begin
  v_session := private.zone_session_for_work(p_session_id);
  if p_round is null or jsonb_typeof(p_round) <> 'object' then
    raise exception 'round details are missing' using errcode = 'BR003';
  end if;
  v_values := private.zone_round_from(p_round);
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.zone_rounds r where r.session_id = p_session_id;
  if v_seq > 50 then
    raise exception 'a session has at most 50 rounds' using errcode = 'BR004';
  end if;
  insert into public.zone_rounds (session_id, athlete_id, seq, batting_side, stage, delivery_source, drill_key, drill_version,
                                  constraint_key, primary_cue, target_lane, planned_reps, intended_zones, created_by)
  values (p_session_id, v_session.athlete_id, v_seq, v_values.batting_side, v_values.stage, v_values.delivery_source,
          v_values.drill_key, v_values.drill_version, v_values.constraint_key, v_values.primary_cue, v_values.target_lane,
          v_values.planned_reps, v_values.intended_zones, v_uid)
  returning * into v_round;
  perform private.zone_add_assignment(v_round, coalesce(p_round -> 'assignment', '{}'::jsonb));
  update public.zone_sessions s set updated_at = now() where s.id = p_session_id;
  return v_round.id;
end;
$$;

-- Changing a round's assignment adds a version; events already logged keep theirs.
create function public.set_zone_assignment(p_round_id uuid, p_assignment jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.zone_rounds%rowtype;
begin
  v_round := private.zone_round_for_work(p_round_id);
  return private.zone_add_assignment(v_round, coalesce(p_assignment, '{}'::jsonb));
end;
$$;

create function public.review_zone_round(p_round_id uuid, p_review jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.zone_rounds%rowtype;
begin
  v_round := private.zone_round_for_work(p_round_id);
  update public.zone_rounds r
     set hitter_feedback = private.zone_text(p_review, 'hitter_feedback', 500, 'Hitter feedback'),
         coach_notes = private.zone_text(p_review, 'coach_notes', 1000, 'Coach notes'),
         response = private.zone_choice(p_review, 'response', array['advance', 'hold', 'simplify', 'stop'], 'the next step'),
         reviewed_at = now()
   where r.id = p_round_id;
end;
$$;

-- The post-session evaluation. Only the development coach writes the coach's
-- assessment; an athlete-side change after the coach approved the next-session
-- plan withdraws that approval.
create function public.review_zone_session(p_session_id uuid, p_review jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.zone_sessions%rowtype;
  v_coach boolean;
  v_next_constraint text;
begin
  v_session := private.zone_session_for_work(p_session_id);
  v_coach := private.assessment_relation(v_uid, v_session.athlete_id) = 'development_coach';
  v_next_constraint := private.zone_text(p_review, 'next_constraint_key', 80, 'The next constraint');
  if v_next_constraint is not null and not exists (select 1 from public.zone_constraints c where c.key = v_next_constraint) then
    raise exception 'choose the next constraint from the list' using errcode = 'BR003';
  end if;
  update public.zone_sessions s
     set hitter_self_assessment = private.zone_text(p_review, 'hitter_self_assessment', 1000, 'The hitter''s self-assessment'),
         coach_assessment = case when v_coach then private.zone_text(p_review, 'coach_assessment', 1000, 'The coach''s assessment')
                                 else s.coach_assessment end,
         best_process_win = private.zone_text(p_review, 'best_process_win', 300, 'Best process win'),
         repeated_breakdown = private.zone_text(p_review, 'repeated_breakdown', 500, 'The repeated breakdown'),
         decision = private.zone_choice(p_review, 'decision', array['advance', 'hold', 'simplify'], 'advance, hold or simplify'),
         next_zones = private.zone_list(p_review, 'next_zones', 2, 'the next zones'),
         next_cue = private.zone_text(p_review, 'next_cue', 120, 'The next cue'),
         next_constraint_key = v_next_constraint,
         next_volume = private.zone_text(p_review, 'next_volume', 120, 'The next volume'),
         success_criterion = private.zone_text(p_review, 'success_criterion', 300, 'The success criterion'),
         status = 'reviewed',
         reviewed_by = v_uid,
         reviewed_at = now(),
         next_plan_approved_by = case when v_coach then s.next_plan_approved_by end,
         next_plan_approved_at = case when v_coach then s.next_plan_approved_at end,
         updated_at = now()
   where s.id = p_session_id;
end;
$$;

create function public.approve_zone_next_plan(p_session_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.zone_sessions%rowtype;
begin
  v_session := private.zone_session_for_work(p_session_id);
  if private.assessment_relation(v_uid, v_session.athlete_id) is distinct from 'development_coach' then
    raise exception 'only the athlete''s development coach can approve the next-session plan' using errcode = 'BR002';
  end if;
  if v_session.status <> 'reviewed' then
    raise exception 'review the session before approving the next plan' using errcode = 'BR004';
  end if;
  update public.zone_sessions s set next_plan_approved_by = v_uid, next_plan_approved_at = now(), updated_at = now()
   where s.id = p_session_id;
  perform private.log_audit('zone.next_plan_approved', 'zone_session', p_session_id::text, v_session.athlete_id, '{}'::jsonb, v_uid);
end;
$$;

-- Deleting a session removes its rounds and events. The athlete's side cannot
-- delete a session the development coach started.
create function public.delete_zone_session(p_session_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.zone_sessions%rowtype;
begin
  v_session := private.zone_session_for_work(p_session_id);
  if v_session.source_kind = 'development_coach'
     and private.assessment_relation(v_uid, v_session.athlete_id) is distinct from 'development_coach' then
    raise exception 'only the development coach can delete a session they started' using errcode = 'BR002';
  end if;
  delete from public.zone_sessions s where s.id = p_session_id;
  perform private.log_audit('zone.session_deleted', 'zone_session', p_session_id::text, v_session.athlete_id, '{}'::jsonb, v_uid);
end;
$$;

-- =============================================================================
-- Events (pitches, tee swings, dry reps)
-- =============================================================================
create type private.zone_event_values as (
  kind text,
  batting_side text,
  intended_zone smallint,
  location text,
  pitch_class text,
  pitch_type text,
  response text,
  contact text,
  hard_targeted boolean,
  depth_correct boolean,
  lane_correct boolean,
  posture_error boolean,
  recognition_call text,
  off_plan boolean,
  off_plan_reason text,
  forced_take boolean,
  voided boolean,
  void_reason text,
  media_id uuid,
  clip_time_ms integer,
  note text,
  evidence_method text
);

-- Reads and checks an event payload in plain language (the table constraints
-- check the same rules again).
create function private.zone_event_from(p jsonb, p_round public.zone_rounds) returns private.zone_event_values
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.zone_event_values;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'event details are missing' using errcode = 'BR003';
  end if;
  v.kind := coalesce(private.zone_choice(p, 'kind', array['pitch', 'tee_swing', 'dry_rep'], 'pitch, tee swing or dry rep'), 'pitch');
  v.batting_side := coalesce(private.zone_choice(p, 'batting_side', array['right', 'left'], 'the batting side'), p_round.batting_side);
  v.intended_zone := private.zone_int(p, 'intended_zone', 1, 9, 'The planned zone');
  v.location := coalesce(private.zone_choice(p, 'location', array[
    'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'out_high', 'out_low', 'out_in', 'out_away', 'unknown'], 'the location'), 'unknown');
  v.pitch_class := private.zone_choice(p, 'pitch_class', array['strike', 'ball'], 'strike or ball');
  v.pitch_type := private.zone_choice(p, 'pitch_type', array[
    'four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup', 'splitter', 'knuckleball', 'other'], 'the pitch type');
  v.response := private.zone_choice(p, 'response', array['swing', 'take'], 'swing or take');
  v.contact := private.zone_choice(p, 'contact', array['miss', 'foul', 'fair', 'unknown'], 'the contact');
  v.hard_targeted := private.zone_bool(p, 'hard_targeted');
  v.depth_correct := private.zone_bool(p, 'depth_correct');
  v.lane_correct := private.zone_bool(p, 'lane_correct');
  v.posture_error := private.zone_bool(p, 'posture_error');
  v.recognition_call := private.zone_choice(p, 'recognition_call', array['strike', 'ball'], 'the recognition call');
  v.off_plan := coalesce(private.zone_bool(p, 'off_plan'), false);
  v.off_plan_reason := private.zone_text(p, 'off_plan_reason', 200, 'The off-plan reason');
  v.forced_take := coalesce(private.zone_bool(p, 'forced_take'), false);
  v.voided := coalesce(private.zone_bool(p, 'voided'), false);
  v.void_reason := private.zone_text(p, 'void_reason', 200, 'The reason for leaving it out');
  v.media_id := private.zone_uuid(p, 'media_id', 'a clip');
  v.clip_time_ms := private.zone_int(p, 'clip_time_ms', 0, 3600000, 'The clip time');
  v.note := private.zone_text(p, 'note', 300, 'The note');
  v.evidence_method := coalesce(private.zone_choice(p, 'evidence_method', array['live', 'video'], 'live or video'), 'live');

  if v.kind = 'tee_swing' then
    v.response := 'swing';
  end if;
  if v.kind <> 'pitch' then
    if v.pitch_class is not null or v.recognition_call is not null or v.forced_take or v.intended_zone is not null
       or v.off_plan or v.pitch_type is not null then
      raise exception 'tee swings and dry reps are repetitions, not pitches: no ball/strike, call, plan or pitch type' using errcode = 'BR003';
    end if;
    if v.location like 'out_%' then
      raise exception 'a tee swing or dry rep is placed in a zone' using errcode = 'BR003';
    end if;
  end if;
  if v.kind = 'dry_rep' and (v.response is not null or v.contact is not null or v.hard_targeted is not null
                             or v.depth_correct is not null or v.lane_correct is not null) then
    raise exception 'a dry rep has no ball: record posture only' using errcode = 'BR003';
  end if;
  if v.pitch_class is not null and v.location <> 'unknown' then
    v.pitch_class := null; -- derived from the location
  end if;
  if v.response is distinct from 'swing' and (v.contact is not null or v.hard_targeted is not null or v.depth_correct is not null
                                               or (v.posture_error is not null and v.kind <> 'dry_rep')) then
    raise exception 'contact, quality, depth and posture are recorded on swings only' using errcode = 'BR003';
  end if;
  if v.lane_correct is not null and v.contact is distinct from 'fair' then
    raise exception 'the lane is recorded on fair balls in play only' using errcode = 'BR003';
  end if;
  if v.forced_take and v.response is distinct from 'take' then
    raise exception 'a forced take must be recorded as a take' using errcode = 'BR003';
  end if;
  if not v.off_plan then
    v.off_plan_reason := null;
  end if;
  if v.voided and char_length(coalesce(v.void_reason, '')) < 3 then
    raise exception 'say why this is left out (3 to 200 characters)' using errcode = 'BR003';
  end if;
  if not v.voided then
    v.void_reason := null;
  end if;
  if v.media_id is not null and not exists (
       select 1 from public.assessment_media m
        where m.id = v.media_id and m.athlete_id = p_round.athlete_id and m.status = 'uploaded') then
    raise exception 'choose one of this athlete''s uploaded clips' using errcode = 'BR003';
  end if;
  if v.media_id is null then
    v.clip_time_ms := null;
  end if;
  return v;
end;
$$;
revoke all on function private.zone_event_from(jsonb, public.zone_rounds) from public;

create function public.log_zone_event(p_round_id uuid, p_event jsonb)
returns table (event_id uuid, seq integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_round public.zone_rounds%rowtype;
  v public.zone_events%rowtype;
  v_values private.zone_event_values;
  v_assignment uuid;
  v_seq integer;
begin
  v_round := private.zone_round_for_work(p_round_id);
  v_values := private.zone_event_from(p_event, v_round);
  select a.id into v_assignment from public.zone_assignments a where a.round_id = p_round_id order by a.version desc limit 1;
  select coalesce(max(e.seq), 0) + 1 into v_seq from public.zone_events e where e.round_id = p_round_id;
  if v_seq > 1000 then
    raise exception 'a round has at most 1,000 entries; start a new round' using errcode = 'BR004';
  end if;
  insert into public.zone_events (
    round_id, session_id, athlete_id, seq, kind, assignment_id, batting_side, intended_zone, location, pitch_class,
    pitch_type, response, contact, hard_targeted, depth_correct, lane_correct, posture_error, recognition_call, off_plan,
    off_plan_reason, forced_take, voided, void_reason, media_id, clip_time_ms, note, evidence_method, source_kind,
    created_by, updated_by)
  values (
    p_round_id, v_round.session_id, v_round.athlete_id, v_seq, v_values.kind, v_assignment, v_values.batting_side,
    v_values.intended_zone, v_values.location, v_values.pitch_class, v_values.pitch_type, v_values.response, v_values.contact,
    v_values.hard_targeted, v_values.depth_correct, v_values.lane_correct, v_values.posture_error, v_values.recognition_call,
    v_values.off_plan, v_values.off_plan_reason, v_values.forced_take, v_values.voided, v_values.void_reason, v_values.media_id,
    v_values.clip_time_ms, v_values.note, v_values.evidence_method, private.assessment_source_kind(v_round.athlete_id),
    v_uid, v_uid)
  returning * into v;
  update public.zone_sessions s set updated_at = now() where s.id = v_round.session_id;
  event_id := v.id;
  seq := v.seq;
  return next;
end;
$$;

-- A correction. The kind and the assignment the event was judged against stay
-- as they were; the athlete's side cannot change what the coach recorded.
create function public.update_zone_event(p_event_id uuid, p_event jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_event public.zone_events%rowtype;
  v_round public.zone_rounds%rowtype;
  v_values private.zone_event_values;
begin
  select * into v_event from public.zone_events e where e.id = p_event_id;
  if not found then
    raise exception 'entry not found' using errcode = 'BR003';
  end if;
  v_round := private.zone_round_for_work(v_event.round_id);
  select * into v_event from public.zone_events e where e.id = p_event_id for update;
  if v_event.source_kind = 'development_coach' and private.assessment_source_kind(v_event.athlete_id) = 'self' then
    raise exception 'only the development coach can change what the coach recorded' using errcode = 'BR002';
  end if;
  v_values := private.zone_event_from(coalesce(p_event, '{}'::jsonb) || jsonb_build_object('kind', v_event.kind), v_round);
  update public.zone_events e
     set batting_side = v_values.batting_side, intended_zone = v_values.intended_zone, location = v_values.location,
         pitch_class = v_values.pitch_class, pitch_type = v_values.pitch_type, response = v_values.response,
         contact = v_values.contact, hard_targeted = v_values.hard_targeted, depth_correct = v_values.depth_correct,
         lane_correct = v_values.lane_correct, posture_error = v_values.posture_error,
         recognition_call = v_values.recognition_call, off_plan = v_values.off_plan, off_plan_reason = v_values.off_plan_reason,
         forced_take = v_values.forced_take, voided = v_values.voided, void_reason = v_values.void_reason,
         media_id = v_values.media_id, clip_time_ms = v_values.clip_time_ms, note = v_values.note,
         evidence_method = v_values.evidence_method, updated_by = v_uid, updated_at = now()
   where e.id = p_event_id;
end;
$$;

create function public.delete_zone_event(p_event_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.zone_events%rowtype;
begin
  select * into v_event from public.zone_events e where e.id = p_event_id;
  if not found then
    raise exception 'entry not found' using errcode = 'BR003';
  end if;
  perform private.zone_round_for_work(v_event.round_id);
  if v_event.source_kind = 'development_coach' and private.assessment_source_kind(v_event.athlete_id) = 'self' then
    raise exception 'only the development coach can remove what the coach recorded' using errcode = 'BR002';
  end if;
  delete from public.zone_events e where e.id = p_event_id;
end;
$$;

-- =============================================================================
-- Progression
-- =============================================================================
create function public.set_zone_stage(
  p_athlete_id uuid,
  p_zone integer,
  p_stage integer,
  p_decision text,
  p_reason text,
  p_evidence text default null,
  p_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current smallint;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR003';
  end if;
  if p_zone is null or p_zone not between 1 and 9 or p_stage is null or p_stage not between 1 and 9 then
    raise exception 'choose a zone and a stage from 1 to 9' using errcode = 'BR003';
  end if;
  if char_length(coalesce(btrim(p_reason), '')) not between 3 and 500 then
    raise exception 'give the reason for this decision (3 to 500 characters)' using errcode = 'BR003';
  end if;
  if char_length(coalesce(p_evidence, '')) > 500 then
    raise exception 'the evidence note is longer than 500 characters' using errcode = 'BR003';
  end if;
  if p_session_id is not null and not exists (
       select 1 from public.zone_sessions s where s.id = p_session_id and s.athlete_id = p_athlete_id) then
    raise exception 'link one of this athlete''s sessions' using errcode = 'BR003';
  end if;
  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;
  select p.stage into v_current from public.zone_progress p
   where p.athlete_id = p_athlete_id and p.zone = p_zone order by p.created_at desc, p.id desc limit 1;
  if v_current is null and p_decision is distinct from 'set' then
    raise exception 'set a starting stage for this zone first' using errcode = 'BR004';
  elsif v_current is not null and not (
          (p_decision = 'advance' and p_stage = v_current + 1)
       or (p_decision = 'hold' and p_stage = v_current)
       or (p_decision = 'simplify' and p_stage < v_current)) then
    raise exception 'advance moves up one stage, hold keeps the stage, simplify moves to an earlier stage' using errcode = 'BR003';
  end if;
  insert into public.zone_progress (athlete_id, zone, stage, decision, reason, evidence, session_id, source_kind, decided_by)
  values (p_athlete_id, p_zone, p_stage, p_decision, btrim(p_reason), nullif(btrim(p_evidence), ''), p_session_id,
          private.assessment_source_kind(p_athlete_id), v_uid)
  returning id into v_id;
  perform private.log_audit('zone.stage_changed', 'zone_progress', v_id::text, p_athlete_id, '{}'::jsonb, v_uid);
  return v_id;
end;
$$;

-- =============================================================================
-- Privileges
-- =============================================================================
revoke all on function public.create_zone_session(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.add_zone_round(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.set_zone_assignment(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.review_zone_round(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.review_zone_session(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.approve_zone_next_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_zone_session(uuid) from public, anon, authenticated, service_role;
revoke all on function public.log_zone_event(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_zone_event(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.delete_zone_event(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_zone_stage(uuid, integer, integer, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_zone_session(uuid, jsonb) to authenticated;
grant execute on function public.add_zone_round(uuid, jsonb) to authenticated;
grant execute on function public.set_zone_assignment(uuid, jsonb) to authenticated;
grant execute on function public.review_zone_round(uuid, jsonb) to authenticated;
grant execute on function public.review_zone_session(uuid, jsonb) to authenticated;
grant execute on function public.approve_zone_next_plan(uuid) to authenticated;
grant execute on function public.delete_zone_session(uuid) to authenticated;
grant execute on function public.log_zone_event(uuid, jsonb) to authenticated;
grant execute on function public.update_zone_event(uuid, jsonb) to authenticated;
grant execute on function public.delete_zone_event(uuid) to authenticated;
grant execute on function public.set_zone_stage(uuid, integer, integer, text, text, text, uuid) to authenticated;

-- =============================================================================
-- Content version 1 (generated from src/lib/assessment/zones/content-v1.json)
-- =============================================================================
-- @generated zone-content-seed (scripts/zone-content/seed-sql.py; do not edit below)
select private.import_zone_content($zone${"source": {"file": "9_Zone_Hitting_Drills_and_Tracking.xlsx", "sha256": "7e2d3e151a7213bdc39985a3f5e72bded643d0d5f7969c878eb5862bec9140cf"}, "version": "zone-v1",
"zones": [
{"commonMisses": "Jammed contact; hook fouls", "cue": "Get it out front.", "depthCue": "Farthest forward", "desiredResult": "Controlled hard pull-side contact", "location": "High inside", "placement": "Upper third, inner third", "sourceRow": 2, "targetLane": "Pull-side gap", "zone": 1},
{"commonMisses": "Popups; dropping under ball", "cue": "Stay tall through center.", "depthCue": "Standard to slightly forward", "desiredResult": "Firm line through center", "location": "High middle", "placement": "Upper third, center", "sourceRow": 3, "targetLane": "Center field", "zone": 2},
{"commonMisses": "Weak flares; early pull contact", "cue": "Let it travel.", "depthCue": "Deeper than middle; still in front", "desiredResult": "Opposite-field line drive", "location": "High outside", "placement": "Upper third, outer third", "sourceRow": 4, "targetLane": "Opposite-field gap", "zone": 3},
{"commonMisses": "Jams; hook fouls; early opening", "cue": "Hands inside, turn it out front.", "depthCue": "Out front near/ahead of lead-foot reference", "desiredResult": "Hard pull-side line drive", "location": "Middle inside", "placement": "Belt high, inner third", "sourceRow": 5, "targetLane": "Pull-side gap", "zone": 4},
{"commonMisses": "Pulled early contact; deep weak flares", "cue": "See it, meet it, drive through center.", "depthCue": "Around lead-foot/toe reference", "desiredResult": "Firm center-field contact", "location": "Middle middle", "placement": "Belt high, center", "sourceRow": 6, "targetLane": "Center field", "zone": 5},
{"commonMisses": "Early rollover; overly deep contact", "cue": "Wait, stay inside, drive through the gap.", "depthCue": "Deeper than middle-middle; still in front", "desiredResult": "Firm opposite-field contact", "location": "Middle outside", "placement": "Belt high, outer third", "sourceRow": 7, "targetLane": "Opposite-field gap", "zone": 6},
{"commonMisses": "Posture loss; hooks; jams", "cue": "Hips back, chest over, turn it out front.", "depthCue": "Forward; slightly deeper than belt-high inside", "desiredResult": "Firm low pull-side ball", "location": "Low inside", "placement": "Low strike, inner third", "sourceRow": 8, "targetLane": "Low pull-side gap", "zone": 7},
{"commonMisses": "Standing up; steep grounders; early opening", "cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "desiredResult": "Low line or firm ground ball through center", "location": "Low middle", "placement": "Low strike, center", "sourceRow": 9, "targetLane": "Low center lane", "zone": 8},
{"commonMisses": "Early rollover; late contact; guided flare", "cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "desiredResult": "Firm low opposite-field contact", "location": "Low outside", "placement": "Low strike, outer third", "sourceRow": 10, "targetLane": "Low opposite-field gap", "zone": 9}
],
"drills": [
{"cue": "Get it out front.", "depthCue": "Farthest forward", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z1-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at upper third, inner third; mark target lane.", "sourceId": "Z1-01", "sourceRow": 2, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Pull-side gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Jammed contact; hook fouls", "zone": 1},
{"cue": "Get it out front.", "depthCue": "Farthest forward", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z1-02", "level": "Announced moving ball", "name": "Announced zone soft toss", "setup": "Announce Zone 1; deliver repeatable strikes.", "sourceId": "Z1-02", "sourceRow": 3, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Pull-side gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Jammed contact; hook fouls", "zone": 1},
{"cue": "Get it out front.", "depthCue": "Farthest forward", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z1-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 1 strikes with obvious balls above zone or farther inside.", "sourceId": "Z1-03", "sourceRow": 4, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Pull-side gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Jammed contact; hook fouls", "zone": 1},
{"cue": "Stay tall through center.", "depthCue": "Standard to slightly forward", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z2-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at upper third, center; mark target lane.", "sourceId": "Z2-01", "sourceRow": 5, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Center field", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Popups; dropping under ball", "zone": 2},
{"cue": "Stay tall through center.", "depthCue": "Standard to slightly forward", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z2-02", "level": "Announced moving ball", "name": "Announced zone soft toss", "setup": "Announce Zone 2; deliver repeatable strikes.", "sourceId": "Z2-02", "sourceRow": 6, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Center field", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Popups; dropping under ball", "zone": 2},
{"cue": "Stay tall through center.", "depthCue": "Standard to slightly forward", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z2-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 2 strikes with obvious balls above zone.", "sourceId": "Z2-03", "sourceRow": 7, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Center field", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Popups; dropping under ball", "zone": 2},
{"cue": "Let it travel.", "depthCue": "Deeper than middle; still in front", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z3-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at upper third, outer third; mark target lane.", "sourceId": "Z3-01", "sourceRow": 8, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Opposite-field gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Weak flares; early pull contact", "zone": 3},
{"cue": "Let it travel.", "depthCue": "Deeper than middle; still in front", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z3-02", "level": "Announced moving ball", "name": "Announced zone soft toss", "setup": "Announce Zone 3; deliver repeatable strikes.", "sourceId": "Z3-02", "sourceRow": 9, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Opposite-field gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Weak flares; early pull contact", "zone": 3},
{"cue": "Let it travel.", "depthCue": "Deeper than middle; still in front", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z3-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 3 strikes with obvious balls off plate away.", "sourceId": "Z3-03", "sourceRow": 10, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Opposite-field gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Weak flares; early pull contact", "zone": 3},
{"cue": "Hands inside, turn it out front.", "depthCue": "Out front near/ahead of lead-foot reference", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z4-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at belt high, inner third; mark target lane.", "sourceId": "Z4-01", "sourceRow": 11, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Pull-side gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Jams; hook fouls; early opening", "zone": 4},
{"cue": "Hands inside, turn it out front.", "depthCue": "Out front near/ahead of lead-foot reference", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z4-02", "level": "Announced moving ball", "name": "Turn-and-drive soft toss", "setup": "Announce Zone 4; deliver repeatable strikes.", "sourceId": "Z4-02", "sourceRow": 12, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Pull-side gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Jams; hook fouls; early opening", "zone": 4},
{"cue": "Hands inside, turn it out front.", "depthCue": "Out front near/ahead of lead-foot reference", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z4-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 4 strikes with obvious balls farther inside.", "sourceId": "Z4-03", "sourceRow": 13, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Pull-side gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Jams; hook fouls; early opening", "zone": 4},
{"cue": "See it, meet it, drive through center.", "depthCue": "Around lead-foot/toe reference", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z5-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at belt high, center; mark target lane.", "sourceId": "Z5-01", "sourceRow": 14, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Center field", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Pulled early contact; deep weak flares", "zone": 5},
{"cue": "See it, meet it, drive through center.", "depthCue": "Around lead-foot/toe reference", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z5-02", "level": "Announced moving ball", "name": "Center-drive soft toss", "setup": "Announce Zone 5; deliver repeatable strikes.", "sourceId": "Z5-02", "sourceRow": 15, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Center field", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Pulled early contact; deep weak flares", "zone": 5},
{"cue": "See it, meet it, drive through center.", "depthCue": "Around lead-foot/toe reference", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z5-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 5 strikes with obvious balls clearly outside zone boundaries.", "sourceId": "Z5-03", "sourceRow": 16, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Center field", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Pulled early contact; deep weak flares", "zone": 5},
{"cue": "Wait, stay inside, drive through the gap.", "depthCue": "Deeper than middle-middle; still in front", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z6-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at belt high, outer third; mark target lane.", "sourceId": "Z6-01", "sourceRow": 17, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Opposite-field gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Early rollover; overly deep contact", "zone": 6},
{"cue": "Wait, stay inside, drive through the gap.", "depthCue": "Deeper than middle-middle; still in front", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z6-02", "level": "Announced moving ball", "name": "Stay-through soft toss", "setup": "Announce Zone 6; deliver repeatable strikes.", "sourceId": "Z6-02", "sourceRow": 18, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Opposite-field gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Early rollover; overly deep contact", "zone": 6},
{"cue": "Wait, stay inside, drive through the gap.", "depthCue": "Deeper than middle-middle; still in front", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z6-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 6 strikes with obvious balls off plate away.", "sourceId": "Z6-03", "sourceRow": 19, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Opposite-field gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Early rollover; overly deep contact", "zone": 6},
{"cue": "Hips back, chest over, turn it out front.", "depthCue": "Forward; slightly deeper than belt-high inside", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z7-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at low strike, inner third; mark target lane.", "sourceId": "Z7-01", "sourceRow": 20, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Low pull-side gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Posture loss; hooks; jams", "zone": 7},
{"cue": "Hips back, chest over, turn it out front.", "depthCue": "Forward; slightly deeper than belt-high inside", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z7-02", "level": "Announced moving ball", "name": "Hinge-and-turn soft toss", "setup": "Announce Zone 7; deliver repeatable strikes.", "sourceId": "Z7-02", "sourceRow": 21, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Low pull-side gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Posture loss; hooks; jams", "zone": 7},
{"cue": "Hips back, chest over, turn it out front.", "depthCue": "Forward; slightly deeper than belt-high inside", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z7-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 7 strikes with obvious balls below zone.", "sourceId": "Z7-03", "sourceRow": 22, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Low pull-side gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Posture loss; hooks; jams", "zone": 7},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z8-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at low strike, center; mark target lane.", "sourceId": "Z8-01", "sourceRow": 23, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Low center lane", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z8-02", "level": "Announced moving ball", "name": "Announced zone soft toss", "setup": "Announce Zone 8; deliver repeatable strikes.", "sourceId": "Z8-02", "sourceRow": 24, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Low center lane", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z8-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 8 strikes with obvious balls below zone.", "sourceId": "Z8-03", "sourceRow": 25, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Low center lane", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Set depth before swinging. Hit toward assigned lane; check posture between sets.", "key": "z9-01", "level": "Tee", "name": "Contact-point tee work", "setup": "Tee at low strike, outer third; mark target lane.", "sourceId": "Z9-01", "sourceRow": 26, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 2–3 sets of 6–8", "targetLane": "Low opposite-field gap", "track": "Correct depth; correct lane; firm contact", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Keep location and tempo consistent. Transfer the tee contact plan to a moving ball.", "key": "z9-02", "level": "Announced moving ball", "name": "Announced zone soft toss", "setup": "Announce Zone 9; deliver repeatable strikes.", "sourceId": "Z9-02", "sourceRow": 27, "sourceSheet": "Zone Drill Library", "suggestedVolume": "8 announced strikes; Zones 8–9 may use 10", "targetLane": "Low opposite-field gap", "track": "Depth; lane; contact quality; posture", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Swing at assigned strikes; take balls. Record actual location and decision.", "key": "z9-03", "level": "Front toss / decisions", "name": "Zone strike-versus-chase round", "setup": "Mix Zone 9 strikes with obvious balls below or off plate away.", "sourceId": "Z9-03", "sourceRow": 28, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Low opposite-field gap", "track": "Decision rate; chase rate; depth on strike swings", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Rehearse hinge and contact posture; pause for a controlled check.", "key": "z8-04", "level": "Dry rehearsal", "name": "Posture rehearsal freezes", "setup": "Low-middle contact reference; no ball", "sourceId": "Z8-04", "sourceRow": 29, "sourceSheet": "Zone Drill Library", "suggestedVolume": "6 dry freezes", "targetLane": "Low center lane", "track": "Stable posture", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Drive low-middle strikes through low center target without scooping.", "key": "z8-05", "level": "Tee / toss", "name": "Low-line target constraint", "setup": "Use a safe visual low target; keep objects out of swing path", "sourceId": "Z8-05", "sourceRow": 30, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 8–10 swings", "targetLane": "Low center lane", "track": "Low targeted contact; posture", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Specify whether neighboring strikes are green-light pitches before round.", "key": "z8-06", "level": "Decision toss", "name": "Low-middle take-or-hit", "setup": "Mix low-middle strikes, below-zone balls, neighboring low strikes", "sourceId": "Z8-06", "sourceRow": 31, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 12–15 pitches", "targetLane": "Low center lane", "track": "Assignment decisions; chase rate", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hips back, chest over, through center.", "depthCue": "Near toe reference; slightly deeper than middle-middle", "execution": "Adjust depth and direction while maintaining hinge.", "key": "z8-07", "level": "Random front toss", "name": "Low-row transfer", "setup": "Randomize Zones 7, 8, 9", "sourceId": "Z8-07", "sourceRow": 32, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 12–15 pitches", "targetLane": "Low center lane", "track": "Depth; lane; posture", "version": 1, "watchFor": "Standing up; steep grounders; early opening", "zone": 8},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Rehearse deep contact ahead of back hip with stable hinge.", "key": "z9-04", "level": "Dry rehearsal", "name": "Posture and depth freezes", "setup": "Mark low-away reference without obstructing swing", "sourceId": "Z9-04", "sourceRow": 33, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 6 dry freezes", "targetLane": "Low opposite-field gap", "track": "Depth reference; posture", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Maintain posture through low-away contact; avoid forced restriction.", "key": "z9-05", "level": "Tee / announced toss", "name": "Chest-to-plate constraint", "setup": "Low-away strike; use verbal posture cue, not restraint", "sourceId": "Z9-05", "sourceRow": 34, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 8–10 swings", "targetLane": "Low opposite-field gap", "track": "Posture; opposite lane", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Use forward/back reference to locate suitable low-away contact, then hit one ball.", "key": "z9-06", "level": "Tee", "name": "Two-ball depth reference", "setup": "Two visual depth references; remove unused ball before swinging", "sourceId": "Z9-06", "sourceRow": 35, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 8–10 swings", "targetLane": "Low opposite-field gap", "track": "Correct depth", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "React to actual location without predicting order.", "key": "z9-07", "level": "Front toss", "name": "Low-row randomizer", "setup": "Random Zones 7–9 strikes", "sourceId": "Z9-07", "sourceRow": 36, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 12–15 pitches", "targetLane": "Low opposite-field gap", "track": "Depth adjustment; lane", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Change tempo or controlled speed between blocks; retain away-pitch plan.", "key": "z9-08", "level": "Front toss", "name": "Variable timing front toss", "setup": "Keep safe screened setup; vary one timing demand only", "sourceId": "Z9-08", "sourceRow": 37, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 12–18 pitches", "targetLane": "Low opposite-field gap", "track": "Timing; depth; posture", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Reward correct takes and firm opposite-lane strike contact.", "key": "z9-09", "level": "Decision toss / live", "name": "Low-away versus chase game", "setup": "Mix low-away strikes with clear below/away balls", "sourceId": "Z9-09", "sourceRow": 38, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 10–15 pitches", "targetLane": "Low opposite-field gap", "track": "Decisions; chase; hard targeted contact", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Transfer cue to live release; review only between blocks.", "key": "z9-10", "level": "Controlled BP", "name": "Controlled BP transfer", "setup": "Location bias to low-away with nearby strikes", "sourceId": "Z9-10", "sourceRow": 39, "sourceSheet": "Zone Drill Library", "suggestedVolume": "Suggested: 8–12 pitches", "targetLane": "Low opposite-field gap", "track": "Depth; lane; decisions", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9},
{"cue": "Hinge, wait, stay through the opposite gap.", "depthCue": "Deepest reference; still ahead of back hip", "execution": "Score process within fixed pitch limit. Review repeatability across sessions.", "key": "z9-11", "level": "Controlled live", "name": "Pressure finish / graduation", "setup": "Predeclare low-away assignment and fixed finish length", "sourceId": "Z9-11", "sourceRow": 40, "sourceSheet": "Zone Drill Library", "suggestedVolume": "4–6 pitches; do not extend for a hit", "targetLane": "Low opposite-field gap", "track": "Process success; no chase", "version": 1, "watchFor": "Early rollover; late contact; guided flare", "zone": 9}
],
"stages": [
{"instructions": "Two weak zones; finish with 6 alternating reps", "measures": "Depth / lane / posture", "name": "Static tee map", "newDemand": "Depth, posture, lane", "nextStep": "Moving ball with location announced", "source": "Tee; one zone", "sourceRow": 2, "stage": 1, "suggestedVolume": "2–3 sets of 6–8 per selected zone"},
{"instructions": "Known strikes; steady tempo", "measures": "Depth / lane / quality", "name": "Announced moving ball", "newDemand": "Moving-ball timing", "nextStep": "Alternate two announced locations", "source": "Side toss or screened front toss", "sourceRow": 3, "stage": 2, "suggestedVolume": "2 sets of 8–10 per weak zone"},
{"instructions": "Random order; announce location before delivery", "measures": "Depth by zone / lane", "name": "Announced alternating locations", "newDemand": "Depth adjustment", "nextStep": "Remove location announcement", "source": "Toss; two zones", "sourceRow": 4, "stage": 3, "suggestedVolume": "12–16 pitches per pairing"},
{"instructions": "Start with one row; expand gradually", "measures": "Depth / timing / lane", "name": "Mixed strikes", "newDemand": "Location recognition", "nextStep": "Add obvious balls", "source": "Front toss; unannounced strikes", "sourceRow": 5, "stage": 4, "suggestedVolume": "15–20 pitches"},
{"instructions": "Begin with obvious balls; define swing assignment", "measures": "Decisions / chase / strike contact", "name": "Decision rounds", "newDemand": "Swing/take decisions", "nextStep": "Add one timing variable", "source": "Front toss; strikes and balls", "sourceRow": 6, "stage": 5, "suggestedVolume": "15–18 pitches"},
{"instructions": "Vary tempo or speed one at a time; do not use reduced live-pitch distance", "measures": "Decisions / timing / posture", "name": "Variable timing", "newDemand": "Timing adaptability", "nextStep": "Controlled BP", "source": "Front toss with safe fixed setup", "sourceRow": 7, "stage": 6, "suggestedVolume": "18–24 pitches if appropriate"},
{"instructions": "Weak zones, then mixed strikes, then decisions", "measures": "Depth / lane / decisions", "name": "Controlled BP", "newDemand": "More realistic flight and speed", "nextStep": "Constrained live BP", "source": "Coach / machine / controlled arm", "sourceRow": 8, "stage": 7, "suggestedVolume": "3 blocks of 8–12 if appropriate"},
{"instructions": "One constraint per block; feedback between blocks", "measures": "Decisions / depth / posture", "name": "Live BP with constraints", "newDemand": "Live release and uncertainty", "nextStep": "Game-transfer at-bats", "source": "Live pitcher; planned round", "sourceRow": 9, "stage": 8, "suggestedVolume": "Short blocks within pitcher workload plan"},
{"instructions": "Unannounced mix; chart then review", "measures": "Decisions / chase / zone trends", "name": "Game-transfer BP", "newDemand": "Competitive transfer", "nextStep": "Use evaluation to select next practice", "source": "Live at-bats / scrimmage", "sourceRow": 10, "stage": 9, "suggestedVolume": "At-bats within planned workload"}
],
"pairings": [
{"key": "pair-4-6", "name": "Middle inside / outside", "purpose": "Depth adjustment", "sourceRow": 2, "zones": [4, 6]},
{"key": "pair-7-9", "name": "Low inside / outside", "purpose": "Hinge plus depth", "sourceRow": 3, "zones": [7, 9]},
{"key": "pair-1-3", "name": "High inside / outside", "purpose": "Tall posture plus depth", "sourceRow": 4, "zones": [1, 3]},
{"key": "pair-5-8", "name": "Middle-middle / low-middle", "purpose": "Height and posture", "sourceRow": 5, "zones": [5, 8]},
{"key": "pair-2-5", "name": "High-middle / middle-middle", "purpose": "Height control", "sourceRow": 6, "zones": [2, 5]}
],
"constraints": [
{"category": "Location", "deliverySetup": "Bias Zones 1/4/7", "hitterAssignment": "Out-front contact; pull gap", "key": "location-inside-third", "measure": "Depth / lane", "name": "Inside third", "sourceRow": 2, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Bias Zones 2/5/8", "hitterAssignment": "Drive center", "key": "location-middle-third", "measure": "Lane / quality", "name": "Middle third", "sourceRow": 3, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Bias Zones 3/6/9", "hitterAssignment": "Let travel; opposite gap", "key": "location-outside-third", "measure": "Depth / lane", "name": "Outside third", "sourceRow": 4, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Zones 1–3", "hitterAssignment": "Control high strikes with stable posture", "key": "location-high-row", "measure": "Posture / quality", "name": "High row", "sourceRow": 5, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Zones 4–6", "hitterAssignment": "Adjust depth across row", "key": "location-middle-row", "measure": "Depth / lane", "name": "Middle row", "sourceRow": 6, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Zones 7–9", "hitterAssignment": "Maintain hinge; low target lanes", "key": "location-low-row", "measure": "Posture / lane", "name": "Low row", "sourceRow": 7, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Two zones, random order", "hitterAssignment": "Adjust without guessing", "key": "location-two-zone-contrast", "measure": "Depth by zone", "name": "Two-zone contrast", "sourceRow": 8, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Location", "deliverySetup": "Bias selected weak zones; nearby strikes for transfer", "hitterAssignment": "Apply one established cue", "key": "location-weak-zone-emphasis", "measure": "Weak-zone process", "name": "Weak-zone emphasis", "sourceRow": 9, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "Only controlled fastballs", "hitterAssignment": "Location and timing", "key": "pitch-type-fastball-only", "measure": "Depth / decisions", "name": "Fastball only", "sourceRow": 10, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "Add one age-appropriate secondary pitch", "hitterAssignment": "Recognize speed and location", "key": "pitch-type-fastball-plus-one-secondary", "measure": "Decision / timing", "name": "Fastball plus one secondary", "sourceRow": 11, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "Announce pitch type before delivery", "hitterAssignment": "Rehearse timing adaptation", "key": "pitch-type-announced-secondary", "measure": "Timing / posture", "name": "Announced secondary", "sourceRow": 12, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "Mix two types without announcement", "hitterAssignment": "Compete with recognition", "key": "pitch-type-unannounced-secondary", "measure": "Chase / decision", "name": "Unannounced secondary", "sourceRow": 13, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "Planned two-type location pairing", "hitterAssignment": "Avoid guessing; adjust to actual pitch", "key": "pitch-type-fastball-in-secondary-away", "measure": "Depth / decision", "name": "Fastball-in / secondary-away", "sourceRow": 14, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Pitch type", "deliverySetup": "One location with two pitch types", "hitterAssignment": "Adjust timing without forcing depth", "key": "pitch-type-same-zone-two-types", "measure": "Timing / quality", "name": "Same zone, two types", "sourceRow": 15, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Include clear balls and strikes", "hitterAssignment": "Track; take until first strike, then activate swing assignment", "key": "decision-take-until-first-strike", "measure": "Recognition; separate forced takes", "name": "Take until first strike", "sourceRow": 16, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "First pitch is an automatic take", "hitterAssignment": "Track then compete", "key": "decision-take-first-pitch", "measure": "Readiness; forced take excluded from decisions", "name": "Take first pitch", "sourceRow": 17, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Start simulated count with two strikes", "hitterAssignment": "Compete using declared zone standard", "key": "decision-two-strike-round", "measure": "Decisions / contact", "name": "Two-strike round", "sourceRow": 18, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Mix strikes with obvious balls", "hitterAssignment": "Avoid chase; finish at fixed pitch cap", "key": "decision-no-chase-round", "measure": "Chase", "name": "No-chase round", "sourceRow": 19, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Mix strikes and balls", "hitterAssignment": "Earn decision points; bonus quality", "key": "decision-strike-zone-game", "measure": "Decision / quality", "name": "Strike-zone game", "sourceRow": 20, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Target edges and clear strikes", "hitterAssignment": "Use predeclared selective swing rule", "key": "decision-borderline-takes", "measure": "Assignment decisions", "name": "Borderline takes", "sourceRow": 21, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Define attack zones before round", "hitterAssignment": "Swing only in assigned zones", "key": "decision-green-light-zones", "measure": "Assignment decisions", "name": "Green-light zones", "sourceRow": 22, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Decision", "deliverySetup": "Early-count zone plan; expand at two strikes", "hitterAssignment": "Follow count-specific plan", "key": "decision-hunt-and-adjust", "measure": "Assignment decisions", "name": "Hunt and adjust", "sourceRow": 23, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Inside strikes", "hitterAssignment": "Drive assigned pull lane", "key": "direction-pull-gap-round", "measure": "Lane / depth", "name": "Pull-gap round", "sourceRow": 24, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Middle strikes", "hitterAssignment": "Drive through center", "key": "direction-center-field-round", "measure": "Lane", "name": "Center-field round", "sourceRow": 25, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Outside strikes", "hitterAssignment": "Deep contact to opposite gap", "key": "direction-opposite-gap-round", "measure": "Depth / lane", "name": "Opposite-gap round", "sourceRow": 26, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Low strikes; safe visual target", "hitterAssignment": "Low firm flight without scoop", "key": "direction-low-line-round", "measure": "Quality / posture", "name": "Low-line round", "sourceRow": 27, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Assigned strikes", "hitterAssignment": "Line drives and firm grounders", "key": "direction-firm-contact-round", "measure": "Hard targeted contact", "name": "Firm-contact round", "sourceRow": 28, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Outer-third strikes", "hitterAssignment": "Avoid early pulled rollover", "key": "direction-no-hook-away", "measure": "Depth / lane", "name": "No-hook away", "sourceRow": 29, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Direction", "deliverySetup": "Outer-third strikes", "hitterAssignment": "Firm contact rather than guided flare", "key": "direction-no-flare-away", "measure": "Quality / depth", "name": "No-flare away", "sourceRow": 30, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Low strikes at manageable speed", "hitterAssignment": "Maintain comfortable hinge", "key": "posture-low-zone-posture", "measure": "Posture", "name": "Low-zone posture", "sourceRow": 31, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Selected predictable strikes", "hitterAssignment": "Hold balanced finish briefly", "key": "posture-freeze-and-check", "measure": "Balance", "name": "Freeze and check", "sourceRow": 32, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Low-away strikes", "hitterAssignment": "Retain posture; do not physically restrain", "key": "posture-chest-to-plate-cue", "measure": "Posture / lane", "name": "Chest-to-plate cue", "sourceRow": 33, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Controlled predictable strikes", "hitterAssignment": "Use only if coach intentionally tests stride", "key": "posture-reduced-stride-diagnostic", "measure": "Balance / timing", "name": "Reduced-stride diagnostic", "sourceRow": 34, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Predictable strikes", "hitterAssignment": "Limit excessive movement without rigidity", "key": "posture-quiet-head-cue", "measure": "Posture / tracking", "name": "Quiet-head cue", "sourceRow": 35, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Controlled strikes", "hitterAssignment": "Finish under control", "key": "posture-balanced-finish", "measure": "Balance", "name": "Balanced finish", "sourceRow": 36, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Posture", "deliverySetup": "Low-away strikes; visual reference outside swing path", "hitterAssignment": "Apply individualized deep-contact cue", "key": "posture-low-away-depth-reference", "measure": "Depth", "name": "Low-away depth reference", "sourceRow": 37, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "Repeatable safe delivery rhythm", "hitterAssignment": "Establish timing", "key": "timing-consistent-tempo", "measure": "Timing", "name": "Consistent tempo", "sourceRow": 38, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "Slightly vary between-pitch interval only when hitter ready", "hitterAssignment": "Reset routine; never rush safety", "key": "timing-pace-pressure-round", "measure": "Readiness / decisions", "name": "Pace-pressure round", "sourceRow": 39, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "Vary legal set time; hitter remains ready", "hitterAssignment": "Avoid rushing commitment", "key": "timing-hold-and-go", "measure": "Timing", "name": "Hold and go", "sourceRow": 40, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "Same safe pitching distance; gradual speed changes", "hitterAssignment": "Preserve depth as speed rises", "key": "timing-velocity-ladder", "measure": "Depth / quality", "name": "Velocity ladder", "sourceRow": 41, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "Progress from screened toss to regulation-distance live within readiness", "hitterAssignment": "Adapt to changing visual flight; no shortened live distance", "key": "timing-visual-timing-transfer", "measure": "Timing", "name": "Visual timing transfer", "sourceRow": 42, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Timing", "deliverySetup": "No location cues; allow normal preparation", "hitterAssignment": "Read actual delivery", "key": "timing-unannounced-location", "measure": "Decision / depth", "name": "Unannounced location", "sourceRow": 43, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Declared process rubric", "hitterAssignment": "Earn decisions, depth, lane, quality points", "key": "competition-quality-at-bat-game", "measure": "Process components", "name": "Quality-at-bat game", "sourceRow": 44, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Fixed 3-pitch block", "hitterAssignment": "Execute assignment on each pitch", "key": "competition-three-pitch-at-bat", "measure": "Decision / quality", "name": "Three-pitch at-bat", "sourceRow": 45, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Declared zone cluster and target", "hitterAssignment": "Reach process goal within fixed cap", "key": "competition-win-the-zone", "measure": "Zone process", "name": "Win the zone", "sourceRow": 46, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Fixed final 4–6 pitches", "hitterAssignment": "Repeat skill under score pressure", "key": "competition-pressure-finish", "measure": "Process", "name": "Pressure finish", "sourceRow": 47, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Set success target within fixed cap", "hitterAssignment": "Chain correct reps; no extra workload to force finish", "key": "competition-consecutive-success", "measure": "Repeatability", "name": "Consecutive success", "sourceRow": 48, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Normal plan after miss", "hitterAssignment": "Reset and make next sound decision", "key": "competition-comeback-round", "measure": "Recovery / decisions", "name": "Comeback round", "sourceRow": 49, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"},
{"category": "Competition", "deliverySetup": "Shared process-point target", "hitterAssignment": "Contribute quality decisions, not just hits", "key": "competition-team-relay", "measure": "Process", "name": "Team relay", "sourceRow": 50, "volumeNote": "Suggested: 8–12 pitches unless a shorter finish is specified; fit to workload plan"}
]}$zone$::jsonb);
