import { describe, expect, it } from 'vitest';

import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { computeAssessmentResults, type EngineObservation, type EngineTarget } from '@/lib/assessment/engine';
import type { MetricResult } from '@/lib/assessment/results';
import { SAMPLE_REPORT } from '@/lib/assessment/sample';

let counter = 0;
function obs(metric_key: string, value: number | null, extra: Partial<EngineObservation> = {}): EngineObservation {
  counter += 1;
  return {
    id: `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`,
    metric_key,
    repetition_id: null,
    pitch_type: null,
    repetition_status: null,
    value,
    quality_state: value === null ? 'unable_to_assess' : 'usable',
    evidence_category: 'observation',
    entry_method: 'manual_entry',
    source_kind: 'development_coach',
    device_kind: null,
    device_label: null,
    reviewed: true,
    updated_at: '2026-11-01T12:00:00.000Z',
    ...extra,
  };
}

function reps(metric_key: string, values: readonly number[], extra: Partial<EngineObservation> = {}): EngineObservation[] {
  return values.map((value, index) =>
    obs(metric_key, value, {
      repetition_id: `rep-${index + 1}`,
      repetition_status: 'valid',
      evidence_category: 'sensor_measurement',
      device_kind: 'radar',
      device_label: 'Radar A',
      ...extra,
    }),
  );
}

const hittingVideo = requireProtocol('hitting-video', 1);
const pitchingInstrumented = requireProtocol('pitching-instrumented', 1);
const run = (observations: EngineObservation[], targets: EngineTarget[] = [], protocol = hittingVideo) =>
  computeAssessmentResults({ protocol, observations, targets, references: [] });
const row = (rows: readonly MetricResult[], key: string, pitch: string | null = null) =>
  rows.find((item) => item.metric_key === key && item.pitch_type === pitch) as MetricResult;

describe('metric results', () => {
  it('keeps uncollected metrics missing — no value, no score, evidence unavailable', () => {
    const results = run([]);
    const load = row(results.metrics, 'hit_load_repeatability');
    expect(load.status).toBe('not_collected');
    expect(load.value).toBeNull();
    expect(load.score).toBeNull();
    expect(load.evidence).toEqual([]);
    expect(results.pillars.every((pillar) => pillar.status === 'no_data' && pillar.score === null)).toBe(true);
  });

  it('treats "unable to assess" as missing, never as a low rating', () => {
    const results = run([obs('hit_load_repeatability', null)]);
    const load = row(results.metrics, 'hit_load_repeatability');
    expect(load.status).toBe('unable_to_assess');
    expect(load.value).toBeNull();
    expect(load.score).toBeNull();
    expect(load.excluded_count).toBe(1);
  });

  it('scores rubric ratings and prefers the coach’s rating over a self-assessment', () => {
    const results = run([
      obs('hit_load_repeatability', 4, { source_kind: 'self', reviewed: false, updated_at: '2026-11-02T00:00:00.000Z' }),
      obs('hit_load_repeatability', 2),
    ]);
    const load = row(results.metrics, 'hit_load_repeatability');
    expect(load.value).toBe(2);
    expect(load.score).toBe(25);
    expect(load.method).toBe('rubric');
    expect(load.source_kinds).toEqual(['development_coach']);
  });

  it('labels a self-assessed rating as self-assessed', () => {
    const results = run([obs('hit_balance_through_swing', 5, { source_kind: 'self', reviewed: false })]);
    expect(row(results.metrics, 'hit_balance_through_swing').source_kinds).toEqual(['self']);
  });

  it('keeps valid zeros', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const results = run(reps('hit_launch_angle_deg', [0, 0, 0, 5]), [], protocol);
    const launch = row(results.metrics, 'hit_launch_angle_deg');
    expect(launch.status).toBe('ok');
    expect(launch.value).toBe(0);
  });

  it('reports typical and peak separately and never swaps them', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const results = run(reps('hit_exit_velocity_mph', [70, 72, 90]), [], protocol);
    const ev = row(results.metrics, 'hit_exit_velocity_mph');
    expect(ev.value).toBe(72);
    expect(ev.peak).toBe(90);
    expect(ev.method).toBe('descriptive');
    expect(ev.score).toBeNull();
  });

  it('scores a measured value only against a coach target', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const targets: EngineTarget[] = [
      { id: 't1', metric_key: 'hit_exit_velocity_mph', pitch_type: null, kind: 'higher_is_better', value_a: 60, value_b: 80, value_c: null, source: 'Coach goal' },
    ];
    const ev = row(run(reps('hit_exit_velocity_mph', [70, 72, 74]), targets, protocol).metrics, 'hit_exit_velocity_mph');
    expect(ev.method).toBe('target');
    expect(ev.score).toBe(60);
    expect(ev.target?.id).toBe('t1');
  });

  it('needs the minimum number of valid repetitions before a value counts', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const ev = row(run(reps('hit_exit_velocity_mph', [70, 72]), [], protocol).metrics, 'hit_exit_velocity_mph');
    expect(ev.status).toBe('insufficient');
    expect(ev.valid_count).toBe(2);
    expect(ev.min_count).toBe(3);
  });

  it('leaves excluded repetitions and excluded observations out, and counts them', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const observations = [
      ...reps('hit_exit_velocity_mph', [70, 72, 74]),
      obs('hit_exit_velocity_mph', 99, { repetition_id: 'rep-9', repetition_status: 'excluded', evidence_category: 'sensor_measurement', device_kind: 'radar', device_label: 'Radar A' }),
      obs('hit_exit_velocity_mph', 98, { repetition_id: 'rep-8', repetition_status: 'valid', quality_state: 'excluded', evidence_category: 'sensor_measurement', device_kind: 'radar', device_label: 'Radar A' }),
    ];
    const ev = row(run(observations, [], protocol).metrics, 'hit_exit_velocity_mph');
    expect(ev.valid_count).toBe(3);
    expect(ev.excluded_count).toBe(2);
    expect(ev.peak).toBe(74);
  });

  it('never combines values from different devices', () => {
    const protocol = requireProtocol('hitting-instrumented', 1);
    const observations = [...reps('hit_bat_speed_mph', [60, 61]), ...reps('hit_bat_speed_mph', [70], { device_label: 'Sensor B' })];
    const bat = row(run(observations, [], protocol).metrics, 'hit_bat_speed_mph');
    expect(bat.status).toBe('mixed_devices');
    expect(bat.value).toBeNull();
    expect(bat.devices).toEqual(['radar a', 'sensor b']);
  });

  it('derives timing variation from eligible video estimates and records its inputs', () => {
    const intervals = reps('hit_fc_to_contact_ms', [200, 210, 220], {
      evidence_category: 'video_estimate',
      entry_method: 'in_app_review',
      device_kind: null,
      device_label: null,
    });
    const variation = row(run(intervals).metrics, 'hit_timing_variation_ms');
    expect(variation.status).toBe('ok');
    expect(variation.value).toBe(10);
    expect(variation.evidence).toEqual(['derived_calculation']);
    expect(variation.input_evidence).toEqual(['video_estimate']);
    expect(variation.inputs).toHaveLength(3);
  });

  it('keeps pitch types apart and adds an all-pitches row only for rates', () => {
    const observations = [
      ...reps('pit_velocity_mph', [80, 81, 82], { pitch_type: 'four_seam' }),
      ...reps('pit_velocity_mph', [70, 71, 72], { pitch_type: 'changeup' }),
      ...[1, 1, 0, 1, 1].map((value, index) =>
        obs('pit_strike', value, { repetition_id: `s-${index}`, repetition_status: 'valid', pitch_type: index < 3 ? 'four_seam' : 'changeup' }),
      ),
    ];
    const results = run(observations, [], pitchingInstrumented);
    const velocities = results.metrics.filter((item) => item.metric_key === 'pit_velocity_mph');
    expect(velocities.map((item) => item.pitch_type)).toEqual(['four_seam', 'changeup']);
    expect(row(results.metrics, 'pit_velocity_mph', 'four_seam').value).toBe(81);
    const strikes = results.metrics.filter((item) => item.metric_key === 'pit_strike');
    expect(strikes.map((item) => item.pitch_type)).toEqual([null, 'four_seam', 'changeup']);
    expect(row(results.metrics, 'pit_strike').value).toBe(80);
    expect(row(results.metrics, 'pit_strike').status).toBe('ok');
    expect(row(results.metrics, 'pit_strike', 'four_seam').status).toBe('insufficient');
  });
});

describe('pillar results', () => {
  const fullLoadTiming = [obs('hit_load_repeatability', 3), obs('hit_drill_preparation', 5)];

  it('shows a complete score when every required metric has evidence', () => {
    const loadTiming = run(fullLoadTiming).pillars.find((pillar) => pillar.pillar === 'load_timing');
    expect(loadTiming?.status).toBe('complete');
    expect(loadTiming?.score).toBe(75);
    expect(loadTiming?.included.map((item) => item.metric_key)).toEqual(['hit_load_repeatability', 'hit_drill_preparation']);
  });

  it('withholds the score when required evidence is missing', () => {
    const loadTiming = run([obs('hit_load_repeatability', 5)]).pillars.find((pillar) => pillar.pillar === 'load_timing');
    expect(loadTiming?.status).toBe('incomplete');
    expect(loadTiming?.score).toBeNull();
    expect(loadTiming?.missing_required).toEqual(['hit_drill_preparation']);
  });

  it('lists every excluded metric with its reason', () => {
    const loadTiming = run(fullLoadTiming).pillars.find((pillar) => pillar.pillar === 'load_timing');
    expect(loadTiming?.excluded).toEqual([
      { metric_key: 'hit_fc_to_contact_ms', reason: 'not_collected' },
      { metric_key: 'hit_timing_variation_ms', reason: 'not_collected' },
    ]);
  });

  it('describes but does not score a pillar whose evidence has no rubric or target', () => {
    const solid = [1, 0, 1, 1, 1].map((value, index) => obs('hit_solid_contact', value, { repetition_id: `r${index}`, repetition_status: 'valid' }));
    const impact = run(solid).pillars.find((pillar) => pillar.pillar === 'impact_output');
    expect(impact?.status).toBe('descriptive');
    expect(impact?.score).toBeNull();
  });

  it('builds the fictional sample report with the same engine', () => {
    expect(SAMPLE_REPORT.fictional).toBe(true);
    expect(SAMPLE_REPORT.results.pillars).toHaveLength(4);
    const impact = SAMPLE_REPORT.results.pillars.find((pillar) => pillar.pillar === 'impact_output');
    expect(impact?.status).toBe('complete');
    const lowerBody = SAMPLE_REPORT.results.pillars.find((pillar) => pillar.pillar === 'lower_body_contribution');
    expect(lowerBody?.status).toBe('complete');
    expect(row(SAMPLE_REPORT.results.metrics, 'hit_lower_body_consistency').source_kinds).toEqual(['self']);
  });
});
