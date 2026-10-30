/**
 * The school suggestion engine: one list that combines the player's athletic
 * level (from Paul's per-level standards), academic fit (fit.ts), academic
 * eligibility to compete (eligibility.ts) and the player's own filters
 * (budget, states, campus setting, levels). Rules approved by the founder on
 * 2026-10-30 and written out in docs/matching-rulebook.md.
 *
 * Groups:
 *  - Strong fit: athletically in range for the school's level, and an academic Fit.
 *  - Possible fit: in range, and an academic Stretch (or a Fit whose
 *    eligibility depends on something Base Recruits doesn't ask for).
 *  - Reach: in range, and an academic Reach, or below the level's published
 *    minimum GPA to compete.
 *  - Not enough data: the level's athletic result or the academic comparison
 *    is missing. Always returned, never hidden.
 * Levels where the player is below the athletic standard are left out and
 * counted, so the page can say how many schools were set aside and why.
 *
 * Guarantees, each covered by a test:
 *  - No subscription, plan or payment input exists: two players with the same
 *    data get the same list, whatever they pay (no pay-to-win).
 *  - Missing data never excludes a school and never counts against a player;
 *    an unreported cost stays in the list, labelled.
 *  - No ranking score is invented: groups are sorted by name, and the page can
 *    re-sort by published cost.
 *  - Every suggestion carries its reasons and the versions of every rule set
 *    that produced it.
 *
 * Pure functions with relative, type-only imports.
 */

import type { CampusSetting, DivisionCode } from '../registry/types';
import { ELIGIBILITY_RULES_VERSION, checkAllLevels, levelForDivision, type EligibilityCheck, type EligibilityExtras, type Level } from './eligibility';
import { FIT_RULES_VERSION, academicFit, type AcademicFitResult } from './fit';
import { RULES_VERSION, compareSchool, type ApplicantInput, type ComparisonResult, type SchoolEvidence } from './rules';

export const SUGGESTION_RULES_VERSION = '2026-10-30.1';

// ---------------------------------------------------------------------------
// The athletic side (Paul's standards). Base Recruits receives a per-level
// result; how a player counts as "in range" is Paul's rule, recorded with his
// standards release (decision F44). Until standards are loaded every level is
// "not_enough_data".
// ---------------------------------------------------------------------------

export type AthleticStatus = 'in_range' | 'below' | 'not_enough_data';

export interface AthleticLevelResult {
  readonly status: AthleticStatus;
  /** The standards release the result was calculated from; null when there is none. */
  readonly standardsVersion: string | null;
}

export interface AthleticProfile {
  /** A level that is missing here counts as "not_enough_data". */
  readonly byLevel: Readonly<Partial<Record<Level, AthleticLevelResult>>>;
}

export const NO_ATHLETIC_DATA: AthleticProfile = { byLevel: {} };

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The registry fields the engine reads (a subset of SchoolSummary). */
export interface SuggestionSchool {
  readonly slug: string;
  readonly name: string;
  readonly state: string | null;
  readonly setting: CampusSetting | null;
  readonly division_code: DivisionCode;
  readonly cost_of_attendance: number | null;
  readonly cost_year: string | null;
}

export interface SuggestionCandidate {
  readonly school: SuggestionSchool;
  readonly evidence: SchoolEvidence;
}

export interface SuggestionPreferences {
  /** Published cost of attendance ceiling in dollars, or null for any. Never net price. */
  readonly maxCostOfAttendance: number | null;
  /** Two-letter state codes; empty means any. */
  readonly states: readonly string[];
  /** Campus settings; empty means any. */
  readonly settings: readonly CampusSetting[];
  /** Levels the player wants to see; empty means any. */
  readonly levels: readonly Level[];
}

export const ANY_PREFERENCES: SuggestionPreferences = { maxCostOfAttendance: null, states: [], settings: [], levels: [] };

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export const SUGGESTION_GROUPS = ['strong_fit', 'possible_fit', 'reach', 'not_enough_data'] as const;
export type SuggestionGroup = (typeof SUGGESTION_GROUPS)[number];

export type SuggestionReason =
  | 'ATHLETIC_IN_RANGE'
  | 'ATHLETIC_NOT_ASSESSED'
  | 'ACADEMIC_FIT'
  | 'ACADEMIC_STRETCH'
  | 'ACADEMIC_REACH'
  | 'ACADEMIC_NOT_COMPARED'
  | 'ELIGIBILITY_BELOW_MINIMUM'
  | 'ELIGIBILITY_DEPENDS'
  | 'COST_WITHIN_BUDGET'
  | 'COST_NOT_REPORTED'
  | 'SETTING_NOT_REPORTED'
  | 'STATE_NOT_REPORTED';

export type ExclusionReason =
  | 'LEVEL_NOT_SUGGESTED'
  | 'LEVEL_NOT_CHOSEN'
  | 'ATHLETIC_BELOW_LEVEL'
  | 'OVER_BUDGET'
  | 'OUTSIDE_CHOSEN_STATES'
  | 'OUTSIDE_CHOSEN_SETTINGS';

export interface Suggestion {
  readonly school: SuggestionSchool;
  readonly level: Level;
  readonly group: SuggestionGroup;
  readonly athletic: AthleticLevelResult;
  readonly academic: AcademicFitResult;
  readonly comparison: ComparisonResult;
  readonly eligibility: EligibilityCheck;
  readonly reasons: readonly SuggestionReason[];
}

export interface SuggestionVersions {
  readonly suggestions: string;
  readonly comparison: string;
  readonly academicFit: string;
  readonly eligibility: string;
  /** Distinct standards releases the athletic results came from. */
  readonly athleticStandards: readonly string[];
}

export interface SuggestionList {
  readonly groups: Readonly<Record<SuggestionGroup, readonly Suggestion[]>>;
  /** How many candidates were left out, by the first reason that excluded them. */
  readonly excluded: Readonly<Record<ExclusionReason, number>>;
  readonly eligibilityByLevel: Readonly<Record<Level, EligibilityCheck>>;
  readonly versions: SuggestionVersions;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const NOT_ASSESSED: AthleticLevelResult = { status: 'not_enough_data', standardsVersion: null };

function exclusionFor(school: SuggestionSchool, level: Level | null, prefs: SuggestionPreferences, athletic: AthleticLevelResult): ExclusionReason | null {
  if (level === null) return 'LEVEL_NOT_SUGGESTED';
  if (prefs.levels.length > 0 && !prefs.levels.includes(level)) return 'LEVEL_NOT_CHOSEN';
  // Unknown values never exclude: only a reported value outside the player's filter does.
  if (prefs.states.length > 0 && school.state !== null && !prefs.states.includes(school.state)) return 'OUTSIDE_CHOSEN_STATES';
  if (prefs.settings.length > 0 && school.setting !== null && !prefs.settings.includes(school.setting)) return 'OUTSIDE_CHOSEN_SETTINGS';
  if (prefs.maxCostOfAttendance !== null && school.cost_of_attendance !== null && school.cost_of_attendance > prefs.maxCostOfAttendance) {
    return 'OVER_BUDGET';
  }
  if (athletic.status === 'below') return 'ATHLETIC_BELOW_LEVEL';
  return null;
}

const ACADEMIC_REASON: Readonly<Record<AcademicFitResult['fit'], SuggestionReason>> = {
  fit: 'ACADEMIC_FIT',
  stretch: 'ACADEMIC_STRETCH',
  reach: 'ACADEMIC_REACH',
  not_enough_data: 'ACADEMIC_NOT_COMPARED',
};

/** The approved grouping rule, on its own so the rulebook and the tests can point at it. */
export function groupFor(
  athletic: AthleticStatus,
  academic: AcademicFitResult['fit'],
  eligibility: EligibilityCheck['status'],
): { readonly group: SuggestionGroup; readonly reasons: readonly SuggestionReason[] } {
  const reasons: SuggestionReason[] = [];
  if (athletic !== 'in_range') reasons.push('ATHLETIC_NOT_ASSESSED');
  else reasons.push('ATHLETIC_IN_RANGE');
  reasons.push(ACADEMIC_REASON[academic]);
  if (athletic !== 'in_range' || academic === 'not_enough_data') {
    if (eligibility === 'below' || eligibility === 'likely_below') reasons.push('ELIGIBILITY_BELOW_MINIMUM');
    return { group: 'not_enough_data', reasons };
  }
  let group: SuggestionGroup = academic === 'fit' ? 'strong_fit' : academic === 'stretch' ? 'possible_fit' : 'reach';
  if (eligibility === 'below' || eligibility === 'likely_below') {
    group = 'reach';
    reasons.push('ELIGIBILITY_BELOW_MINIMUM');
  } else if (eligibility === 'depends') {
    if (group === 'strong_fit') group = 'possible_fit';
    reasons.push('ELIGIBILITY_DEPENDS');
  }
  return { group, reasons };
}

function emptyExcluded(): Record<ExclusionReason, number> {
  return {
    LEVEL_NOT_SUGGESTED: 0,
    LEVEL_NOT_CHOSEN: 0,
    ATHLETIC_BELOW_LEVEL: 0,
    OVER_BUDGET: 0,
    OUTSIDE_CHOSEN_STATES: 0,
    OUTSIDE_CHOSEN_SETTINGS: 0,
  };
}

/**
 * Builds the suggestion list. Deliberately takes no plan, subscription or
 * payment argument: what a player pays never changes their suggestions.
 */
export function suggestSchools(
  candidates: readonly SuggestionCandidate[],
  input: ApplicantInput,
  athletic: AthleticProfile,
  preferences: SuggestionPreferences = ANY_PREFERENCES,
  extras?: EligibilityExtras,
): SuggestionList {
  const eligibilityByLevel = checkAllLevels(input, extras);
  const groups: Record<SuggestionGroup, Suggestion[]> = { strong_fit: [], possible_fit: [], reach: [], not_enough_data: [] };
  const excluded = emptyExcluded();
  const standards = new Set<string>();
  const seen = new Set<string>();

  for (const { school, evidence } of candidates) {
    if (seen.has(school.slug)) continue; // a school listed twice counts once
    seen.add(school.slug);
    const level = levelForDivision(school.division_code);
    const athleticResult = level === null ? NOT_ASSESSED : (athletic.byLevel[level] ?? NOT_ASSESSED);
    const exclusion = exclusionFor(school, level, preferences, athleticResult);
    if (exclusion !== null || level === null) {
      excluded[exclusion ?? 'LEVEL_NOT_SUGGESTED'] += 1;
      continue;
    }
    if (athleticResult.standardsVersion !== null) standards.add(athleticResult.standardsVersion);
    const comparison = compareSchool(evidence, input);
    const academic = academicFit(comparison);
    const eligibility = eligibilityByLevel[level];
    const { group, reasons } = groupFor(athleticResult.status, academic.fit, eligibility.status);
    const all = [...reasons];
    if (preferences.maxCostOfAttendance !== null) all.push(school.cost_of_attendance === null ? 'COST_NOT_REPORTED' : 'COST_WITHIN_BUDGET');
    if (preferences.settings.length > 0 && school.setting === null) all.push('SETTING_NOT_REPORTED');
    if (preferences.states.length > 0 && school.state === null) all.push('STATE_NOT_REPORTED');
    groups[group].push({ school, level, group, athletic: athleticResult, academic, comparison, eligibility, reasons: all });
  }

  const byName = (a: Suggestion, b: Suggestion) => a.school.name.localeCompare(b.school.name, 'en') || a.school.slug.localeCompare(b.school.slug);
  for (const key of SUGGESTION_GROUPS) groups[key].sort(byName);

  return {
    groups,
    excluded,
    eligibilityByLevel,
    versions: {
      suggestions: SUGGESTION_RULES_VERSION,
      comparison: RULES_VERSION,
      academicFit: FIT_RULES_VERSION,
      eligibility: ELIGIBILITY_RULES_VERSION,
      athleticStandards: [...standards].sort(),
    },
  };
}

/** Re-sorts one group by published cost of attendance (unreported costs last), keeping name order for ties. */
export function sortByCost(list: readonly Suggestion[]): Suggestion[] {
  return [...list].sort((a, b) => {
    const ca = a.school.cost_of_attendance;
    const cb = b.school.cost_of_attendance;
    if (ca === null && cb === null) return a.school.name.localeCompare(b.school.name, 'en');
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca - cb || a.school.name.localeCompare(b.school.name, 'en');
  });
}
