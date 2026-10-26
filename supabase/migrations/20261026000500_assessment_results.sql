-- =============================================================================
-- Base Recruits Assessment / Migration 5: results, reports and benchmarks
--
-- private.assessment_results() is the authoritative calculation (calc-v1) for
-- every preview and published report. It mirrors src/lib/assessment/engine.ts
-- exactly; tests/contract/assessment-engine.test.ts runs identical inputs
-- through both and requires identical output.
--
-- Published reports are frozen: a revision stores the complete snapshot
-- (context, review, results with their inputs and versions, targets, clips).
-- Correcting an assessment means reopening it and publishing a new revision;
-- earlier revisions are kept as superseded and are never rewritten.
--
-- Reference benchmarks: releases are administered here, but none exists.
-- Only approved, non-synthetic releases with at least 30 distinct athletes can
-- produce a percentile, and only for an exact match of metric version,
-- protocol, unit, statistic, pitch type and cohort.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reference benchmark releases (admin only)
-- -----------------------------------------------------------------------------
create table public.assessment_benchmark_releases (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  metric_version smallint not null,
  protocol_key text not null,
  protocol_version smallint not null,
  unit text not null,
  statistic text not null constraint assessment_benchmark_releases_statistic check (statistic in ('median', 'rate', 'sd', 'cv')),
  pitch_type text,
  age_band text constraint assessment_benchmark_releases_age_band check (age_band in ('13_14', '15_16', '17_18', '19_22', '23_plus')),
  competition_level text constraint assessment_benchmark_releases_level check (competition_level in (
    'youth', 'high_school', 'travel', 'junior_college', 'four_year_college', 'adult', 'other')),
  device_kind text constraint assessment_benchmark_releases_device check (device_kind in (
    'radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other')),
  source text not null constraint assessment_benchmark_releases_source check (char_length(source) between 3 and 300),
  usage_rights text not null constraint assessment_benchmark_releases_rights check (char_length(usage_rights) between 3 and 300),
  collected_from date not null,
  collected_to date not null,
  cohort_description text not null constraint assessment_benchmark_releases_cohort check (char_length(cohort_description) between 3 and 500),
  aggregation_note text not null constraint assessment_benchmark_releases_aggregation check (char_length(aggregation_note) between 3 and 300),
  dataset_version text not null constraint assessment_benchmark_releases_version check (char_length(dataset_version) between 1 and 40),
  is_synthetic boolean not null default false,
  status text not null default 'draft' constraint assessment_benchmark_releases_status check (status in ('draft', 'approved', 'retired')),
  distinct_athletes integer not null default 0,
  repetition_count integer constraint assessment_benchmark_releases_reps check (repetition_count >= 0),
  note text constraint assessment_benchmark_releases_note check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  retired_at timestamptz,
  foreign key (metric_key, metric_version) references public.assessment_metric_definitions (key, version),
  foreign key (protocol_key, protocol_version) references public.assessment_protocols (key, version),
  constraint assessment_benchmark_releases_dates check (collected_from <= collected_to),
  constraint assessment_benchmark_releases_synthetic_never_approved check (not (is_synthetic and status = 'approved'))
);
comment on table public.assessment_benchmark_releases is
  'Reference datasets for percentiles. None exists today; reports say benchmarks are unavailable.';

create table public.assessment_benchmark_values (
  release_id uuid not null references public.assessment_benchmark_releases (id) on delete cascade,
  subject_key text not null constraint assessment_benchmark_values_subject check (char_length(subject_key) between 1 and 64),
  value numeric not null,
  primary key (release_id, subject_key)
);
comment on table public.assessment_benchmark_values is
  'One summary value per distinct athlete (pseudonymous subject key), so no athlete''s many repetitions can dominate a reference.';

create trigger assessment_benchmark_releases_audit
  after insert or update of status or delete on public.assessment_benchmark_releases
  for each row execute function private.audit_row_change(null, 'id', 'status', 'metric_key', 'dataset_version');

alter table public.assessment_benchmark_releases enable row level security;
alter table public.assessment_benchmark_values enable row level security;
revoke all on table public.assessment_benchmark_releases, public.assessment_benchmark_values from anon, authenticated, service_role;
grant select on table public.assessment_benchmark_releases to authenticated;
create policy assessment_benchmark_releases_admin_read on public.assessment_benchmark_releases
  for select to authenticated using (private.is_admin());

-- -----------------------------------------------------------------------------
-- The calculation (calc-v1). Mirrors src/lib/assessment/engine.ts.
-- -----------------------------------------------------------------------------
create function private.assessment_pitch_order() returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['four_seam', 'two_seam', 'sinker', 'cutter', 'slider', 'sweeper', 'curveball', 'changeup',
               'splitter', 'knuckleball', 'other']
$$;

create function private.assessment_percentile(
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
  with release as (
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
     order by (r.age_band is not null)::int + (r.competition_level is not null)::int + (r.device_kind is not null)::int desc,
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

-- One observation as the calculation sees it (device label already normalized).
create type private.assessment_calc_row as (
  id uuid,
  value numeric,
  quality_state text,
  evidence_category text,
  entry_method text,
  source_kind text,
  device_kind text,
  device_label text,
  reviewed boolean,
  updated_at timestamptz,
  eligible boolean
);

create function private.assessment_results(p_assessment_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assessment public.assessments%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_source_key text;
  v_requires_device boolean;
  v_statistic text;
  v_result_unit text;
  v_groups text[];
  v_group text;
  v_pitch text;
  v_total integer;
  v_eligible integer;
  v_devices integer;
  v_median double precision;
  v_max numeric;
  v_sd numeric;
  v_avg numeric;
  v_rate numeric;
  v_chosen uuid;
  v_any_unable boolean;
  v_value numeric;
  v_peak numeric;
  v_status text;
  v_used uuid[];
  v_target public.assessment_targets%rowtype;
  v_method text;
  v_score numeric;
  v_percentile jsonb;
  v_device_kinds text[];
  v_excluded integer;
  v_rows private.assessment_calc_row[];
  v_metrics jsonb := '[]'::jsonb;
  v_pillars jsonb := '[]'::jsonb;
  v_pillar text;
begin
  select * into v_assessment from public.assessments a where a.id = p_assessment_id;
  if not found then
    return null;
  end if;

  for v_definition in
    select d.* from public.assessment_protocol_metrics pm
      join public.assessment_metric_definitions d on d.key = pm.metric_key and d.version = pm.metric_version
     where pm.protocol_key = v_assessment.protocol_key and pm.protocol_version = v_assessment.protocol_version
     order by pm.position
  loop
    v_source_key := coalesce(v_definition.derived_from, v_definition.key);
    select d.requires_device into v_requires_device from public.assessment_metric_definitions d
     where d.key = v_source_key order by d.version desc limit 1;
    v_statistic := case v_definition.aggregation when 'single' then 'rating' else v_definition.aggregation end;
    v_result_unit := case when v_definition.aggregation = 'rate' then 'percent' else v_definition.unit end;

    if not v_definition.per_pitch_type then
      v_groups := array['*'];
    else
      select coalesce(array_agg(p order by array_position(private.assessment_pitch_order(), p)), '{}')
        into v_groups
        from (select distinct r.pitch_type as p
                from public.assessment_observations o
                join public.assessment_repetitions r on r.id = o.repetition_id
               where o.assessment_id = p_assessment_id and o.metric_key = v_source_key and r.pitch_type is not null) pitches;
      if v_definition.aggregation = 'rate' or cardinality(v_groups) = 0 then
        v_groups := array['*'] || v_groups;
      end if;
    end if;

    foreach v_group in array v_groups loop
      v_pitch := nullif(v_group, '*');

      v_rows := array(
        select row(o.id, o.value, o.quality_state, o.evidence_category, o.entry_method, o.source_kind, o.device_kind,
                   private.assessment_normalize_device_label(o.device_label), o.reviewed_by is not null, o.updated_at,
                   o.value is not null and o.quality_state in ('not_reviewed', 'usable', 'limited')
                     and (o.repetition_id is null or r.status = 'valid'))::private.assessment_calc_row
          from public.assessment_observations o
          left join public.assessment_repetitions r on r.id = o.repetition_id
         where o.assessment_id = p_assessment_id and o.metric_key = v_source_key
           and (v_pitch is null or r.pitch_type = v_pitch));

      select count(*), count(*) filter (where g.eligible),
             count(distinct g.device_label) filter (where g.eligible),
             percentile_cont(0.5) within group (order by g.value) filter (where g.eligible),
             max(g.value) filter (where g.eligible),
             stddev_samp(g.value) filter (where g.eligible),
             avg(g.value) filter (where g.eligible),
             100.0 * count(*) filter (where g.eligible and g.value = 1) / nullif(count(*) filter (where g.eligible), 0),
             bool_or(g.quality_state = 'unable_to_assess')
        into v_total, v_eligible, v_devices, v_median, v_max, v_sd, v_avg, v_rate, v_any_unable
        from unnest(v_rows) g;

      v_value := null;
      v_peak := null;
      if v_definition.aggregation = 'single' then
        v_chosen := null;
        select g.id, g.value into v_chosen, v_value
          from unnest(v_rows) g where g.eligible
         order by (g.source_kind = 'development_coach') desc, g.updated_at desc, g.id
         limit 1;
        v_used := case when v_chosen is null then '{}'::uuid[] else array[v_chosen] end;
        v_status := case when v_total = 0 then 'not_collected'
                         when v_chosen is not null then 'ok'
                         when v_any_unable then 'unable_to_assess'
                         else 'insufficient' end;
        v_excluded := v_total - v_eligible;
        if v_chosen is not null then v_eligible := 1; else v_eligible := 0; end if;
      else
        select coalesce(array_agg(g.id order by g.id), '{}') into v_used from unnest(v_rows) g where g.eligible;
        if v_total = 0 then
          v_status := 'not_collected';
        elsif v_requires_device and v_devices > 1 then
          v_status := 'mixed_devices';
        else
          v_value := case v_definition.aggregation
                       when 'median' then round(v_median::numeric, 3)
                       when 'rate' then round(v_rate, 3)
                       when 'sd' then round(v_sd, 3)
                       when 'cv' then case when v_avg > 0 and v_sd is not null then round(100 * v_sd / v_avg, 3) end
                     end;
          v_peak := case when v_definition.has_peak then round(v_max, 3) end;
          v_status := case when v_eligible >= v_definition.min_valid_count and v_value is not null then 'ok' else 'insufficient' end;
        end if;
        v_excluded := v_total - v_eligible;
      end if;

      -- Scoring: rubric, coach target, or descriptive.
      v_method := 'descriptive';
      v_score := null;
      v_target := null;
      if v_definition.scoring = 'rubric' then
        v_method := 'rubric';
        if v_status = 'ok' then v_score := 25 * (v_value - 1); end if;
      elsif v_definition.scoring = 'targetable' then
        select * into v_target from public.assessment_targets t
         where t.athlete_id = v_assessment.athlete_id and t.metric_key = v_definition.key
           and t.pitch_type is not distinct from v_pitch and t.retired_at is null;
        if v_target.id is not null then
          v_method := 'target';
          if v_status = 'ok' then
            v_score := private.assessment_target_score(v_value, v_target.kind, v_target.value_a, v_target.value_b, v_target.value_c);
          end if;
        end if;
      end if;

      select coalesce(array_agg(distinct g.device_kind order by g.device_kind) filter (where g.device_kind is not null), '{}')
        into v_device_kinds from unnest(v_rows) g where g.id = any (v_used);
      v_percentile := case when v_definition.scoring <> 'rubric' and v_status = 'ok'
                           then private.assessment_percentile(v_assessment, v_definition, v_statistic, v_result_unit,
                                                              v_pitch, v_device_kinds, v_value) end;

      v_metrics := v_metrics || jsonb_build_array(jsonb_build_object(
        'metric_key', v_definition.key,
        'metric_version', v_definition.version,
        'pillar', v_definition.pillar,
        'pitch_type', v_pitch,
        'status', v_status,
        'statistic', v_statistic,
        'value', case when v_status = 'mixed_devices' then null else v_value end,
        'peak', case when v_status = 'mixed_devices' then null else v_peak end,
        'valid_count', v_eligible,
        'excluded_count', v_excluded,
        'min_count', v_definition.min_valid_count,
        'evidence', case
          when v_definition.derived_from is not null then
            case when v_total > 0 then '["derived_calculation"]'::jsonb else '[]'::jsonb end
          else (select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
                  from (select distinct g.evidence_category e from unnest(v_rows) g where g.id = any (v_used)) s) end,
        'input_evidence', case
          when v_definition.derived_from is null then '[]'::jsonb
          else (select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
                  from (select distinct g.evidence_category e from unnest(v_rows) g where g.id = any (v_used)) s) end,
        'entry_methods', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
                            from (select distinct g.entry_method e from unnest(v_rows) g where g.id = any (v_used)) s),
        'source_kinds', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
                           from (select distinct g.source_kind e from unnest(v_rows) g where g.id = any (v_used)) s),
        'device_kinds', to_jsonb(v_device_kinds),
        'devices', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
                      from (select distinct g.device_label e from unnest(v_rows) g
                             where g.id = any (v_used) and g.device_label is not null) s),
        'reviewed_count', (select count(*) from unnest(v_rows) g where g.id = any (v_used) and g.reviewed),
        'limited_count', (select count(*) from unnest(v_rows) g where g.id = any (v_used) and g.quality_state = 'limited'),
        'method', v_method,
        'score', round(v_score, 1),
        'target', case when v_target.id is null then null else jsonb_build_object(
          'id', v_target.id, 'kind', v_target.kind, 'value_a', v_target.value_a, 'value_b', v_target.value_b,
          'value_c', v_target.value_c, 'source', v_target.source) end,
        'percentile', v_percentile,
        'inputs', (select coalesce(jsonb_agg(u::text order by u), '[]'::jsonb) from unnest(v_used) u)));
    end loop;
  end loop;

  -- Pillars, in the discipline's order.
  foreach v_pillar in array case v_assessment.discipline
      when 'hitting' then array['load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output']
      else array['lower_body_delivery', 'movement_timing', 'arm_delivery', 'pitch_performance'] end
  loop
    v_pillars := v_pillars || jsonb_build_array((
      with pm as (
        select pm.metric_key, pm.required, pm.weight, pm.position
          from public.assessment_protocol_metrics pm
          join public.assessment_metric_definitions d on d.key = pm.metric_key and d.version = pm.metric_version
         where pm.protocol_key = v_assessment.protocol_key and pm.protocol_version = v_assessment.protocol_version
           and d.pillar = v_pillar
      ),
      rows as (
        select m ->> 'metric_key' as metric_key, m ->> 'pitch_type' as pitch_type, m ->> 'status' as status,
               (m ->> 'score')::numeric as score, m -> 'evidence' as evidence, m -> 'source_kinds' as source_kinds
          from jsonb_array_elements(v_metrics) m
      ),
      per_metric as (
        select pm.metric_key, pm.required, pm.weight, pm.position,
               coalesce(
                 (select r.score from rows r where r.metric_key = pm.metric_key and r.pitch_type is null and r.score is not null),
                 (select round(avg(r.score), 1) from rows r where r.metric_key = pm.metric_key and r.pitch_type is not null and r.score is not null)
               ) as contribution,
               bool_or(r.status = 'ok') as any_ok,
               bool_or(r.status = 'mixed_devices') as any_mixed,
               bool_or(r.status = 'insufficient') as any_insufficient,
               bool_or(r.status = 'unable_to_assess') as any_unable,
               bool_or(r.status <> 'not_collected') as any_data
          from pm left join rows r on r.metric_key = pm.metric_key
         group by pm.metric_key, pm.required, pm.weight, pm.position
      ),
      summary as (
        select
          coalesce(bool_or(p.any_data), false) as any_data,
          coalesce(jsonb_agg(p.metric_key order by p.position) filter (where p.required), '[]'::jsonb) as required,
          coalesce(jsonb_agg(p.metric_key order by p.position) filter (where p.required and not coalesce(p.any_ok, false)), '[]'::jsonb) as missing,
          coalesce(jsonb_agg(jsonb_build_object(
            'metric_key', p.metric_key, 'weight', p.weight, 'score', p.contribution,
            'evidence', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb) from (
               select distinct jsonb_array_elements_text(r.evidence) e from rows r
                where r.metric_key = p.metric_key and r.score is not null) s),
            'source_kinds', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb) from (
               select distinct jsonb_array_elements_text(r.source_kinds) e from rows r
                where r.metric_key = p.metric_key and r.score is not null) s))
            order by p.position) filter (where p.contribution is not null), '[]'::jsonb) as included,
          coalesce(jsonb_agg(jsonb_build_object(
            'metric_key', p.metric_key,
            'reason', case when p.any_ok then 'not_scored' when p.any_mixed then 'mixed_devices'
                           when p.any_insufficient then 'insufficient' when p.any_unable then 'unable_to_assess'
                           else 'not_collected' end)
            order by p.position) filter (where p.contribution is null), '[]'::jsonb) as excluded,
          round(sum(p.contribution * p.weight) filter (where p.contribution is not null)
                / nullif(sum(p.weight) filter (where p.contribution is not null), 0), 1) as weighted
        from per_metric p
      )
      select jsonb_build_object(
        'pillar', v_pillar,
        'status', case when not s.any_data then 'no_data'
                       when jsonb_array_length(s.missing) > 0 then 'incomplete'
                       when jsonb_array_length(s.included) = 0 then 'descriptive'
                       else 'complete' end,
        'score', case when s.any_data and jsonb_array_length(s.missing) = 0 and jsonb_array_length(s.included) > 0
                      then s.weighted end,
        'required', s.required,
        'missing_required', s.missing,
        'included', s.included,
        'excluded', s.excluded)
      from summary s));
  end loop;

  return jsonb_build_object('calculation_version', 'calc-v1', 'metrics', v_metrics, 'pillars', v_pillars);
end;
$$;

create function private.assessment_snapshot(p_assessment_id uuid, p_review jsonb) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with results as (select private.assessment_results(p_assessment_id) as r)
  select jsonb_build_object(
    'schema', 'assessment-report-v1',
    'assessment', jsonb_build_object(
      'id', a.id,
      'athlete_id', a.athlete_id,
      'athlete_name', p.display_name,
      'discipline', a.discipline,
      'mode', a.mode,
      'protocol_key', a.protocol_key,
      'protocol_version', a.protocol_version,
      'assessment_date', a.assessment_date,
      'age_band', a.age_band,
      'competition_level', a.competition_level,
      'bats', a.bats,
      'throws', a.throws,
      'drill_type', a.drill_type,
      'equipment', a.equipment,
      'bat_details', a.bat_details,
      'camera_views', to_jsonb(a.camera_views),
      'environment', a.environment,
      'surface', a.surface,
      'capture_limitations', a.capture_limitations,
      'notes', a.notes,
      'rep_goal', a.rep_goal,
      'repetitions', jsonb_build_object(
        'total', (select count(*) from public.assessment_repetitions r where r.assessment_id = a.id),
        'valid', (select count(*) from public.assessment_repetitions r where r.assessment_id = a.id and r.status = 'valid'),
        'excluded', (select count(*) from public.assessment_repetitions r where r.assessment_id = a.id and r.status = 'excluded'),
        'by_pitch_type', (select coalesce(jsonb_agg(jsonb_build_object('pitch_type', t.pitch_type, 'valid', t.n)
                                                    order by array_position(private.assessment_pitch_order(), t.pitch_type)), '[]'::jsonb)
                            from (select r.pitch_type, count(*) as n from public.assessment_repetitions r
                                   where r.assessment_id = a.id and r.status = 'valid' and r.pitch_type is not null
                                   group by r.pitch_type) t)),
      'baseline_assessment_id', a.baseline_assessment_id,
      'reassessment_of_id', a.reassessment_of_id,
      'reassessment_due_on', a.reassessment_due_on),
    'review', p_review,
    'results', results.r,
    'clips', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'camera_view', m.camera_view,
                                                           'timing_basis', m.timing_basis) order by m.created_at, m.id), '[]'::jsonb)
                from public.assessment_media m where m.assessment_id = a.id and m.status = 'uploaded'),
    'benchmarks_available', exists (select 1 from jsonb_array_elements(results.r -> 'metrics') m
                                     where jsonb_typeof(m -> 'percentile') = 'object'))
  from public.assessments a
  join public.profiles p on p.id = a.athlete_id
  cross join results
  where a.id = p_assessment_id
$$;

revoke all on function private.assessment_pitch_order() from public;
revoke all on function private.assessment_percentile(public.assessments, public.assessment_metric_definitions, text, text, text, text[], numeric) from public;
revoke all on function private.assessment_results(uuid) from public;
revoke all on type private.assessment_calc_row from public;
revoke all on function private.assessment_snapshot(uuid, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Report revisions (frozen)
-- -----------------------------------------------------------------------------
create table public.assessment_report_revisions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  revision smallint not null constraint assessment_report_revisions_revision check (revision >= 1),
  status text not null default 'current' constraint assessment_report_revisions_status check (status in ('current', 'superseded')),
  review_kind text not null constraint assessment_report_revisions_review_kind check (review_kind in ('self_assessed', 'coach_reviewed')),
  reviewer_id uuid references auth.users (id) on delete set null,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  note text constraint assessment_report_revisions_note check (char_length(note) <= 500),
  discipline text not null,
  protocol_key text not null,
  protocol_version smallint not null,
  calculation_version text not null,
  snapshot jsonb not null,
  superseded_at timestamptz,
  unique (assessment_id, revision),
  constraint assessment_report_revisions_coach_has_reviewer check (review_kind = 'self_assessed' or reviewer_id is not null)
);
comment on table public.assessment_report_revisions is
  'Frozen published reports. The snapshot is never changed; a correction is a new revision.';
create unique index assessment_report_revisions_one_current on public.assessment_report_revisions (assessment_id) where status = 'current';
create index assessment_report_revisions_athlete_idx on public.assessment_report_revisions (athlete_id, published_at desc);

alter table public.assessments
  add column current_revision_id uuid references public.assessment_report_revisions (id) on delete set null,
  add column last_reopen_reason text constraint assessments_reopen_reason_length check (char_length(last_reopen_reason) <= 300);

create function private.protect_report_revision() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.snapshot is distinct from old.snapshot or new.assessment_id <> old.assessment_id
     or new.athlete_id <> old.athlete_id or new.revision <> old.revision or new.review_kind <> old.review_kind
     or new.reviewer_id is distinct from old.reviewer_id or new.published_at <> old.published_at
     or new.calculation_version <> old.calculation_version
     or (old.status = 'superseded' and new.status <> 'superseded') then
    raise exception 'published report revisions cannot be changed' using errcode = 'BR002';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_report_revision() from public;
create trigger assessment_report_revisions_frozen
  before update on public.assessment_report_revisions
  for each row execute function private.protect_report_revision();

create trigger assessment_report_revisions_audit
  after insert or update of status or delete on public.assessment_report_revisions
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'revision', 'review_kind');

alter table public.assessment_report_revisions enable row level security;
revoke all on table public.assessment_report_revisions from anon, authenticated, service_role;
grant select on table public.assessment_report_revisions to authenticated;

-- People who work on the athlete's assessments see every revision. A verified
-- college coach the athlete shared reports with sees current revisions only.
create policy assessment_report_revisions_read on public.assessment_report_revisions for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id)
         or (status = 'current' and private.coach_can_view((select auth.uid()), athlete_id, 'coach_assessment_reports')));

-- -----------------------------------------------------------------------------
-- Preview, publish, reopen, baseline and reassessment
-- -----------------------------------------------------------------------------
create function public.preview_assessment_report(p_assessment_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_athlete uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select a.athlete_id into v_athlete from public.assessments a where a.id = p_assessment_id;
  if v_athlete is null or not private.can_work_on_assessments(v_uid, v_athlete) then
    raise exception 'assessment not found' using errcode = 'BR003';
  end if;
  return private.assessment_snapshot(p_assessment_id, null);
end;
$$;

create function public.publish_assessment(p_assessment_id uuid, p_note text default null) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_coach boolean;
  v_kind text;
  v_revision integer;
  v_name text;
  v_review jsonb;
  v_snapshot jsonb;
  v_id uuid;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'the note is longer than 500 characters' using errcode = 'BR003';
  end if;
  if not exists (select 1 from public.assessment_observations o where o.assessment_id = p_assessment_id and o.value is not null) then
    raise exception 'record at least one value before publishing' using errcode = 'BR004';
  end if;
  v_coach := private.assessment_relation(v_uid, v_row.athlete_id) = 'development_coach';
  v_kind := case when v_coach then 'coach_reviewed' else 'self_assessed' end;
  select coalesce(max(r.revision), 0) + 1 into v_revision
    from public.assessment_report_revisions r where r.assessment_id = p_assessment_id;
  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  v_review := jsonb_build_object(
    'kind', v_kind,
    'reviewer_id', case when v_coach then v_uid end,
    'reviewer_name', case when v_coach then v_name end,
    'published_by', v_uid,
    'published_by_name', v_name,
    'published_at', now(),
    'revision', v_revision,
    'note', nullif(btrim(p_note), ''));
  v_snapshot := private.assessment_snapshot(p_assessment_id, v_review);

  update public.assessment_report_revisions r
     set status = 'superseded', superseded_at = now()
   where r.assessment_id = p_assessment_id and r.status = 'current';
  insert into public.assessment_report_revisions
    (assessment_id, athlete_id, revision, review_kind, reviewer_id, published_by, note, discipline, protocol_key,
     protocol_version, calculation_version, snapshot)
  values
    (p_assessment_id, v_row.athlete_id, v_revision, v_kind, case when v_coach then v_uid end, v_uid,
     nullif(btrim(p_note), ''), v_row.discipline, v_row.protocol_key, v_row.protocol_version,
     v_snapshot -> 'results' ->> 'calculation_version', v_snapshot)
  returning id into v_id;

  update public.assessments a
     set status = 'published', current_revision_id = v_id,
         reviewed_by = case when v_coach then v_uid else a.reviewed_by end,
         reviewed_at = case when v_coach then now() else a.reviewed_at end
   where a.id = p_assessment_id;
  return v_id;
end;
$$;

-- Opens a published assessment for corrections. The published report stays
-- visible as it was until a new revision is published.
create function public.reopen_assessment(p_assessment_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  v_row := private.assessment_for_work(p_assessment_id, false);
  if v_row.status <> 'published' then
    raise exception 'only published assessments need reopening' using errcode = 'BR004';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'say what needs correcting (3 to 300 characters)' using errcode = 'BR003';
  end if;
  update public.assessments a
     set status = 'draft', reviewed_by = null, reviewed_at = null, last_reopen_reason = v_reason
   where a.id = p_assessment_id;
end;
$$;

create function public.set_assessment_baseline(p_assessment_id uuid, p_baseline_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
begin
  v_row := private.assessment_for_work(p_assessment_id, false);
  if p_baseline_id is not null and not exists (
       select 1 from public.assessments b
        where b.id = p_baseline_id and b.id <> v_row.id and b.athlete_id = v_row.athlete_id
          and b.discipline = v_row.discipline and b.current_revision_id is not null) then
    raise exception 'choose a published assessment of the same athlete and discipline' using errcode = 'BR003';
  end if;
  update public.assessments a set baseline_assessment_id = p_baseline_id where a.id = p_assessment_id;
end;
$$;

create function public.set_reassessment_date(p_assessment_id uuid, p_due_on date) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
begin
  v_row := private.assessment_for_work(p_assessment_id, false);
  if p_due_on is not null and (p_due_on < v_row.assessment_date or p_due_on > v_row.assessment_date + interval '2 years') then
    raise exception 'choose a date after the assessment and within two years' using errcode = 'BR003';
  end if;
  update public.assessments a set reassessment_due_on = p_due_on where a.id = p_assessment_id;
end;
$$;

-- A new draft with the previous assessment's protocol and capture settings —
-- never its measurements, ratings, clips or results.
create function public.create_reassessment(p_previous_id uuid, p_assessment_date date) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_previous public.assessments%rowtype;
  v_id uuid;
begin
  v_previous := private.assessment_for_work(p_previous_id, false);
  if v_previous.current_revision_id is null then
    raise exception 'publish this assessment before creating its reassessment' using errcode = 'BR004';
  end if;
  if not exists (select 1 from public.assessment_protocols p
                  where p.key = v_previous.protocol_key and p.version = v_previous.protocol_version and p.active) then
    raise exception 'this protocol version has been retired; start a new assessment instead' using errcode = 'BR004';
  end if;
  if p_assessment_date is null or p_assessment_date > private.today_utc() + 1
     or p_assessment_date < v_previous.assessment_date then
    raise exception 'choose a date on or after the previous assessment and not in the future' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessments a
       where a.athlete_id = v_previous.athlete_id and a.status <> 'published') >= 30 then
    raise exception 'too many unfinished assessments; publish or delete some first' using errcode = 'BR005';
  end if;
  insert into public.assessments (
    athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date, age_band,
    competition_level, bats, throws, drill_type, equipment, bat_details, camera_views, environment, surface,
    rep_goal, baseline_assessment_id, reassessment_of_id, created_by)
  values (
    v_previous.athlete_id, v_previous.discipline, v_previous.mode, v_previous.protocol_key, v_previous.protocol_version,
    p_assessment_date, private.assessment_age_band(v_previous.athlete_id, p_assessment_date),
    v_previous.competition_level, v_previous.bats, v_previous.throws, v_previous.drill_type, v_previous.equipment,
    v_previous.bat_details, v_previous.camera_views, v_previous.environment, v_previous.surface,
    v_previous.rep_goal, v_previous.id, v_previous.id, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Published reports shared with the signed-in verified college coach.
create function public.shared_assessment_reports()
returns table (
  revision_id uuid,
  assessment_id uuid,
  athlete_id uuid,
  athlete_name text,
  discipline text,
  assessment_date date,
  review_kind text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.assessment_id, r.athlete_id, p.display_name, r.discipline,
         (r.snapshot -> 'assessment' ->> 'assessment_date')::date, r.review_kind, r.published_at
    from public.assessment_report_revisions r
    join public.profiles p on p.id = r.athlete_id
   where r.status = 'current'
     and private.coach_can_view((select auth.uid()), r.athlete_id, 'coach_assessment_reports')
   order by r.published_at desc
$$;

-- -----------------------------------------------------------------------------
-- Benchmark administration (admin only)
-- -----------------------------------------------------------------------------
create function public.admin_create_benchmark_release(p_release jsonb) returns uuid
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
  insert into public.assessment_benchmark_releases (
    metric_key, metric_version, protocol_key, protocol_version, unit, statistic, pitch_type, age_band,
    competition_level, device_kind, source, usage_rights, collected_from, collected_to, cohort_description,
    aggregation_note, dataset_version, is_synthetic, repetition_count, note, created_by)
  values (
    v_definition.key, v_definition.version, p_release ->> 'protocol_key', (p_release ->> 'protocol_version')::smallint,
    p_release ->> 'unit', p_release ->> 'statistic', nullif(p_release ->> 'pitch_type', ''),
    nullif(p_release ->> 'age_band', ''), nullif(p_release ->> 'competition_level', ''),
    nullif(p_release ->> 'device_kind', ''), p_release ->> 'source', p_release ->> 'usage_rights',
    (p_release ->> 'collected_from')::date, (p_release ->> 'collected_to')::date, p_release ->> 'cohort_description',
    p_release ->> 'aggregation_note', p_release ->> 'dataset_version',
    coalesce((p_release ->> 'is_synthetic')::boolean, false), (p_release ->> 'repetition_count')::integer,
    nullif(p_release ->> 'note', ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Values for a draft release: one value per distinct subject (athlete).
create function public.admin_add_benchmark_values(p_release_id uuid, p_values jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.assessment_benchmark_releases%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_added integer;
begin
  perform private.require_admin();
  select * into v_release from public.assessment_benchmark_releases r where r.id = p_release_id for update;
  if not found or v_release.status <> 'draft' then
    raise exception 'values can only be added to a draft release' using errcode = 'BR004';
  end if;
  select * into v_definition from public.assessment_metric_definitions d
   where d.key = v_release.metric_key and d.version = v_release.metric_version;
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) not between 1 and 20000 then
    raise exception 'send between 1 and 20,000 values' using errcode = 'BR003';
  end if;
  if exists (select 1 from jsonb_array_elements(p_values) e
              where jsonb_typeof(e -> 'value') <> 'number' or char_length(coalesce(e ->> 'subject_key', '')) not between 1 and 64
                 or (v_release.statistic in ('median') and v_definition.min_value is not null and (e ->> 'value')::numeric < v_definition.min_value)
                 or (v_release.statistic in ('median') and v_definition.max_value is not null and (e ->> 'value')::numeric > v_definition.max_value)) then
    raise exception 'every value needs a subject key and a number in the metric''s range' using errcode = 'BR003';
  end if;
  insert into public.assessment_benchmark_values (release_id, subject_key, value)
  select p_release_id, e ->> 'subject_key', (e ->> 'value')::numeric from jsonb_array_elements(p_values) e;
  get diagnostics v_added = row_count;
  update public.assessment_benchmark_releases r
     set distinct_athletes = (select count(*) from public.assessment_benchmark_values v where v.release_id = p_release_id)
   where r.id = p_release_id;
  return v_added;
end;
$$;

create function public.admin_set_benchmark_release_status(p_release_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_release public.assessment_benchmark_releases%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
begin
  select * into v_release from public.assessment_benchmark_releases r where r.id = p_release_id for update;
  if not found then
    raise exception 'release not found' using errcode = 'BR003';
  end if;
  select * into v_definition from public.assessment_metric_definitions d
   where d.key = v_release.metric_key and d.version = v_release.metric_version;
  if p_status = 'approved' then
    if v_release.status <> 'draft' then
      raise exception 'only draft releases can be approved' using errcode = 'BR004';
    end if;
    if v_release.is_synthetic then
      raise exception 'synthetic data can never be approved as a reference' using errcode = 'BR004';
    end if;
    if v_release.distinct_athletes < 30 then
      raise exception 'a reference needs at least 30 distinct athletes' using errcode = 'BR004';
    end if;
    if v_definition.requires_device and v_release.device_kind is null then
      raise exception 'say which kind of device produced the reference values' using errcode = 'BR004';
    end if;
    update public.assessment_benchmark_releases r
       set status = 'approved', approved_by = v_uid, approved_at = now(), note = coalesce(nullif(btrim(p_note), ''), r.note)
     where r.id = p_release_id;
  elsif p_status = 'retired' then
    update public.assessment_benchmark_releases r
       set status = 'retired', retired_at = now(), note = coalesce(nullif(btrim(p_note), ''), r.note)
     where r.id = p_release_id;
  else
    raise exception 'a release can be approved or retired' using errcode = 'BR003';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.preview_assessment_report(uuid) from public, anon, authenticated, service_role;
revoke all on function public.publish_assessment(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.reopen_assessment(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.set_assessment_baseline(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_reassessment_date(uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.create_reassessment(uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.shared_assessment_reports() from public, anon, authenticated, service_role;
revoke all on function public.admin_create_benchmark_release(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_add_benchmark_values(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_benchmark_release_status(uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.preview_assessment_report(uuid) to authenticated;
grant execute on function public.publish_assessment(uuid, text) to authenticated;
grant execute on function public.reopen_assessment(uuid, text) to authenticated;
grant execute on function public.set_assessment_baseline(uuid, uuid) to authenticated;
grant execute on function public.set_reassessment_date(uuid, date) to authenticated;
grant execute on function public.create_reassessment(uuid, date) to authenticated;
grant execute on function public.shared_assessment_reports() to authenticated;
grant execute on function public.admin_create_benchmark_release(jsonb) to authenticated;
grant execute on function public.admin_add_benchmark_values(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_benchmark_release_status(uuid, text, text) to authenticated;
