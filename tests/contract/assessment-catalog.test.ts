/**
 * Contract tests for Base Recruits Assessment: the TypeScript catalog, value
 * lists, unit conversions, target scoring and the whole results calculation
 * must match the database exactly. Runs when DATABASE_URL points at a migrated
 * database (`npm run test:contract`); skipped otherwise. Every row these tests
 * create is inside a transaction that is rolled back.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  AGE_BANDS,
  BATTING_SIDES,
  CAMERA_VIEWS,
  COMPETITION_LEVELS,
  DRILL_TYPES,
  ENVIRONMENTS,
  THROWING_HANDS,
  VIDEO_MIME_TYPES,
} from '@/lib/assessment/catalog/context';
import { DEVICE_MODELS, deviceModelFor } from '@/lib/assessment/catalog/devices';
import { DRILLS } from '@/lib/assessment/catalog/drills';
import { SHOWCASE_MEASURES, SHOWCASE_SOURCES } from '@/lib/assessment/catalog/showcase';
import { HITTING_EVENTS, METRIC_LIST, PITCHING_EVENTS } from '@/lib/assessment/catalog/metrics';
import { PROTOCOLS, requireProtocol } from '@/lib/assessment/catalog/protocols';
import { computeAssessmentResults, type EngineObservation, type EngineTarget } from '@/lib/assessment/engine';
import { targetScore, targetFromStored } from '@/lib/assessment/scoring';
import {
  ASSESSMENT_MODES,
  ASSESSMENT_STATUSES,
  DEVICE_KINDS,
  ENTRY_METHODS,
  EVIDENCE_CATEGORIES,
  MEDIA_STATUSES,
  PITCH_TYPES,
  PLAN_APPROVALS,
  PLAN_STATUSES,
  QUALITY_STATES,
  REVIEW_KINDS,
  REVISION_STATUSES,
  SOURCE_KINDS,
  TARGET_KINDS,
  TIMING_BASES,
  type EntryMethod,
  type EvidenceCategory,
  type PitchType,
  type QualityState,
  type SourceKind,
  type TargetKind,
} from '@/lib/assessment/types';
import { convertToCanonical } from '@/lib/assessment/units';

const DATABASE_URL = process.env.DATABASE_URL;
const PSQL = process.env.PSQL ?? 'psql';

function rows<T>(sql: string): T[] {
  const output = execFileSync(
    PSQL,
    [DATABASE_URL ?? '', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as T[];
}

/** Runs setup statements and one final query in a transaction that is rolled back. */
function rolledBack(setup: string, finalQuery: string): unknown {
  const script = `\\set ON_ERROR_STOP 1\nbegin;\n\\o /dev/null\n${setup}\n\\o\nselect (${finalQuery})::text;\nrollback;\n`;
  const output = execFileSync(PSQL, [DATABASE_URL ?? '', '-X', '-q', '-At', '-f', '-'], { input: script, encoding: 'utf8' });
  return JSON.parse(output.trim());
}

/** The quoted values in a CHECK constraint, sorted. */
function checkValues(constraint: string): string[] {
  const [row] = rows<{ def: string }>(`select pg_get_constraintdef(c.oid) as def from pg_constraint c where c.conname = '${constraint}'`);
  if (!row) throw new Error(`constraint ${constraint} not found`);
  return [...row.def.matchAll(/'([^']+)'::text/g)].map((match) => match[1] as string).sort();
}

const sorted = (values: readonly string[]) => [...values].sort();
const sqlText = (value: string | null) => (value === null ? 'null' : `'${value.replace(/'/g, "''")}'`);
const sqlNumber = (value: number | null) => (value === null ? 'null' : String(value));

describe.skipIf(!DATABASE_URL)('assessment catalog: database and TypeScript agree', () => {
  it('metric definitions', () => {
    const db = rows<Record<string, unknown>>(
      `select key, version, discipline, pillar, name, value_kind, granularity, unit, evidence, derived_from, derivation,
              min_value::float8 as min_value, max_value::float8 as max_value, integer_only, aggregation, has_peak,
              min_valid_count, directionality, scoring, target_kinds, per_pitch_type, requires_device, marker_start, marker_end
         from public.assessment_metric_definitions where active order by key`,
    );
    const ts = [...METRIC_LIST]
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((item) => ({
        key: item.key,
        version: item.version,
        discipline: item.discipline,
        pillar: item.pillar,
        name: item.name,
        value_kind: item.valueKind,
        granularity: item.granularity,
        unit: item.unit,
        evidence: [...item.evidence],
        derived_from: item.derived?.from ?? null,
        derivation: item.derived?.calculation ?? null,
        min_value: item.min,
        max_value: item.max,
        integer_only: item.integerOnly,
        aggregation: item.aggregation,
        has_peak: item.hasPeak,
        min_valid_count: item.minValidCount,
        directionality: item.directionality,
        scoring: item.scoring,
        target_kinds: [...item.targetKinds],
        per_pitch_type: item.perPitchType,
        requires_device: item.requiresDevice,
        marker_start: item.markers?.start ?? null,
        marker_end: item.markers?.end ?? null,
      }));
    expect(db).toEqual(ts);
  });

  it('protocols and their metrics', () => {
    const protocols = rows<Record<string, unknown>>(
      'select key, version, discipline, mode, title, default_rep_goal from public.assessment_protocols order by key, version',
    );
    expect(protocols).toEqual(
      [...PROTOCOLS]
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .map((item) => ({ key: item.key, version: item.version, discipline: item.discipline, mode: item.mode, title: item.title, default_rep_goal: item.defaultRepGoal })),
    );
    const metrics = rows<Record<string, unknown>>(
      `select protocol_key, protocol_version, metric_key, metric_version, required, weight::float8 as weight, position
         from public.assessment_protocol_metrics order by protocol_key, protocol_version, position`,
    );
    expect(metrics).toEqual(
      [...PROTOCOLS]
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .flatMap((item) =>
          item.metrics.map((entry, index) => ({
            protocol_key: item.key,
            protocol_version: item.version,
            metric_key: entry.key,
            metric_version: entry.version,
            required: entry.required,
            weight: entry.weight,
            position: index + 1,
          })),
        ),
    );
  });

  it('drill library', () => {
    const db = rows<Record<string, unknown>>('select key, version, discipline, pillars, name, active from public.assessment_drills order by key');
    expect(db).toEqual(
      [...DRILLS]
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .map((item) => ({
          key: item.key,
          version: item.version,
          discipline: item.discipline,
          pillars: [...item.pillars],
          name: item.name,
          active: !item.replacedBy,
        })),
    );
  });

  it('value lists', () => {
    const cases: Array<[string, readonly string[]]> = [
      ['assessments_competition_level', COMPETITION_LEVELS],
      ['assessments_bats', BATTING_SIDES],
      ['assessments_throws', THROWING_HANDS],
      ['assessments_drill_type', DRILL_TYPES],
      ['assessments_camera_views', CAMERA_VIEWS],
      ['assessments_environment', ENVIRONMENTS],
      ['assessments_age_band', AGE_BANDS],
      ['assessments_status', ASSESSMENT_STATUSES],
      ['assessments_mode', ASSESSMENT_MODES],
      ['assessment_repetitions_pitch_type', PITCH_TYPES],
      ['assessment_observations_evidence', EVIDENCE_CATEGORIES],
      ['assessment_observations_entry_method', ENTRY_METHODS],
      ['assessment_observations_source', SOURCE_KINDS],
      ['assessment_observations_quality', QUALITY_STATES],
      ['assessment_observations_device_kind', DEVICE_KINDS],
      ['assessment_observations_device_model', DEVICE_MODELS],
      ['assessment_benchmark_releases_device_model', DEVICE_MODELS],
      ['athlete_showcase_results_measure', SHOWCASE_MEASURES.map((item) => item.key)],
      ['athlete_showcase_results_source', SHOWCASE_SOURCES],
      ['assessment_media_mime', VIDEO_MIME_TYPES],
      ['assessment_media_timing_basis', TIMING_BASES],
      ['assessment_media_status', MEDIA_STATUSES],
      ['assessment_annotations_event_type', [...new Set([...HITTING_EVENTS, ...PITCHING_EVENTS])]],
      ['assessment_targets_kind', TARGET_KINDS],
      ['assessment_report_revisions_review_kind', REVIEW_KINDS],
      ['assessment_report_revisions_status', REVISION_STATUSES],
      ['assessment_training_plans_status', PLAN_STATUSES],
      ['assessment_training_plans_approval', PLAN_APPROVALS],
    ];
    for (const [constraint, values] of cases) {
      expect({ constraint, values: checkValues(constraint) }).toEqual({ constraint, values: sorted(values) });
    }
  });

  it('device models', () => {
    const cases: Array<[string, string]> = [
      ['ball_tracking', 'Rapsodo'],
      ['ball_tracking', 'Rapsodo Hitting 2.0'],
      ['ball_tracking', 'TrackMan'],
      ['ball_tracking', 'Trackman B1'],
      ['bat_sensor', 'Blast Motion'],
      ['bat_sensor', 'blast'],
      ['bat_sensor', 'Diamond Kinetics'],
      ['bat_sensor', 'DK SwingTracker'],
      ['bat_sensor', 'dk'],
      ['bat_sensor', 'Darkhorse'],
      ['radar', 'Rapsodo'],
      ['ball_tracking', 'Blast Motion'],
      ['radar', 'Pocket radar'],
      ['other', 'TrackMan'],
    ];
    const db = rows<{ m: string | null }>(
      cases.map(([kind, label]) => `select private.assessment_device_model('${kind}', '${label}') as m`).join(' union all '),
    ).map((row) => row.m);
    expect(db).toEqual(cases.map(([kind, label]) => deviceModelFor(kind, label)));
  });

  it('unit conversions', () => {
    const cases: Array<[number, string, 'mph' | 'ms' | 'in' | 'deg' | 'rpm']> = [
      [100, 'km/h', 'mph'],
      [126.1, 'KPH', 'mph'],
      [30, 'm/s', 'mph'],
      [0.215, 's', 'ms'],
      [25.4, 'cm', 'in'],
      [12.5, 'degrees', 'deg'],
      [0, 'deg', 'deg'],
      [2250, 'rpm', 'rpm'],
      [80, 'rpm', 'mph'],
      [80, 'furlongs', 'mph'],
    ];
    const db = rows<{ v: number | null }>(
      cases.map(([value, unit, canonical]) => `select private.assessment_convert_unit(${value}, '${unit}', '${canonical}')::float8 as v`).join(' union all '),
    ).map((row) => row.v);
    expect(db).toEqual(cases.map(([value, unit, canonical]) => convertToCanonical(value, unit, canonical)));
  });

  it('target attainment', () => {
    const cases: Array<[number, TargetKind, number, number, number | null]> = [
      [70, 'higher_is_better', 60, 80, null],
      [95, 'higher_is_better', 60, 80, null],
      [61.37, 'higher_is_better', 60, 85, null],
      [20, 'lower_is_better', 10, 30, null],
      [12.3, 'lower_is_better', 5, 40, null],
      [15, 'target_range', 10, 20, 10],
      [27.5, 'target_range', 10, 20, 10],
      [-3, 'target_range', 0, 20, 7],
    ];
    const db = rows<{ v: number }>(
      cases.map(([value, kind, a, b, c]) => `select private.assessment_target_score(${value}, '${kind}', ${a}, ${b}, ${sqlNumber(c)})::float8 as v`).join(' union all '),
    ).map((row) => row.v);
    expect(db).toEqual(cases.map(([value, kind, a, b, c]) => targetScore(value, targetFromStored({ kind, value_a: a, value_b: b, value_c: c }))));
  });
});

// ------------------------------------------------------------------ results engine parity

interface FixtureRep {
  readonly seq: number;
  readonly pitch: PitchType | null;
  readonly excluded?: boolean;
}

interface FixtureObservation {
  readonly metric: string;
  readonly rep: number | null;
  readonly value: number | null;
  readonly evidence: EvidenceCategory;
  readonly entry?: EntryMethod;
  readonly source?: SourceKind;
  readonly quality?: QualityState;
  readonly device?: readonly ['radar' | 'ball_tracking' | 'bat_sensor', string];
  readonly reviewed?: boolean;
}

interface Fixture {
  readonly protocol: { readonly key: string; readonly version: number };
  readonly discipline: 'hitting' | 'pitching';
  readonly reps: readonly FixtureRep[];
  readonly observations: readonly FixtureObservation[];
  readonly targets: ReadonlyArray<{ readonly metric: string; readonly pitch: PitchType | null; readonly kind: TargetKind; readonly a: number; readonly b: number; readonly c: number | null }>;
}

const ATHLETE = '00000000-0000-4000-8000-00000000a001';
const ASSESSMENT = '00000000-0000-4000-8000-00000000b001';
const UPDATED_AT = '2026-11-02T17:00:00.000Z';
const uuid = (prefix: string, index: number) => `00000000-0000-4000-8000-${prefix}${String(index).padStart(12 - prefix.length, '0')}`;

function parity(fixture: Fixture) {
  const protocol = requireProtocol(fixture.protocol.key, fixture.protocol.version);
  const repId = (seq: number) => uuid('c', seq);
  const observations: EngineObservation[] = fixture.observations.map((item, index) => {
    const rep = item.rep === null ? null : fixture.reps.find((entry) => entry.seq === item.rep);
    const quality = item.quality ?? (item.value === null ? 'unable_to_assess' : 'usable');
    return {
      id: uuid('d', index + 1),
      metric_key: item.metric,
      repetition_id: rep ? repId(rep.seq) : null,
      pitch_type: rep?.pitch ?? null,
      repetition_status: rep ? (rep.excluded ? 'excluded' : 'valid') : null,
      value: item.value,
      quality_state: quality,
      evidence_category: item.evidence,
      entry_method: item.entry ?? 'manual_entry',
      source_kind: item.source ?? 'development_coach',
      device_kind: item.device?.[0] ?? null,
      device_label: item.device?.[1] ?? null,
      reviewed: item.reviewed ?? false,
      updated_at: UPDATED_AT,
    };
  });
  const targets: EngineTarget[] = fixture.targets.map((item, index) => ({
    id: uuid('e', index + 1),
    metric_key: item.metric,
    pitch_type: item.pitch,
    kind: item.kind,
    value_a: item.a,
    value_b: item.b,
    value_c: item.c,
    source: 'Contract test target',
  }));

  const setup = [
    `insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('${ATHLETE}', 'authenticated', 'authenticated', 'parity@example.test', now(), '{}', '{}', now(), now());`,
    `select private.provision_role('${ATHLETE}', 'athlete', null);`,
    `insert into public.assessments (id, athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date, age_band, rep_goal)
       values ('${ASSESSMENT}', '${ATHLETE}', '${fixture.discipline}', '${protocol.mode}', '${protocol.key}', ${protocol.version}, '2026-11-02', 'unknown', 10);`,
    ...fixture.reps.map(
      (rep) =>
        `insert into public.assessment_repetitions (id, assessment_id, seq, pitch_type, status, exclusion_reason)
           values ('${repId(rep.seq)}', '${ASSESSMENT}', ${rep.seq}, ${sqlText(rep.pitch)}, '${rep.excluded ? 'excluded' : 'valid'}', ${rep.excluded ? "'Fixture exclusion'" : 'null'});`,
    ),
    ...observations.map(
      (item) =>
        `insert into public.assessment_observations (id, assessment_id, repetition_id, metric_key, metric_version, value, unit, evidence_category,
           entry_method, source_kind, quality_state, quality_reason, device_kind, device_label, reviewed_by, created_at, updated_at)
         values ('${item.id}', '${ASSESSMENT}', ${sqlText(item.repetition_id)}, '${item.metric_key}', 1, ${sqlNumber(item.value)},
           (select unit from public.assessment_metric_definitions where key = '${item.metric_key}' and version = 1),
           '${item.evidence_category}', '${item.entry_method}', '${item.source_kind}', '${item.quality_state}',
           ${['limited', 'excluded', 'unable_to_assess'].includes(item.quality_state) ? "'Fixture reason'" : 'null'},
           ${sqlText(item.device_kind)}, ${sqlText(item.device_label)}, ${item.reviewed ? `'${ATHLETE}'` : 'null'},
           '${UPDATED_AT}', '${UPDATED_AT}');`,
    ),
    ...targets.map(
      (item) =>
        `insert into public.assessment_targets (id, athlete_id, metric_key, metric_version, pitch_type, kind, value_a, value_b, value_c, source)
           values ('${item.id}', '${ATHLETE}', '${item.metric_key}', 1, ${sqlText(item.pitch_type)}, '${item.kind}', ${item.value_a}, ${item.value_b},
                   ${sqlNumber(item.value_c)}, '${item.source}');`,
    ),
  ].join('\n');

  const database = rolledBack(setup, `private.assessment_results('${ASSESSMENT}')`);
  const typescript = JSON.parse(JSON.stringify(computeAssessmentResults({ protocol, observations, targets, references: [] })));
  return { database, typescript };
}

const rating = (metric: string, value: number | null, extra: Partial<FixtureObservation> = {}): FixtureObservation => ({
  metric,
  rep: null,
  value,
  evidence: 'observation',
  reviewed: true,
  ...extra,
});

const hittingFixture: Fixture = {
  protocol: { key: 'hitting-instrumented', version: 1 },
  discipline: 'hitting',
  reps: [1, 2, 3, 4, 5, 6, 7].map((seq) => ({ seq, pitch: null, excluded: seq === 7 })),
  observations: [
    rating('hit_load_repeatability', 4, { source: 'self', reviewed: false }),
    rating('hit_load_repeatability', 2),
    rating('hit_drill_preparation', 5),
    rating('hit_contact_location_consistency', 3),
    rating('hit_barrel_delivery_consistency', null, { quality: 'unable_to_assess' }),
    rating('hit_stride_direction_repeatability', 4, { quality: 'limited' }),
    rating('hit_balance_through_swing', 5, { quality: 'excluded' }),
    rating('hit_lower_body_consistency', 3, { source: 'self', reviewed: false, quality: 'not_reviewed' }),
    ...[72.4, 75.3, 70.1, 78.6, 74.2, 77.0, 99].map((value, index) => ({
      metric: 'hit_exit_velocity_mph',
      rep: index + 1,
      value,
      evidence: 'sensor_measurement' as const,
      entry: 'file_import' as const,
      device: ['radar', 'Radar  A'] as const,
      quality: (index === 5 ? 'excluded' : 'not_reviewed') as QualityState,
    })),
    ...[0, 4.5, -2, 0].map((value, index) => ({
      metric: 'hit_launch_angle_deg',
      rep: index + 1,
      value,
      evidence: 'sensor_measurement' as const,
      device: ['ball_tracking', 'Tracker'] as const,
    })),
    ...[61.2, 63.4, 64.0].map((value, index) => ({
      metric: 'hit_bat_speed_mph',
      rep: index + 1,
      value,
      evidence: 'sensor_measurement' as const,
      device: ['bat_sensor', index === 2 ? 'Sensor B' : 'Sensor A'] as const,
    })),
    ...[1, 1, 0, 1, 0, 1, 1].map((value, index) => ({
      metric: 'hit_solid_contact',
      rep: index + 1,
      value,
      evidence: 'observation' as const,
    })),
    ...[205, 214.5, 198, 231].map((value, index) => ({
      metric: 'hit_fc_to_contact_ms',
      rep: index + 1,
      value,
      evidence: 'video_estimate' as const,
      entry: 'in_app_review' as const,
    })),
  ],
  targets: [
    { metric: 'hit_exit_velocity_mph', pitch: null, kind: 'higher_is_better', a: 65, b: 85, c: null },
    { metric: 'hit_launch_angle_deg', pitch: null, kind: 'target_range', a: 5, b: 15, c: 10 },
    { metric: 'hit_solid_contact', pitch: null, kind: 'higher_is_better', a: 30, b: 80, c: null },
    { metric: 'hit_timing_variation_ms', pitch: null, kind: 'lower_is_better', a: 5, b: 40, c: null },
    { metric: 'hit_output_consistency_pct', pitch: null, kind: 'lower_is_better', a: 1, b: 10, c: null },
  ],
};

const pitchingFixture: Fixture = {
  protocol: { key: 'pitching-instrumented', version: 1 },
  discipline: 'pitching',
  reps: [
    ...[1, 2, 3, 4, 5, 6].map((seq) => ({ seq, pitch: 'four_seam' as const })),
    ...[7, 8, 9, 10].map((seq) => ({ seq, pitch: 'changeup' as const })),
    { seq: 11, pitch: 'slider' as const, excluded: true },
  ],
  observations: [
    rating('pit_stride_direction_repeatability', 3),
    rating('pit_delivery_balance', 4),
    rating('pit_landing_consistency', 4),
    rating('pit_delivery_event_repeatability', 2),
    rating('pit_arm_path_consistency', 5),
    rating('pit_event_position_repeatability', 3),
    rating('pit_release_consistency', 4, { source: 'self', reviewed: false }),
    ...[78.2, 79.0, 80.4, 77.9, 81.1, 79.6, 70.2, 71.0, 69.8, 70.5, 75].map((value, index) => ({
      metric: 'pit_velocity_mph',
      rep: index + 1,
      value,
      evidence: 'sensor_measurement' as const,
      device: ['radar', 'Radar'] as const,
    })),
    ...[1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1].map((value, index) => ({
      metric: 'pit_strike',
      rep: index + 1,
      value,
      evidence: 'observation' as const,
    })),
    ...[1, 0, 0, 1, 1, 0].map((value, index) => ({
      metric: 'pit_target_hit',
      rep: index + 1,
      value,
      evidence: 'observation' as const,
      source: 'self' as const,
    })),
    ...[2210, 2290].map((value, index) => ({
      metric: 'pit_spin_rate_rpm',
      rep: index + 1,
      value,
      evidence: 'sensor_measurement' as const,
      device: ['ball_tracking', 'Tracker'] as const,
    })),
    ...[150, 162, 158].map((value, index) => ({
      metric: 'pit_fc_to_release_ms',
      rep: index + 1,
      value,
      evidence: 'video_estimate' as const,
      entry: 'in_app_review' as const,
    })),
  ],
  targets: [
    { metric: 'pit_velocity_mph', pitch: 'four_seam', kind: 'higher_is_better', a: 70, b: 85, c: null },
    { metric: 'pit_velocity_mph', pitch: 'changeup', kind: 'higher_is_better', a: 60, b: 75, c: null },
    { metric: 'pit_strike', pitch: null, kind: 'higher_is_better', a: 40, b: 80, c: null },
    { metric: 'pit_target_hit', pitch: 'four_seam', kind: 'higher_is_better', a: 20, b: 70, c: null },
  ],
};

describe.skipIf(!DATABASE_URL)('assessment results: database and TypeScript engines agree', () => {
  it('on a hitting assessment with ratings, measured values, devices, exclusions and targets', () => {
    const { database, typescript } = parity(hittingFixture);
    expect(database).toEqual(typescript);
  });

  it('on a pitching assessment with pitch types, rates and per-pitch-type targets', () => {
    const { database, typescript } = parity(pitchingFixture);
    expect(database).toEqual(typescript);
  });
});
