/**
 * The fictional sample report shown to visitors. Every name and number here
 * is invented to demonstrate the report layout; it is computed by the same
 * engine as real reports but is never stored, never mixed with real
 * assessments and never used as a benchmark.
 */

import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { computeAssessmentResults, type EngineObservation, type EngineTarget } from '@/lib/assessment/engine';
import type { ReportSnapshot } from '@/lib/assessment/snapshot';
import { SNAPSHOT_SCHEMA, type QualityState, type SourceKind } from '@/lib/assessment/types';

export const SAMPLE_ATHLETE_NAME = 'Sample Athlete (fictional)';

let sequence = 0;
const id = (prefix: string) => `sample-${prefix}-${String((sequence += 1)).padStart(3, '0')}`;
const AT = '2026-11-02T17:00:00.000Z';

function rating(key: string, value: number | null, source: SourceKind = 'development_coach'): EngineObservation {
  const quality: QualityState = value === null ? 'unable_to_assess' : 'usable';
  return {
    id: id('obs'),
    metric_key: key,
    repetition_id: null,
    pitch_type: null,
    repetition_status: null,
    value,
    quality_state: quality,
    evidence_category: 'observation',
    entry_method: 'manual_entry',
    source_kind: source,
    device_kind: null,
    device_label: null,
    reviewed: source === 'development_coach',
    updated_at: AT,
  };
}

function rep(key: string, repetition: number, value: number, extra: Partial<EngineObservation> = {}): EngineObservation {
  return {
    id: id('obs'),
    metric_key: key,
    repetition_id: `sample-rep-${String(repetition).padStart(2, '0')}`,
    pitch_type: null,
    repetition_status: 'valid',
    value,
    quality_state: 'usable',
    evidence_category: 'sensor_measurement',
    entry_method: 'file_import',
    source_kind: 'development_coach',
    device_kind: 'radar',
    device_label: 'Example radar',
    reviewed: true,
    updated_at: AT,
    ...extra,
  };
}

function buildSample(): ReportSnapshot {
  sequence = 0;
  const protocol = requireProtocol('hitting-instrumented', 1);
  const exitVelocities = [71.2, 74.8, 69.5, 76.1, 73.0, 72.4, 75.3, 70.8];
  const intervals = [212, 198, 225, 205, 231, 214];
  const solid = [1, 1, 0, 1, 0, 1, 1, 0];
  const observations: EngineObservation[] = [
    rating('hit_load_repeatability', 3),
    rating('hit_drill_preparation', 4),
    rating('hit_contact_location_consistency', 2),
    rating('hit_barrel_delivery_consistency', 3),
    rating('hit_stride_direction_repeatability', 4),
    rating('hit_balance_through_swing', 5),
    rating('hit_lower_body_consistency', null),
    rating('hit_lower_body_consistency', 3, 'self'),
    ...exitVelocities.map((value, index) => rep('hit_exit_velocity_mph', index + 1, value)),
    ...intervals.map((value, index) =>
      rep('hit_fc_to_contact_ms', index + 1, value, {
        evidence_category: 'video_estimate',
        entry_method: 'in_app_review',
        device_kind: null,
        device_label: null,
      }),
    ),
    ...solid.map((value, index) =>
      rep('hit_solid_contact', index + 1, value, {
        evidence_category: 'observation',
        entry_method: 'manual_entry',
        device_kind: null,
        device_label: null,
      }),
    ),
  ];
  const targets: EngineTarget[] = [
    { id: 'sample-target-ev', metric_key: 'hit_exit_velocity_mph', pitch_type: null, kind: 'higher_is_better', value_a: 65, value_b: 80, value_c: null, source: 'Fictional coach goal for this block' },
    { id: 'sample-target-solid', metric_key: 'hit_solid_contact', pitch_type: null, kind: 'higher_is_better', value_a: 30, value_b: 80, value_c: null, source: 'Fictional coach goal for this block' },
  ];
  const results = computeAssessmentResults({ protocol, observations, targets, references: [] });
  return {
    schema: SNAPSHOT_SCHEMA,
    fictional: true,
    assessment: {
      id: 'sample',
      athlete_id: 'sample',
      athlete_name: SAMPLE_ATHLETE_NAME,
      discipline: 'hitting',
      mode: 'instrumented',
      protocol_key: protocol.key,
      protocol_version: protocol.version,
      assessment_date: '2026-11-02',
      age_band: '15_16',
      competition_level: 'high_school',
      bats: 'right',
      throws: 'right',
      drill_type: 'front_toss',
      equipment: 'L-screen, game baseballs',
      bat_details: '32 in, −10',
      camera_views: ['side_facing', 'front_on'],
      environment: 'indoor',
      surface: 'Turf cage',
      capture_limitations: 'Front-view clip is slightly dark; the hips are hard to see on two swings.',
      notes: 'Intended contact point: middle-in, slightly out in front.',
      rep_goal: 10,
      repetitions: { total: 9, valid: 8, excluded: 1, by_pitch_type: [] },
      baseline_assessment_id: null,
      reassessment_of_id: null,
      reassessment_due_on: '2026-12-14',
    },
    review: {
      kind: 'coach_reviewed',
      reviewer_id: 'sample-coach',
      reviewer_name: 'Sample Coach (fictional)',
      published_by: 'sample-coach',
      published_by_name: 'Sample Coach (fictional)',
      published_at: '2026-11-02T18:30:00.000Z',
      revision: 1,
      note: null,
    },
    results,
    clips: [
      { id: 'sample-clip-1', label: 'Front toss, side view', camera_view: 'side_facing', timing_basis: 'real_time' },
      { id: 'sample-clip-2', label: 'Front toss, front view', camera_view: 'front_on', timing_basis: 'slow_motion' },
    ],
    benchmarks_available: false,
  };
}

/** Built once per server process; it never touches the database. */
export const SAMPLE_REPORT: ReportSnapshot = buildSample();
