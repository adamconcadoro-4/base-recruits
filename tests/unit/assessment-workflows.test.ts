import { describe, expect, it } from 'vitest';

import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { compareResults, compareSnapshots } from '@/lib/assessment/compatibility';
import { CSV_FIELDS, exampleCsv, missingRequiredFields, parseCsv, suggestMapping, validateRows } from '@/lib/assessment/csv';
import { evidenceLabel } from '@/lib/assessment/labels';
import { findingsFrom, strengthsFrom, suggestPlan } from '@/lib/assessment/recommendations';
import type { MetricResult } from '@/lib/assessment/results';
import { SAMPLE_REPORT } from '@/lib/assessment/sample';
import { parseSnapshot, type ReportSnapshot } from '@/lib/assessment/snapshot';

const hittingKeys = requireProtocol('hitting-instrumented', 1).metrics.map((item) => item.key);
const pitchingKeys = requireProtocol('pitching-instrumented', 1).metrics.map((item) => item.key);
const ASSESSMENT = '11111111-2222-3333-4444-555555555555';

describe('CSV import', () => {
  it('parses quoted cells, CRLF line endings and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('suggests a column mapping from common header names', () => {
    const mapping = suggestMapping(['Rep #', 'Metric', 'Reading', 'Units', 'Evidence', 'Device Type', 'Device']);
    expect(mapping).toEqual({ rep: 0, metric: 1, value: 2, unit: 3, acquisition: 4, device_kind: 5, device: 6 });
    expect(missingRequiredFields(mapping)).toEqual([]);
    expect(missingRequiredFields({ rep: 0 })).toEqual(['metric', 'value', 'unit', 'acquisition']);
  });

  it('accepts the documented example files', () => {
    for (const [discipline, keys] of [['hitting', hittingKeys], ['pitching', pitchingKeys]] as const) {
      const [header, ...rows] = parseCsv(exampleCsv(discipline));
      expect(header).toEqual([...CSV_FIELDS]);
      const outcome = validateRows(rows, suggestMapping(header ?? []), { assessmentId: ASSESSMENT, discipline, metricKeys: keys });
      expect(outcome.rejected).toEqual([]);
      expect(outcome.accepted).toHaveLength(3);
    }
  });

  it('converts units and keeps the original value', () => {
    const [header, ...rows] = parseCsv(exampleCsv('hitting'));
    const outcome = validateRows(rows, suggestMapping(header ?? []), { assessmentId: ASSESSMENT, discipline: 'hitting', metricKeys: hittingKeys });
    const kmh = outcome.accepted.find((item) => item.unit === 'km/h');
    expect(kmh?.value).toBe(126.1);
    expect(kmh?.canonical_value).toBe(78.355);
  });

  it('reports row-level errors in plain language', () => {
    const header = [...CSV_FIELDS];
    const rows = [
      ['other-assessment', '1', 'hitting', '', 'hit_exit_velocity_mph', '80', 'mph', 'sensor_measurement', 'radar', 'R', ''],
      ['', '0', 'hitting', '', 'hit_exit_velocity_mph', '80', 'mph', 'sensor_measurement', 'radar', 'R', ''],
      ['', '2', 'hitting', '', 'hit_load_repeatability', '4', 'rating', 'observation', '', '', ''],
      ['', '3', 'hitting', '', 'hit_exit_velocity_mph', '80', 'rpm', 'sensor_measurement', 'radar', 'R', ''],
      ['', '4', 'hitting', '', 'hit_exit_velocity_mph', '80', 'mph', 'sensor_measurement', '', '', ''],
      ['', '5', 'hitting', '', 'hit_exit_velocity_mph', '300', 'mph', 'sensor_measurement', 'radar', 'R', ''],
      ['', '6', 'pitching', '', 'hit_exit_velocity_mph', '80', 'mph', 'sensor_measurement', 'radar', 'R', ''],
      ['', '7', 'hitting', '', 'hit_timing_variation_ms', '12', 'ms', 'video_estimate', '', '', ''],
      ['', '8', 'hitting', '', 'hit_exit_velocity_mph', '80', 'mph', 'video_estimate', 'radar', 'R', ''],
      ['', '9', 'hitting', '', 'hit_solid_contact', 'maybe', 'yes_no', 'observation', '', '', ''],
    ];
    const outcome = validateRows(rows, suggestMapping(header), { assessmentId: ASSESSMENT, discipline: 'hitting', metricKeys: hittingKeys });
    expect(outcome.accepted).toEqual([]);
    const reasons = outcome.rejected.map((item) => item.reasons.join(' '));
    expect(reasons[0]).toMatch(/assessment reference does not match/);
    expect(reasons[1]).toMatch(/whole number from 1 to 500/);
    expect(reasons[2]).toMatch(/Rubric ratings are entered in the app/);
    expect(reasons[3]).toMatch(/not an accepted unit/);
    expect(reasons[4]).toMatch(/device kind and a device name/);
    expect(reasons[5]).toMatch(/outside the valid range/);
    expect(reasons[6]).toMatch(/discipline must be hitting/);
    expect(reasons[7]).toMatch(/Derived values/);
    expect(reasons[8]).toMatch(/evidence is not accepted/);
    expect(reasons[9]).toMatch(/yes or no/);
    expect(outcome.rejected.map((item) => item.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('flags duplicate rows and conflicting values for the same repetition', () => {
    const header = [...CSV_FIELDS];
    const line = ['', '1', 'hitting', '', 'hit_exit_velocity_mph', '80', 'mph', 'sensor_measurement', 'radar', 'R', ''];
    const conflict = ['', '1', 'hitting', '', 'hit_exit_velocity_mph', '81', 'mph', 'sensor_measurement', 'radar', 'R', ''];
    const outcome = validateRows([line, line, conflict], suggestMapping(header), {
      assessmentId: ASSESSMENT,
      discipline: 'hitting',
      metricKeys: hittingKeys,
    });
    expect(outcome.duplicateRows).toBe(1);
    expect(outcome.accepted).toEqual([]);
    expect(outcome.rejected.map((item) => item.reasons[0])).toEqual([
      'Repetition 1 has more than one exit velocity value in this file.',
      'Duplicate of row 2.',
      'Repetition 1 has more than one exit velocity value in this file.',
    ]);
  });

  it('requires a pitch type for pitch-type metrics', () => {
    const header = [...CSV_FIELDS];
    const outcome = validateRows(
      [['', '1', 'pitching', '', 'pit_velocity_mph', '80', 'mph', 'sensor_measurement', 'radar', 'R', '']],
      suggestMapping(header),
      { assessmentId: ASSESSMENT, discipline: 'pitching', metricKeys: pitchingKeys },
    );
    expect(outcome.rejected[0]?.reasons).toContain('This metric needs a pitch type.');
  });
});

describe('development priorities and drills', () => {
  const metrics = SAMPLE_REPORT.results.metrics;

  it('finds priorities only in scored results with enough evidence', () => {
    const findings = findingsFrom(metrics);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.metricKey).toBe('hit_contact_location_consistency');
    expect(findings[0]?.severity).toBe('priority');
    for (const finding of findings) {
      const result = metrics.find((item) => item.metric_key === finding.metricKey);
      expect(result?.status).toBe('ok');
    }
  });

  it('suggests at most three focus areas, spread across pillars, with reasons and a progress check', () => {
    const plan = suggestPlan('hitting', metrics);
    expect(plan.focus.length).toBeLessThanOrEqual(3);
    expect(new Set(plan.focus.map((item) => item.pillar)).size).toBe(plan.focus.length);
    expect(plan.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of plan.suggestions) {
      expect(suggestion.drill.discipline).toBe('hitting');
      expect(suggestion.drill.findings).toContain(suggestion.finding.metricKey);
      expect(suggestion.reason).toMatch(/^Suggested because /);
      expect(suggestion.evaluation.length).toBeGreaterThan(10);
    }
  });

  it('puts the coach’s named priorities first and skips drills needing missing equipment', () => {
    const plan = suggestPlan('hitting', metrics, { priorityMetrics: ['hit_load_repeatability'], available: { partner: false } });
    expect(plan.focus[0]?.metricKey).toBe('hit_load_repeatability');
    expect(plan.suggestions.some((item) => item.drill.requires.includes('partner'))).toBe(false);
  });

  it('lists evidence-supported strengths', () => {
    expect(strengthsFrom(metrics).map((item) => item.metric_key)).toContain('hit_balance_through_swing');
  });
});

describe('progress comparisons', () => {
  const base = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_exit_velocity_mph') as MetricResult;

  it('compares raw values and scores only when everything matches', () => {
    const later: MetricResult = { ...base, value: (base.value ?? 0) + 2, score: (base.score ?? 0) + 10 };
    const comparison = compareResults(base, later, { sameProtocol: true, sameCalculation: true });
    expect(comparison.comparable).toBe(true);
    expect(comparison.valueChange).toBe(2);
    expect(comparison.scoreComparable).toBe(true);
  });

  it('refuses to compare values from different devices or observers', () => {
    const otherDevice: MetricResult = { ...base, devices: ['another radar'] };
    expect(compareResults(base, otherDevice, { sameProtocol: true, sameCalculation: true }).reasons).toContain(
      'Measured with different devices.',
    );
    const rating = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_load_repeatability') as MetricResult;
    const selfRated: MetricResult = { ...rating, source_kinds: ['self'] };
    expect(compareResults(rating, selfRated, { sameProtocol: true, sameCalculation: true }).comparable).toBe(false);
  });

  it('compares raw values but not scores when the coach target changed', () => {
    const retargeted: MetricResult = { ...base, target: base.target ? { ...base.target, value_b: 85 } : null };
    const comparison = compareResults(base, retargeted, { sameProtocol: true, sameCalculation: true });
    expect(comparison.comparable).toBe(true);
    expect(comparison.scoreComparable).toBe(false);
  });

  it('flags capture differences and never claims causation', () => {
    const later: ReportSnapshot = {
      ...SAMPLE_REPORT,
      assessment: { ...SAMPLE_REPORT.assessment, drill_type: 'tee', environment: 'outdoor' },
    };
    const comparison = compareSnapshots(SAMPLE_REPORT, later);
    expect(comparison.contextDifferences.map((item) => item.field)).toEqual(['Drill type', 'Environment']);
    expect(comparison.warnings.join(' ')).toMatch(/does not prove that training caused it/);
  });
});

describe('snapshots and labels', () => {
  it('accepts a v1 snapshot and rejects anything else', () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(SAMPLE_REPORT)))).not.toBeNull();
    expect(parseSnapshot({ schema: 'something-else' })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });

  it('says who observed a result and how a sensor value was entered', () => {
    const rating = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_load_repeatability') as MetricResult;
    expect(evidenceLabel(rating)).toBe('Coach observation');
    const self = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_lower_body_consistency') as MetricResult;
    expect(evidenceLabel(self)).toBe('Self-assessed observation');
    const missing = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_bat_speed_mph') as MetricResult;
    expect(evidenceLabel(missing)).toBe('Unavailable');
    expect(evidenceLabel({ evidence: ['sensor_measurement'], source_kinds: ['self'], entry_methods: ['manual_entry'], status: 'ok' })).toBe(
      'Sensor measurement (entered by hand)',
    );
  });
});
