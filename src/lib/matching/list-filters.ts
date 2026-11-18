/**
 * The My schools list's filters (levels, states, campus settings, budget and
 * sort), remembered in this browser so the list opens the way the player left
 * it. Filters say nothing about the player's grades, but they stay on this
 * device like the numbers do (decision F45). Anything unexpected in storage is
 * treated as nothing saved.
 *
 * Pure parse/serialize functions; the read/save helpers touch localStorage
 * and tolerate it being missing or blocked.
 */

import { SETTINGS, type CampusSetting } from '../registry/types';
import { DEFAULT_LIST_LEVELS } from './candidates';
import { LEVELS, type Level } from './eligibility';
import type { SuggestionPreferences } from './suggestions';

export const LIST_FILTERS_KEY = 'br.my-schools-filters.v1';

/** Published cost of attendance ceilings offered, in dollars. */
export const BUDGET_CHOICES = [25000, 40000, 55000, 70000, 85000] as const;

export type ListSort = 'name' | 'cost';

export interface ListFilters {
  readonly levels: readonly Level[];
  readonly states: readonly string[];
  readonly settings: readonly CampusSetting[];
  readonly maxCost: number | null;
  readonly sort: ListSort;
}

export const DEFAULT_LIST_FILTERS: ListFilters = { levels: DEFAULT_LIST_LEVELS, states: [], settings: [], maxCost: null, sort: 'name' };

const STATE_CODE = /^[A-Z]{2}$/;

function onlyKnown<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === 'string' && (allowed as readonly string[]).includes(v))) return null;
  return [...new Set(value as T[])];
}

export function parseListFilters(text: string | null): ListFilters | null {
  if (!text || text.length > 2000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== 1) return null;
  const raw = data as Record<string, unknown>;
  const levels = onlyKnown(raw.levels, LEVELS);
  const settings = onlyKnown(raw.settings, SETTINGS);
  const states = Array.isArray(raw.states) && raw.states.length <= 60 && raw.states.every((s) => typeof s === 'string' && STATE_CODE.test(s)) ? [...new Set(raw.states as string[])] : null;
  const maxCost = raw.maxCost === null ? null : (BUDGET_CHOICES as readonly unknown[]).includes(raw.maxCost) ? (raw.maxCost as number) : undefined;
  const sort = raw.sort === 'name' || raw.sort === 'cost' ? raw.sort : null;
  if (!levels || !settings || !states || maxCost === undefined || !sort) return null;
  return { levels, states, settings, maxCost, sort };
}

export function serializeListFilters(filters: ListFilters): string {
  return JSON.stringify({ v: 1, ...filters });
}

/**
 * The engine's preferences. An empty level choice would mean "any level" to the
 * engine, but on this page it means the player unticked every box, so it
 * shows nothing rather than everything.
 */
export function toPreferences(filters: ListFilters): SuggestionPreferences | null {
  if (filters.levels.length === 0) return null;
  return { maxCostOfAttendance: filters.maxCost, states: filters.states, settings: filters.settings, levels: filters.levels };
}

export function readListFilters(): ListFilters | null {
  try {
    return parseListFilters(window.localStorage.getItem(LIST_FILTERS_KEY));
  } catch {
    return null;
  }
}

export function saveListFilters(filters: ListFilters): void {
  try {
    window.localStorage.setItem(LIST_FILTERS_KEY, serializeListFilters(filters));
  } catch {
    // Storage blocked: the filters still apply on this visit.
  }
}

export function forgetListFilters(): void {
  try {
    window.localStorage.removeItem(LIST_FILTERS_KEY);
  } catch {
    // Nothing stored, or storage blocked.
  }
}
