'use server';

import { isSignedIn } from '@/lib/auth/session';
import { normalizeDivisionValues } from '@/lib/registry/divisions';
import { currentPolicies, mySavedSlugs, schoolsBySlugs, searchSchools } from '@/lib/registry/queries';
import { SLUG_PATTERN, parseExplorerParams } from '@/lib/registry/search-params';
import { STATE_NAMES } from '@/lib/registry/states';
import type { CurrentPolicy, SchoolSummary } from '@/lib/registry/types';

/**
 * Candidate schools for the score comparison. Only the school filters reach
 * the server; the applicant's grades and scores never leave the browser.
 */
export interface CandidateResult {
  readonly status: 'ok' | 'failed';
  readonly schools: readonly SchoolSummary[];
  readonly policies: readonly CurrentPolicy[];
  readonly total: number;
}

const FAILED: CandidateResult = { status: 'failed', schools: [], policies: [], total: 0 };

async function withPolicies(schools: readonly SchoolSummary[], total: number): Promise<CandidateResult> {
  const map = await currentPolicies(schools.map((s) => s.slug));
  if (map === 'failed') return FAILED;
  return { status: 'ok', schools, policies: [...map.values()].flat(), total };
}

export async function matchCandidates(filters: {
  readonly state: string;
  readonly divisions: readonly string[];
  readonly page: number;
}): Promise<CandidateResult> {
  const state = typeof filters.state === 'string' && filters.state.toUpperCase() in STATE_NAMES ? filters.state.toUpperCase() : '';
  const divisions = normalizeDivisionValues(Array.isArray(filters.divisions) ? filters.divisions.filter((d) => typeof d === 'string') : []).codes;
  const page = Number.isInteger(filters.page) && filters.page >= 1 && filters.page <= 20 ? filters.page : 1;
  const explorer = parseExplorerParams({ ...(state ? { state } : {}), division: [...divisions], page: String(page) });
  const result = await searchSchools(explorer, 100);
  if (result.failed) return FAILED;
  return withPolicies(result.rows, result.total);
}

/** The visitor's saved schools: a guest's browser list (slugs sent by the page) or the account's list. */
export async function savedCandidates(guestSlugs: readonly unknown[]): Promise<CandidateResult> {
  let slugs: string[];
  if (await isSignedIn()) {
    const saved = await mySavedSlugs();
    if (saved === null) return FAILED;
    slugs = [...saved];
  } else {
    slugs = (Array.isArray(guestSlugs) ? guestSlugs : [])
      .filter((s): s is string => typeof s === 'string' && s.length <= 120 && SLUG_PATTERN.test(s))
      .slice(0, 1000);
  }
  const schools = await schoolsBySlugs(slugs);
  if (schools === 'failed') return FAILED;
  return withPolicies(schools, schools.length);
}
