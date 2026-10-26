/**
 * Which results from two reports can be compared, and what changed in how
 * they were captured. Raw values are compared only when the metric
 * definition, statistic, protocol, evidence, observer and device match;
 * scores additionally need the same calculation version, method and target
 * (or reference release). Capture differences are flagged, never hidden.
 *
 * A change between assessments is a description, not proof that training
 * caused it.
 */

import { CAMERA_VIEW_LABELS, COMPETITION_LEVEL_LABELS, DRILL_TYPE_LABELS, AGE_BAND_LABELS } from '@/lib/assessment/catalog/context';
import type { MetricResult } from '@/lib/assessment/results';
import type { ReportSnapshot } from '@/lib/assessment/snapshot';
import type { PitchType } from '@/lib/assessment/types';
import { round1, round3 } from '@/lib/assessment/units';

export interface ComparisonRow {
  readonly metricKey: string;
  readonly pitchType: PitchType | null;
  readonly previous: MetricResult | null;
  readonly current: MetricResult | null;
  /** Raw values can be compared. */
  readonly comparable: boolean;
  readonly reasons: readonly string[];
  readonly valueChange: number | null;
  readonly scoreComparable: boolean;
  readonly scoreReasons: readonly string[];
  readonly scoreChange: number | null;
}

export interface ContextDifference {
  readonly field: string;
  readonly previous: string;
  readonly current: string;
}

export interface SnapshotComparison {
  readonly sameDiscipline: boolean;
  readonly rows: readonly ComparisonRow[];
  readonly contextDifferences: readonly ContextDifference[];
  readonly warnings: readonly string[];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

function rowKey(result: Pick<MetricResult, 'metric_key' | 'pitch_type'>): string {
  return `${result.metric_key}:${result.pitch_type ?? ''}`;
}

export function compareResults(
  previous: MetricResult | null,
  current: MetricResult | null,
  context: { readonly sameProtocol: boolean; readonly sameCalculation: boolean },
): Omit<ComparisonRow, 'metricKey' | 'pitchType' | 'previous' | 'current'> {
  const reasons: string[] = [];
  if (!previous || !current) {
    reasons.push(previous ? 'Not part of the current assessment.' : 'Not part of the earlier assessment.');
  } else {
    if (previous.metric_version !== current.metric_version) reasons.push('The metric definition changed between versions.');
    if (previous.statistic !== current.statistic) reasons.push('Summarized with a different statistic.');
    if (!context.sameProtocol) reasons.push('Captured with a different protocol.');
    if (previous.status !== 'ok' || current.status !== 'ok') reasons.push('One of the assessments lacks enough valid evidence.');
    if (!sameSet(previous.evidence, current.evidence) || !sameSet(previous.input_evidence, current.input_evidence)) {
      reasons.push('Collected with different kinds of evidence.');
    }
    if (
      (previous.evidence.includes('observation') || current.evidence.includes('observation')) &&
      !sameSet(previous.source_kinds, current.source_kinds)
    ) {
      reasons.push('Observed by different people (self-assessed and coach observations are not compared).');
    }
    if ((previous.devices.length > 0 || current.devices.length > 0) && !sameSet(previous.devices, current.devices)) {
      reasons.push('Measured with different devices.');
    }
  }
  const comparable = reasons.length === 0;
  const scoreReasons: string[] = [];
  if (comparable && previous && current) {
    if (!context.sameCalculation) scoreReasons.push('Scored with a different calculation version.');
    if (previous.method !== current.method) scoreReasons.push('Scored by a different method.');
    if (previous.score === null || current.score === null) scoreReasons.push('Not scored in both assessments.');
    if (previous.method === 'target' && current.method === 'target') {
      const a = previous.target;
      const b = current.target;
      if (!a || !b || a.kind !== b.kind || a.value_a !== b.value_a || a.value_b !== b.value_b || a.value_c !== b.value_c) {
        scoreReasons.push('The coach target changed, so scores are not compared.');
      }
    }
  }
  const scoreComparable = comparable && scoreReasons.length === 0;
  return {
    comparable,
    reasons,
    valueChange:
      comparable && previous?.value != null && current?.value != null ? round3(current.value - previous.value) : null,
    scoreComparable,
    scoreReasons,
    scoreChange: scoreComparable && previous?.score != null && current?.score != null ? round1(current.score - previous.score) : null,
  };
}

function text(value: string | number | null | undefined | readonly string[]): string {
  if (Array.isArray(value)) return value.length > 0 ? [...value].sort().join(', ') : 'Not recorded';
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return String(value);
}

export function compareSnapshots(previous: ReportSnapshot, current: ReportSnapshot): SnapshotComparison {
  const a = previous.assessment;
  const b = current.assessment;
  const sameDiscipline = a.discipline === b.discipline;
  const sameProtocol = a.protocol_key === b.protocol_key && a.protocol_version === b.protocol_version;
  const sameCalculation = previous.results.calculation_version === current.results.calculation_version;

  const previousRows = new Map(previous.results.metrics.map((row) => [rowKey(row), row]));
  const currentRows = new Map(current.results.metrics.map((row) => [rowKey(row), row]));
  const keys = [...new Set([...currentRows.keys(), ...previousRows.keys()])];
  const rows: ComparisonRow[] = sameDiscipline
    ? keys.map((key) => {
        const before = previousRows.get(key) ?? null;
        const after = currentRows.get(key) ?? null;
        const sample = (after ?? before) as MetricResult;
        return {
          metricKey: sample.metric_key,
          pitchType: sample.pitch_type,
          previous: before,
          current: after,
          ...compareResults(before, after, { sameProtocol, sameCalculation }),
        };
      })
    : [];

  const differences: ContextDifference[] = [];
  const check = (field: string, before: string, after: string) => {
    if (before !== after) differences.push({ field, previous: before, current: after });
  };
  check('Protocol', `${a.protocol_key} v${a.protocol_version}`, `${b.protocol_key} v${b.protocol_version}`);
  check('Drill type', text(a.drill_type ? DRILL_TYPE_LABELS[a.drill_type] : null), text(b.drill_type ? DRILL_TYPE_LABELS[b.drill_type] : null));
  check(
    'Camera views',
    text(a.camera_views.map((view) => CAMERA_VIEW_LABELS[view])),
    text(b.camera_views.map((view) => CAMERA_VIEW_LABELS[view])),
  );
  check('Environment', text(a.environment), text(b.environment));
  check('Surface', text(a.surface), text(b.surface));
  check('Equipment', text(a.equipment), text(b.equipment));
  check('Bat', text(a.bat_details), text(b.bat_details));
  check(
    'Competition level',
    text(a.competition_level ? COMPETITION_LEVEL_LABELS[a.competition_level] : null),
    text(b.competition_level ? COMPETITION_LEVEL_LABELS[b.competition_level] : null),
  );
  check('Age band', AGE_BAND_LABELS[a.age_band], AGE_BAND_LABELS[b.age_band]);
  check('Valid repetitions', String(a.repetitions.valid), String(b.repetitions.valid));

  const warnings: string[] = [];
  if (!sameDiscipline) warnings.push('These assessments are for different disciplines and cannot be compared.');
  if (!sameCalculation) warnings.push('The reports were calculated with different versions; scores are not compared.');
  if (previous.review?.kind !== current.review?.kind) {
    warnings.push('One report is self-assessed and the other is coach-reviewed.');
  }
  warnings.push('A change between assessments describes what was recorded. It does not prove that training caused it.');
  return { sameDiscipline, rows, contextDifferences: differences, warnings };
}
