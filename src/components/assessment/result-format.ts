import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import type { MetricResult } from '@/lib/assessment/results';
import { rubricFormula, targetFormula, targetFromStored } from '@/lib/assessment/scoring';
import type { CanonicalUnit } from '@/lib/assessment/types';
import { formatValue } from '@/lib/assessment/units';
import { SITE_TIME_ZONE, displayTimeZone, parseStoredDate } from '@/lib/time';

/** Display helpers shared by report, preview, progress and sample pages. */

export function resultUnit(result: Pick<MetricResult, 'metric_key' | 'statistic'>): CanonicalUnit {
  if (result.statistic === 'rate') return 'percent';
  return requireMetric(result.metric_key).unit;
}

export function metricLabel(result: Pick<MetricResult, 'metric_key' | 'pitch_type'>): string {
  const definition = requireMetric(result.metric_key);
  if (result.pitch_type) return `${definition.name} — ${PITCH_TYPE_LABELS[result.pitch_type]}`;
  return definition.perPitchType ? `${definition.name} — all pitches` : definition.name;
}

export const STATISTIC_LABELS: Readonly<Record<MetricResult['statistic'], string>> = {
  rating: 'Rating',
  median: 'Typical (median)',
  rate: 'Rate',
  sd: 'Standard deviation',
  cv: 'Coefficient of variation',
};

export function valueText(result: MetricResult): string {
  if (result.status === 'not_collected') return 'Not collected';
  if (result.status === 'unable_to_assess') return 'Unable to assess';
  if (result.status === 'mixed_devices') return 'Not combined';
  if (result.value === null) return 'Not enough data';
  return formatValue(result.value, resultUnit(result), result.statistic === 'rate' ? 0 : 1);
}

export function scoreText(score: number | null): string {
  if (score === null) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** The formula with this result's numbers, for "How this was scored". */
export function formulaText(result: MetricResult): string | null {
  if (result.score === null || result.value === null) return null;
  if (result.method === 'rubric') return `Rubric score = ${rubricFormula(result.value)}`;
  if (result.method === 'target' && result.target) {
    return `Target attainment = ${targetFormula(result.value, targetFromStored(result.target))} = ${scoreText(result.score)}`;
  }
  return null;
}

export function targetText(result: MetricResult): string | null {
  const target = result.target;
  if (!target) return null;
  const unit = resultUnit(result);
  const value = (number: number) => formatValue(number, unit);
  switch (target.kind) {
    case 'higher_is_better':
      return `Higher is better: ${value(target.value_a)} scores 0, ${value(target.value_b)} or more scores 100 (${target.source})`;
    case 'lower_is_better':
      return `Lower is better: ${value(target.value_a)} or less scores 100, ${value(target.value_b)} scores 0 (${target.source})`;
    case 'target_range':
      return `Target range ${value(target.value_a)}–${value(target.value_b)}, falling to 0 over ${value(target.value_c ?? 0)} outside it (${target.source})`;
  }
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const date = parseStoredDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: displayTimeZone(iso) }).format(date);
}

/** "EDT" or "EST" for the moment given. */
function easternZoneLabel(date: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TIME_ZONE, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? 'ET';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // "Oct 25, 2026, 11:06 PM EDT"
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: SITE_TIME_ZONE }).format(date) + ' ' + easternZoneLabel(date);
}
