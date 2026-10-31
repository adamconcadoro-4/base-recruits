import { describe, expect, it } from 'vitest';

import {
  ATHLETIC_METRICS,
  MIN_COMPARED,
  POSITIONS,
  POSITION_METRICS,
  PUBLIC_BENCHMARKS,
  evaluateAthletic,
  evaluateLevel,
  parseAthleticInput,
  type AthleticInput,
  type AthleticMetric,
} from '@/lib/matching/athletic';
import { LEVELS, type Level } from '@/lib/matching/eligibility';
import type { ApplicantInput, SchoolEvidence } from '@/lib/matching/rules';
import { schoolFit } from '@/lib/matching/school-fit';
import {
  ATHLETIC_STATUS_LABELS,
  ATHLETIC_STATUS_TEXT,
  FLOOR_BASIS_TEXT,
  METRIC_LABELS,
  POSITION_LABELS,
  SELF_REPORTED_NOTE,
} from '@/lib/matching/suggestions-explain';

/**
 * The athletic side: public per-level benchmarks (checked 2026-10-31) and the
 * typical-range rule. Players below are synthetic.
 */

const floorValue = (level: Level, metric: AthleticMetric, group?: string) =>
  PUBLIC_BENCHMARKS.floors[level].find((f) => f.metric === metric && (group === undefined || f.sixtyGroup === group))?.value;

describe('the public benchmark set', () => {
  it('records the checked numbers, so any change is a reviewed edit', () => {
    expect(PUBLIC_BENCHMARKS.version).toBe('public-2026-10-31');
    // BaseballPath typical-range lows (average − 1 SD), "Other D1" for D1.
    expect([floorValue('ncaa_d1', 'fastball_mph'), floorValue('ncaa_d2', 'fastball_mph'), floorValue('ncaa_d3', 'fastball_mph')]).toEqual([85, 81, 78]);
    expect([floorValue('ncaa_d1', 'exit_velocity_mph'), floorValue('ncaa_d2', 'exit_velocity_mph'), floorValue('ncaa_d3', 'exit_velocity_mph')]).toEqual([89, 87, 85]);
    // Average-only metrics use the next level down's average (D3 uses its own).
    expect([floorValue('ncaa_d1', 'sixty_yard_s', 'outfield'), floorValue('ncaa_d2', 'sixty_yard_s', 'outfield'), floorValue('ncaa_d3', 'sixty_yard_s', 'outfield')]).toEqual([7.02, 7.13, 7.13]);
    expect([floorValue('ncaa_d1', 'pop_time_s'), floorValue('ncaa_d2', 'pop_time_s'), floorValue('ncaa_d3', 'pop_time_s')]).toEqual([2.04, 2.09, 2.09]);
    // NCSA guidelines for NAIA and junior college.
    expect([floorValue('naia', 'fastball_mph'), floorValue('juco', 'fastball_mph')]).toEqual([77, 80]);
    expect([floorValue('naia', 'pop_time_s'), floorValue('juco', 'pop_time_s')]).toEqual([2.1, 2.1]);
  });

  it('never fills a gap: no exit velocity or catcher velocity for NAIA or junior college, no JUCO infield velocity', () => {
    for (const level of ['naia', 'juco'] as const) {
      expect(floorValue(level, 'exit_velocity_mph')).toBeUndefined();
      expect(floorValue(level, 'catcher_velocity_mph')).toBeUndefined();
    }
    expect(floorValue('juco', 'infield_velocity_mph')).toBeUndefined();
    expect(floorValue('ncaa_d1', 'sixty_yard_s', 'corner_infield')).toBeUndefined();
  });

  it('gives every floor a known source, and every guideline its published wording', () => {
    for (const level of LEVELS) {
      for (const floor of PUBLIC_BENCHMARKS.floors[level]) {
        const source = PUBLIC_BENCHMARKS.sources[floor.source];
        expect(source?.url).toMatch(/^https:\/\//);
        if (floor.basis === 'guideline') {
          expect(source?.kind).toBe('guideline');
          expect(floor.sourceText).toBeTruthy();
        } else {
          expect(source?.kind).toBe('measured');
        }
      }
    }
  });

  it('NCAA floors get stricter as the level rises', () => {
    for (const metric of ATHLETIC_METRICS) {
      for (const group of [undefined, 'outfield', 'middle_infield']) {
        const [d1, d2, d3] = (['ncaa_d1', 'ncaa_d2', 'ncaa_d3'] as const).map((l) => floorValue(l, metric, metric === 'sixty_yard_s' ? group : undefined));
        if (d1 === undefined || d2 === undefined || d3 === undefined) continue;
        if (metric === 'sixty_yard_s' || metric === 'pop_time_s') expect(d1 <= d2 && d2 <= d3).toBe(true);
        else expect(d1 >= d2 && d2 >= d3).toBe(true);
      }
    }
  });

  it('has wording for every position, metric, basis and status', () => {
    for (const p of POSITIONS) expect(POSITION_LABELS[p]).toBeTruthy();
    for (const m of ATHLETIC_METRICS) expect(METRIC_LABELS[m]).toBeTruthy();
    for (const text of [...Object.values(FLOOR_BASIS_TEXT), ...Object.values(ATHLETIC_STATUS_LABELS), ...Object.values(ATHLETIC_STATUS_TEXT), SELF_REPORTED_NOTE]) {
      expect(text.length).toBeGreaterThan(3);
      expect(text).not.toMatch(/\b(guarantee[sd]?|will get in|scholarship offer|will be recruited)\b/i);
    }
  });
});

describe('parseAthleticInput', () => {
  it('a blank position means no baseball numbers, not an error', () => {
    expect(parseAthleticInput({ position: '' })).toEqual({ ok: true, input: null });
  });

  it('reads only the position’s own numbers', () => {
    const result = parseAthleticInput({ position: 'pitcher', fastball_mph: '86', exit_velocity_mph: '99', sixty_yard_s: 'abc' });
    expect(result).toEqual({ ok: true, input: { position: 'pitcher', metrics: { fastball_mph: 86 } } });
  });

  it('rejects an unknown position and out-of-range numbers', () => {
    expect(parseAthleticInput({ position: 'designated_hitter' }).ok).toBe(false);
    const bad = parseAthleticInput({ position: 'outfield', sixty_yard_s: '4.2', exit_velocity_mph: 'fast' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['exit_velocity_mph', 'sixty_yard_s']);
  });
});

const outfielder = (metrics: AthleticInput['metrics']): AthleticInput => ({ position: 'outfield', metrics });

describe('the typical-range rule', () => {
  it('pitchers: one fastball decides each level', () => {
    const p = (mph: number) => evaluateAthletic({ position: 'pitcher', metrics: { fastball_mph: mph } }).byLevel;
    expect(p(86)).toMatchObject({ ncaa_d1: { status: 'in_range' }, ncaa_d2: { status: 'in_range' }, ncaa_d3: { status: 'in_range' }, naia: { status: 'in_range' }, juco: { status: 'in_range' } });
    expect(p(84)).toMatchObject({ ncaa_d1: { status: 'below' }, ncaa_d2: { status: 'in_range' } });
    expect(p(79)).toMatchObject({ ncaa_d2: { status: 'below' }, ncaa_d3: { status: 'in_range' }, naia: { status: 'in_range' }, juco: { status: 'below' } });
    expect(p(85).ncaa_d1?.status).toBe('in_range');
  });

  it('a lower time is better for the 60 and pop time', () => {
    expect(evaluateLevel(outfielder({ sixty_yard_s: 7.02, exit_velocity_mph: 80 }), 'ncaa_d1').comparisons.find((c) => c.metric === 'sixty_yard_s')?.meets).toBe(true);
    expect(evaluateLevel(outfielder({ sixty_yard_s: 7.03, exit_velocity_mph: 80 }), 'ncaa_d1').comparisons.find((c) => c.metric === 'sixty_yard_s')?.meets).toBe(false);
  });

  it('in range when at least half of the compared numbers meet the floor', () => {
    expect(evaluateLevel(outfielder({ exit_velocity_mph: 90, sixty_yard_s: 7.0, outfield_velocity_mph: 85 }), 'ncaa_d1').status).toBe('in_range');
    expect(evaluateLevel(outfielder({ exit_velocity_mph: 88, sixty_yard_s: 7.0 }), 'ncaa_d1').status).toBe('in_range');
    expect(evaluateLevel(outfielder({ exit_velocity_mph: 88, sixty_yard_s: 7.1, outfield_velocity_mph: 85 }), 'ncaa_d1').status).toBe('below');
  });

  it('position players need two compared numbers; a missing number is never a zero', () => {
    const one = evaluateLevel(outfielder({ exit_velocity_mph: 99 }), 'ncaa_d1');
    expect(one).toMatchObject({ status: 'not_enough_data', minCompared: MIN_COMPARED.outfield, notEntered: ['sixty_yard_s', 'outfield_velocity_mph'] });
  });

  it('catchers at NAIA and junior college can’t be placed: only pop time has a benchmark', () => {
    const catcher: AthleticInput = { position: 'catcher', metrics: { exit_velocity_mph: 92, pop_time_s: 2.0, catcher_velocity_mph: 78 } };
    for (const level of ['naia', 'juco'] as const) {
      expect(evaluateLevel(catcher, level)).toMatchObject({ status: 'not_enough_data', notCovered: ['exit_velocity_mph', 'catcher_velocity_mph'] });
    }
    expect(evaluateLevel(catcher, 'ncaa_d2').status).toBe('in_range');
  });

  it('corner infielders are compared on the 60 only where a source gives it (D3)', () => {
    const corner: AthleticInput = { position: 'third_base', metrics: { exit_velocity_mph: 90, sixty_yard_s: 7.4, infield_velocity_mph: 80 } };
    expect(evaluateLevel(corner, 'ncaa_d1').notCovered).toEqual(['sixty_yard_s']);
    expect(evaluateLevel(corner, 'ncaa_d3').comparisons.map((c) => c.metric)).toEqual(['exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph']);
  });

  it('every position’s metrics are known metrics', () => {
    for (const p of POSITIONS) for (const m of POSITION_METRICS[p]) expect(ATHLETIC_METRICS).toContain(m);
  });

  it('no baseball numbers: no athletic result at any level', () => {
    expect(evaluateAthletic(null)).toEqual({ byLevel: {}, details: {} });
  });
});

describe('with the rest of the engine', () => {
  const evidence: SchoolEvidence = {
    slug: 'example-college',
    admissionsTerm: 'Fall 2025',
    satErw: [520, 600],
    satMath: [510, 600],
    actComposite: [null, null],
    historicalTestPolicy: null,
    currentPolicies: [],
  };
  const student: ApplicantInput = { applicantType: 'first_year', entryYear: 2027, gpa: { value: 3.2, scale: 4, type: 'unweighted' }, sat: { erw: 560, math: 560 }, act: null, submitScores: 'yes' };

  it('turns an in-range level into a full group, and a below level into "not in your suggestions"', () => {
    const inRange = evaluateLevel({ position: 'pitcher', metrics: { fastball_mph: 83 } }, 'ncaa_d2');
    expect(schoolFit(evidence, 'ncaa_d2', student, inRange)).toMatchObject({ placed: true, group: 'strong_fit' });
    const below = evaluateLevel({ position: 'pitcher', metrics: { fastball_mph: 80 } }, 'ncaa_d2');
    expect(schoolFit(evidence, 'ncaa_d2', student, below)).toMatchObject({ placed: true, group: null });
  });
});
