import { describe, expect, it } from 'vitest';

import { evaluateAthletic } from '@/lib/matching/athletic';
import {
  DEFAULT_LIST_LEVELS,
  DIVISIONS_BY_LEVEL,
  NOT_SUGGESTED_DIVISIONS,
  SUGGESTED_DIVISIONS,
  toListCandidate,
} from '@/lib/matching/candidates';
import { levelForDivision } from '@/lib/matching/eligibility';
import {
  DEFAULT_LIST_FILTERS,
  parseListFilters,
  serializeListFilters,
  toPreferences,
  type ListFilters,
} from '@/lib/matching/list-filters';
import { hasTypedAcademics, readPlayerInput } from '@/lib/matching/player-input';
import { EMPTY_PLAYER_NUMBERS, type PlayerNumbers } from '@/lib/matching/player-store';
import { suggestSchools } from '@/lib/matching/suggestions';
import { DIVISION_CODES, type CurrentPolicy, type GpaRangeRow, type SchoolSummary } from '@/lib/registry/types';

/**
 * The My schools list: candidates built from registry rows, the player's
 * stored numbers read the same way as on school pages, and the list's
 * filters. Schools and numbers below are synthetic test fixtures.
 */

const numbers = (overrides: Partial<PlayerNumbers> = {}): PlayerNumbers => ({ ...EMPTY_PLAYER_NUMBERS, entryYear: '2027', ...overrides });

function row(overrides: Partial<SchoolSummary> = {}): SchoolSummary {
  return {
    slug: 'example-college-ny',
    name: 'Example College',
    city: 'Exampleton',
    state: 'NY',
    control: 'private_nonprofit',
    level: 'four_year',
    setting: 'suburb',
    undergraduate_enrollment: 3000,
    enrollment_term: 'Fall 2024',
    association_code: 'ncaa',
    association_short_name: 'NCAA',
    division_code: 'ncaa_d1',
    division_name: 'Division I',
    two_year_association: false,
    conference: 'Example Conference',
    program_season: '2024-25',
    verification: 'federal_report',
    admissions_term: 'Fall 2024',
    admission_rate: 0.5,
    sat_erw_25: 560,
    sat_erw_75: 640,
    sat_math_25: 560,
    sat_math_75: 640,
    act_composite_25: null,
    act_composite_75: null,
    test_policy: 'considered_not_required',
    cost_year: '2024-25',
    cost_of_attendance: 60000,
    tuition_in_state: 45000,
    tuition_out_of_state: 45000,
    open_admission: false,
    relevance: 0,
    total_count: 1,
    ...overrides,
  };
}

describe('levels and divisions', () => {
  it('places every division at exactly one level, or counts it as not suggested', () => {
    for (const code of DIVISION_CODES) {
      const level = levelForDivision(code);
      if (level === null) expect(NOT_SUGGESTED_DIVISIONS).toContain(code);
      else expect(DIVISIONS_BY_LEVEL[level]).toContain(code);
    }
    expect(new Set([...SUGGESTED_DIVISIONS, ...NOT_SUGGESTED_DIVISIONS]).size).toBe(DIVISION_CODES.length);
  });

  it('opens on D1, D2 and D3 (founder decision 2026-11-17)', () => {
    expect(DEFAULT_LIST_LEVELS).toEqual(['ncaa_d1', 'ncaa_d2', 'ncaa_d3']);
    expect(DEFAULT_LIST_FILTERS.levels).toEqual(['ncaa_d1', 'ncaa_d2', 'ncaa_d3']);
  });
});

describe('toListCandidate', () => {
  const policy: CurrentPolicy = {
    slug: 'example-college-ny',
    applicant_type: 'first_year',
    entry_year: 2027,
    test_policy: 'required',
    exceptions: null,
    source_url: 'https://admissions.example.edu/testing',
    source_title: null,
    verified_at: '2026-10-23T00:00:00Z',
  };
  const gpa: GpaRangeRow = {
    slug: 'example-college-ny',
    source_kind: 'common_data_set',
    entering_term: 'Fall 2024',
    cds_year: '2024-25',
    low: 3.5,
    high: 4,
    average: null,
    percent_submitting: null,
    weighting: 'not_stated',
    source_url: 'https://ir.example.edu/cds',
    source_title: null,
    recorded_at: '2026-10-31T00:00:00Z',
  };

  it('carries the same evidence a school page compares against', () => {
    const c = toListCandidate(row(), [policy, { ...policy, slug: 'other-school' }], gpa, null);
    expect(c.evidence.satErw).toEqual([560, 640]);
    expect(c.evidence.openAdmission).toBe(false);
    expect(c.evidence.currentPolicies).toHaveLength(1);
    expect(c.evidence.currentPolicies[0]?.test_policy).toBe('required');
    expect(c.evidence.gpa).toEqual({ low: 3.5, high: 4, term: 'Fall 2024', weighting: 'not_stated' });
    expect(c.school).toMatchObject({ slug: 'example-college-ny', city: 'Exampleton', conference: 'Example Conference', power4: false, power4Conference: null });
  });

  it('marks Power 4 only for Division I schools', () => {
    expect(toListCandidate(row(), [], null, 'SEC').school).toMatchObject({ power4: true, power4Conference: 'SEC' });
    expect(toListCandidate(row({ division_code: 'ncaa_d2' }), [], null, 'SEC').school).toMatchObject({ power4: false, power4Conference: null });
  });

  it('keeps unreported values unknown, never zero', () => {
    const c = toListCandidate(row({ cost_of_attendance: null, cost_year: null, open_admission: undefined, sat_erw_25: null }), [], null, null);
    expect(c.school.cost_of_attendance).toBeNull();
    expect(c.evidence.openAdmission).toBeNull();
    expect(c.evidence.satErw[0]).toBeNull();
    expect(c.evidence.gpa).toBeNull();
  });
});

describe('readPlayerInput', () => {
  it('reads grades, core-course GPAs and baseball numbers together', () => {
    const r = readPlayerInput(numbers({ gpa: '3.4', satTotal: '1210', coreGpaDivisionI: '3.2', position: 'pitcher', fastball_mph: '88' }), 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.gpa).toEqual({ value: 3.4, scale: 4, type: 'unweighted' });
    expect(r.extras).toEqual({ ncaaCoreGpaDivisionI: 3.2, ncaaCoreGpaDivisionII: null });
    expect(r.athletic).toEqual({ position: 'pitcher', metrics: { fastball_mph: 88 } });
  });

  it('collects every field error at once', () => {
    const r = readPlayerInput(numbers({ satTotal: '1605', coreGpaDivisionII: 'x', position: 'pitcher', fastball_mph: '300' }), 2026);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['coreGpaDivisionII', 'fastball_mph', 'satTotal']);
  });

  it('has no baseball input without a position', () => {
    const r = readPlayerInput(numbers({ gpa: '3.0' }), 2026);
    expect(r.ok && r.athletic).toBeNull();
  });

  it('knows when typed grades need transcripts', () => {
    expect(hasTypedAcademics(numbers())).toBe(false);
    expect(hasTypedAcademics(numbers({ position: 'pitcher', fastball_mph: '88' }))).toBe(false);
    expect(hasTypedAcademics(numbers({ act: '25' }))).toBe(true);
  });
});

describe('list filters', () => {
  it('round-trips through storage', () => {
    const f: ListFilters = { levels: ['ncaa_d3', 'naia'], states: ['NY', 'NJ'], settings: ['town'], maxCost: 40000, sort: 'cost' };
    expect(parseListFilters(serializeListFilters(f))).toEqual(f);
  });

  it('treats anything unexpected as nothing saved', () => {
    for (const bad of [
      null,
      '',
      'not json',
      JSON.stringify({ v: 2, ...DEFAULT_LIST_FILTERS }),
      JSON.stringify({ v: 1, ...DEFAULT_LIST_FILTERS, levels: ['ncaa_d4'] }),
      JSON.stringify({ v: 1, ...DEFAULT_LIST_FILTERS, states: ['New York'] }),
      JSON.stringify({ v: 1, ...DEFAULT_LIST_FILTERS, maxCost: 12345 }),
      JSON.stringify({ v: 1, ...DEFAULT_LIST_FILTERS, sort: 'score' }),
      'x'.repeat(3000),
    ]) {
      expect(parseListFilters(bad)).toBeNull();
    }
  });

  it('shows nothing, not everything, when every level is unticked', () => {
    expect(toPreferences({ ...DEFAULT_LIST_FILTERS, levels: [] })).toBeNull();
    expect(toPreferences(DEFAULT_LIST_FILTERS)).toEqual({ maxCostOfAttendance: null, states: [], settings: [], levels: ['ncaa_d1', 'ncaa_d2', 'ncaa_d3'] });
  });
});

describe('the list end to end', () => {
  const candidates = [
    toListCandidate(row({ slug: 'a-ny', name: 'A College' }), [], null, null),
    toListCandidate(row({ slug: 'p4-ny', name: 'Power Four University' }), [], null, 'ACC'),
    toListCandidate(row({ slug: 'd3-ny', name: 'D3 College', division_code: 'ncaa_d3' }), [], null, null),
    toListCandidate(row({ slug: 'jc-ny', name: 'Junior College', division_code: 'njcaa_d1', open_admission: true, sat_erw_25: null, sat_erw_75: null, sat_math_25: null, sat_math_75: null }), [], null, null),
  ];

  function list(n: PlayerNumbers, filters: ListFilters = DEFAULT_LIST_FILTERS) {
    const r = readPlayerInput(n, 2026);
    if (!r.ok) throw new Error('fixture numbers should validate');
    const prefs = toPreferences(filters);
    if (!prefs) throw new Error('fixture filters should choose a level');
    return suggestSchools(candidates, r.input, evaluateAthletic(r.athletic), prefs, r.extras);
  }

  it('compares Power 4 schools with the Power 4 benchmarks (F50)', () => {
    // 86 mph: in the Division I typical range, below the Power 4 one (87 and up).
    const l = list(numbers({ gpa: '3.6', satTotal: '1200', position: 'pitcher', fastball_mph: '86' }));
    expect(l.groups.strong_fit.map((s) => s.school.slug)).toEqual(['a-ny', 'd3-ny']);
    expect(l.excluded.ATHLETIC_BELOW_LEVEL).toBe(1);
    expect(l.excluded.LEVEL_NOT_CHOSEN).toBe(1);
  });

  it('puts everything under Not enough data until baseball numbers are entered', () => {
    const l = list(numbers({ gpa: '3.6', satTotal: '1200' }));
    expect(l.groups.not_enough_data).toHaveLength(3);
    expect(l.groups.not_enough_data.every((s) => s.academic.fit === 'fit')).toBe(true);
  });

  it('adds junior colleges when chosen', () => {
    const l = list(numbers({ position: 'pitcher', fastball_mph: '88' }), { ...DEFAULT_LIST_FILTERS, levels: ['juco'] });
    expect(l.groups.strong_fit.map((s) => s.school.slug)).toEqual(['jc-ny']);
    expect(l.excluded.LEVEL_NOT_CHOSEN).toBe(3);
  });
});
