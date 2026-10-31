/**
 * Academic fit labels (founder decision F15, approved 2026-10-30): Fit,
 * Stretch, Reach or Not enough data, derived only from the existing score
 * comparison in rules.ts. No new thresholds are introduced here: the label is
 * a name for where the player's compared scores sit against the ranges the
 * school reported, plus the one hard fact the comparison knows (a checked
 * test requirement the player won't meet). See docs/matching-rulebook.md.
 *
 *  - Fit: every compared score is within or above the reported range, and no
 *    checked requirement is unmet.
 *  - Stretch: some compared scores are below a reported range.
 *  - Reach: every compared score is below the reported ranges, or a checked
 *    current requirement is not met (for example a required test the player
 *    said they won't send).
 *  - Not enough data: nothing could be compared (no scores entered, scores not
 *    sent, test-blind, no reported ranges, or a transfer applicant, whose
 *    scores are never compared with first-year ranges). An unmet checked
 *    requirement is still a Reach for transfers too.
 *
 * The label never claims an admission outcome. Ranges describe a past entering
 * class as a whole, not recruited athletes, and that caveat travels with every
 * label through the comparison's own reasons.
 */

import { scoreGroup, type ComparisonResult } from './rules';

export const FIT_RULES_VERSION = '2026-10-30.1';

export const ACADEMIC_FITS = ['fit', 'stretch', 'reach', 'not_enough_data'] as const;
export type AcademicFit = (typeof ACADEMIC_FITS)[number];

export type AcademicFitReason = 'SCORES_AT_OR_ABOVE' | 'SOME_SCORES_BELOW' | 'ALL_SCORES_BELOW' | 'REQUIREMENT_NOT_MET' | 'NOTHING_COMPARED';

export interface AcademicFitResult {
  readonly fit: AcademicFit;
  readonly reason: AcademicFitReason;
  readonly rulesVersion: string;
}

export function academicFit(result: ComparisonResult): AcademicFitResult {
  const base = { rulesVersion: FIT_RULES_VERSION };
  if (result.requirementSummary === 'not_met') return { ...base, fit: 'reach', reason: 'REQUIREMENT_NOT_MET' };
  switch (scoreGroup(result)) {
    case 'at_or_above':
      return { ...base, fit: 'fit', reason: 'SCORES_AT_OR_ABOVE' };
    case 'mixed':
      return { ...base, fit: 'stretch', reason: 'SOME_SCORES_BELOW' };
    case 'below':
      return { ...base, fit: 'reach', reason: 'ALL_SCORES_BELOW' };
    case 'not_compared':
      return { ...base, fit: 'not_enough_data', reason: 'NOTHING_COMPARED' };
  }
}
