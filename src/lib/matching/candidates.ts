/**
 * The schools the My schools list sorts: every active program at the five
 * suggestion levels, in the shape the suggestion engine reads, plus the few
 * display fields the list shows. Built on the server from public registry
 * rows only; the player's numbers never reach the server (decision F45).
 *
 * Pure functions with relative, type-only imports.
 */

import type { CurrentPolicy, DivisionCode, GpaRangeRow, SchoolSummary } from '../registry/types';
import type { Level } from './eligibility';
import type { SchoolEvidence } from './rules';
import type { SuggestionSchool } from './suggestions';

/** Divisions placed by level (rulebook §1): NCAA I–III, NAIA and the junior college associations. */
export const DIVISIONS_BY_LEVEL: Readonly<Record<Level, readonly DivisionCode[]>> = {
  ncaa_d1: ['ncaa_d1'],
  ncaa_d2: ['ncaa_d2'],
  ncaa_d3: ['ncaa_d3'],
  naia: ['naia'],
  juco: ['njcaa_d1', 'njcaa_d2', 'njcaa_d3', 'cccaa', 'nwac'],
};

export const SUGGESTED_DIVISIONS: readonly DivisionCode[] = Object.values(DIVISIONS_BY_LEVEL).flat();

/** Associations the list doesn't place by level yet; only counted. */
export const NOT_SUGGESTED_DIVISIONS: readonly DivisionCode[] = ['uscaa', 'nccaa_d1', 'nccaa_d2', 'independent', 'other'];

/** The levels the list shows first (founder decision, 2026-11-17: the academic side targets D1, D2 and D3). */
export const DEFAULT_LIST_LEVELS: readonly Level[] = ['ncaa_d1', 'ncaa_d2', 'ncaa_d3'];

export interface ListSchool extends SuggestionSchool {
  readonly city: string | null;
  readonly conference: string | null;
  /** The Power 4 conference's display name (for example "SEC"), or null. */
  readonly power4Conference: string | null;
}

export interface ListCandidate {
  readonly school: ListSchool;
  readonly evidence: SchoolEvidence;
}

/** One registry row, its checked policies and published GPA range, as a list candidate. */
export function toListCandidate(
  row: SchoolSummary,
  policies: readonly CurrentPolicy[],
  gpa: GpaRangeRow | null,
  power4Conference: string | null,
): ListCandidate {
  const power4 = row.division_code === 'ncaa_d1' && power4Conference !== null;
  return {
    school: {
      slug: row.slug,
      name: row.name,
      city: row.city,
      state: row.state,
      setting: row.setting,
      division_code: row.division_code,
      cost_of_attendance: row.cost_of_attendance,
      cost_year: row.cost_year,
      conference: row.conference,
      power4,
      power4Conference: power4 ? power4Conference : null,
    },
    evidence: {
      slug: row.slug,
      admissionsTerm: row.admissions_term,
      satErw: [row.sat_erw_25, row.sat_erw_75],
      satMath: [row.sat_math_25, row.sat_math_75],
      actComposite: [row.act_composite_25, row.act_composite_75],
      historicalTestPolicy: row.test_policy,
      openAdmission: row.open_admission ?? null,
      currentPolicies: policies
        .filter((p) => p.slug === row.slug)
        .map((p) => ({
          applicant_type: p.applicant_type,
          entry_year: p.entry_year,
          test_policy: p.test_policy,
          source_url: p.source_url,
          verified_at: p.verified_at,
        })),
      gpa: gpa ? { low: gpa.low, high: gpa.high, term: gpa.entering_term, weighting: gpa.weighting } : null,
    },
  };
}
