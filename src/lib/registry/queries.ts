import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import { MAX_COMPARE, toSearchArgs, type ExplorerState } from './search-params';
import type { CurrentPolicy, RegistryCoverage, SchoolRecord, SchoolSummary } from './types';

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
