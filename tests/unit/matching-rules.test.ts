import { describe, expect, it } from 'vitest';

import { REASONS } from '@/lib/matching/explain';
import {
  RULES_VERSION,
  compareSchool,
  parseApplicantInput,
  scoreGroup,
  type ApplicantInput,
  type SchoolEvidence,
} from '@/lib/matching/rules';

/**
 * The conservative comparison contract: requirements come only from checked
 * current policies for the exact applicant type and entry year; historical
 * ranges are benchmarks, never requirements; no GPA, fit or chance labels.
 * Fixtures are synthetic numbers, not real applicants.
 */

const CHECKED = { source_url: 'https://admissions.example.edu/testing', verified_at: '2026-10-23T00:00:00Z' } as const;

/** A school whose PAST class was test-optional but whose CURRENT first-year policy (fall 2027) requires tests. */
const pastOptionalNowRequired: SchoolEvidence = {
  slug: 'example-university',
  admissionsTerm: 'Fall 2024',
  satErw: [700, 760],
  satMath: [720, 790],
  actComposite: [32, 35],
  historicalTestPolicy: 'considered_not_required',
  currentPolicies: [{ applicant_type: 'first_year', entry_year: 2027, test_policy: 'required', ...CHECKED }],
};

const withPolicy = (test_policy: 'required' | 'considered_not_required' | 'not_considered'): SchoolEvidence => ({
  ...pastOptionalNowRequired,
  currentPolicies: [{ applicant_type: 'first_year', entry_year: 2027, test_policy, ...CHECKED }],
});
const unchecked: SchoolEvidence = { ...pastOptionalNowRequired, currentPolicies: [] };
const noAdmissionsData: SchoolEvidence = {
  slug: 'example-community-college',
  admissionsTerm: null,
  satErw: [null, null],
  satMath: [null, null],
  actComposite: [null, null],
  historicalTestPolicy: null,
  currentPolicies: [],
};

const applicant = (overrides: Partial<ApplicantInput> = {}): ApplicantInput => ({
  applicantType: 'first_year',
  entryYear: 2027,
  gpa: { value: 3.6, scale: 4, type: 'unweighted' },
  sat: { erw: 610, math: 610 },
  act: null,
  submitScores: 'yes',
  ...overrides,
});

const testing = (evidence: SchoolEvidence, input: ApplicantInput) =>
  compareSchool(evidence, input).requirements.find((r) => r.key === 'testing');

describe('testing requirement', () => {
  it('a past test-optional class never overrides a checked current requirement', () => {
    expect(testing(pastOptionalNowRequired, applicant({ sat: null, act: null }))).toMatchObject({
      status: 'unknown',
      reasons: ['CURRENT_POLICY_CHECKED', 'POLICY_REQUIRED_NO_SCORE'],
    });
    expect(testing(pastOptionalNowRequired, applicant({ submitScores: 'no' }))?.status).toBe('not_met');
    expect(testing(pastOptionalNowRequired, applicant())?.status).toBe('met');
    expect(testing(pastOptionalNowRequired, applicant({ submitScores: 'undecided' }))?.status).toBe('unknown');
  });

  it('is unknown without a checked policy, even when the past class reported one', () => {
    const result = compareSchool(unchecked, applicant());
    expect(result.requirements.find((r) => r.key === 'testing')).toMatchObject({ status: 'unknown', reasons: ['CURRENT_POLICY_NOT_CHECKED'], policy: null });
    expect(result.requirementSummary).toBe('unknown');
  });

  it('applies a policy only to the exact entry year and applicant type it was checked for', () => {
    expect(testing(pastOptionalNowRequired, applicant({ entryYear: 2028 }))?.status).toBe('unknown');
    expect(testing(pastOptionalNowRequired, applicant({ applicantType: 'transfer' }))?.status).toBe('unknown');
  });

  it('test-optional: a missing score is not a failure', () => {
    const result = compareSchool(withPolicy('considered_not_required'), applicant({ sat: null }));
    expect(result.requirements.find((r) => r.key === 'testing')?.status).toBe('not_applicable');
    expect(result.requirementSummary).not.toBe('not_met');
  });

  it('test-blind: scores are never compared', () => {
    const result = compareSchool(withPolicy('not_considered'), applicant());
    expect(result.benchmarks.filter((b) => b.key !== 'gpa').every((b) => b.status === 'not_comparable')).toBe(true);
    expect(result.benchmarks[0]?.reasons).toEqual(['POLICY_BLIND_SCORES_IGNORED']);
    expect(scoreGroup(result)).toBe('not_compared');
  });

  it('never invents a GPA minimum', () => {
    const result = compareSchool(pastOptionalNowRequired, applicant());
    expect(result.requirements.find((r) => r.key === 'gpa_minimum')).toMatchObject({ status: 'unknown', reasons: ['NO_PUBLISHED_GPA_MINIMUM'] });
  });
});

describe('historical benchmarks', () => {
  it('below a past range is a benchmark, not a requirement failure', () => {
    const result = compareSchool(unchecked, applicant());
    expect(result.benchmarks[0]).toMatchObject({ key: 'sat_erw', status: 'below', low: 700, high: 760, term: 'Fall 2024' });
    expect(result.benchmarks[0]?.reasons).toContain('BELOW_RANGE_IS_NOT_A_REQUIREMENT');
    expect(result.benchmarks[0]?.reasons).toContain('WHOLE_CLASS_NOT_ATHLETES');
    expect(result.requirementSummary).not.toBe('not_met');
    expect(scoreGroup(result)).toBe('below');
  });

  it('places scores within and above the range, and mixes them honestly', () => {
    const result = compareSchool(unchecked, applicant({ sat: { erw: 760, math: 800 }, act: { composite: 30 } }));
    expect(result.benchmarks.map((b) => b.status)).toEqual(['within', 'above', 'below', 'not_reported']);
    expect(scoreGroup(result)).toBe('mixed');
    expect(scoreGroup(compareSchool(unchecked, applicant({ sat: { erw: 760, math: 800 } })))).toBe('at_or_above');
  });

  it('a score the applicant will not send is not compared', () => {
    const result = compareSchool(unchecked, applicant({ submitScores: 'no' }));
    expect(result.benchmarks.filter((b) => b.key !== 'gpa').every((b) => b.status === 'not_comparable')).toBe(true);
    expect(scoreGroup(result)).toBe('not_compared');
  });

  it('a score that was not entered is not compared', () => {
    const result = compareSchool(unchecked, applicant({ sat: { erw: 720, math: null } }));
    expect(result.benchmarks[1]).toMatchObject({ key: 'sat_math', status: 'not_comparable', reasons: ['SCORE_NOT_ENTERED'] });
  });

  it('GPA is not compared when the school published no GPA range; nothing is estimated', () => {
    expect(compareSchool(unchecked, applicant()).benchmarks.find((b) => b.key === 'gpa')).toMatchObject({
      status: 'not_reported',
      reasons: ['GPA_NOT_REPORTED_BY_SCHOOLS'],
    });
    expect(compareSchool(unchecked, applicant()).evidence.reasons).toContain('GPA_NOT_REPORTED_BY_SCHOOLS');
  });

  it('flags ranges that are more than two classes old', () => {
    expect(compareSchool(unchecked, applicant({ entryYear: 2026 })).evidence.stale).toBe(false);
    expect(compareSchool(unchecked, applicant({ entryYear: 2027 })).evidence.stale).toBe(true);
  });

  it('a school with no admissions data says so', () => {
    const result = compareSchool(noAdmissionsData, applicant());
    expect(result.benchmarks.filter((b) => b.key !== 'gpa').every((b) => b.status === 'not_reported')).toBe(true);
    expect(result.evidence.status).toBe('insufficient');
  });
});

describe('transfer applicants', () => {
  it('never use first-year ranges', () => {
    const result = compareSchool(pastOptionalNowRequired, applicant({ applicantType: 'transfer' }));
    expect(result.benchmarks.every((b) => b.status === 'not_comparable')).toBe(true);
    expect(result.benchmarks.every((b) => b.reasons.includes('TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE'))).toBe(true);
    expect(result.evidence.status).toBe('insufficient');
  });

  it('use a checked transfer policy when there is one', () => {
    const evidence: SchoolEvidence = {
      ...pastOptionalNowRequired,
      currentPolicies: [...pastOptionalNowRequired.currentPolicies, { applicant_type: 'transfer', entry_year: 2027, test_policy: 'considered_not_required', ...CHECKED }],
    };
    const result = compareSchool(evidence, applicant({ applicantType: 'transfer' }));
    expect(result.requirements.find((r) => r.key === 'testing')?.status).toBe('not_applicable');
    expect(result.evidence.status).toBe('partial');
  });
});

describe('evidence and versioning', () => {
  it('sufficient only with a checked policy and reported ranges', () => {
    expect(compareSchool(pastOptionalNowRequired, applicant()).evidence.status).toBe('sufficient');
    expect(compareSchool(unchecked, applicant()).evidence.status).toBe('partial');
  });

  it('every result carries the rules version and the checked source', () => {
    const result = compareSchool(pastOptionalNowRequired, applicant());
    expect(result.rulesVersion).toBe(RULES_VERSION);
    expect(result.requirements.find((r) => r.key === 'testing')?.policy?.source_url).toBe(CHECKED.source_url);
  });

  it('has plain-language text for every reason it can return', () => {
    const inputs = [applicant(), applicant({ submitScores: 'no' }), applicant({ submitScores: 'undecided' }), applicant({ applicantType: 'transfer' }), applicant({ sat: null, gpa: null })];
    const schools = [pastOptionalNowRequired, unchecked, noAdmissionsData, withPolicy('not_considered'), withPolicy('considered_not_required')];
    for (const school of schools) {
      for (const input of inputs) {
        const result = compareSchool(school, input);
        const codes = [...result.requirements.flatMap((r) => r.reasons), ...result.benchmarks.flatMap((b) => b.reasons), ...result.evidence.reasons];
        for (const code of codes) expect(REASONS[code]).toBeTruthy();
      }
    }
  });

  it('never produces a fit or chance label', () => {
    const text = JSON.stringify(compareSchool(pastOptionalNowRequired, applicant())) + JSON.stringify(REASONS);
    expect(text).not.toMatch(/\b(safety|reach|target|strong|competitive|likely|chance of admission)\b/i);
  });
});

describe('input validation', () => {
  const raw = {
    applicantType: 'first_year',
    entryYear: '2027',
    satErw: '',
    satMath: '',
    act: '',
    submitScores: 'yes',
    gpa: '',
    gpaScale: '4',
    gpaType: 'unweighted',
  };

  it('accepts an applicant with no scores and no GPA', () => {
    const parsed = parseApplicantInput(raw, 2026);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input).toMatchObject({ sat: null, act: null, gpa: null });
  });

  it('rejects impossible scores, GPAs and years with a message per field', () => {
    const parsed = parseApplicantInput({ ...raw, satErw: '805', satMath: '615', act: '40', gpa: '4.5', entryYear: '2040' }, 2026);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.errors).sort()).toEqual(['act', 'entryYear', 'gpa', 'satErw', 'satMath']);
  });

  it('rejects an unknown applicant type instead of guessing', () => {
    expect(parseApplicantInput({ ...raw, applicantType: 'graduate' }, 2026).ok).toBe(false);
  });
});

describe('GPA against a published range (F51)', () => {
  const withGpa: SchoolEvidence = { ...unchecked, gpa: { low: 3.25, high: 3.99, term: 'Fall 2025', weighting: 'not_stated' } };
  const gpaOf = (evidence: SchoolEvidence, input: ApplicantInput) => compareSchool(evidence, input).benchmarks.find((b) => b.key === 'gpa');
  const at = (value: number, type: 'unweighted' | 'weighted' | 'unknown' = 'unweighted', scale = 4) => applicant({ gpa: { value, scale, type } });

  it('places the GPA below, within or above the middle half, weighted or not, and says the school didn’t state which', () => {
    expect(gpaOf(withGpa, at(3.2))).toMatchObject({ status: 'below', low: 3.25, high: 3.99, term: 'Fall 2025', applicant: 3.2 });
    expect(gpaOf(withGpa, at(3.25))?.status).toBe('within');
    expect(gpaOf(withGpa, at(4.0, 'weighted'))?.status).toBe('above');
    expect(gpaOf(withGpa, at(3.6, 'unknown'))?.reasons).toEqual(['GPA_RANGE_PUBLISHED', 'WHOLE_CLASS_NOT_ATHLETES', 'GPA_WEIGHTING_NOT_STATED']);
    expect(gpaOf(withGpa, at(3.2))?.reasons).toContain('BELOW_RANGE_IS_NOT_A_REQUIREMENT');
    expect(gpaOf({ ...withGpa, gpa: { low: 3.25, high: 3.99, term: 'Fall 2025', weighting: 'unweighted' } }, at(3.6))?.reasons).not.toContain('GPA_WEIGHTING_NOT_STATED');
  });

  it('compares only GPAs on a 4.0 scale', () => {
    expect(gpaOf(withGpa, at(4.5, 'weighted', 5))).toMatchObject({ status: 'not_comparable', reasons: ['GPA_SCALE_NOT_COMPARABLE'] });
    expect(gpaOf(withGpa, at(92, 'unknown', 100))).toMatchObject({ status: 'not_comparable', reasons: ['GPA_SCALE_NOT_COMPARABLE'] });
  });

  it('flags a GPA range more than two classes old', () => {
    const old: SchoolEvidence = { ...withGpa, gpa: { low: 3.25, high: 3.99, term: 'Fall 2023', weighting: 'not_stated' } };
    expect(gpaOf(old, applicant({ entryYear: 2027 }))?.reasons).toContain('HISTORICAL_DATA_STALE');
    expect(gpaOf(old, applicant({ entryYear: 2025 }))?.reasons).not.toContain('HISTORICAL_DATA_STALE');
  });

  it('is compared even when test scores are not sent or not used, and counts in the score grouping', () => {
    const noScores = applicant({ sat: null, submitScores: 'no', gpa: { value: 3.0, scale: 4, type: 'unweighted' } });
    expect(gpaOf(withGpa, noScores)?.status).toBe('below');
    expect(scoreGroup(compareSchool(withGpa, noScores))).toBe('below');
    expect(gpaOf({ ...withGpa, currentPolicies: [{ applicant_type: 'first_year', entry_year: 2027, test_policy: 'not_considered', ...CHECKED }] }, at(3.5))?.status).toBe('within');
    // SAT within or above and GPA below: mixed.
    expect(scoreGroup(compareSchool(withGpa, applicant({ sat: { erw: 760, math: 800 }, gpa: { value: 3.0, scale: 4, type: 'unweighted' } })))).toBe('mixed');
  });

  it('a GPA range counts as reported evidence, also for a school with no test-score figures', () => {
    const gpaOnly: SchoolEvidence = { ...noAdmissionsData, gpa: { low: 2.5, high: 3.49, term: 'Fall 2025', weighting: 'not_stated' } };
    const result = compareSchool(gpaOnly, applicant({ gpa: { value: 3.0, scale: 4, type: 'unweighted' } }));
    expect(result.benchmarks.find((b) => b.key === 'gpa')?.status).toBe('within');
    expect(result.evidence.status).toBe('partial');
    expect(result.evidence.reasons).not.toContain('GPA_NOT_REPORTED_BY_SCHOOLS');
    expect(scoreGroup(result)).toBe('at_or_above');
  });

  it('never applies first-year GPA ranges to transfer applicants', () => {
    expect(gpaOf(withGpa, applicant({ applicantType: 'transfer' }))).toMatchObject({ status: 'not_comparable', reasons: ['TRANSFER_FIRST_YEAR_DATA_NOT_APPLICABLE'] });
  });

  it('has wording for every GPA reason', () => {
    for (const code of ['GPA_RANGE_PUBLISHED', 'GPA_WEIGHTING_NOT_STATED', 'GPA_SCALE_NOT_COMPARABLE'] as const) expect(REASONS[code].length).toBeGreaterThan(10);
  });
});
