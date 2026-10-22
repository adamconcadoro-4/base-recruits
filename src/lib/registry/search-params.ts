/**
 * The school explorer keeps its whole state in the URL (GET form, plain
 * links), so it works without JavaScript, can be bookmarked and shared, and the
 * back button behaves. This module turns query strings into validated search
 * arguments and builds links back.
 */

import { z } from 'zod';

import { STATE_NAMES } from './states';
import { CONTROLS, DIVISION_CODES, LEVELS, SETTINGS, SORTS, TEST_POLICIES, type SchoolSort } from './types';

export const PAGE_SIZE = 20;
export const MAX_COMPARE = 5;

export const SIZE_BANDS = {
  small: { label: 'Under 2,000 undergraduates', min: null, max: 1999 },
  medium: { label: '2,000–4,999', min: 2000, max: 4999 },
  large: { label: '5,000–14,999', min: 5000, max: 14999 },
  xlarge: { label: '15,000 or more', min: 15000, max: null },
} as const;
export type SizeBand = keyof typeof SIZE_BANDS;

export const RATE_CHOICES = {
  '15': { label: '15% or lower', max: 0.15, min: null },
  '35': { label: '35% or lower', max: 0.35, min: null },
  '60': { label: '60% or lower', max: 0.6, min: null },
  '60plus': { label: '60% or higher', max: null, min: 0.6 },
} as const;
export type RateChoice = keyof typeof RATE_CHOICES;

export const COST_CHOICES = ['20000', '35000', '50000', '70000'] as const;
export type CostChoice = (typeof COST_CHOICES)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function all(raw: RawParams, key: string): string[] {
  const value = raw[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((v: string) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

function one(raw: RawParams, key: string): string | undefined {
  return all(raw, key)[0];
}

function only<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return [...new Set(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

export interface ExplorerState {
  readonly q: string;
  readonly state: string | null;
  readonly divisions: readonly (typeof DIVISION_CODES)[number][];
  readonly controls: readonly (typeof CONTROLS)[number][];
  readonly levels: readonly (typeof LEVELS)[number][];
  readonly settings: readonly (typeof SETTINGS)[number][];
  readonly tests: readonly (typeof TEST_POLICIES)[number][];
  readonly size: SizeBand | null;
  readonly rate: RateChoice | null;
  readonly cost: CostChoice | null;
  readonly sort: SchoolSort | null;
  readonly page: number;
  readonly compare: readonly string[];
}

const pageSchema = z.coerce.number().int().min(1).max(500);

/** Unknown or malformed values are dropped, never passed to the database. */
export function parseExplorerParams(raw: RawParams): ExplorerState {
  const q = (one(raw, 'q') ?? '').slice(0, 100);
  const stateCode = one(raw, 'state')?.toUpperCase();
  const size = one(raw, 'size');
  const rate = one(raw, 'rate');
  const cost = one(raw, 'cost');
  const sort = one(raw, 'sort');
  const page = pageSchema.safeParse(one(raw, 'page') ?? '1');
  return {
    q,
    state: stateCode && stateCode in STATE_NAMES ? stateCode : null,
    divisions: only(all(raw, 'division'), DIVISION_CODES),
    controls: only(all(raw, 'control'), CONTROLS),
    levels: only(all(raw, 'level'), LEVELS),
    settings: only(all(raw, 'setting'), SETTINGS),
    tests: only(all(raw, 'test'), TEST_POLICIES),
    size: size && size in SIZE_BANDS ? (size as SizeBand) : null,
    rate: rate && rate in RATE_CHOICES ? (rate as RateChoice) : null,
    cost: cost && (COST_CHOICES as readonly string[]).includes(cost) ? (cost as CostChoice) : null,
    sort: sort && (SORTS as readonly string[]).includes(sort) ? (sort as SchoolSort) : null,
    page: page.success ? page.data : 1,
    compare: parseCompareList(all(raw, 'compare')),
  };
}

export function parseCompareList(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase()).filter((v) => v.length <= 120 && SLUG_PATTERN.test(v)))].slice(0, MAX_COMPARE);
}

/** Arguments for public.search_schools. */
export function toSearchArgs(state: ExplorerState) {
  const size = state.size ? SIZE_BANDS[state.size] : null;
  const rate = state.rate ? RATE_CHOICES[state.rate] : null;
  const sort: SchoolSort = state.sort ?? (state.q ? 'relevance' : 'name');
  return {
    p_query: state.q || null,
    p_states: state.state ? [state.state] : null,
    p_divisions: state.divisions.length ? [...state.divisions] : null,
    p_controls: state.controls.length ? [...state.controls] : null,
    p_levels: state.levels.length ? [...state.levels] : null,
    p_settings: state.settings.length ? [...state.settings] : null,
    p_min_enrollment: size?.min ?? null,
    p_max_enrollment: size?.max ?? null,
    p_min_admission_rate: rate?.min ?? null,
    p_max_admission_rate: rate?.max ?? null,
    p_test_policies: state.tests.length ? [...state.tests] : null,
    p_max_cost: state.cost ? Number(state.cost) : null,
    p_sort: sort === 'relevance' && !state.q ? 'name' : sort,
    p_limit: PAGE_SIZE,
    p_offset: (state.page - 1) * PAGE_SIZE,
  };
}

/** True when any filter other than the search text and sort is set. */
export function hasFilters(state: ExplorerState): boolean {
  return Boolean(
    state.state || state.divisions.length || state.controls.length || state.levels.length || state.settings.length ||
      state.tests.length || state.size || state.rate || state.cost,
  );
}

/** Filters that leave out schools which don't report the figure. */
export function figureFilters(state: ExplorerState): string[] {
  const notes: string[] = [];
  if (state.rate) notes.push('admission rate');
  if (state.tests.length) notes.push('test policy');
  if (state.size) notes.push('enrollment');
  if (state.cost) notes.push('cost of attendance');
  return notes;
}

/** Query string for an explorer state (only non-default values). */
export function explorerQuery(state: ExplorerState, changes: Partial<ExplorerState> = {}): string {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.state) params.set('state', next.state);
  for (const v of next.divisions) params.append('division', v);
  for (const v of next.controls) params.append('control', v);
  for (const v of next.levels) params.append('level', v);
  for (const v of next.settings) params.append('setting', v);
  for (const v of next.tests) params.append('test', v);
  if (next.size) params.set('size', next.size);
  if (next.rate) params.set('rate', next.rate);
  if (next.cost) params.set('cost', next.cost);
  if (next.sort) params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  if (next.compare.length) params.set('compare', next.compare.join(','));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** The compare list with `slug` added (when there is room) or removed. */
export function toggleCompare(list: readonly string[], slug: string): string[] {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= MAX_COMPARE ? [...list] : [...list, slug];
}
