-- =============================================================================
-- Base Recruits Assessment / Migration 3: catalog and calculation helpers
--
-- The metric catalog, capture protocols and drill library, seeded from the
-- TypeScript catalog in src/lib/assessment/catalog (tests/contract keeps the
-- two identical). Definitions are versioned: a changed definition is a new
-- row with a higher version, never an edit, so published reports keep
-- pointing at the definition they used.
--
-- Also the calculation building blocks shared by imports and results: unit
-- conversion, device-label normalization and target attainment.
-- =============================================================================

create table public.assessment_metric_definitions (
  key text not null
    constraint assessment_metric_definitions_key_format check (key ~ '^(hit|pit)_[a-z0-9_]+$'),
  version smallint not null constraint assessment_metric_definitions_version_positive check (version >= 1),
  discipline text not null constraint assessment_metric_definitions_discipline check (discipline in ('hitting', 'pitching')),
  pillar text not null constraint assessment_metric_definitions_pillar check (pillar in (
    'load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output',
    'lower_body_delivery', 'movement_timing', 'arm_delivery', 'pitch_performance')),
  name text not null constraint assessment_metric_definitions_name_length check (char_length(name) between 3 and 80),
  value_kind text not null constraint assessment_metric_definitions_value_kind check (value_kind in ('rating', 'number', 'boolean')),
  granularity text not null constraint assessment_metric_definitions_granularity check (granularity in ('assessment', 'repetition')),
  unit text not null constraint assessment_metric_definitions_unit check (unit in ('rating', 'ms', 'mph', 'deg', 'rpm', 'in', 'percent', 'yes_no')),
  evidence text[] not null
    constraint assessment_metric_definitions_evidence check (evidence <@ array['sensor_measurement', 'video_estimate', 'observation']::text[]),
  derived_from text,
  derivation text constraint assessment_metric_definitions_derivation check (derivation in ('sd', 'cv')),
  min_value numeric,
  max_value numeric,
  integer_only boolean not null,
  aggregation text not null constraint assessment_metric_definitions_aggregation check (aggregation in ('single', 'median', 'rate', 'sd', 'cv')),
  has_peak boolean not null,
  min_valid_count smallint not null constraint assessment_metric_definitions_min_count check (min_valid_count >= 1),
  directionality text not null constraint assessment_metric_definitions_directionality check (directionality in ('higher', 'lower', 'target_range', 'descriptive')),
  scoring text not null constraint assessment_metric_definitions_scoring check (scoring in ('rubric', 'targetable', 'descriptive')),
  target_kinds text[] not null
    constraint assessment_metric_definitions_target_kinds check (target_kinds <@ array['higher_is_better', 'lower_is_better', 'target_range']::text[]),
  per_pitch_type boolean not null,
  requires_device boolean not null,
  marker_start text,
  marker_end text,
  active boolean not null default true,
  primary key (key, version),
  constraint assessment_metric_definitions_derived_pair check ((derived_from is null) = (derivation is null)),
  constraint assessment_metric_definitions_derived_no_evidence check (derived_from is null or cardinality(evidence) = 0),
  constraint assessment_metric_definitions_range check (min_value is null or max_value is null or min_value < max_value),
  constraint assessment_metric_definitions_targets check ((scoring = 'targetable') = (cardinality(target_kinds) > 0)),
  constraint assessment_metric_definitions_markers check ((marker_start is null) = (marker_end is null))
);
comment on table public.assessment_metric_definitions is
  'Versioned metric catalog. Structural fields only; explanations, rubric anchors and limitations live in src/lib/assessment/catalog/metrics.ts.';

create table public.assessment_protocols (
  key text not null constraint assessment_protocols_key_format check (key ~ '^[a-z]+(-[a-z]+)*$'),
  version smallint not null constraint assessment_protocols_version_positive check (version >= 1),
  discipline text not null constraint assessment_protocols_discipline check (discipline in ('hitting', 'pitching')),
  mode text not null constraint assessment_protocols_mode check (mode in ('video_coach', 'instrumented', 'lab')),
  title text not null,
  default_rep_goal smallint not null constraint assessment_protocols_rep_goal check (default_rep_goal between 1 and 200),
  active boolean not null default true,
  primary key (key, version)
);

create table public.assessment_protocol_metrics (
  protocol_key text not null,
  protocol_version smallint not null,
  metric_key text not null,
  metric_version smallint not null,
  required boolean not null,
  weight numeric not null constraint assessment_protocol_metrics_weight_positive check (weight > 0),
  position smallint not null,
  primary key (protocol_key, protocol_version, metric_key),
  unique (protocol_key, protocol_version, position),
  foreign key (protocol_key, protocol_version) references public.assessment_protocols (key, version),
  foreign key (metric_key, metric_version) references public.assessment_metric_definitions (key, version)
);

create table public.assessment_drills (
  key text not null constraint assessment_drills_key_format check (key ~ '^(hit|pit)-[a-z0-9-]+$'),
  version smallint not null constraint assessment_drills_version_positive check (version >= 1),
  discipline text not null constraint assessment_drills_discipline check (discipline in ('hitting', 'pitching')),
  pillars text[] not null,
  name text not null,
  active boolean not null default true,
  primary key (key, version)
);
comment on table public.assessment_drills is
  'Drill library keys and versions. Instructions live in src/lib/assessment/catalog/drills.ts (written text only; no media).';

alter table public.assessment_metric_definitions enable row level security;
alter table public.assessment_protocols enable row level security;
alter table public.assessment_protocol_metrics enable row level security;
alter table public.assessment_drills enable row level security;
revoke all on table public.assessment_metric_definitions, public.assessment_protocols,
  public.assessment_protocol_metrics, public.assessment_drills from anon, authenticated, service_role;
grant select on table public.assessment_metric_definitions, public.assessment_protocols,
  public.assessment_protocol_metrics, public.assessment_drills to authenticated;
create policy assessment_metric_definitions_read on public.assessment_metric_definitions for select to authenticated using (true);
create policy assessment_protocols_read on public.assessment_protocols for select to authenticated using (true);
create policy assessment_protocol_metrics_read on public.assessment_protocol_metrics for select to authenticated using (true);
create policy assessment_drills_read on public.assessment_drills for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Seed: version 1 (generated from the TypeScript catalog)
-- -----------------------------------------------------------------------------
insert into public.assessment_metric_definitions
  (key, version, discipline, pillar, name, value_kind, granularity, unit, evidence, derived_from, derivation,
   min_value, max_value, integer_only, aggregation, has_peak, min_valid_count, directionality, scoring, target_kinds,
   per_pitch_type, requires_device, marker_start, marker_end)
values
  ('hit_load_repeatability', 1, 'hitting', 'load_timing', 'Load repeatability', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_drill_preparation', 1, 'hitting', 'load_timing', 'Ready on time for the drill', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_fc_to_contact_ms', 1, 'hitting', 'load_timing', 'Foot landing to contact', 'number', 'repetition', 'ms', array['video_estimate'], null, null, 20, 1500, false, 'median', false, 3, 'target_range', 'targetable', array['target_range'], false, false, 'foot_contact', 'contact'),
  ('hit_timing_variation_ms', 1, 'hitting', 'load_timing', 'Swing-to-swing timing variation', 'number', 'repetition', 'ms', '{}'::text[], 'hit_fc_to_contact_ms', 'sd', null, null, false, 'sd', false, 3, 'lower', 'targetable', array['lower_is_better'], false, false, null, null),
  ('hit_contact_location_consistency', 1, 'hitting', 'barrel_delivery', 'Contact-point consistency', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_barrel_delivery_consistency', 1, 'hitting', 'barrel_delivery', 'Barrel delivery consistency', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_bat_speed_mph', 1, 'hitting', 'barrel_delivery', 'Bat speed', 'number', 'repetition', 'mph', array['sensor_measurement'], null, null, 10, 110, false, 'median', true, 3, 'higher', 'targetable', array['higher_is_better'], false, true, null, null),
  ('hit_attack_angle_deg', 1, 'hitting', 'barrel_delivery', 'Attack angle', 'number', 'repetition', 'deg', array['sensor_measurement'], null, null, -45, 60, false, 'median', false, 3, 'target_range', 'targetable', array['target_range'], false, true, null, null),
  ('hit_stride_direction_repeatability', 1, 'hitting', 'lower_body_contribution', 'Stride-direction repeatability', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_balance_through_swing', 1, 'hitting', 'lower_body_contribution', 'Balance through the swing', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_lower_body_consistency', 1, 'hitting', 'lower_body_contribution', 'Lower-body movement consistency', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('hit_exit_velocity_mph', 1, 'hitting', 'impact_output', 'Exit velocity', 'number', 'repetition', 'mph', array['sensor_measurement'], null, null, 10, 130, false, 'median', true, 3, 'higher', 'targetable', array['higher_is_better'], false, true, null, null),
  ('hit_launch_angle_deg', 1, 'hitting', 'impact_output', 'Launch angle', 'number', 'repetition', 'deg', array['sensor_measurement'], null, null, -90, 90, false, 'median', false, 3, 'target_range', 'targetable', array['target_range'], false, true, null, null),
  ('hit_solid_contact', 1, 'hitting', 'impact_output', 'Solid-contact rate', 'boolean', 'repetition', 'yes_no', array['observation'], null, null, 0, 1, true, 'rate', false, 5, 'higher', 'targetable', array['higher_is_better'], false, false, null, null),
  ('hit_output_consistency_pct', 1, 'hitting', 'impact_output', 'Exit-velocity consistency', 'number', 'repetition', 'percent', '{}'::text[], 'hit_exit_velocity_mph', 'cv', null, null, false, 'cv', false, 5, 'lower', 'targetable', array['lower_is_better'], false, false, null, null),
  ('pit_stride_direction_repeatability', 1, 'pitching', 'lower_body_delivery', 'Stride-direction repeatability', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_delivery_balance', 1, 'pitching', 'lower_body_delivery', 'Delivery balance', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_landing_consistency', 1, 'pitching', 'lower_body_delivery', 'Landing-position consistency', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_fc_to_release_ms', 1, 'pitching', 'movement_timing', 'Foot landing to release', 'number', 'repetition', 'ms', array['video_estimate'], null, null, 20, 1500, false, 'median', false, 3, 'target_range', 'targetable', array['target_range'], false, false, 'foot_contact', 'release'),
  ('pit_timing_consistency_ms', 1, 'pitching', 'movement_timing', 'Delivery timing variation', 'number', 'repetition', 'ms', '{}'::text[], 'pit_fc_to_release_ms', 'sd', null, null, false, 'sd', false, 3, 'lower', 'targetable', array['lower_is_better'], false, false, null, null),
  ('pit_delivery_event_repeatability', 1, 'pitching', 'movement_timing', 'Delivery rhythm repeatability', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_arm_path_consistency', 1, 'pitching', 'arm_delivery', 'Arm-path consistency', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_event_position_repeatability', 1, 'pitching', 'arm_delivery', 'Positions at landing and release', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_release_consistency', 1, 'pitching', 'arm_delivery', 'Release consistency (visual)', 'rating', 'assessment', 'rating', array['observation'], null, null, 1, 5, true, 'single', false, 1, 'higher', 'rubric', '{}'::text[], false, false, null, null),
  ('pit_velocity_mph', 1, 'pitching', 'pitch_performance', 'Pitch velocity', 'number', 'repetition', 'mph', array['sensor_measurement'], null, null, 20, 110, false, 'median', true, 3, 'higher', 'targetable', array['higher_is_better'], true, true, null, null),
  ('pit_target_hit', 1, 'pitching', 'pitch_performance', 'Target-hit rate', 'boolean', 'repetition', 'yes_no', array['observation'], null, null, 0, 1, true, 'rate', false, 5, 'higher', 'targetable', array['higher_is_better'], true, false, null, null),
  ('pit_strike', 1, 'pitching', 'pitch_performance', 'Strike rate', 'boolean', 'repetition', 'yes_no', array['observation'], null, null, 0, 1, true, 'rate', false, 5, 'higher', 'targetable', array['higher_is_better'], true, false, null, null),
  ('pit_spin_rate_rpm', 1, 'pitching', 'pitch_performance', 'Spin rate', 'number', 'repetition', 'rpm', array['sensor_measurement'], null, null, 100, 4000, false, 'median', false, 3, 'target_range', 'targetable', array['target_range'], true, true, null, null),
  ('pit_horizontal_break_in', 1, 'pitching', 'pitch_performance', 'Horizontal movement', 'number', 'repetition', 'in', array['sensor_measurement'], null, null, -40, 40, false, 'median', false, 3, 'descriptive', 'descriptive', '{}'::text[], true, true, null, null),
  ('pit_vertical_break_in', 1, 'pitching', 'pitch_performance', 'Vertical movement', 'number', 'repetition', 'in', array['sensor_measurement'], null, null, -40, 40, false, 'median', false, 3, 'descriptive', 'descriptive', '{}'::text[], true, true, null, null);

insert into public.assessment_protocols (key, version, discipline, mode, title, default_rep_goal)
values
  ('hitting-video', 1, 'hitting', 'video_coach', 'Hitting — video and coach review', 10),
  ('hitting-instrumented', 1, 'hitting', 'instrumented', 'Hitting — video plus measured ball data', 10),
  ('pitching-video', 1, 'pitching', 'video_coach', 'Pitching — video and coach review', 15),
  ('pitching-instrumented', 1, 'pitching', 'instrumented', 'Pitching — video plus measured pitch data', 15);

insert into public.assessment_protocol_metrics
  (protocol_key, protocol_version, metric_key, metric_version, required, weight, position)
values
  ('hitting-video', 1, 'hit_load_repeatability', 1, true, 1, 1),
  ('hitting-video', 1, 'hit_drill_preparation', 1, true, 1, 2),
  ('hitting-video', 1, 'hit_contact_location_consistency', 1, true, 1, 3),
  ('hitting-video', 1, 'hit_barrel_delivery_consistency', 1, true, 1, 4),
  ('hitting-video', 1, 'hit_stride_direction_repeatability', 1, true, 1, 5),
  ('hitting-video', 1, 'hit_balance_through_swing', 1, true, 1, 6),
  ('hitting-video', 1, 'hit_lower_body_consistency', 1, true, 1, 7),
  ('hitting-video', 1, 'hit_fc_to_contact_ms', 1, false, 1, 8),
  ('hitting-video', 1, 'hit_timing_variation_ms', 1, false, 1, 9),
  ('hitting-video', 1, 'hit_bat_speed_mph', 1, false, 1, 10),
  ('hitting-video', 1, 'hit_attack_angle_deg', 1, false, 1, 11),
  ('hitting-video', 1, 'hit_exit_velocity_mph', 1, false, 1, 12),
  ('hitting-video', 1, 'hit_launch_angle_deg', 1, false, 1, 13),
  ('hitting-video', 1, 'hit_solid_contact', 1, true, 1, 14),
  ('hitting-video', 1, 'hit_output_consistency_pct', 1, false, 1, 15),
  ('hitting-instrumented', 1, 'hit_load_repeatability', 1, true, 1, 1),
  ('hitting-instrumented', 1, 'hit_drill_preparation', 1, true, 1, 2),
  ('hitting-instrumented', 1, 'hit_contact_location_consistency', 1, true, 1, 3),
  ('hitting-instrumented', 1, 'hit_barrel_delivery_consistency', 1, true, 1, 4),
  ('hitting-instrumented', 1, 'hit_stride_direction_repeatability', 1, true, 1, 5),
  ('hitting-instrumented', 1, 'hit_balance_through_swing', 1, true, 1, 6),
  ('hitting-instrumented', 1, 'hit_lower_body_consistency', 1, true, 1, 7),
  ('hitting-instrumented', 1, 'hit_fc_to_contact_ms', 1, false, 1, 8),
  ('hitting-instrumented', 1, 'hit_timing_variation_ms', 1, false, 1, 9),
  ('hitting-instrumented', 1, 'hit_bat_speed_mph', 1, false, 1, 10),
  ('hitting-instrumented', 1, 'hit_attack_angle_deg', 1, false, 1, 11),
  ('hitting-instrumented', 1, 'hit_exit_velocity_mph', 1, true, 1, 12),
  ('hitting-instrumented', 1, 'hit_launch_angle_deg', 1, false, 1, 13),
  ('hitting-instrumented', 1, 'hit_solid_contact', 1, true, 1, 14),
  ('hitting-instrumented', 1, 'hit_output_consistency_pct', 1, false, 1, 15),
  ('pitching-video', 1, 'pit_stride_direction_repeatability', 1, true, 1, 1),
  ('pitching-video', 1, 'pit_delivery_balance', 1, true, 1, 2),
  ('pitching-video', 1, 'pit_landing_consistency', 1, true, 1, 3),
  ('pitching-video', 1, 'pit_delivery_event_repeatability', 1, true, 1, 4),
  ('pitching-video', 1, 'pit_arm_path_consistency', 1, true, 1, 5),
  ('pitching-video', 1, 'pit_event_position_repeatability', 1, true, 1, 6),
  ('pitching-video', 1, 'pit_release_consistency', 1, true, 1, 7),
  ('pitching-video', 1, 'pit_fc_to_release_ms', 1, false, 1, 8),
  ('pitching-video', 1, 'pit_timing_consistency_ms', 1, false, 1, 9),
  ('pitching-video', 1, 'pit_velocity_mph', 1, false, 1, 10),
  ('pitching-video', 1, 'pit_target_hit', 1, false, 1, 11),
  ('pitching-video', 1, 'pit_strike', 1, true, 1, 12),
  ('pitching-video', 1, 'pit_spin_rate_rpm', 1, false, 1, 13),
  ('pitching-video', 1, 'pit_horizontal_break_in', 1, false, 1, 14),
  ('pitching-video', 1, 'pit_vertical_break_in', 1, false, 1, 15),
  ('pitching-instrumented', 1, 'pit_stride_direction_repeatability', 1, true, 1, 1),
  ('pitching-instrumented', 1, 'pit_delivery_balance', 1, true, 1, 2),
  ('pitching-instrumented', 1, 'pit_landing_consistency', 1, true, 1, 3),
  ('pitching-instrumented', 1, 'pit_delivery_event_repeatability', 1, true, 1, 4),
  ('pitching-instrumented', 1, 'pit_arm_path_consistency', 1, true, 1, 5),
  ('pitching-instrumented', 1, 'pit_event_position_repeatability', 1, true, 1, 6),
  ('pitching-instrumented', 1, 'pit_release_consistency', 1, true, 1, 7),
  ('pitching-instrumented', 1, 'pit_fc_to_release_ms', 1, false, 1, 8),
  ('pitching-instrumented', 1, 'pit_timing_consistency_ms', 1, false, 1, 9),
  ('pitching-instrumented', 1, 'pit_velocity_mph', 1, true, 1, 10),
  ('pitching-instrumented', 1, 'pit_target_hit', 1, false, 1, 11),
  ('pitching-instrumented', 1, 'pit_strike', 1, true, 1, 12),
  ('pitching-instrumented', 1, 'pit_spin_rate_rpm', 1, false, 1, 13),
  ('pitching-instrumented', 1, 'pit_horizontal_break_in', 1, false, 1, 14),
  ('pitching-instrumented', 1, 'pit_vertical_break_in', 1, false, 1, 15);

insert into public.assessment_drills (key, version, discipline, pillars, name)
values
  ('hit-rhythm-load-tee', 1, 'hitting', array['load_timing'], 'Rhythm-and-load tee series'),
  ('hit-front-toss-tempo', 1, 'hitting', array['load_timing'], 'Front-toss tempo changes'),
  ('hit-contact-point-map', 1, 'hitting', array['barrel_delivery'], 'Contact-point tee map'),
  ('hit-barrel-gate', 1, 'hitting', array['barrel_delivery'], 'Barrel gate tee work'),
  ('hit-stride-line', 1, 'hitting', array['lower_body_contribution'], 'Stride line'),
  ('hit-hold-the-finish', 1, 'hitting', array['lower_body_contribution'], 'Hold-the-finish swings'),
  ('hit-same-move-sets', 1, 'hitting', array['lower_body_contribution', 'load_timing'], 'Same-move video sets'),
  ('hit-line-drive-rounds', 1, 'hitting', array['impact_output'], 'Line-drive target rounds'),
  ('hit-radar-intent-rounds', 1, 'hitting', array['impact_output'], 'Measured intent rounds'),
  ('pit-stride-line', 1, 'pitching', array['lower_body_delivery'], 'Stride-line landing work'),
  ('pit-balance-hold', 1, 'pitching', array['lower_body_delivery'], 'Leg-lift balance holds'),
  ('pit-tempo-count', 1, 'pitching', array['movement_timing'], 'Rhythm count deliveries'),
  ('pit-checkpoint-freeze', 1, 'pitching', array['movement_timing', 'arm_delivery'], 'Checkpoint freeze'),
  ('pit-mirror-arm-path', 1, 'pitching', array['arm_delivery'], 'Mirror arm-path work'),
  ('pit-release-window', 1, 'pitching', array['arm_delivery', 'pitch_performance'], 'Release-window target throws'),
  ('pit-quadrant-charting', 1, 'pitching', array['pitch_performance'], 'Quadrant-charted bullpen'),
  ('pit-pitch-pairing', 1, 'pitching', array['pitch_performance', 'arm_delivery'], 'Pitch-pairing sequences'),
  ('pit-measured-bullpen', 1, 'pitching', array['pitch_performance'], 'Measured bullpen check-in');

-- -----------------------------------------------------------------------------
-- Calculation helpers (mirrored in src/lib/assessment/units.ts and scoring.ts)
-- -----------------------------------------------------------------------------

-- Unit as typed in a file → its code ("KPH" → "km/h"); null when blank.
create function private.assessment_normalize_unit(p_unit text) returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_unit, '')))
    when '' then null
    when 'milliseconds' then 'ms' when 'millisecond' then 'ms'
    when 'sec' then 's' when 'secs' then 's' when 'second' then 's' when 'seconds' then 's'
    when 'kph' then 'km/h' when 'kmh' then 'km/h' when 'km/hr' then 'km/h'
    when 'mps' then 'm/s' when 'mi/h' then 'mph'
    when 'degree' then 'deg' when 'degrees' then 'deg' when '°' then 'deg'
    when 'inch' then 'in' when 'inches' then 'in'
    when 'centimeters' then 'cm' when 'centimetres' then 'cm'
    when '%' then 'percent' when 'pct' then 'percent'
    when 'yes/no' then 'yes_no' when 'boolean' then 'yes_no' when 'bool' then 'yes_no'
    else lower(btrim(p_unit))
  end
$$;

-- A value in a source unit converted to the canonical unit, rounded to three
-- decimals; null when the unit is not accepted for that canonical unit.
create function private.assessment_convert_unit(p_value numeric, p_unit text, p_canonical text) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when private.assessment_normalize_unit(p_unit) = p_canonical then round(p_value, 3)
    when p_canonical = 'ms' and private.assessment_normalize_unit(p_unit) = 's' then round(p_value * 1000, 3)
    when p_canonical = 'mph' and private.assessment_normalize_unit(p_unit) = 'km/h' then round(p_value / 1.609344, 3)
    when p_canonical = 'mph' and private.assessment_normalize_unit(p_unit) = 'm/s' then round(p_value * 3600 / 1609.344, 3)
    when p_canonical = 'in' and private.assessment_normalize_unit(p_unit) = 'cm' then round(p_value / 2.54, 3)
  end
$$;

create function private.assessment_normalize_device_label(p_label text) returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'))), '')
$$;

-- Target attainment, 0–100 to one decimal (see scoring.ts for the formulas).
create function private.assessment_target_score(p_value numeric, p_kind text, p_a numeric, p_b numeric, p_c numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(least(100, greatest(0, case p_kind
    when 'higher_is_better' then 100 * (p_value - p_a) / (p_b - p_a)
    when 'lower_is_better' then 100 * (p_b - p_value) / (p_b - p_a)
    when 'target_range' then case
      when p_value between p_a and p_b then 100
      when p_value < p_a then 100 * (1 - (p_a - p_value) / p_c)
      else 100 * (1 - (p_value - p_b) / p_c) end
  end)), 1)
  where p_value is not null and p_a < p_b
    and (p_kind <> 'target_range' or p_c > 0)
$$;

revoke all on function private.assessment_normalize_unit(text) from public;
revoke all on function private.assessment_convert_unit(numeric, text, text) from public;
revoke all on function private.assessment_normalize_device_label(text) from public;
revoke all on function private.assessment_target_score(numeric, text, numeric, numeric, numeric) from public;
