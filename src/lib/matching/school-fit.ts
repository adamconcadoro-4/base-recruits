/**
 * One school's result for one player: the same rules as the suggestion list
 * (docs/matching-rulebook.md), applied to a single school so its own page can
 * show "your fit with this school". No new rules live here; it composes
 * compareSchool, academicFit, checkEligibility and groupFor.
 *
 * Pure functions with relative, type-only imports.
 */

import type { DivisionCode } from '../registry/types';
import { checkEligibility, levelForDivision, NO_EXTRAS, type EligibilityCheck, type EligibilityExtras, type Level } from './eligibility';
import { academicFit, type AcademicFitResult } from './fit';
import { compareSchool, type ApplicantInput, type ComparisonResult, type SchoolEvidence } from './rules';
import { groupFor, type AthleticLevelResult, type SuggestionGroup, type SuggestionReason } from './suggestions';

export interface PlacedSchoolFit {
  readonly placed: true;
  readonly level: Level;
  readonly athletic: AthleticLevelResult;
  readonly comparison: ComparisonResult;
  readonly academic: AcademicFitResult;
  readonly eligibility: EligibilityCheck;
  /**
   * The suggestion group, or null when the player's assessment is below this
   * level's standard (the list sets such schools aside rather than grouping them).
   */
  readonly group: SuggestionGroup | null;
  readonly reasons: readonly SuggestionReason[];
}

export interface UnplacedSchoolFit {
  readonly placed: false;
  /** The school's association isn't one of the five suggestion levels (USCAA, NCCAA, independent, "Other"). */
  readonly reason: 'LEVEL_NOT_SUGGESTED';
  readonly comparison: ComparisonResult;
  readonly academic: AcademicFitResult;
}

export type SchoolFit = PlacedSchoolFit | UnplacedSchoolFit;

const NOT_ASSESSED: AthleticLevelResult = { status: 'not_enough_data', standardsVersion: null };

/**
 * The player's fit with one school. `athletic` is the player's result for the
 * school's level, or null when there is none (no standards loaded, or no
 * assessment yet). Takes no plan or payment input.
 */
export function schoolFit(
  evidence: SchoolEvidence,
  division: DivisionCode,
  input: ApplicantInput,
  athletic: AthleticLevelResult | null,
  extras: EligibilityExtras = NO_EXTRAS,
): SchoolFit {
  const comparison = compareSchool(evidence, input);
  const academic = academicFit(comparison);
  const level = levelForDivision(division);
  if (level === null) return { placed: false, reason: 'LEVEL_NOT_SUGGESTED', comparison, academic };
  const athleticResult = athletic ?? NOT_ASSESSED;
  const eligibility = checkEligibility(level, input, extras);
  if (athleticResult.status === 'below') {
    return { placed: true, level, athletic: athleticResult, comparison, academic, eligibility, group: null, reasons: [] };
  }
  const { group, reasons } = groupFor(athleticResult.status, academic.fit, eligibility.status);
  return { placed: true, level, athletic: athleticResult, comparison, academic, eligibility, group, reasons };
}
