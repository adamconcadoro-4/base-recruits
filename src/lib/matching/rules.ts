/**
 * Conservative academic comparison — deterministic rules with versioned,
 * cited evidence (remediation brief §8). No model, no thresholds invented
 * here, no admission probabilities, and no Strong / Competitive / Reach
 * labels: those need an approved rulebook first.
 *
 * What it compares, and only this:
 *  - Requirements: a testing requirement only from a CURRENT policy an
 *    administrator checked on the school's official page for the applicant's
 *    type and entry year. No checked policy means "unknown". GPA minimums are
 *    never published in our data, so they are always "unknown".
 *  - Benchmarks: the applicant's SAT section or ACT composite scores against
 *    the 25th–75th percentile ranges the school reported for a past entering
 *    class (enrolled students whose scores were used), and their GPA against
 *    the middle half of the class's high school GPAs where the school published
 *    them (founder decision F51). Below the range is a benchmark position,
 *    never a failed requirement.
 *  - Evidence: how much of the above rests on checked, current information.
 *
 * Rules, in the brief's words: no known failure is not "all requirements
 * met"; a missing score is never penalised under an
 * applicable test-optional policy; scores are ignored under a test-blind
 * policy; scores the applicant won't submit don't drive anything; first-year
 * data are never applied to transfer applicants; institution-wide ranges are
 * not recruited-athlete thresholds.
 *
 * GPA (F51, 2026-10-31): the founder decided to compare the player's GPA with
 * the school's published range whether either is weighted or unweighted; most
 * schools don't say. The comparison says so every time, and only GPAs on a
 * 4.0 scale are compared, because the published ranges are on a 4.0 scale.
 *
 * Pure functions with relative, type-only imports, so the module can be
 * tested anywhere.
 */

export const RULES_VERSION = '2026-10-31.1';

export type ApplicantType = 'first_year' | 'transfer';
export type TestPolicy = 'required' | 'considered_not_required' | 'not_considered';
export type SubmitIntent = 'yes' | 'no' | 'undecided';
export type GpaType = 'unweighted' | 'weighted' | 'unknown';

export interface ApplicantInput {
  readonly applicantType: ApplicantType;
  /** The fall the applicant would enroll. */
  readonly entryYear: number;
  readonly gpa: { readonly value: number; readonly scale: number; readonly type: GpaType } | null;
  readonly sat: { readonly erw: number | null; readonly math: number | null } | null;
  readonly act: { readonly composite: number } | null;
  readonly submitScores: SubmitIntent;
}

export interface CheckedPolicy {
  readonly applicant_type: ApplicantType;
  readonly entry_year: number;
  readonly test_policy: TestPolicy;
  readonly source_url: string;
  readonly verified_at: string;
}

/** The middle half of a past entering class's high school GPAs, as the school published it, on a 4.0 scale. */
export interface GpaRange {
  readonly low: number;
  readonly high: number;
  /** The entering class it describes, e.g. "Fall 2024". */
  readonly term: string;
  /** Whether the school said its GPAs are weighted; most don't. */
  readonly weighting: 'weighted' | 'unweighted' | 'not_stated';
}

export interface SchoolEvidence {
  readonly slug: string;
  /** Latest reported entering class, e.g. "Fall 2024"; null when none is reported. */
  readonly admissionsTerm: string | null;
  readonly satErw: readonly [number | null, number | null];
  readonly satMath: readonly [number | null, number | null];
  readonly actComposite: readonly [number | null, number | null];
  /** The test policy reported for that past class (history, never applied as a rule). */
  readonly historicalTestPolicy: TestPolicy | null;
  readonly currentPolicies: readonly CheckedPolicy[];
  /**
   * The school's open admission policy as reported to the College Scorecard
   * (null or absent = not reported). Not used by compareSchool; the academic
   * fit label reads it (fit.ts).
   */
  readonly openAdmission?: boolean | null;
  /** The school's published GPA range; missing or null when there is none. */
  readonly gpa?: GpaRange | null;
}

export type RequirementStatus = 'met' | 'not_met' | 'unknown' | 'not_applicable';
export type BenchmarkStatus = 'above' | 'within' | 'below' | 'not_comparable' | 'not_reported';
export type EvidenceStatus = 'sufficient' | 'partial' | 'insufficient' | 'conflicting';

export type ReasonCode =
  | 'TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE'
  | 'CURRENT_POLICY_NOT_CHECKED'
  | 'CURRENT_POLICY_CHECKED'
  | 'POLICY_REQUIRED_SCORE_SUBMITTED'
  | 'POLICY_REQUIRED_NO_SCORE'
  | 'POLICY_REQUIRED_NOT_SUBMITTING'
  | 'POLICY_REQUIRED_UNDECIDED'
  | 'POLICY_OPTIONAL_NO_PENALTY'
  | 'POLICY_BLIND_SCORES_IGNORED'
  | 'NO_PUBLISHED_GPA_MINIMUM'
  | 'GPA_NOT_REPORTED_BY_SCHOOLS'
  | 'GPA_NOT_ENTERED'
  | 'GPA_RANGE_PUBLISHED'
  | 'GPA_WEIGHTING_NOT_STATED'
  | 'GPA_SCALE_NOT_COMPARABLE'
  | 'SCORES_NOT_SUBMITTED'
  | 'SCORES_ONLY_IF_SUBMITTED'
  | 'SCORE_NOT_ENTERED'
  | 'RANGE_NOT_REPORTED'
  | 'NO_ADMISSIONS_DATA'
  | 'HISTORICAL_RANGE'
  | 'HISTORICAL_DATA_STALE'
  | 'BELOW_RANGE_IS_NOT_A_REQUIREMENT'
  | 'WHOLE_CLASS_NOT_ATHLETES';

export interface Requirement {
  readonly key: 'testing' | 'gpa_minimum';
  readonly status: RequirementStatus;
  readonly reasons: readonly ReasonCode[];
  /** The checked policy this requirement rests on, if any. */
  readonly policy: CheckedPolicy | null;
}

export interface Benchmark {
  readonly key: 'sat_erw' | 'sat_math' | 'act_composite' | 'gpa';
  readonly status: BenchmarkStatus;
  readonly applicant: number | null;
  readonly low: number | null;
  readonly high: number | null;
  /** The past entering class the range describes. */
  readonly term: string | null;
  readonly reasons: readonly ReasonCode[];
}

export interface ComparisonResult {
  readonly slug: string;
  readonly rulesVersion: string;
  readonly applicantType: ApplicantType;
  readonly entryYear: number;
  readonly requirements: readonly Requirement[];
  /** 'met' only when every requirement is known and met (or not applicable). */
  readonly requirementSummary: RequirementStatus;
  readonly benchmarks: readonly Benchmark[];
  readonly evidence: { readonly status: EvidenceStatus; readonly stale: boolean; readonly reasons: readonly ReasonCode[] };
}

/** How many years between the reported class and the applicant's entry before the range counts as stale. */
export const STALE_AFTER_YEARS = 2;

export function termYear(term: string | null): number | null {
  const match = term ? /(\d{4})/.exec(term) : null;
  return match ? Number(match[1]) : null;
}

export function isValidSatSection(value: number): boolean {
  return Number.isInteger(value) && value >= 200 && value <= 800 && value % 10 === 0;
}

export function isValidActComposite(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 36;
}

/** The checked policy for exactly this applicant type and entry year, or null. */
export function applicablePolicy(evidence: SchoolEvidence, input: ApplicantInput): CheckedPolicy | null {
  return evidence.currentPolicies.find((p) => p.applicant_type === input.applicantType && p.entry_year === input.entryYear) ?? null;
}

function hasScore(input: ApplicantInput): boolean {
  return (input.sat !== null && (input.sat.erw !== null || input.sat.math !== null)) || input.act !== null;
}

function testingRequirement(policy: CheckedPolicy | null, input: ApplicantInput): Requirement {
  if (!policy) return { key: 'testing', status: 'unknown', reasons: ['CURRENT_POLICY_NOT_CHECKED'], policy: null };
  switch (policy.test_policy) {
    case 'considered_not_required':
      return { key: 'testing', status: 'not_applicable', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_OPTIONAL_NO_PENALTY'], policy };
    case 'not_considered':
      return { key: 'testing', status: 'not_applicable', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_BLIND_SCORES_IGNORED'], policy };
    case 'required':
      if (input.submitScores === 'no') {
        return { key: 'testing', status: 'not_met', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_REQUIRED_NOT_SUBMITTING'], policy };
      }
      if (!hasScore(input)) {
        return { key: 'testing', status: 'unknown', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_REQUIRED_NO_SCORE'], policy };
      }
      if (input.submitScores === 'undecided') {
        return { key: 'testing', status: 'unknown', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_REQUIRED_UNDECIDED'], policy };
      }
      return { key: 'testing', status: 'met', reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_REQUIRED_SCORE_SUBMITTED'], policy };
  }
}

function summarize(requirements: readonly Requirement[]): RequirementStatus {
  if (requirements.some((r) => r.status === 'not_met')) return 'not_met';
  if (requirements.every((r) => r.status === 'not_applicable')) return 'not_applicable';
  if (requirements.every((r) => r.status === 'met' || r.status === 'not_applicable')) return 'met';
  return 'unknown';
}

function position(value: number, low: number, high: number): BenchmarkStatus {
  if (value < low) return 'below';
  if (value > high) return 'above';
  return 'within';
}

function scoreBenchmark(
  key: Benchmark['key'],
  applicant: number | null,
  range: readonly [number | null, number | null],
  term: string | null,
  blocked: ReasonCode | null,
  extra: readonly ReasonCode[],
): Benchmark {
  const [low, high] = range;
  if (blocked) return { key, status: 'not_comparable', applicant, low, high, term, reasons: [blocked] };
  if (applicant === null) return { key, status: 'not_comparable', applicant, low, high, term, reasons: ['SCORE_NOT_ENTERED'] };
  if (low === null || high === null) return { key, status: 'not_reported', applicant, low, high, term, reasons: ['RANGE_NOT_REPORTED'] };
  const status = position(applicant, low, high);
  const reasons: ReasonCode[] = ['HISTORICAL_RANGE', 'WHOLE_CLASS_NOT_ATHLETES', ...extra];
  if (status === 'below') reasons.push('BELOW_RANGE_IS_NOT_A_REQUIREMENT');
  return { key, status, applicant, low, high, term, reasons };
}

/** The applicant's GPA against the school's published range (F51). */
function gpaBenchmark(evidence: SchoolEvidence, input: ApplicantInput): Benchmark {
  const range = evidence.gpa ?? null;
  const base = { key: 'gpa' as const, applicant: input.gpa?.value ?? null, low: range?.low ?? null, high: range?.high ?? null, term: range?.term ?? null };
  if (!input.gpa) return { ...base, status: 'not_comparable', reasons: ['GPA_NOT_ENTERED'] };
  if (!range) return { ...base, status: 'not_reported', reasons: ['GPA_NOT_REPORTED_BY_SCHOOLS'] };
  if (input.gpa.scale !== 4) return { ...base, status: 'not_comparable', reasons: ['GPA_SCALE_NOT_COMPARABLE'] };
  const status = position(input.gpa.value, range.low, range.high);
  const reasons: ReasonCode[] = ['GPA_RANGE_PUBLISHED', 'WHOLE_CLASS_NOT_ATHLETES'];
  if (range.weighting === 'not_stated') reasons.push('GPA_WEIGHTING_NOT_STATED');
  const year = termYear(range.term);
  if (year !== null && input.entryYear - year > STALE_AFTER_YEARS) reasons.push('HISTORICAL_DATA_STALE');
  if (status === 'below') reasons.push('BELOW_RANGE_IS_NOT_A_REQUIREMENT');
  return { ...base, status, reasons };
}

export function compareSchool(evidence: SchoolEvidence, input: ApplicantInput): ComparisonResult {
  const policy = applicablePolicy(evidence, input);
  const base = { slug: evidence.slug, rulesVersion: RULES_VERSION, applicantType: input.applicantType, entryYear: input.entryYear };
  const gpa = gpaBenchmark(evidence, input);
  const gpaRequirement: Requirement = { key: 'gpa_minimum', status: 'unknown', reasons: ['NO_PUBLISHED_GPA_MINIMUM'], policy: null };

  if (input.applicantType === 'transfer') {
    // Every figure we hold describes first-year students. Only a checked
    // transfer policy can say anything, and only about testing.
    const requirements = [testingRequirement(policy, input), gpaRequirement];
    const blocked = (key: Benchmark['key'], applicant: number | null, range: readonly [number | null, number | null]) =>
      scoreBenchmark(key, applicant, range, evidence.admissionsTerm, 'TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE', []);
    return {
      ...base,
      requirements,
      requirementSummary: summarize(requirements),
      benchmarks: [
        blocked('sat_erw', input.sat?.erw ?? null, evidence.satErw),
        blocked('sat_math', input.sat?.math ?? null, evidence.satMath),
        blocked('act_composite', input.act?.composite ?? null, evidence.actComposite),
        { ...gpa, status: 'not_comparable', reasons: ['TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE'] },
      ],
      evidence: {
        status: policy ? 'partial' : 'insufficient',
        stale: false,
        reasons: ['TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE', policy ? 'CURRENT_POLICY_CHECKED' : 'CURRENT_POLICY_NOT_CHECKED'],
      },
    };
  }

  const requirements = [testingRequirement(policy, input), gpaRequirement];
  const noData = evidence.admissionsTerm === null;
  let blocked: ReasonCode | null = null;
  if (policy?.test_policy === 'not_considered') blocked = 'POLICY_BLIND_SCORES_IGNORED';
  else if (input.submitScores === 'no') blocked = 'SCORES_NOT_SUBMITTED';
  const extra: ReasonCode[] = input.submitScores === 'undecided' ? ['SCORES_ONLY_IF_SUBMITTED'] : [];

  const benchmarks: Benchmark[] = noData
    ? (['sat_erw', 'sat_math', 'act_composite'] as const).map((key) => ({
        key,
        status: blocked ? ('not_comparable' as const) : ('not_reported' as const),
        applicant: key === 'act_composite' ? (input.act?.composite ?? null) : key === 'sat_erw' ? (input.sat?.erw ?? null) : (input.sat?.math ?? null),
        low: null,
        high: null,
        term: null,
        reasons: [blocked ?? 'NO_ADMISSIONS_DATA'],
      }))
    : [
        scoreBenchmark('sat_erw', input.sat?.erw ?? null, evidence.satErw, evidence.admissionsTerm, blocked, extra),
        scoreBenchmark('sat_math', input.sat?.math ?? null, evidence.satMath, evidence.admissionsTerm, blocked, extra),
        scoreBenchmark('act_composite', input.act?.composite ?? null, evidence.actComposite, evidence.admissionsTerm, blocked, extra),
      ];
  benchmarks.push(gpa);

  const hasRanges =
    (!noData && [evidence.satErw, evidence.satMath, evidence.actComposite].some(([low, high]) => low !== null && high !== null)) ||
    Boolean(evidence.gpa);
  const year = termYear(evidence.admissionsTerm);
  const stale = year !== null && input.entryYear - year > STALE_AFTER_YEARS;
  const evidenceReasons: ReasonCode[] = [policy ? 'CURRENT_POLICY_CHECKED' : 'CURRENT_POLICY_NOT_CHECKED'];
  if (noData) evidenceReasons.push('NO_ADMISSIONS_DATA');
  else if (hasRanges) evidenceReasons.push('HISTORICAL_RANGE');
  else evidenceReasons.push('RANGE_NOT_REPORTED');
  if (stale) evidenceReasons.push('HISTORICAL_DATA_STALE');
  if (!evidence.gpa) evidenceReasons.push('GPA_NOT_REPORTED_BY_SCHOOLS');

  return {
    ...base,
    requirements,
    requirementSummary: summarize(requirements),
    benchmarks,
    evidence: {
      status: policy && hasRanges ? 'sufficient' : policy || hasRanges ? 'partial' : 'insufficient',
      stale,
      reasons: evidenceReasons,
    },
  };
}

export type ScoreGroup = 'at_or_above' | 'mixed' | 'below' | 'not_compared';

/**
 * Groups a result by where the applicant's compared scores sit against the
 * reported ranges — a factual grouping for sorting, not a fit label.
 */
export function scoreGroup(result: ComparisonResult): ScoreGroup {
  const compared = result.benchmarks.filter((b) => b.status === 'above' || b.status === 'within' || b.status === 'below');
  if (compared.length === 0) return 'not_compared';
  if (compared.every((b) => b.status !== 'below')) return 'at_or_above';
  if (compared.every((b) => b.status === 'below')) return 'below';
  return 'mixed';
}

/** Validates raw form values into an ApplicantInput, or returns field errors. */
export function parseApplicantInput(raw: {
  readonly applicantType: string;
  readonly entryYear: string;
  readonly satErw: string;
  readonly satMath: string;
  readonly act: string;
  readonly submitScores: string;
  readonly gpa: string;
  readonly gpaScale: string;
  readonly gpaType: string;
}, thisYear: number): { readonly ok: true; readonly input: ApplicantInput } | { readonly ok: false; readonly errors: Readonly<Record<string, string>> } {
  const errors: Record<string, string> = {};
  const applicantType = raw.applicantType === 'transfer' ? 'transfer' : raw.applicantType === 'first_year' ? 'first_year' : null;
  if (!applicantType) errors.applicantType = 'Choose first-year or transfer.';
  const entryYear = Number(raw.entryYear);
  if (!Number.isInteger(entryYear) || entryYear < thisYear || entryYear > thisYear + 4) {
    errors.entryYear = `Choose a year from ${thisYear} to ${thisYear + 4}.`;
  }
  const num = (value: string) => (value.trim() === '' ? null : Number(value));
  const erw = num(raw.satErw);
  const math = num(raw.satMath);
  const act = num(raw.act);
  if (erw !== null && !isValidSatSection(erw)) errors.satErw = 'Enter a section score from 200 to 800, in steps of 10.';
  if (math !== null && !isValidSatSection(math)) errors.satMath = 'Enter a section score from 200 to 800, in steps of 10.';
  if (act !== null && !isValidActComposite(act)) errors.act = 'Enter a composite from 1 to 36.';
  const submitScores = raw.submitScores === 'yes' || raw.submitScores === 'no' || raw.submitScores === 'undecided' ? raw.submitScores : null;
  if (!submitScores) errors.submitScores = 'Choose whether you plan to send scores.';
  const gpaValue = num(raw.gpa);
  const scale = Number(raw.gpaScale);
  const gpaType = raw.gpaType === 'unweighted' || raw.gpaType === 'weighted' ? raw.gpaType : 'unknown';
  if (gpaValue !== null) {
    if (!Number.isFinite(scale) || scale <= 0) errors.gpaScale = 'Choose the scale your school uses.';
    else if (!Number.isFinite(gpaValue) || gpaValue < 0 || gpaValue > scale) errors.gpa = `Enter a GPA from 0 to ${scale}.`;
  }
  if (Object.keys(errors).length > 0 || !applicantType || !submitScores) return { ok: false, errors };
  return {
    ok: true,
    input: {
      applicantType,
      entryYear,
      gpa: gpaValue === null ? null : { value: gpaValue, scale, type: gpaType },
      sat: erw === null && math === null ? null : { erw, math },
      act: act === null ? null : { composite: act },
      submitScores,
    },
  };
}
