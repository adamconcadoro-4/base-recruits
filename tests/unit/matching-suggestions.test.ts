import { describe, expect, it } from 'vitest';

import { academicFit } from '@/lib/matching/fit';
import type { ApplicantInput, SchoolEvidence } from '@/lib/matching/rules';
import { compareSchool } from '@/lib/matching/rules';
import {
  ACADEMIC_FIT_LABELS,
  ACADEMIC_FIT_REASONS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_REASONS,
  ELIGIBILITY_SCOPE_NOTE,
  EXCLUSION_REASONS,
  GROUP_DESCRIPTIONS,
  GROUP_NAMES,
  LEVEL_LABELS,
  SUGGESTION_DISCLAIMER,
  SUGGESTION_REASONS,
} from '@/lib/matching/suggestions-explain';
import {
  NO_ATHLETIC_DATA,
  SUGGESTION_GROUPS,
  groupFor,
  sortByCost,
  suggestSchools,
  type AthleticProfile,
  type SuggestionCandidate,
} from '@/lib/matching/suggestions';

/**
 * The suggestion engine. Schools, ranges, costs and the athletic standards
 * release below are synthetic test fixtures, not real data.
 */

const CHECKED = { source_url: 'https://admissions.example.edu/testing', verified_at: '2026-10-23T00:00:00Z' } as const;

function evidence(slug: string, erw: [number | null, number | null], math: [number | null, number | null], required = false): SchoolEvidence {
  return {
    slug,
    admissionsTerm: erw[0] === null && math[0] === null ? null : 'Fall 2025',
    satErw: erw,
    satMath: math,
    actComposite: [null, null],
    historicalTestPolicy: null,
    currentPolicies: required ? [{ applicant_type: 'first_year', entry_year: 2027, test_policy: 'required', ...CHECKED }] : [],
  };
}

function candidate(
  slug: string,
  name: string,
  division: SuggestionCandidate['school']['division_code'],
  ranges: { erw: [number | null, number | null]; math: [number | null, number | null]; required?: boolean },
  extra: Partial<SuggestionCandidate['school']> = {},
): SuggestionCandidate {
  return {
    school: { slug, name, state: 'NY', setting: 'suburb', division_code: division, cost_of_attendance: 40000, cost_year: '2025-26', ...extra },
    evidence: evidence(slug, ranges.erw, ranges.math, ranges.required),
  };
}

const player = (overrides: Partial<ApplicantInput> = {}): ApplicantInput => ({
  applicantType: 'first_year',
  entryYear: 2027,
  gpa: { value: 3.3, scale: 4, type: 'unweighted' },
  sat: { erw: 600, math: 600 },
  act: null,
  submitScores: 'yes',
  ...overrides,
});

const STANDARDS = 'test-standards-2026.1';
const inRange = (...levels: (keyof AthleticProfile['byLevel'])[]): AthleticProfile => ({
  byLevel: Object.fromEntries(levels.map((l) => [l, { status: 'in_range' as const, standardsVersion: STANDARDS }])),
});

const AT = { erw: [560, 640] as [number, number], math: [560, 640] as [number, number] };
const MIXED = { erw: [560, 640] as [number, number], math: [620, 700] as [number, number] };
const ABOVE = { erw: [650, 720] as [number, number], math: [650, 720] as [number, number] };
const NONE = { erw: [null, null] as [null, null], math: [null, null] as [null, null] };

const schools: SuggestionCandidate[] = [
  candidate('d1-fit', 'Alder University', 'ncaa_d1', AT),
  candidate('d1-stretch', 'Birch University', 'ncaa_d1', MIXED),
  candidate('d1-reach', 'Cedar University', 'ncaa_d1', ABOVE),
  candidate('d2-fit', 'Dogwood College', 'ncaa_d2', AT),
  candidate('d3-none', 'Elm College', 'ncaa_d3', NONE),
  candidate('naia-fit', 'Fir College', 'naia', AT),
  candidate('juco', 'Gum Community College', 'njcaa_d1', NONE),
  candidate('uscaa', 'Hazel College', 'uscaa', AT),
];

describe('the approved grouping rule', () => {
  it('needs athletic "in range" before any group other than Not enough data', () => {
    expect(groupFor('in_range', 'fit', 'meets').group).toBe('strong_fit');
    expect(groupFor('in_range', 'stretch', 'meets').group).toBe('possible_fit');
    expect(groupFor('in_range', 'reach', 'meets').group).toBe('reach');
    expect(groupFor('in_range', 'not_enough_data', 'meets').group).toBe('not_enough_data');
    expect(groupFor('not_enough_data', 'fit', 'meets').group).toBe('not_enough_data');
  });

  it('a GPA below the level’s minimum to compete makes it a Reach, even when academics weren’t compared', () => {
    expect(groupFor('in_range', 'fit', 'below')).toMatchObject({ group: 'reach' });
    expect(groupFor('in_range', 'fit', 'likely_below').reasons).toContain('ELIGIBILITY_BELOW_MINIMUM');
    expect(groupFor('in_range', 'not_enough_data', 'likely_below').group).toBe('reach');
    // Without an athletic result nothing is placed, but the barrier is still named.
    expect(groupFor('not_enough_data', 'fit', 'below')).toEqual({
      group: 'not_enough_data',
      reasons: ['ATHLETIC_NOT_ASSESSED', 'ACADEMIC_FIT', 'ELIGIBILITY_BELOW_MINIMUM'],
    });
  });

  it('eligibility that depends on class rank or a test score caps a Strong fit at Possible fit', () => {
    expect(groupFor('in_range', 'fit', 'depends').group).toBe('possible_fit');
    expect(groupFor('in_range', 'stretch', 'depends').group).toBe('possible_fit');
    expect(groupFor('in_range', 'reach', 'depends').group).toBe('reach');
    expect(groupFor('in_range', 'not_enough_data', 'depends')).toEqual({
      group: 'not_enough_data',
      reasons: ['ATHLETIC_IN_RANGE', 'ACADEMIC_NOT_COMPARED', 'ELIGIBILITY_DEPENDS'],
    });
  });

  it('an unchecked or non-applicable minimum changes nothing', () => {
    for (const status of ['unknown', 'not_applicable', 'meets', 'likely_meets'] as const) {
      expect(groupFor('in_range', 'fit', status).group).toBe('strong_fit');
    }
  });
});

describe('suggestSchools', () => {
  it('groups schools by athletic level and academic fit, with reasons', () => {
    const list = suggestSchools(schools, player(), inRange('ncaa_d1', 'ncaa_d2', 'ncaa_d3', 'naia', 'juco'));
    const slugs = (g: (typeof SUGGESTION_GROUPS)[number]) => list.groups[g].map((s) => s.school.slug);
    expect(slugs('strong_fit')).toEqual(['d1-fit', 'd2-fit', 'naia-fit']);
    expect(slugs('possible_fit')).toEqual(['d1-stretch']);
    expect(slugs('reach')).toEqual(['d1-reach']);
    expect(slugs('not_enough_data')).toEqual(['d3-none', 'juco']);
    expect(list.excluded.LEVEL_NOT_SUGGESTED).toBe(1);
    expect(list.groups.strong_fit[0]?.reasons).toEqual(['ATHLETIC_IN_RANGE', 'ACADEMIC_FIT']);
    expect(list.versions.athleticStandards).toEqual([STANDARDS]);
  });

  it('leaves out levels where the player is below the standard, and counts them', () => {
    const profile: AthleticProfile = {
      byLevel: { ncaa_d1: { status: 'below', standardsVersion: STANDARDS }, ncaa_d2: { status: 'in_range', standardsVersion: STANDARDS } },
    };
    const list = suggestSchools(schools, player(), profile);
    const all = Object.values(list.groups).flat().map((s) => s.school.slug);
    expect(all).not.toContain('d1-fit');
    expect(list.excluded.ATHLETIC_BELOW_LEVEL).toBe(3);
    expect(list.groups.strong_fit.map((s) => s.school.slug)).toEqual(['d2-fit']);
  });

  it('a Power 4 school uses the Power 4 result; other Division I schools keep the Division I one (F50)', () => {
    const p4 = [
      candidate('p4-fit', 'Pawpaw University', 'ncaa_d1', AT, { power4: true }),
      candidate('d1-fit', 'Alder University', 'ncaa_d1', AT),
    ];
    const profile: AthleticProfile = {
      byLevel: { ncaa_d1: { status: 'in_range', standardsVersion: STANDARDS } },
      ncaaD1Power4: { status: 'below', standardsVersion: STANDARDS },
    };
    const list = suggestSchools(p4, player(), profile);
    expect(list.groups.strong_fit.map((s) => [s.school.slug, s.power4])).toEqual([['d1-fit', false]]);
    expect(list.excluded.ATHLETIC_BELOW_LEVEL).toBe(1);
    const both = suggestSchools(p4, player(), { ...profile, ncaaD1Power4: { status: 'in_range', standardsVersion: STANDARDS } });
    expect(both.groups.strong_fit.map((s) => [s.school.slug, s.power4])).toEqual([
      ['d1-fit', false],
      ['p4-fit', true],
    ]);
    // Standards with no Power 4 result (for example a partner release) judge every Division I school the same way.
    const plain = suggestSchools(p4, player(), { byLevel: profile.byLevel });
    expect(plain.groups.strong_fit.map((s) => [s.school.slug, s.power4])).toEqual([
      ['d1-fit', false],
      ['p4-fit', false],
    ]);
  });

  it('without athletic results, nothing is hidden: every school is Not enough data, with its academic label', () => {
    const list = suggestSchools(schools, player(), NO_ATHLETIC_DATA);
    expect(list.groups.strong_fit).toHaveLength(0);
    expect(list.groups.not_enough_data).toHaveLength(7);
    expect(list.groups.not_enough_data.find((s) => s.school.slug === 'd1-fit')?.academic.fit).toBe('fit');
    expect(list.versions.athleticStandards).toEqual([]);
  });

  it('a GPA below a level’s minimum moves only that level’s schools to Reach', () => {
    const list = suggestSchools(schools, player({ gpa: { value: 2.25, scale: 4, type: 'unweighted' } }), inRange('ncaa_d1', 'ncaa_d2', 'naia'));
    // 2.25 is below Division I's 2.3, so every Division I school is a Reach, sorted by name.
    expect(list.groups.reach.map((s) => s.school.slug)).toEqual(['d1-fit', 'd1-stretch', 'd1-reach']);
    // It meets Division II's 2.2, and with a qualifying SAT it meets two of the NAIA's three criteria.
    expect(list.groups.strong_fit.map((s) => s.school.slug)).toEqual(['d2-fit', 'naia-fit']);
  });

  it('NAIA eligibility that depends on class rank caps the school at Possible fit', () => {
    const list = suggestSchools(schools, player({ gpa: { value: 2.1, scale: 4, type: 'unweighted' }, sat: { erw: 450, math: 450 } }), inRange('naia'));
    expect(list.eligibilityByLevel.naia.status).toBe('depends');
    // The SAT is below the NAIA test minimum but the ranges here are lower still for this fixture school.
    const lowRanges = [candidate('naia-low', 'Pine College', 'naia', { erw: [400, 480], math: [400, 480] })];
    const low = suggestSchools(lowRanges, player({ gpa: { value: 2.1, scale: 4, type: 'unweighted' }, sat: { erw: 450, math: 450 } }), inRange('naia'));
    expect(low.groups.possible_fit.map((s) => s.school.slug)).toEqual(['naia-low']);
    expect(low.groups.possible_fit[0]?.reasons).toContain('ELIGIBILITY_DEPENDS');
  });

  it('a GPA below the minimum makes a school with no score ranges a Reach, not Not enough data', () => {
    const list = suggestSchools(
      [candidate('d1-none', 'Quince University', 'ncaa_d1', NONE)],
      player({ gpa: { value: 2.0, scale: 4, type: 'unweighted' } }),
      inRange('ncaa_d1'),
    );
    expect(list.groups.reach.map((s) => s.school.slug)).toEqual(['d1-none']);
    expect(list.groups.reach[0]?.reasons).toEqual(['ATHLETIC_IN_RANGE', 'ACADEMIC_NOT_COMPARED', 'ELIGIBILITY_BELOW_MINIMUM']);
  });

  it('a better test score never moves a school to a lower group', () => {
    const naia = [candidate('naia-low', 'Redbud College', 'naia', { erw: [400, 480], math: [400, 480] })];
    const weighted = { value: 3.4, scale: 4, type: 'weighted' as const };
    const lower = suggestSchools(naia, player({ gpa: weighted, sat: { erw: 480, math: 480 } }), inRange('naia'));
    const higher = suggestSchools(naia, player({ gpa: weighted, sat: { erw: 490, math: 490 } }), inRange('naia'));
    // SAT 960 misses the NAIA's 970, 980 meets it; with a weighted GPA eligibility stays "not checked" either way,
    // so the better score can't cap the school at Possible fit.
    expect(lower.eligibilityByLevel.naia.status).toBe('unknown');
    expect(higher.eligibilityByLevel.naia.status).toBe('unknown');
    expect(lower.groups.strong_fit.map((s) => s.school.slug)).toEqual(['naia-low']);
    expect(higher.groups.strong_fit.map((s) => s.school.slug)).toEqual(['naia-low']);
  });

  it('a checked test requirement the player won’t meet is a Reach', () => {
    const required = [candidate('req', 'Ironwood University', 'ncaa_d1', { ...AT, required: true })];
    const list = suggestSchools(required, player({ submitScores: 'no' }), inRange('ncaa_d1'));
    expect(list.groups.reach[0]?.academic).toMatchObject({ fit: 'reach', reason: 'REQUIREMENT_NOT_MET' });
  });

  it('applies the player’s filters, but never excludes a school for unreported data', () => {
    const extra = [
      candidate('costly', 'Juniper University', 'ncaa_d1', AT, { cost_of_attendance: 90000 }),
      candidate('no-cost', 'Koa University', 'ncaa_d1', AT, { cost_of_attendance: null }),
      candidate('far', 'Larch University', 'ncaa_d1', AT, { state: 'CA' }),
      candidate('no-state', 'Maple University', 'ncaa_d1', AT, { state: null }),
      candidate('rural', 'Nutmeg University', 'ncaa_d1', AT, { setting: 'rural' }),
      candidate('no-setting', 'Oak University', 'ncaa_d1', AT, { setting: null }),
    ];
    const list = suggestSchools([...schools, ...extra], player(), inRange('ncaa_d1', 'ncaa_d2'), {
      maxCostOfAttendance: 60000,
      states: ['NY'],
      settings: ['suburb'],
      levels: ['ncaa_d1'],
    });
    const strong = list.groups.strong_fit.map((s) => s.school.slug);
    expect(strong).toEqual(['d1-fit', 'no-cost', 'no-state', 'no-setting']);
    expect(list.excluded).toMatchObject({ OVER_BUDGET: 1, OUTSIDE_CHOSEN_STATES: 1, OUTSIDE_CHOSEN_SETTINGS: 1, LEVEL_NOT_CHOSEN: 4 });
    expect(list.groups.strong_fit.find((s) => s.school.slug === 'no-cost')?.reasons).toContain('COST_NOT_REPORTED');
    expect(list.groups.strong_fit.find((s) => s.school.slug === 'd1-fit')?.reasons).toContain('COST_WITHIN_BUDGET');
    expect(list.groups.strong_fit.find((s) => s.school.slug === 'no-state')?.reasons).toContain('STATE_NOT_REPORTED');
    expect(list.groups.strong_fit.find((s) => s.school.slug === 'no-setting')?.reasons).toContain('SETTING_NOT_REPORTED');
  });

  it('is deterministic and takes no plan or payment input: identical data gives identical lists', () => {
    const a = suggestSchools(schools, player(), inRange('ncaa_d1', 'naia'));
    const b = suggestSchools([...schools].reverse(), player(), inRange('ncaa_d1', 'naia'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('counts a school listed twice once', () => {
    const first = schools[0];
    if (!first) throw new Error('fixture');
    const list = suggestSchools([first, first], player(), inRange('ncaa_d1'));
    expect(list.groups.strong_fit).toHaveLength(1);
  });

  it('carries every rule version', () => {
    const { versions } = suggestSchools(schools, player(), NO_ATHLETIC_DATA);
    expect(Object.keys(versions)).toEqual(['suggestions', 'comparison', 'academicFit', 'eligibility', 'athleticStandards']);
  });
});

describe('academic fit and wording', () => {
  it('derives the label from the existing comparison only', () => {
    const fit = (ranges: typeof AT | typeof NONE, input = player()) => academicFit(compareSchool(evidence('x', ranges.erw, ranges.math), input)).fit;
    expect(fit(AT)).toBe('fit');
    expect(fit(MIXED)).toBe('stretch');
    expect(fit(ABOVE)).toBe('reach');
    expect(fit(NONE)).toBe('not_enough_data');
    expect(fit(AT, player({ applicantType: 'transfer' }))).toBe('not_enough_data');
  });

  it('sorts by published cost with unreported costs last', () => {
    const list = suggestSchools(
      [
        candidate('a', 'A', 'ncaa_d1', AT, { cost_of_attendance: 50000 }),
        candidate('b', 'B', 'ncaa_d1', AT, { cost_of_attendance: null }),
        candidate('c', 'C', 'ncaa_d1', AT, { cost_of_attendance: 20000 }),
      ],
      player(),
      inRange('ncaa_d1'),
    );
    expect(sortByCost(list.groups.strong_fit).map((s) => s.school.slug)).toEqual(['c', 'a', 'b']);
  });

  it('has plain wording for every group, label and reason, with no outcome promises', () => {
    const texts = [
      ...SUGGESTION_GROUPS.map((g) => GROUP_NAMES[g]),
      ...Object.values(GROUP_DESCRIPTIONS),
      ...Object.values(ACADEMIC_FIT_LABELS),
      ...Object.values(ACADEMIC_FIT_REASONS),
      ...Object.values(ELIGIBILITY_LABELS),
      ...Object.values(ELIGIBILITY_REASONS),
      ...Object.values(LEVEL_LABELS),
      ...Object.values(SUGGESTION_REASONS),
      ...Object.values(EXCLUSION_REASONS),
      ELIGIBILITY_SCOPE_NOTE,
      SUGGESTION_DISCLAIMER,
    ];
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(3);
      expect(text).not.toMatch(/\b(guarantee[sd]?|will get in|will be admitted|chance of admission|chances? of getting|scholarship offer|safety|safeties)\b/i);
    }
  });
});
