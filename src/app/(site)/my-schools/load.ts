import 'server-only';

import { toListCandidate, NOT_SUGGESTED_DIVISIONS, SUGGESTED_DIVISIONS, type ListCandidate } from '@/lib/matching/candidates';
import { POWER4_CONFERENCE_NAMES, POWER4_MEMBERS } from '@/lib/matching/power4';
import { allSchoolsIn, countSchoolsIn, currentPolicies, gpaRanges, slugsForUnitIds } from '@/lib/registry/queries';
import type { CurrentPolicy, GpaRangeRow } from '@/lib/registry/types';

export type CandidateLoad =
  | {
      readonly status: 'ok';
      readonly candidates: readonly ListCandidate[];
      /** Programs in associations the list doesn't place by level yet (null when the count didn't load). */
      readonly otherAssociations: number | null;
    }
  | { readonly status: 'failed' };

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Every program the My schools list can place, with the evidence the rules
 * read. Public registry data only: nothing about the player is sent here.
 */
export async function loadListCandidates(): Promise<CandidateLoad> {
  const [rows, otherAssociations, power4Slugs] = await Promise.all([
    allSchoolsIn(SUGGESTED_DIVISIONS),
    countSchoolsIn(NOT_SUGGESTED_DIVISIONS),
    slugsForUnitIds(POWER4_MEMBERS.map((m) => m.unitid)),
  ]);
  if (rows === 'failed' || power4Slugs === 'failed') return { status: 'failed' };

  const slugs = [...new Set(rows.map((r) => r.slug))];
  const parts = chunks(slugs, 1000);
  const [policyMaps, gpaMaps] = await Promise.all([
    Promise.all(parts.map((part) => currentPolicies(part))),
    Promise.all(parts.map((part) => gpaRanges(part))),
  ]);
  if (policyMaps.some((m) => m === 'failed') || gpaMaps.some((m) => m === 'failed')) return { status: 'failed' };

  const policies = new Map<string, readonly CurrentPolicy[]>();
  const gpa = new Map<string, GpaRangeRow>();
  for (const m of policyMaps) if (m !== 'failed') for (const [k, v] of m) policies.set(k, v);
  for (const m of gpaMaps) if (m !== 'failed') for (const [k, v] of m) gpa.set(k, v);

  const conferenceBySlug = new Map<string, string>();
  for (const member of POWER4_MEMBERS) {
    const slug = power4Slugs.get(member.unitid);
    if (slug) conferenceBySlug.set(slug, POWER4_CONFERENCE_NAMES[member.conference]);
  }

  return {
    status: 'ok',
    candidates: rows.map((row) => toListCandidate(row, policies.get(row.slug) ?? [], gpa.get(row.slug) ?? null, conferenceBySlug.get(row.slug) ?? null)),
    otherAssociations,
  };
}
