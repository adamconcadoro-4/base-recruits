/**
 * The athletic side of school suggestions: a player's baseball numbers
 * compared with per-level benchmarks (founder decisions F44, F46, F47,
 * 2026-10-31; docs/matching-rulebook.md §4a).
 *
 * - Benchmarks come in versioned sets. The set in use today is PUBLIC_BENCHMARKS,
 *   built only from free public sources, every number with its source. Paul's
 *   per-level standards replace it as a "partner" set when they arrive.
 * - "In range" uses the typical-range rule (F46): a player meets a level on a
 *   metric when their number is at or better than the low end of where most
 *   players who committed to that level fall.
 * - The player's numbers are self-reported and labelled as such.
 * - Missing numbers are never zero: a metric without both a player number and
 *   a benchmark simply isn't compared.
 *
 * Pure functions with relative, type-only imports.
 */

import { LEVELS, type Level } from './eligibility';
import type { AthleticLevelResult, AthleticProfile } from './suggestions';

// ---------------------------------------------------------------------------
// Positions and metrics
// ---------------------------------------------------------------------------

export const POSITIONS = ['pitcher', 'catcher', 'first_base', 'second_base', 'shortstop', 'third_base', 'outfield'] as const;
export type Position = (typeof POSITIONS)[number];

/** Groups the sources report 60-yard times by. */
export type SixtyGroup = 'outfield' | 'middle_infield' | 'corner_infield';

export const ATHLETIC_METRICS = [
  'fastball_mph',
  'exit_velocity_mph',
  'sixty_yard_s',
  'infield_velocity_mph',
  'outfield_velocity_mph',
  'catcher_velocity_mph',
  'pop_time_s',
] as const;
export type AthleticMetric = (typeof ATHLETIC_METRICS)[number];

export interface MetricInfo {
  readonly unit: 'mph' | 's';
  /** Times: a lower number is better. */
  readonly lowerIsBetter: boolean;
  /** Accepted entry range (inclusive); anything outside is treated as a typo. */
  readonly min: number;
  readonly max: number;
}

export const METRIC_INFO: Readonly<Record<AthleticMetric, MetricInfo>> = {
  fastball_mph: { unit: 'mph', lowerIsBetter: false, min: 40, max: 105 },
  exit_velocity_mph: { unit: 'mph', lowerIsBetter: false, min: 40, max: 125 },
  sixty_yard_s: { unit: 's', lowerIsBetter: true, min: 5.5, max: 10 },
  infield_velocity_mph: { unit: 'mph', lowerIsBetter: false, min: 40, max: 105 },
  outfield_velocity_mph: { unit: 'mph', lowerIsBetter: false, min: 40, max: 110 },
  catcher_velocity_mph: { unit: 'mph', lowerIsBetter: false, min: 40, max: 100 },
  pop_time_s: { unit: 's', lowerIsBetter: true, min: 1.5, max: 3.5 },
};

/** The metrics each position is compared on. */
export const POSITION_METRICS: Readonly<Record<Position, readonly AthleticMetric[]>> = {
  pitcher: ['fastball_mph'],
  catcher: ['exit_velocity_mph', 'pop_time_s', 'catcher_velocity_mph'],
  first_base: ['exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph'],
  second_base: ['exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph'],
  shortstop: ['exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph'],
  third_base: ['exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph'],
  outfield: ['exit_velocity_mph', 'sixty_yard_s', 'outfield_velocity_mph'],
};

export const SIXTY_GROUP: Readonly<Record<Position, SixtyGroup | null>> = {
  pitcher: null,
  catcher: null,
  first_base: 'corner_infield',
  second_base: 'middle_infield',
  shortstop: 'middle_infield',
  third_base: 'corner_infield',
  outfield: 'outfield',
};

/** Fewest metrics that must be compared before a level gets a result. */
export const MIN_COMPARED: Readonly<Record<Position, number>> = {
  pitcher: 1,
  catcher: 2,
  first_base: 2,
  second_base: 2,
  shortstop: 2,
  third_base: 2,
  outfield: 2,
};

// ---------------------------------------------------------------------------
// Benchmark sets
// ---------------------------------------------------------------------------

export interface BenchmarkSource {
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  /** Dates as the page shows them (YYYY-MM-DD). */
  readonly published: string;
  readonly updated: string | null;
  /** What the numbers describe, in plain words. */
  readonly basis: string;
  /** Measured data on real players, or a guideline with no stated data. */
  readonly kind: 'measured' | 'guideline';
}

/**
 * How a floor was set:
 *  - typical_range_low: the low end of the source's typical range (average − 1 SD) for this level;
 *  - next_level_average: the source gives only an average, so the floor is the average of the next level down;
 *  - level_average: no lower level is measured in the source (D3), so the floor is this level's own average;
 *  - guideline: the source's own guideline (a minimum, or the slower/lower end of its range).
 */
export type FloorBasis = 'typical_range_low' | 'next_level_average' | 'level_average' | 'guideline';

export interface Floor {
  readonly metric: AthleticMetric;
  /** For 60-yard times: the position group this floor applies to. */
  readonly sixtyGroup?: SixtyGroup;
  /** The value a player must reach (at or above; at or below for times). */
  readonly value: number;
  readonly basis: FloorBasis;
  /** The level's reported average, shown for context. */
  readonly average: number | null;
  /** The source's own wording of the number, e.g. "77–82 mph", for guidelines. */
  readonly sourceText: string | null;
  readonly source: string;
}

export interface BenchmarkSet {
  readonly version: string;
  readonly kind: 'public' | 'partner';
  readonly name: string;
  /** Date every number was checked against its source (YYYY-MM-DD). */
  readonly checkedOn: string;
  readonly sources: Readonly<Record<string, BenchmarkSource>>;
  readonly floors: Readonly<Record<Level, readonly Floor[]>>;
}

const BP = 'baseballpath-2026-10';
const NCSA = 'ncsa-guidelines';

const bp = (metric: AthleticMetric, value: number, basis: FloorBasis, average: number | null, sixtyGroup?: SixtyGroup): Floor => ({
  metric,
  value,
  basis,
  average,
  sourceText: null,
  source: BP,
  ...(sixtyGroup ? { sixtyGroup } : {}),
});
const ncsa = (metric: AthleticMetric, value: number, sourceText: string, sixtyGroup?: SixtyGroup): Floor => ({
  metric,
  value,
  basis: 'guideline',
  average: null,
  sourceText,
  source: NCSA,
  ...(sixtyGroup ? { sixtyGroup } : {}),
});

/**
 * Public benchmarks, checked 2026-10-31. Every number as each source published it is recorded in
 * docs/benchmark-sources.md, which a monthly scheduled task compares with the live pages; keep the two in step.
 * D1 uses the source's "Other D1"
 * (non–Power 4) figures, because the registry doesn't separate Power 4.
 * NAIA and junior college use NCSA guidelines (F47); NAIA shares NCSA's D3
 * column. Values not given as numbers (JUCO "upper 70s" infield velocity) and
 * metrics a source doesn't cover are left out, never estimated.
 */
export const PUBLIC_BENCHMARKS: BenchmarkSet = {
  version: 'public-2026-10-31',
  kind: 'public',
  name: 'Public benchmarks',
  checkedOn: '2026-10-31',
  sources: {
    [BP]: {
      title: 'What Numbers Do You Need to Play D1, D2, or D3 Baseball?',
      publisher: 'BaseballPath',
      url: 'https://www.baseballpath.com/blog/velocity-exit-velo-by-division',
      published: '2026-06-08',
      updated: '2026-10-20',
      basis:
        'Each player’s best recorded showcase number on their Prep Baseball Report profile, high school classes of 2024–26, grouped by the level they committed to. Sample size not published.',
      kind: 'measured',
    },
    [NCSA]: {
      title: 'College Baseball Recruiting Guidelines and Measurables',
      publisher: 'NCSA',
      url: 'https://www.ncsasports.org/baseball/recruiting-guidelines',
      published: '2018-08-17',
      updated: '2026-03-16',
      basis: 'Guidelines for what college coaches generally look for. No data or method is published; NAIA is grouped with D3.',
      kind: 'guideline',
    },
  },
  floors: {
    ncaa_d1: [
      bp('fastball_mph', 85, 'typical_range_low', 88),
      bp('exit_velocity_mph', 89, 'typical_range_low', 94.66),
      bp('sixty_yard_s', 7.02, 'next_level_average', 6.91, 'outfield'),
      bp('sixty_yard_s', 7.15, 'next_level_average', 7.05, 'middle_infield'),
      bp('infield_velocity_mph', 81, 'next_level_average', 84),
      bp('outfield_velocity_mph', 84, 'next_level_average', 86),
      bp('catcher_velocity_mph', 76, 'next_level_average', 78),
      bp('pop_time_s', 2.04, 'next_level_average', 1.99),
    ],
    ncaa_d2: [
      bp('fastball_mph', 81, 'typical_range_low', 85),
      bp('exit_velocity_mph', 87, 'typical_range_low', 92.39),
      bp('sixty_yard_s', 7.13, 'next_level_average', 7.02, 'outfield'),
      bp('sixty_yard_s', 7.29, 'next_level_average', 7.15, 'middle_infield'),
      bp('infield_velocity_mph', 78, 'next_level_average', 81),
      bp('outfield_velocity_mph', 82, 'next_level_average', 84),
      bp('catcher_velocity_mph', 74, 'next_level_average', 76),
      bp('pop_time_s', 2.09, 'next_level_average', 2.04),
    ],
    ncaa_d3: [
      bp('fastball_mph', 78, 'typical_range_low', 82),
      bp('exit_velocity_mph', 85, 'typical_range_low', 90.17),
      bp('sixty_yard_s', 7.13, 'level_average', 7.13, 'outfield'),
      bp('sixty_yard_s', 7.29, 'level_average', 7.29, 'middle_infield'),
      bp('sixty_yard_s', 7.52, 'level_average', 7.52, 'corner_infield'),
      bp('infield_velocity_mph', 78, 'level_average', 78),
      bp('outfield_velocity_mph', 82, 'level_average', 82),
      bp('catcher_velocity_mph', 74, 'level_average', 74),
      bp('pop_time_s', 2.09, 'level_average', 2.09),
    ],
    naia: [
      ncsa('fastball_mph', 77, '77–82 mph'),
      ncsa('sixty_yard_s', 6.9, '6.9 or below (center and corner outfield)', 'outfield'),
      ncsa('sixty_yard_s', 7.0, '7.0 or below', 'middle_infield'),
      ncsa('infield_velocity_mph', 78, '78+ mph from shortstop'),
      ncsa('outfield_velocity_mph', 80, '80+ mph'),
      ncsa('pop_time_s', 2.1, '2.0–2.1'),
    ],
    juco: [
      ncsa('fastball_mph', 80, '80 mph consistently'),
      ncsa('sixty_yard_s', 7.0, '7.0 or below (center and corner outfield)', 'outfield'),
      ncsa('sixty_yard_s', 7.1, '7.1 or below', 'middle_infield'),
      ncsa('outfield_velocity_mph', 78, '78+ mph'),
      ncsa('pop_time_s', 2.1, '2.1 or below'),
    ],
  },
};

// ---------------------------------------------------------------------------
// Player input
// ---------------------------------------------------------------------------

export interface AthleticInput {
  readonly position: Position;
  /** The player's own numbers; a missing metric is simply absent. */
  readonly metrics: Readonly<Partial<Record<AthleticMetric, number>>>;
}

export type AthleticRaw = Readonly<{ position: string } & Partial<Record<AthleticMetric, string>>>;

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

/**
 * Validates raw form values. Blank position → null (no athletic input, not an
 * error). Only the position's own metrics are read.
 */
export function parseAthleticInput(
  raw: AthleticRaw,
): { readonly ok: true; readonly input: AthleticInput | null } | { readonly ok: false; readonly errors: Readonly<Partial<Record<AthleticMetric | 'position', string>>> } {
  const position = raw.position.trim();
  if (position === '') return { ok: true, input: null };
  if (!isPosition(position)) return { ok: false, errors: { position: 'Choose your main position.' } };
  const errors: Partial<Record<AthleticMetric, string>> = {};
  const metrics: Partial<Record<AthleticMetric, number>> = {};
  for (const metric of POSITION_METRICS[position]) {
    const text = (raw[metric] ?? '').trim();
    if (text === '') continue;
    const value = Number(text);
    const info = METRIC_INFO[metric];
    if (!Number.isFinite(value) || value < info.min || value > info.max) {
      errors[metric] = `Enter a number from ${info.min} to ${info.max} ${info.unit === 's' ? 'seconds' : 'mph'}.`;
      continue;
    }
    metrics[metric] = value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { position, metrics } };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface MetricComparison {
  readonly metric: AthleticMetric;
  readonly player: number;
  readonly floor: Floor;
  readonly meets: boolean;
}

export interface AthleticLevelDetail extends AthleticLevelResult {
  readonly level: Level;
  /** Metrics with both a player number and a benchmark at this level. */
  readonly comparisons: readonly MetricComparison[];
  /** Position metrics this level's benchmarks don't cover. */
  readonly notCovered: readonly AthleticMetric[];
  /** Position metrics the player didn't enter. */
  readonly notEntered: readonly AthleticMetric[];
  readonly minCompared: number;
}

function floorFor(set: BenchmarkSet, level: Level, metric: AthleticMetric, position: Position): Floor | null {
  const group = SIXTY_GROUP[position];
  const match = set.floors[level].find((f) => f.metric === metric && (metric !== 'sixty_yard_s' || f.sixtyGroup === group));
  return match ?? null;
}

function meetsFloor(metric: AthleticMetric, value: number, floor: Floor): boolean {
  return METRIC_INFO[metric].lowerIsBetter ? value <= floor.value : value >= floor.value;
}

/**
 * One level's result. In range when at least half of the compared metrics meet
 * the level's floor; not enough data when fewer than the position's minimum
 * are compared.
 */
export function evaluateLevel(input: AthleticInput, level: Level, set: BenchmarkSet = PUBLIC_BENCHMARKS): AthleticLevelDetail {
  const comparisons: MetricComparison[] = [];
  const notCovered: AthleticMetric[] = [];
  const notEntered: AthleticMetric[] = [];
  for (const metric of POSITION_METRICS[input.position]) {
    const floor = floorFor(set, level, metric, input.position);
    const player = input.metrics[metric];
    if (!floor) notCovered.push(metric);
    else if (player === undefined) notEntered.push(metric);
    else comparisons.push({ metric, player, floor, meets: meetsFloor(metric, player, floor) });
  }
  const minCompared = MIN_COMPARED[input.position];
  const met = comparisons.filter((c) => c.meets).length;
  const status = comparisons.length < minCompared ? 'not_enough_data' : met * 2 >= comparisons.length ? 'in_range' : 'below';
  return { level, status, standardsVersion: set.version, comparisons, notCovered, notEntered, minCompared };
}

/** Every level's result, ready for the suggestion engine. */
export function evaluateAthletic(input: AthleticInput | null, set: BenchmarkSet = PUBLIC_BENCHMARKS): AthleticProfile & { readonly details: Readonly<Partial<Record<Level, AthleticLevelDetail>>> } {
  if (!input) return { byLevel: {}, details: {} };
  const details = Object.fromEntries(LEVELS.map((level) => [level, evaluateLevel(input, level, set)])) as Record<Level, AthleticLevelDetail>;
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, { status: details[level].status, standardsVersion: set.version }])) as Record<Level, AthleticLevelResult>;
  return { byLevel, details };
}
