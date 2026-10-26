import { describe, expect, it } from 'vitest';

import { requireMetric } from '@/lib/assessment/catalog/metrics';
import {
  coefficientOfVariation,
  median,
  percentileRank,
  rate,
  rubricScore,
  sampleStandardDeviation,
  targetFromStored,
  targetProblems,
  targetScore,
  targetToStored,
  weightedMean,
  type Target,
} from '@/lib/assessment/scoring';
import { convertToCanonical, formatValue, normalizeUnit, round1, round3 } from '@/lib/assessment/units';

describe('rubric scores', () => {
  it('maps ratings 1–5 to 0, 25, 50, 75, 100', () => {
    expect([1, 2, 3, 4, 5].map(rubricScore)).toEqual([0, 25, 50, 75, 100]);
  });

  it('refuses anything that is not a whole rating from 1 to 5', () => {
    expect(() => rubricScore(0)).toThrow();
    expect(() => rubricScore(6)).toThrow();
    expect(() => rubricScore(2.5)).toThrow();
    expect(() => rubricScore(Number.NaN)).toThrow();
  });
});

describe('coach-defined targets', () => {
  const higher: Target = { kind: 'higher_is_better', floor: 60, goal: 80 };
  const lower: Target = { kind: 'lower_is_better', goal: 10, ceiling: 30 };
  const range: Target = { kind: 'target_range', low: 10, high: 20, tolerance: 10 };

  it('scores higher-is-better linearly between floor and goal, limited to 0–100', () => {
    expect(targetScore(70, higher)).toBe(50);
    expect(targetScore(80, higher)).toBe(100);
    expect(targetScore(95, higher)).toBe(100);
    expect(targetScore(50, higher)).toBe(0);
  });

  it('scores lower-is-better linearly between goal and ceiling', () => {
    expect(targetScore(20, lower)).toBe(50);
    expect(targetScore(5, lower)).toBe(100);
    expect(targetScore(40, lower)).toBe(0);
  });

  it('scores a range as 100 inside and falls off over the tolerance outside', () => {
    expect(targetScore(15, range)).toBe(100);
    expect(targetScore(10, range)).toBe(100);
    expect(targetScore(25, range)).toBe(50);
    expect(targetScore(5, range)).toBe(50);
    expect(targetScore(40, range)).toBe(0);
  });

  it('keeps a valid zero as a real value', () => {
    expect(targetScore(0, { kind: 'target_range', low: -5, high: 5, tolerance: 10 })).toBe(100);
  });

  it('rejects invalid configurations, including a zero-width range', () => {
    expect(() => targetScore(15, { kind: 'target_range', low: 10, high: 10, tolerance: 5 })).toThrow();
    expect(() => targetScore(15, { kind: 'target_range', low: 10, high: 20, tolerance: 0 })).toThrow();
    expect(() => targetScore(15, { kind: 'higher_is_better', floor: 80, goal: 80 })).toThrow();
    expect(() => targetScore(15, { kind: 'lower_is_better', goal: 30, ceiling: 10 })).toThrow();
  });

  it('explains what is wrong with a target before it is saved', () => {
    const launch = requireMetric('hit_launch_angle_deg');
    expect(targetProblems({ kind: 'target_range', low: 12, high: 12, tolerance: 5 }, launch, 'Coach goal')).toContain(
      'The range must have a low value below its high value (a zero-width range is not allowed).',
    );
    expect(targetProblems({ kind: 'higher_is_better', floor: 10, goal: 20 }, launch, 'Coach goal')).toContain(
      'That kind of target does not fit this metric.',
    );
    expect(targetProblems({ kind: 'target_range', low: 8, high: 20, tolerance: 6 }, launch, '')[0]).toMatch(/Say where the target comes from/);
    expect(targetProblems({ kind: 'target_range', low: 8, high: 20, tolerance: 6 }, launch, 'Coach goal for spring')).toEqual([]);
    expect(targetProblems({ kind: 'target_range', low: 8, high: 20, tolerance: 6 }, requireMetric('hit_load_repeatability'), 'Coach goal')).toContain(
      'This metric is not scored against targets.',
    );
    expect(targetProblems({ kind: 'target_range', low: 8, high: 200, tolerance: 6 }, launch, 'Coach goal')).toContain(
      'Target values must be inside the metric’s valid range.',
    );
    // Charted outcomes are stored as yes/no but scored as a percentage.
    expect(targetProblems({ kind: 'higher_is_better', floor: 30, goal: 80 }, requireMetric('hit_solid_contact'), 'Coach goal')).toEqual([]);
    expect(targetProblems({ kind: 'higher_is_better', floor: 30, goal: 120 }, requireMetric('hit_solid_contact'), 'Coach goal')).toContain(
      'Target values must be inside the metric’s valid range.',
    );
  });

  it('stores and restores each target kind without changing it', () => {
    for (const target of [higher, lower, range]) {
      expect(targetFromStored(targetToStored(target))).toEqual(target);
    }
  });
});

describe('reference percentiles', () => {
  it('splits ties evenly and is deterministic', () => {
    const reference = [70, 72, 72, 72, 80];
    expect(percentileRank(72, reference)).toBe(50);
    expect(percentileRank(72, [...reference].reverse())).toBe(50);
    expect(percentileRank(60, reference)).toBe(0);
    expect(percentileRank(90, reference)).toBe(100);
    expect(percentileRank(80, reference)).toBe(90);
  });

  it('needs a reference to compare with', () => {
    expect(() => percentileRank(72, [])).toThrow();
  });
});

describe('summary statistics', () => {
  it('uses the average of the two middle values for an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });

  it('keeps zeros and negative values', () => {
    expect(median([0, 0, 1])).toBe(0);
    expect(median([-4, 0, 4])).toBe(0);
  });

  it('computes a sample standard deviation and a coefficient of variation', () => {
    expect(sampleStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(sampleStandardDeviation([5])).toBeNull();
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([0, 0])).toBeNull();
  });

  it('computes rates from yes/no values', () => {
    expect(rate([1, 0, 1, 1])).toBe(75);
    expect(rate([0, 0])).toBe(0);
    expect(rate([])).toBeNull();
  });

  it('weights scored items and returns null when nothing is scored', () => {
    expect(weightedMean([{ score: 50, weight: 1 }, { score: 100, weight: 3 }])).toBe(87.5);
    expect(weightedMean([])).toBeNull();
  });
});

describe('units', () => {
  it('converts imported units to the stored unit', () => {
    expect(convertToCanonical(100, 'km/h', 'mph')).toBe(62.137);
    expect(convertToCanonical(30, 'm/s', 'mph')).toBe(67.108);
    expect(convertToCanonical(0.25, 's', 'ms')).toBe(250);
    expect(convertToCanonical(25.4, 'cm', 'in')).toBe(10);
    expect(convertToCanonical(12, 'degrees', 'deg')).toBe(12);
    expect(convertToCanonical(0, 'deg', 'deg')).toBe(0);
  });

  it('refuses units that do not belong to the metric', () => {
    expect(convertToCanonical(80, 'rpm', 'mph')).toBeNull();
    expect(convertToCanonical(80, '', 'mph')).toBeNull();
    expect(convertToCanonical(80, 'furlongs', 'mph')).toBeNull();
  });

  it('normalizes how units are typed', () => {
    expect(normalizeUnit(' KPH ')).toBe('km/h');
    expect(normalizeUnit('Seconds')).toBe('s');
    expect(normalizeUnit('')).toBeNull();
  });

  it('rounds half away from zero like the database', () => {
    expect(round1(87.25)).toBe(87.3);
    expect(round1(-87.25)).toBe(-87.3);
    expect(round3(1.0005)).toBe(1.001);
  });

  it('never shows an uncollected value as zero', () => {
    expect(formatValue(null, 'mph')).toBe('Not collected');
    expect(formatValue(0, 'deg')).toBe('0°');
    expect(formatValue(3, 'rating')).toBe('3 of 5');
  });
});
