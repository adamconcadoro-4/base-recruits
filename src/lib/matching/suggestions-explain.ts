/**
 * Plain-language wording for the suggestion engine: group names, academic fit
 * labels, eligibility statuses and every reason code. Wording rules
 * (docs/matching-rulebook.md): no admission, roster or scholarship claims; say
 * what was compared and against what; unknown is said plainly.
 */

import type { AthleticMetric, FloorBasis, Position } from './athletic';
import type { EligibilityReason, EligibilityStatus, Level } from './eligibility';
import type { AcademicFit, AcademicFitReason } from './fit';
import type { AthleticStatus, ExclusionReason, SuggestionGroup, SuggestionReason } from './suggestions';

export const LEVEL_LABELS: Readonly<Record<Level, string>> = {
  ncaa_d1: 'NCAA Division I',
  ncaa_d2: 'NCAA Division II',
  ncaa_d3: 'NCAA Division III',
  naia: 'NAIA',
  juco: 'Junior college (NJCAA, CCCAA, NWAC)',
};

export const GROUP_NAMES: Readonly<Record<SuggestionGroup, string>> = {
  strong_fit: 'Strong fit',
  possible_fit: 'Possible fit',
  reach: 'Reach',
  not_enough_data: 'Not enough data',
};

export const GROUP_DESCRIPTIONS: Readonly<Record<SuggestionGroup, string>> = {
  strong_fit:
    'Your assessment is in range for this level, and you’re an academic fit: your scores are within or above every range the school reported, or the school has open admission.',
  possible_fit:
    'Your assessment is in range for this level, and some of your scores are below a range the school reported, or meeting the level’s academic minimum depends on your class rank or a test score.',
  reach:
    'Your assessment is in range for this level, but your scores are below the school’s reported ranges, or your GPA is below, or may be below, the level’s academic minimum to compete.',
  not_enough_data: 'We couldn’t compare enough to place these schools. They are shown so nothing is hidden from you.',
};

export const ACADEMIC_FIT_LABELS: Readonly<Record<AcademicFit, string>> = {
  fit: 'Academic fit',
  stretch: 'Academic stretch',
  reach: 'Academic reach',
  not_enough_data: 'Academics not compared',
};

export const ACADEMIC_FIT_REASONS: Readonly<Record<AcademicFitReason, string>> = {
  SCORES_AT_OR_ABOVE: 'Every score or GPA we compared is within or above the range this school reported for a past entering class.',
  SOME_SCORES_BELOW: 'Some of your numbers are below a range this school reported for a past entering class.',
  ALL_SCORES_BELOW: 'Every score or GPA we compared is below the range this school reported for a past entering class.',
  REQUIREMENT_NOT_MET: 'This school currently requires a test score, and you said you won’t send one.',
  NOTHING_COMPARED:
    'Nothing could be compared: no scores entered or sent, the school doesn’t use scores, it reported no ranges, or you’re applying as a transfer.',
  OPEN_ADMISSION:
    'This school has an open admission policy: it admits any applicant, or only requires a high school diploma or equivalent (as reported to the College Scorecard). Some programs may have their own requirements.',
};

export const ELIGIBILITY_LABELS: Readonly<Record<EligibilityStatus, string>> = {
  meets: 'Meets the academic minimum we check',
  likely_meets: 'Likely meets the academic minimum we check',
  below: 'Below the academic minimum we check',
  likely_below: 'May be below the academic minimum we check',
  depends: 'Depends on your class rank or a test score',
  unknown: 'Not checked',
  not_applicable: 'No association minimum',
};

/** Shown with every eligibility result. */
export const ELIGIBILITY_SCOPE_NOTE =
  'Only GPA (and, for the NAIA, test scores) is checked here. Core courses, graduation and other requirements are confirmed by the NCAA or NAIA Eligibility Center.';

export const ELIGIBILITY_REASONS: Readonly<Record<EligibilityReason, string>> = {
  TRANSFER_RULES_DIFFER: 'Freshman eligibility rules don’t apply to transfer students, so they aren’t checked here.',
  DIVISION_III_SCHOOLS_SET_STANDARDS: 'Division III has no association-wide academic minimum; each school sets its own standards.',
  RULE_NOT_CONFIRMED: 'We haven’t confirmed a current academic minimum for this level, so it isn’t checked.',
  GPA_NOT_ENTERED: 'You didn’t enter a GPA.',
  GPA_SCALE_NOT_COMPARABLE: 'Minimums are on a 4.0 scale, so a GPA on another scale isn’t compared.',
  GPA_WEIGHTED_NOT_COMPARABLE: 'A weighted GPA isn’t compared with these minimums. Enter your unweighted GPA to check.',
  GPA_TYPE_NOT_STATED: 'Tell us whether your GPA is weighted or unweighted; only an unweighted GPA is compared with these minimums.',
  CORE_GPA_USED: 'Based on the NCAA core-course GPA you entered for this division.',
  OVERALL_GPA_NOT_CORE_GPA:
    'The NCAA uses a core-course GPA calculated by its Eligibility Center, separately for Division I and II, which can differ from your overall GPA. Enter your core-course GPA for an exact check.',
  NCAA_AT_OR_ABOVE_MINIMUM: 'Your GPA is at or above this level’s minimum core-course GPA to compete as a freshman.',
  NCAA_BELOW_MINIMUM: 'Your GPA is below this level’s minimum core-course GPA to compete as a freshman.',
  NCAA_ACADEMIC_REDSHIRT_RANGE:
    'In Division I, a core-course GPA from 2.0 up to the minimum allows an academic redshirt: practice and athletics aid in the first year, but no competition.',
  NAIA_GPA_ALONE: 'A final high school GPA of 2.3 or higher meets the NAIA freshman requirement on its own.',
  NAIA_GPA_AND_TEST: 'Your GPA of 2.0 or higher and your test score meet two of the NAIA’s three freshman criteria.',
  NAIA_NEEDS_RANK_OR_TEST: 'Your GPA meets one NAIA criterion. You also need to finish in the top half of your class or reach 18 on the ACT or 970 on the SAT.',
  NAIA_NEEDS_RANK_AND_TEST: 'Your test score meets one NAIA criterion. Below a 2.0 GPA you would also need to finish in the top half of your class.',
  NAIA_TEST_ONLY_NEEDS_GPA_OR_RANK:
    'Your test score meets one NAIA criterion. A second one (a 2.0 unweighted GPA or a top-half class rank) can’t be checked from what you entered.',
  NAIA_BELOW_WITHOUT_RANK_AND_TEST:
    'To be eligible in your first term with a GPA below 2.0, the NAIA requires both a top-half class rank and a qualifying test score. A player who meets one criterion can become eligible later by passing 12 credit hours with a C or better in the first term.',
  TEST_NOT_SENT: 'You said you won’t send test scores, so they aren’t counted.',
  TEST_UNDECIDED: 'You haven’t decided whether to send test scores, so they aren’t counted yet.',
  CURRENT_NOT_FINAL: 'Eligibility is decided on your final high school record; this uses your current numbers.',
};

export const SUGGESTION_REASONS: Readonly<Record<SuggestionReason, string>> = {
  ATHLETIC_IN_RANGE: 'Your assessment results are in range for this level’s standards.',
  ATHLETIC_NOT_ASSESSED: 'There is no assessment result for this level yet.',
  ACADEMIC_FIT: ACADEMIC_FIT_REASONS.SCORES_AT_OR_ABOVE,
  ACADEMIC_OPEN_ADMISSION: ACADEMIC_FIT_REASONS.OPEN_ADMISSION,
  ACADEMIC_STRETCH: ACADEMIC_FIT_REASONS.SOME_SCORES_BELOW,
  ACADEMIC_REACH: 'Your scores are below this school’s reported ranges, or a current testing requirement isn’t met.',
  ACADEMIC_NOT_COMPARED: ACADEMIC_FIT_REASONS.NOTHING_COMPARED,
  ELIGIBILITY_BELOW_MINIMUM: 'Your GPA is below, or may be below, this level’s academic minimum to compete as a freshman.',
  ELIGIBILITY_DEPENDS: 'Whether you meet this level’s academic minimum to compete depends on your class rank or a test score.',
  COST_WITHIN_BUDGET: 'The published cost of attendance is within your budget. What your family pays after aid can be lower.',
  COST_NOT_REPORTED: 'This school didn’t report a cost of attendance, so it is kept in your list. Check its net price calculator.',
  SETTING_NOT_REPORTED: 'The campus setting isn’t reported, so this school is kept in your list.',
  STATE_NOT_REPORTED: 'The state isn’t reported, so this school is kept in your list.',
};

export const EXCLUSION_REASONS: Readonly<Record<ExclusionReason, string>> = {
  LEVEL_NOT_SUGGESTED: 'Programs in associations we don’t suggest by level yet (USCAA, NCCAA, independents, unconfirmed divisions).',
  LEVEL_NOT_CHOSEN: 'Levels you chose not to see.',
  ATHLETIC_BELOW_LEVEL: 'Levels where your assessment results are below the standard.',
  OVER_BUDGET: 'Schools whose published cost of attendance is over your budget.',
  OUTSIDE_CHOSEN_STATES: 'Schools outside the states you chose.',
  OUTSIDE_CHOSEN_SETTINGS: 'Schools outside the campus settings you chose.',
};

/** Shown with every suggestion list. */
export const SUGGESTION_DISCLAIMER =
  'Suggestions compare your current results with published standards and past ranges. They are not an admission decision, a prediction of a roster spot or scholarship, or a coach’s evaluation.';

// ---------------------------------------------------------------------------
// Athletic side (src/lib/matching/athletic.ts)
// ---------------------------------------------------------------------------

export const POSITION_LABELS: Readonly<Record<Position, string>> = {
  pitcher: 'Pitcher',
  catcher: 'Catcher',
  first_base: 'First base',
  second_base: 'Second base',
  shortstop: 'Shortstop',
  third_base: 'Third base',
  outfield: 'Outfield',
};

export const METRIC_LABELS: Readonly<Record<AthleticMetric, string>> = {
  fastball_mph: 'Fastball, top velocity',
  exit_velocity_mph: 'Exit velocity, best',
  sixty_yard_s: '60-yard dash, best',
  infield_velocity_mph: 'Infield throwing velocity',
  outfield_velocity_mph: 'Outfield throwing velocity',
  catcher_velocity_mph: 'Catcher throwing velocity',
  pop_time_s: 'Pop time to second base',
};

/** How each floor was set, in a family's words. */
export const FLOOR_BASIS_TEXT: Readonly<Record<FloorBasis, string>> = {
  typical_range_low: 'low end of the typical range for players who committed to this level',
  next_level_average: 'average for players who committed one level down; this level’s average is higher',
  level_average: 'average for players who committed to this level (no lower level is measured)',
  guideline: 'recruiting guideline',
};

export const ATHLETIC_STATUS_LABELS: Readonly<Record<AthleticStatus, string>> = {
  in_range: 'In range',
  below: 'Below the typical range',
  not_enough_data: 'Not enough to compare',
};

export const ATHLETIC_STATUS_TEXT: Readonly<Record<AthleticStatus, string>> = {
  in_range: 'Your numbers are in the typical range for this level on at least half of what was compared.',
  below: 'Your numbers are below the typical range for this level on most of what was compared.',
  not_enough_data: 'Not enough of your numbers could be compared with this level’s benchmarks.',
};

/** Shown when a Division I school in a Power 4 conference is compared with the Power 4 benchmarks (F50). */
export function power4Note(conference: string): string {
  return `This school plays in the ${conference}, a Power 4 conference, so your numbers are compared with players who committed to Power 4 programs (ACC, Big Ten, Big 12 and SEC). “One level down” here means other Division I programs.`;
}

export const SELF_REPORTED_NOTE =
  'Based on numbers you entered yourself; Base Recruits hasn’t measured or verified them. Compare like with like: these benchmarks use best showcase numbers.';
