import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import { MAX_COMPARE, parseExplorerParams, toSearchArgs, type ExplorerState } from './search-params';
import type { CurrentPolicy, DivisionCode, GpaRangeRow, RegistryCoverage, SchoolRecord, SchoolSummary } from './types';

export interface SearchResult {
  readonly rows: readonly SchoolSummary[];
  readonly total: number;
  readonly failed: boolean;
}

/** The registry's free search, run as the visitor (anonymous or signed in). */
export async function searchSchools(state: ExplorerState, pageSize?: number): Promise<SearchResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_schools', toSearchArgs(state, pageSize));
  if (error) return { rows: [], total: 0, failed: true };
  const rows = (data ?? []) as SchoolSummary[];
  return { rows, total: rows[0]?.total_count ?? 0, failed: false };
}

/** Cached per request, so the page and its metadata share one lookup. */
export const getSchool = cache(async (slug: string): Promise<SchoolRecord | null | 'failed'> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_school', { p_slug: slug });
  if (error) return 'failed';
  return (data as SchoolRecord | null) ?? null;
});

export async function compareSchools(slugs: readonly string[]): Promise<readonly SchoolRecord[] | 'failed'> {
  if (slugs.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('compare_schools', { p_slugs: slugs.slice(0, MAX_COMPARE) });
  if (error) return 'failed';
  return (data ?? []) as SchoolRecord[];
}

export async function registryCoverage(): Promise<RegistryCoverage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('registry_coverage');
  if (error || !data) return null;
  return data as RegistryCoverage;
}

/** Summaries for a list of schools, in the order given (saved lists, comparison candidates). */
export async function schoolsBySlugs(slugs: readonly string[]): Promise<readonly SchoolSummary[] | 'failed'> {
  if (slugs.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('schools_by_slugs', { p_slugs: slugs.slice(0, 1000) });
  if (error) return 'failed';
  return (data ?? []) as SchoolSummary[];
}

/** Checked current admissions policies for these schools, grouped by slug. */
export async function currentPolicies(slugs: readonly string[]): Promise<ReadonlyMap<string, readonly CurrentPolicy[]> | 'failed'> {
  const map = new Map<string, CurrentPolicy[]>();
  if (slugs.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_admissions_policies', { p_slugs: slugs.slice(0, 1000) });
  if (error) return 'failed';
  for (const row of (data ?? []) as CurrentPolicy[]) {
    const list = map.get(row.slug) ?? [];
    list.push(row);
    map.set(row.slug, list);
  }
  return map;
}

/** The signed-in user's saved schools (slugs, newest first); null when signed out or on error. */
export async function mySavedSlugs(): Promise<readonly string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_saved_schools');
  if (error) return null;
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
}

/** Published high school GPA ranges for these schools, by slug (at most one current range each). */
export async function gpaRanges(slugs: readonly string[]): Promise<ReadonlyMap<string, GpaRangeRow> | 'failed'> {
  const map = new Map<string, GpaRangeRow>();
  if (slugs.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gpa_ranges_for', { p_slugs: slugs.slice(0, 1000) });
  if (error) return 'failed';
  for (const row of (data ?? []) as GpaRangeRow[]) map.set(row.slug, { ...row, low: Number(row.low), high: Number(row.high) });
  return map;
}

/** Every listed school with an active program in these divisions (pages of 100, the database's limit, fetched together). */
export async function allSchoolsIn(divisions: readonly DivisionCode[]): Promise<readonly SchoolSummary[] | 'failed'> {
  const search = (page: number) => searchSchools(parseExplorerParams({ division: [...divisions], page: String(page), sort: 'name' }), 100);
  const first = await search(1);
  if (first.failed) return 'failed';
  const pages = Math.min(Math.ceil(first.total / 100), 60);
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => search(i + 2)));
  if (rest.some((r) => r.failed)) return 'failed';
  return [first, ...rest].flatMap((r) => r.rows);
}

/** How many listed schools have an active program in these divisions. */
export async function countSchoolsIn(divisions: readonly DivisionCode[]): Promise<number | null> {
  const result = await searchSchools(parseExplorerParams({ division: [...divisions] }), 1);
  return result.failed ? null : result.total;
}

/** The slugs of listed schools with these federal unit IDs (for Power 4 membership, which is kept by unit ID). */
export async function slugsForUnitIds(unitids: readonly number[]): Promise<ReadonlyMap<number, string> | 'failed'> {
  const map = new Map<number, string>();
  if (unitids.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.from('institutions').select('slug, unitid').in('unitid', unitids.slice(0, 200));
  if (error) return 'failed';
  for (const row of (data ?? []) as { slug: string; unitid: number }[]) map.set(row.unitid, row.slug);
  return map;
}
