/** Plain-language wording for the comparison's statuses and reason codes. */

import type { Benchmark, BenchmarkStatus, EvidenceStatus, ReasonCode, RequirementStatus, ScoreGroup } from './rules';

export const REQUIREMENT_LABELS: Readonly<Record<RequirementStatus, string>> = {
  met: 'Met',
  not_met: 'Not met',
  unknown: 'Unknown',
  not_applicable: 'Not applicable',
};

export const BENCHMARK_LABELS: Readonly<Record<BenchmarkStatus, string>> = {
  above: 'Above the reported range',
  within: 'Within the reported range',
  below: 'Below the reported range',
  not_comparable: 'Not compared',
  not_reported: 'Not reported',
};

export const EVIDENCE_LABELS: Readonly<Record<EvidenceStatus, string>> = {
  sufficient: 'Checked policy and reported ranges',
  partial: 'Partial evidence',
  insufficient: 'Not enough evidence',
  conflicting: 'Sources disagree',
};

export const BENCHMARK_NAMES: Readonly<Record<Benchmark['key'], string>> = {
  sat_erw: 'SAT Reading and Writing',
  sat_math: 'SAT Math',
  act_composite: 'ACT composite',
  gpa: 'GPA',
};

export const GROUP_LABELS: Readonly<Record<ScoreGroup, string>> = {
  at_or_above: 'Your scores are within or above every reported range compared',
  mixed: 'Some of your scores are below a reported range',
  below: 'Your scores are below every reported range compared',
  not_compared: 'No score comparison possible',
};

export const REASONS: Readonly<Record<ReasonCode, string>> = {
  TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE:
    'The figures we have describe first-year students, so they are not used for transfer applicants.',
  CURRENT_POLICY_NOT_CHECKED:
    'We haven’t checked this school’s current testing policy for your entry year, so whether a test is required is unknown.',
  CURRENT_POLICY_CHECKED: 'Based on the testing policy we checked on the school’s official admissions page.',
  POLICY_REQUIRED_SCORE_SUBMITTED: 'The school requires a test score, and you entered one you plan to send.',
  POLICY_REQUIRED_NO_SCORE: 'The school requires a test score, and you haven’t entered one yet.',
  POLICY_REQUIRED_NOT_SUBMITTING: 'The school requires a test score, and you said you won’t send one.',
  POLICY_REQUIRED_UNDECIDED: 'The school requires a test score; you haven’t decided whether to send yours.',
  POLICY_OPTIONAL_NO_PENALTY: 'Testing is optional here, so not sending a score is never counted against you.',
  POLICY_BLIND_SCORES_IGNORED: 'This school doesn’t consider test scores, so yours are not compared.',
  NO_PUBLISHED_GPA_MINIMUM: 'No published minimum GPA is in our data, so a GPA requirement is unknown.',
  GPA_NOT_REPORTED_BY_SCHOOLS:
    'Schools don’t report GPA in the federal data we use, so your GPA can’t be compared. We don’t estimate it.',
  GPA_NOT_ENTERED: 'You didn’t enter a GPA.',
  SCORES_NOT_SUBMITTED: 'You said you won’t send scores, so they aren’t used.',
  SCORES_ONLY_IF_SUBMITTED: 'This comparison matters only if you send your scores.',
  SCORE_NOT_ENTERED: 'You didn’t enter this score.',
  RANGE_NOT_REPORTED: 'The school didn’t report this range.',
  NO_ADMISSIONS_DATA: 'The school reported no first-year admissions figures (common for open-admission colleges).',
  HISTORICAL_RANGE:
    'The range is the middle 50% of enrolled first-year students whose scores were used, for a past entering class.',
  HISTORICAL_DATA_STALE: 'The reported class is several years before your entry year; ranges may have changed.',
  BELOW_RANGE_IS_NOT_A_REQUIREMENT:
    'About a quarter of the enrolled students whose scores were used scored below this range. It is not a minimum.',
  WHOLE_CLASS_NOT_ATHLETES: 'The range describes the whole entering class, not recruited athletes.',
};
