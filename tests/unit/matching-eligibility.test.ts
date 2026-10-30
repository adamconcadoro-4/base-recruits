import { describe, expect, it } from 'vitest';

import {
  ELIGIBILITY_RULES,
  LEVELS,
  checkAllLevels,
  checkEligibility,
  levelForDivision,
  parseCoreGpa,
} from '@/lib/matching/eligibility';
import type { ApplicantInput } from '@/lib/matching/rules';
import { ELIGIBILITY_REASONS, LEVEL_LABELS } from '@/lib/matching/suggestions-explain';
import { DIVISION_CODES } from '@/lib/registry/types';

/**
 * Eligibility-to-compete checks by level. Numbers are synthetic players, not
 * real people. The rule values themselves are asserted so a change to a
 * minimum is a deliberate, reviewed edit.
 */

const player = (overrides: Partial<ApplicantInput> = {}): ApplicantInput => ({
  applicantType: 'first_year',
  entryYear: 2027,
  gpa: { value: 3.1, scale: 4, type: 'unweighted' },
  sat: null,
  act: null,
  submitScores: 'yes',
  ...overrides,
});
const gpa = (value: number, type: 'unweighted' | 'weighted' | 'unknown' = 'unweighted', scale = 4) => ({ gpa: { value, scale, type } });

describe('the checked rules', () => {
  it('records the published minimums, each with a source and a check date', () => {
    expect(ELIGIBILITY_RULES.ncaa_d1).toMatchObject({ kind: 'ncaa_core_gpa', minimum: 2.3, redshirtMinimum: 2.0 });
    expect(ELIGIBILITY_RULES.ncaa_d2).toMatchObject({ kind: 'ncaa_core_gpa', minimum: 2.2, redshirtMinimum: null });
    expect(ELIGIBILITY_RULES.ncaa_d3.kind).toBe('no_division_minimum');
    expect(ELIGIBILITY_RULES.naia).toMatchObject({ kind: 'naia', gpaAlone: 2.3, gpaOfTwo: 2.0, actMinimum: 18, satMinimum: 970 });
    expect(ELIGIBILITY_RULES.juco.kind).toBe('unconfirmed');
    for (const rule of Object.values(ELIGIBILITY_RULES)) {
      if (rule.kind === 'unconfirmed') continue;
      expect(rule.sources.length).toBeGreaterThan(0);
      for (const source of rule.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('maps every registry division to a level or to none', () => {
    const mapped = Object.fromEntries(DIVISION_CODES.map((code) => [code, levelForDivision(code)]));
    expect(mapped).toEqual({
      ncaa_d1: 'ncaa_d1',
      ncaa_d2: 'ncaa_d2',
      ncaa_d3: 'ncaa_d3',
      naia: 'naia',
      njcaa_d1: 'juco',
      njcaa_d2: 'juco',
      njcaa_d3: 'juco',
      cccaa: 'juco',
      nwac: 'juco',
      uscaa: null,
      nccaa_d1: null,
      nccaa_d2: null,
      independent: null,
      other: null,
    });
  });

  it('has wording for every level and reason', () => {
    for (const level of LEVELS) expect(LEVEL_LABELS[level]).toBeTruthy();
    for (const text of Object.values(ELIGIBILITY_REASONS)) expect(text.length).toBeGreaterThan(10);
  });
});

describe('NCAA Division I and II', () => {
  it('uses the core-course GPA when it is entered, and states the result plainly', () => {
    expect(checkEligibility('ncaa_d1', player(), { ncaaCoreGpa: 2.3 })).toMatchObject({ status: 'meets', comparedGpa: 2.3, minimum: 2.3 });
    expect(checkEligibility('ncaa_d1', player(), { ncaaCoreGpa: 2.29 })).toMatchObject({ status: 'below' });
    expect(checkEligibility('ncaa_d2', player(), { ncaaCoreGpa: 2.2 })).toMatchObject({ status: 'meets', minimum: 2.2 });
    expect(checkEligibility('ncaa_d2', player(), { ncaaCoreGpa: 2.19 }).status).toBe('below');
  });

  it('labels an overall GPA as "likely", because the NCAA counts only core courses', () => {
    const meets = checkEligibility('ncaa_d1', player(gpa(3.4)));
    expect(meets).toMatchObject({ status: 'likely_meets', comparedGpa: 3.4 });
    expect(meets.reasons).toContain('OVERALL_GPA_NOT_CORE_GPA');
    expect(checkEligibility('ncaa_d1', player(gpa(2.1))).status).toBe('likely_below');
  });

  it('a core-course GPA overrides the overall GPA', () => {
    expect(checkEligibility('ncaa_d1', player(gpa(3.6)), { ncaaCoreGpa: 2.1 }).status).toBe('below');
    expect(checkEligibility('ncaa_d1', player(gpa(2.0)), { ncaaCoreGpa: 2.5 }).status).toBe('meets');
  });

  it('names the Division I academic-redshirt range, and only in Division I', () => {
    expect(checkEligibility('ncaa_d1', player(), { ncaaCoreGpa: 2.0 }).reasons).toContain('NCAA_ACADEMIC_REDSHIRT_RANGE');
    expect(checkEligibility('ncaa_d1', player(), { ncaaCoreGpa: 1.99 }).reasons).not.toContain('NCAA_ACADEMIC_REDSHIRT_RANGE');
    expect(checkEligibility('ncaa_d2', player(), { ncaaCoreGpa: 2.1 }).reasons).not.toContain('NCAA_ACADEMIC_REDSHIRT_RANGE');
  });

  it('never compares a weighted GPA, a GPA on another scale, or a missing GPA', () => {
    expect(checkEligibility('ncaa_d1', player(gpa(4.2, 'weighted', 5)))).toMatchObject({ status: 'unknown', reasons: ['GPA_SCALE_NOT_COMPARABLE'] });
    expect(checkEligibility('ncaa_d1', player(gpa(3.9, 'weighted')))).toMatchObject({ status: 'unknown', reasons: ['GPA_WEIGHTED_NOT_COMPARABLE'] });
    expect(checkEligibility('ncaa_d1', player({ gpa: null }))).toMatchObject({ status: 'unknown', reasons: ['GPA_NOT_ENTERED'] });
  });

  it('test scores play no part (the NCAA removed them)', () => {
    const withScores = checkEligibility('ncaa_d1', player({ ...gpa(2.1), act: { composite: 30 } }));
    expect(withScores.status).toBe('likely_below');
  });
});

describe('NCAA Division III and junior colleges', () => {
  it('Division III has no association minimum', () => {
    expect(checkEligibility('ncaa_d3', player(gpa(1.5)))).toMatchObject({ status: 'not_applicable', reasons: ['DIVISION_III_SCHOOLS_SET_STANDARDS'] });
  });

  it('junior colleges are "not checked" until a current rule is confirmed — never "no minimum"', () => {
    expect(checkEligibility('juco', player(gpa(1.5)))).toMatchObject({ status: 'unknown', reasons: ['RULE_NOT_CONFIRMED'], sources: [] });
  });
});

describe('NAIA', () => {
  it('2.3 or higher meets the requirement on its own', () => {
    expect(checkEligibility('naia', player(gpa(2.3)))).toMatchObject({ status: 'meets', reasons: ['NAIA_GPA_ALONE', 'CURRENT_NOT_FINAL'] });
  });

  it('from 2.0 to 2.29, a qualifying test score makes two of three', () => {
    expect(checkEligibility('naia', player({ ...gpa(2.1), act: { composite: 18 } })).status).toBe('meets');
    expect(checkEligibility('naia', player({ ...gpa(2.1), sat: { erw: 480, math: 490 } })).status).toBe('meets');
    expect(checkEligibility('naia', player({ ...gpa(2.1), sat: { erw: 480, math: 480 } })).status).toBe('depends');
    expect(checkEligibility('naia', player(gpa(2.1)))).toMatchObject({ status: 'depends', reasons: ['NAIA_NEEDS_RANK_OR_TEST', 'CURRENT_NOT_FINAL'] });
  });

  it('a test score the player won’t send is not counted', () => {
    const result = checkEligibility('naia', player({ ...gpa(2.1), act: { composite: 25 }, submitScores: 'no' }));
    expect(result.status).toBe('depends');
    expect(result.reasons).toContain('TEST_NOT_SENT');
  });

  it('below 2.0 needs both class rank and a test score', () => {
    expect(checkEligibility('naia', player({ ...gpa(1.8), act: { composite: 20 } }))).toMatchObject({ status: 'depends', reasons: ['NAIA_NEEDS_RANK_AND_TEST', 'CURRENT_NOT_FINAL'] });
    expect(checkEligibility('naia', player(gpa(1.8))).status).toBe('below');
  });

  it('without a comparable GPA, a test score alone is one criterion of three', () => {
    expect(checkEligibility('naia', player({ gpa: null, act: { composite: 21 } }))).toMatchObject({ status: 'depends' });
    expect(checkEligibility('naia', player({ gpa: null })).status).toBe('unknown');
  });
});

describe('transfers and input', () => {
  it('freshman rules are not applied to transfer applicants', () => {
    for (const check of Object.values(checkAllLevels(player({ applicantType: 'transfer', ...gpa(1.0) })))) {
      expect(check).toMatchObject({ status: 'not_applicable', reasons: ['TRANSFER_RULES_DIFFER'] });
    }
  });

  it('checks every level at once', () => {
    expect(Object.keys(checkAllLevels(player()))).toEqual([...LEVELS]);
  });

  it('validates an entered core-course GPA', () => {
    expect(parseCoreGpa('')).toEqual({ ok: true, value: null });
    expect(parseCoreGpa(' 2.45 ')).toEqual({ ok: true, value: 2.45 });
    expect(parseCoreGpa('4.3').ok).toBe(false);
    expect(parseCoreGpa('abc').ok).toBe(false);
  });
});
