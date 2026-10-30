/**
 * Academic eligibility to compete, by level — the GPA side of the academic
 * engine (founder decision F43, 2026-10-30).
 *
 * Schools don't report GPA in the federal data the registry uses, so a
 * player's GPA can't be compared with a school's admitted class. What CAN be
 * checked is each association's published minimum to compete as an entering
 * freshman. That is what this module does, and only that:
 *
 *  - It is an eligibility-to-compete check, never an admission check. Meeting
 *    a minimum says nothing about getting in.
 *  - Every rule cites the official source it was checked against and the date
 *    it was checked (ELIGIBILITY_RULES). Rules are re-checked each autumn.
 *  - The NCAA minimum is a CORE-COURSE GPA calculated by the NCAA Eligibility
 *    Center. A player's overall GPA can differ, so a check that rests on the
 *    overall GPA is labelled "likely", never stated as fact.
 *  - Weighted and unweighted GPAs are never mixed, and only GPAs on a 4.0 scale
 *    are compared. Anything else is "unknown", never a guess.
 *  - Associations whose current minimum has not been confirmed (junior
 *    colleges, USCAA, NCCAA, independents) are "unknown", not "no minimum".
 *  - Freshman rules don't apply to transfers, so transfers are "not applicable".
 *  - These are the player's current numbers. A final high school GPA can move.
 *
 * Pure functions with relative, type-only imports, so the module can be tested
 * anywhere.
 */

import type { DivisionCode } from '../registry/types';
import type { ApplicantInput } from './rules';

export const ELIGIBILITY_RULES_VERSION = '2026-10-30.1';

/** The levels Base Recruits suggests schools by (the same levels Paul's standards use). */
export const LEVELS = ['ncaa_d1', 'ncaa_d2', 'ncaa_d3', 'naia', 'juco'] as const;
export type Level = (typeof LEVELS)[number];

/** Which suggestion level a registry division belongs to; null when it isn't one of the five. */
export function levelForDivision(code: DivisionCode): Level | null {
  switch (code) {
    case 'ncaa_d1':
    case 'ncaa_d2':
    case 'ncaa_d3':
    case 'naia':
      return code;
    case 'njcaa_d1':
    case 'njcaa_d2':
    case 'njcaa_d3':
    case 'cccaa':
    case 'nwac':
      return 'juco';
    default:
      return null;
  }
}

export interface RuleSource {
  readonly title: string;
  readonly url: string;
  /** Date the rule was checked against the source (YYYY-MM-DD). */
  readonly checkedOn: string;
}

interface NcaaRule {
  readonly kind: 'ncaa_core_gpa';
  /** Minimum core-course GPA (4.0 scale) to compete as an entering freshman. */
  readonly minimum: number;
  /** Division I only: the lower bound of the academic-redshirt range (practice and aid, no competition in year one). */
  readonly redshirtMinimum: number | null;
  readonly sources: readonly RuleSource[];
}

interface NaiaRule {
  readonly kind: 'naia';
  /** A final high school GPA at or above this alone makes an entering freshman eligible. */
  readonly gpaAlone: number;
  /** Otherwise two of three: this GPA, top half of the graduating class, or the test minimum below. */
  readonly gpaOfTwo: number;
  readonly actMinimum: number;
  /** SAT Reading/Writing + Math. */
  readonly satMinimum: number;
  readonly sources: readonly RuleSource[];
}

interface NoDivisionMinimum {
  readonly kind: 'no_division_minimum';
  readonly sources: readonly RuleSource[];
}

interface Unconfirmed {
  readonly kind: 'unconfirmed';
}

export type EligibilityRule = NcaaRule | NaiaRule | NoDivisionMinimum | Unconfirmed;

const CHECKED_ON = '2026-10-30';

/**
 * The checked rules. Sources: the NCAA's legislative database for Division I
 * (Proposal 2022-34, adopted 2023-01-11, effective for students first
 * enrolling on or after 2023-08-01: test scores removed, 2.300 core GPA to
 * compete, 2.000 for an academic redshirt); the NCAA's report of the Division
 * II proposal (16 core courses, 2.2 GPA, no test score); and the NAIA's own
 * interpretation page. The NCAA Eligibility Center pages could not be loaded
 * from the build environment on 2026-10-30 and should be opened by a person
 * before launch (see docs/matching-rulebook.md).
 */
export const ELIGIBILITY_RULES: Readonly<Record<Level, EligibilityRule>> = {
  ncaa_d1: {
    kind: 'ncaa_core_gpa',
    minimum: 2.3,
    redshirtMinimum: 2.0,
    sources: [
      {
        title: 'NCAA Division I Proposal 2022-34 (Academic Eligibility)',
        url: 'https://web3.ncaa.org/lsdbi/search/proposalView?id=106367',
        checkedOn: CHECKED_ON,
      },
    ],
  },
  ncaa_d2: {
    kind: 'ncaa_core_gpa',
    minimum: 2.2,
    redshirtMinimum: null,
    sources: [
      {
        title: 'NCAA: DII 2023 Convention preview (initial-eligibility proposal)',
        url: 'https://www.ncaa.org/news/media-center-dii-2023-convention-preview-member-schools-to-vote-on-12-proposals/',
        checkedOn: CHECKED_ON,
      },
    ],
  },
  ncaa_d3: {
    kind: 'no_division_minimum',
    sources: [
      {
        title: 'NCAA Initial Eligibility Requirements (Division III schools set their own academic standards)',
        url: 'https://www.ncaa.org/eligibility-center/initial-eligibility-requirements/',
        checkedOn: CHECKED_ON,
      },
    ],
  },
  naia: {
    kind: 'naia',
    gpaAlone: 2.3,
    gpaOfTwo: 2.0,
    actMinimum: 18,
    satMinimum: 970,
    sources: [
      {
        title: 'NAIA Legislative Interpretations: Basics of Freshman Eligibility',
        url: 'https://interpretations.naia.org/basics-of-freshman-eligibility/',
        checkedOn: CHECKED_ON,
      },
    ],
  },
  juco: { kind: 'unconfirmed' },
};

export type EligibilityStatus =
  /** The player's current numbers meet the published minimum. */
  | 'meets'
  /** The overall GPA meets the NCAA minimum; the core-course GPA that counts hasn't been entered. */
  | 'likely_meets'
  /** The player's current numbers are below the published minimum. */
  | 'below'
  /** The overall GPA is below the NCAA minimum; the core-course GPA that counts hasn't been entered. */
  | 'likely_below'
  /** Meeting it depends on something Base Recruits doesn't ask for (class rank). */
  | 'depends'
  /** Not enough information, or no confirmed rule. */
  | 'unknown'
  /** No association-wide minimum applies (Division III, transfers). */
  | 'not_applicable';

export type EligibilityReason =
  | 'TRANSFER_RULES_DIFFER'
  | 'DIVISION_III_SCHOOLS_SET_STANDARDS'
  | 'RULE_NOT_CONFIRMED'
  | 'GPA_NOT_ENTERED'
  | 'GPA_SCALE_NOT_COMPARABLE'
  | 'GPA_WEIGHTED_NOT_COMPARABLE'
  | 'CORE_GPA_USED'
  | 'OVERALL_GPA_NOT_CORE_GPA'
  | 'NCAA_AT_OR_ABOVE_MINIMUM'
  | 'NCAA_BELOW_MINIMUM'
  | 'NCAA_ACADEMIC_REDSHIRT_RANGE'
  | 'NAIA_GPA_ALONE'
  | 'NAIA_GPA_AND_TEST'
  | 'NAIA_NEEDS_RANK_OR_TEST'
  | 'NAIA_NEEDS_RANK_AND_TEST'
  | 'NAIA_TEST_ONLY_NEEDS_GPA_OR_RANK'
  | 'NAIA_BELOW_WITHOUT_RANK_AND_TEST'
  | 'TEST_NOT_SENT'
  | 'CURRENT_NOT_FINAL';

export interface EligibilityCheck {
  readonly level: Level;
  readonly status: EligibilityStatus;
  /** The GPA minimum the status was judged against, when one applies. */
  readonly minimum: number | null;
  /** The GPA value that was compared, if any. */
  readonly comparedGpa: number | null;
  readonly reasons: readonly EligibilityReason[];
  readonly sources: readonly RuleSource[];
  readonly rulesVersion: string;
}

/** Extra academic input the eligibility check can use beyond ApplicantInput. */
export interface EligibilityExtras {
  /** The NCAA core-course GPA (4.0 scale) if the player knows it, e.g. from the NCAA Eligibility Center. */
  readonly ncaaCoreGpa: number | null;
}

/** A GPA on a 4.0 scale that isn't weighted, or null with the reason it can't be compared. */
function comparableGpa(input: ApplicantInput): { readonly value: number } | { readonly reason: EligibilityReason } {
  if (!input.gpa) return { reason: 'GPA_NOT_ENTERED' };
  if (input.gpa.scale !== 4) return { reason: 'GPA_SCALE_NOT_COMPARABLE' };
  if (input.gpa.type === 'weighted') return { reason: 'GPA_WEIGHTED_NOT_COMPARABLE' };
  return { value: input.gpa.value };
}

function naiaTestMet(input: ApplicantInput, rule: NaiaRule): boolean {
  if (input.submitScores === 'no') return false;
  const act = input.act?.composite ?? null;
  const satTotal = input.sat && input.sat.erw !== null && input.sat.math !== null ? input.sat.erw + input.sat.math : null;
  return (act !== null && act >= rule.actMinimum) || (satTotal !== null && satTotal >= rule.satMinimum);
}

function checkNcaa(level: Level, rule: NcaaRule, input: ApplicantInput, extras: EligibilityExtras): EligibilityCheck {
  const base = { level, minimum: rule.minimum, sources: rule.sources, rulesVersion: ELIGIBILITY_RULES_VERSION };
  const core = extras.ncaaCoreGpa;
  if (core !== null && Number.isFinite(core) && core >= 0 && core <= 4) {
    if (core >= rule.minimum) {
      return { ...base, status: 'meets', comparedGpa: core, reasons: ['CORE_GPA_USED', 'NCAA_AT_OR_ABOVE_MINIMUM', 'CURRENT_NOT_FINAL'] };
    }
    const reasons: EligibilityReason[] = ['CORE_GPA_USED', 'NCAA_BELOW_MINIMUM'];
    if (rule.redshirtMinimum !== null && core >= rule.redshirtMinimum) reasons.push('NCAA_ACADEMIC_REDSHIRT_RANGE');
    reasons.push('CURRENT_NOT_FINAL');
    return { ...base, status: 'below', comparedGpa: core, reasons };
  }
  const gpa = comparableGpa(input);
  if ('reason' in gpa) return { ...base, status: 'unknown', comparedGpa: null, reasons: [gpa.reason] };
  if (gpa.value >= rule.minimum) {
    return {
      ...base,
      status: 'likely_meets',
      comparedGpa: gpa.value,
      reasons: ['OVERALL_GPA_NOT_CORE_GPA', 'NCAA_AT_OR_ABOVE_MINIMUM', 'CURRENT_NOT_FINAL'],
    };
  }
  const reasons: EligibilityReason[] = ['OVERALL_GPA_NOT_CORE_GPA', 'NCAA_BELOW_MINIMUM'];
  if (rule.redshirtMinimum !== null && gpa.value >= rule.redshirtMinimum) reasons.push('NCAA_ACADEMIC_REDSHIRT_RANGE');
  reasons.push('CURRENT_NOT_FINAL');
  return { ...base, status: 'likely_below', comparedGpa: gpa.value, reasons };
}

function checkNaia(rule: NaiaRule, input: ApplicantInput): EligibilityCheck {
  const base = { level: 'naia' as const, sources: rule.sources, rulesVersion: ELIGIBILITY_RULES_VERSION };
  const testMet = naiaTestMet(input, rule);
  const testNote: EligibilityReason[] = input.submitScores === 'no' ? ['TEST_NOT_SENT'] : [];
  const gpa = comparableGpa(input);
  if ('reason' in gpa) {
    // Without a comparable GPA, a qualifying test score is one of the two criteria; class rank or GPA is still needed.
    if (testMet) {
      return { ...base, status: 'depends', minimum: rule.gpaOfTwo, comparedGpa: null, reasons: [gpa.reason, 'NAIA_TEST_ONLY_NEEDS_GPA_OR_RANK'] };
    }
    return { ...base, status: 'unknown', minimum: null, comparedGpa: null, reasons: [gpa.reason, ...testNote] };
  }
  if (gpa.value >= rule.gpaAlone) {
    return { ...base, status: 'meets', minimum: rule.gpaAlone, comparedGpa: gpa.value, reasons: ['NAIA_GPA_ALONE', 'CURRENT_NOT_FINAL'] };
  }
  if (gpa.value >= rule.gpaOfTwo) {
    if (testMet) {
      return { ...base, status: 'meets', minimum: rule.gpaOfTwo, comparedGpa: gpa.value, reasons: ['NAIA_GPA_AND_TEST', 'CURRENT_NOT_FINAL'] };
    }
    return {
      ...base,
      status: 'depends',
      minimum: rule.gpaOfTwo,
      comparedGpa: gpa.value,
      reasons: ['NAIA_NEEDS_RANK_OR_TEST', ...testNote, 'CURRENT_NOT_FINAL'],
    };
  }
  if (testMet) {
    return { ...base, status: 'depends', minimum: rule.gpaOfTwo, comparedGpa: gpa.value, reasons: ['NAIA_NEEDS_RANK_AND_TEST', 'CURRENT_NOT_FINAL'] };
  }
  return {
    ...base,
    status: 'below',
    minimum: rule.gpaOfTwo,
    comparedGpa: gpa.value,
    reasons: ['NAIA_BELOW_WITHOUT_RANK_AND_TEST', ...testNote, 'CURRENT_NOT_FINAL'],
  };
}

/** The eligibility-to-compete check for one level. */
export function checkEligibility(
  level: Level,
  input: ApplicantInput,
  extras: EligibilityExtras = { ncaaCoreGpa: null },
  rules: Readonly<Record<Level, EligibilityRule>> = ELIGIBILITY_RULES,
): EligibilityCheck {
  const rule = rules[level];
  const base = { level, minimum: null, comparedGpa: null, rulesVersion: ELIGIBILITY_RULES_VERSION };
  if (input.applicantType === 'transfer') {
    return { ...base, status: 'not_applicable', reasons: ['TRANSFER_RULES_DIFFER'], sources: 'sources' in rule ? rule.sources : [] };
  }
  switch (rule.kind) {
    case 'ncaa_core_gpa':
      return checkNcaa(level, rule, input, extras);
    case 'naia':
      return checkNaia(rule, input);
    case 'no_division_minimum':
      return { ...base, status: 'not_applicable', reasons: ['DIVISION_III_SCHOOLS_SET_STANDARDS'], sources: rule.sources };
    case 'unconfirmed':
      return { ...base, status: 'unknown', reasons: ['RULE_NOT_CONFIRMED'], sources: [] };
  }
}

/** Every level's check at once, for the suggestion engine. */
export function checkAllLevels(input: ApplicantInput, extras?: EligibilityExtras): Readonly<Record<Level, EligibilityCheck>> {
  const entries = LEVELS.map((level) => [level, checkEligibility(level, input, extras)] as const);
  return Object.fromEntries(entries) as Record<Level, EligibilityCheck>;
}

/** Validates an entered NCAA core-course GPA (blank → null). */
export function parseCoreGpa(raw: string): { readonly ok: true; readonly value: number | null } | { readonly ok: false; readonly error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 4) return { ok: false, error: 'Enter a core-course GPA from 0 to 4.0.' };
  return { ok: true, value };
}
