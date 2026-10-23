/**
 * Current (checked) admissions policies versus historical statistics.
 *
 * The College Scorecard / IPEDS test policy describes the entering class the
 * statistics come from (for example Fall 2024). It is history, shown as such,
 * and never used as a current rule. A current policy exists only when an
 * administrator checked the school's official admissions page for a specific
 * applicant type and entry year (public.admissions_policies).
 */

import type { ApplicantType, CurrentPolicy } from './types';

/** The newest checked policy for this applicant type, or null when none is on record. */
export function latestPolicy(
  policies: readonly CurrentPolicy[] | undefined,
  applicantType: ApplicantType,
): CurrentPolicy | null {
  let best: CurrentPolicy | null = null;
  for (const policy of policies ?? []) {
    if (policy.applicant_type !== applicantType) continue;
    if (!best || policy.entry_year > best.entry_year) best = policy;
  }
  return best;
}

/** The checked policy for exactly this applicant type and entry year, or null (unknown). */
export function policyFor(
  policies: readonly CurrentPolicy[] | undefined,
  applicantType: ApplicantType,
  entryYear: number,
): CurrentPolicy | null {
  return (policies ?? []).find((p) => p.applicant_type === applicantType && p.entry_year === entryYear) ?? null;
}

export const APPLICANT_LABELS: Readonly<Record<ApplicantType, string>> = {
  first_year: 'First-year applicants',
  transfer: 'Transfer applicants',
};

export function entryLabel(year: number): string {
  return `entering fall ${year}`;
}
