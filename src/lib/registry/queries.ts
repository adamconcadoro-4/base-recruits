import 'server-only';

import { createClient } from '@/lib/supabase/server';

import { MAX_COMPARE, toSearchArgs, type ExplorerState } from './search-params';
import type { RegistryCoverage, SchoolRecord, SchoolSummary } from './types';

export interface SearchResult {
  readonly rows: readonly SchoolSummary[];
  readonly total: number;
  readonly failed: boolean;
}

/** The registry's free search, run as the visitor (anonymous or signed in). */
export async function searchSchools(state: ExplorerState): Promise<SearchResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_schools', toSearchArgs(state));
  if (error) return { rows: [], total: 0, failed: true };
  const rows = (data ?? []) as SchoolSummary[];
  return { rows, total: rows[0]?.total_count ?? 0, failed: false };
}

export async function getSchool(slug: string): Promise<SchoolRecord | null | 'failed'> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_school', { p_slug: slug });
  if (error) return 'failed';
  return (data as SchoolRecord | null) ?? null;
}

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
