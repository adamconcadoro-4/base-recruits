/**
 * Scoring formulas, calculation version calc-v1.
 *
 * The database computes the scores that go into published reports
 * (private.assessment_results); these functions are the same formulas in
 * TypeScript for previews, explanations and the fictional sample report. A
 * contract test checks that both produce identical results.
 *
 * Rules that never change between versions:
 *  - Missing values stay missing. Nothing uncollected becomes zero.
 *  - "Unable to assess" is missing, not a low rating.
 *  - A valid zero (for example, a 0° launch angle) is kept.
 */

import type { MetricDefinition } from '@/lib/assessment/catalog/metrics';
import type { TargetKind } from '@/lib/assessment/types';
import { round1 } from '@/lib/assessment/units';

/** Rubric score = 25 × (rating − 1). A rating of 1 scores 0; 5 scores 100. Not a percentile. */
export function rubricScore(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RangeError('A rubric rating must be a whole number from 1 to 5.');
  }
  return 25 * (rating - 1);
}

export type Target =
  | { readonly kind: 'higher_is_better'; readonly floor: number; readonly goal: number }
  | { readonly kind: 'lower_is_better'; readonly goal: number; readonly ceiling: number }
  | { readonly kind: 'target_range'; readonly low: number; readonly high: number; readonly tolerance: number };

/** Database storage for a target: three numbers whose meaning depends on the kind. */
export interface StoredTarget {
  readonly kind: TargetKind;
  readonly value_a: number;
  readonly value_b: number;
  readonly value_c: number | null;
}

export function targetFromStored(stored: StoredTarget): Target {
  switch (stored.kind) {
    case 'higher_is_better':
      return { kind: 'higher_is_better', floor: stored.value_a, goal: stored.value_b };
    case 'lower_is_better':
      return { kind: 'lower_is_better', goal: stored.value_a, ceiling: stored.value_b };
    case 'target_range':
      return { kind: 'target_range', low: stored.value_a, high: stored.value_b, tolerance: stored.value_c ?? Number.NaN };
  }
}

export function targetToStored(target: Target): StoredTarget {
  switch (target.kind) {
    case 'higher_is_better':
      return { kind: target.kind, value_a: target.floor, value_b: target.goal, value_c: null };
    case 'lower_is_better':
      return { kind: target.kind, value_a: target.goal, value_b: target.ceiling, value_c: null };
    case 'target_range':
      return { kind: target.kind, value_a: target.low, value_b: target.high, value_c: target.tolerance };
  }
}

/**
 * Problems with a coach-defined target for a metric, in plain language. An
 * empty list means the target can be saved. Mirrors set_assessment_target().
 */
export function targetProblems(target: Target, definition: MetricDefinition, source: string): string[] {
  const problems: string[] = [];
  if (definition.scoring !== 'targetable') problems.push('This metric is not scored against targets.');
  if (!definition.targetKinds.includes(target.kind)) problems.push('That kind of target does not fit this metric.');
  const trimmed = source.trim();
  if (trimmed.length < 3 || trimmed.length > 200) {
    problems.push('Say where the target comes from (3 to 200 characters), for example “Coach goal for spring”.');
  }
  const numbers = targetNumbers(target);
  if (numbers.some((value) => !Number.isFinite(value))) {
    problems.push('Enter every number for the target.');
    return problems;
  }
  const inRange = (value: number) =>
    (definition.min === null || value >= definition.min) && (definition.max === null || value <= definition.max);
  switch (target.kind) {
    case 'higher_is_better':
      if (!(target.floor < target.goal)) problems.push('The goal must be higher than the zero-score floor.');
      if (!inRange(target.floor) || !inRange(target.goal)) problems.push('Target values must be inside the metric’s valid range.');
      break;
    case 'lower_is_better':
      if (!(target.goal < target.ceiling)) problems.push('The goal must be lower than the zero-score ceiling.');
      if (target.goal < 0) problems.push('The goal cannot be negative.');
      if (!inRange(target.goal) || !inRange(target.ceiling)) problems.push('Target values must be inside the metric’s valid range.');
      break;
    case 'target_range':
      if (!(target.low < target.high)) problems.push('The range must have a low value below its high value (a zero-width range is not allowed).');
      if (!(target.tolerance > 0)) problems.push('The tolerance must be greater than zero.');
      if (!inRange(target.low) || !inRange(target.high)) problems.push('Target values must be inside the metric’s valid range.');
      break;
  }
  return problems;
}

function targetNumbers(target: Target): number[] {
  switch (target.kind) {
    case 'higher_is_better':
      return [target.floor, target.goal];
    case 'lower_is_better':
      return [target.goal, target.ceiling];
    case 'target_range':
      return [target.low, target.high, target.tolerance];
  }
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Target attainment from 0 to 100, rounded to one decimal.
 *  higher_is_better: 100 × (value − floor) / (goal − floor)
 *  lower_is_better:  100 × (ceiling − value) / (ceiling − goal)
 *  target_range:     100 inside [low, high]; outside, 100 × (1 − distance / tolerance)
 * Results are clamped to 0–100. Throws for an invalid configuration.
 */
export function targetScore(value: number, target: Target): number {
  if (!Number.isFinite(value)) throw new RangeError('A target score needs a measured value.');
  switch (target.kind) {
    case 'higher_is_better':
      if (!(target.floor < target.goal)) throw new RangeError('Invalid target: goal must be above floor.');
      return round1(clamp((100 * (value - target.floor)) / (target.goal - target.floor)));
    case 'lower_is_better':
      if (!(target.goal < target.ceiling)) throw new RangeError('Invalid target: goal must be below ceiling.');
      return round1(clamp((100 * (target.ceiling - value)) / (target.ceiling - target.goal)));
    case 'target_range': {
      if (!(target.low < target.high) || !(target.tolerance > 0)) throw new RangeError('Invalid target range.');
      if (value >= target.low && value <= target.high) return 100;
      const distance = value < target.low ? target.low - value : value - target.high;
      return round1(clamp(100 * (1 - distance / target.tolerance)));
    }
  }
}

/** Plain-language formula with the numbers used, for reports. */
export function targetFormula(value: number, target: Target): string {
  switch (target.kind) {
    case 'higher_is_better':
      return `100 × (${value} − ${target.floor}) ÷ (${target.goal} − ${target.floor}), limited to 0–100`;
    case 'lower_is_better':
      return `100 × (${target.ceiling} − ${value}) ÷ (${target.ceiling} − ${target.goal}), limited to 0–100`;
    case 'target_range':
      return `100 inside ${target.low}–${target.high}; outside, 100 × (1 − distance ÷ ${target.tolerance}), limited to 0–100`;
  }
}

export function rubricFormula(rating: number): string {
  return `25 × (${rating} − 1) = ${rubricScore(rating)}`;
}

/**
 * Empirical percentile with ties split evenly:
 *   100 × (count below + 0.5 × count equal) / reference count
 * The reference holds one value per athlete, so no athlete's many repetitions
 * can dominate. Rounded to one decimal.
 */
export function percentileRank(value: number, reference: readonly number[]): number {
  if (reference.length === 0) throw new RangeError('A percentile needs a non-empty reference.');
  let below = 0;
  let equal = 0;
  for (const item of reference) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  return round1((100 * (below + 0.5 * equal)) / reference.length);
}

/** Median (average of the two middle values for an even count), like percentile_cont(0.5). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation (n − 1), like stddev_samp. Null for fewer than two values. */
export function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values) ?? 0;
  const squares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}

/** Coefficient of variation as a percent. Null when the mean is not positive. */
export function coefficientOfVariation(values: readonly number[]): number | null {
  const sd = sampleStandardDeviation(values);
  const average = mean(values);
  if (sd === null || average === null || average <= 0) return null;
  return (100 * sd) / average;
}

/** Share of yes (1) values as a percent. */
export function rate(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return (100 * values.filter((value) => value === 1).length) / values.length;
}

/** Weighted mean of scored items, rounded to one decimal; null when nothing is scored. */
export function weightedMean(items: ReadonlyArray<{ readonly score: number; readonly weight: number }>): number | null {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (items.length === 0 || totalWeight <= 0) return null;
  return round1(items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}
