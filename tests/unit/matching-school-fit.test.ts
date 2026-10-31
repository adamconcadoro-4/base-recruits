import { describe, expect, it } from 'vitest';

import {
  EMPTY_PLAYER_NUMBERS,
  PLAYER_FIELDS,
  hasAnyNumber,
  parsePlayerNumbers,
  serializePlayerNumbers,
} from '@/lib/matching/player-store';
import type { ApplicantInput, SchoolEvidence } from '@/lib/matching/rules';
import { schoolFit } from '@/lib/matching/school-fit';
import { groupFor, suggestSchools } from '@/lib/matching/suggestions';

/**
 * "Your fit" on a school page, and the on-device store for the player's
 * numbers. Schools and numbers are synthetic fixtures.
 */

const evidence = (erw: [number | null, number | null], math: [number | null, number | null]): SchoolEvidence => ({
  slug: 'example-university',
  admissionsTerm: erw[0] === null ? null : 'Fall 2025',
  satErw: erw,
  satMath: math,
  actComposite: [null, null],
  historicalTestPolicy: null,
  currentPolicies: [],
});

const player = (overrides: Partial<ApplicantInput> = {}): ApplicantInput => ({
  applicantType: 'first_year',
  entryYear: 2027,
  gpa: { value: 3.3, scale: 4, type: 'unweighted' },
  sat: { erw: 600, math: 600 },
  act: null,
  submitScores: 'yes',
  ...overrides,
});

const IN_RANGE = { status: 'in_range', standardsVersion: 'test-standards' } as const;

describe('schoolFit', () => {
  it('gives the same group the suggestion list would', () => {
    const ev = evidence([560, 640], [620, 700]);
    const fit = schoolFit(ev, 'ncaa_d2', player(), IN_RANGE);
    const list = suggestSchools(
      [{ school: { slug: ev.slug, name: 'Example University', state: 'NY', setting: 'city', division_code: 'ncaa_d2', cost_of_attendance: 30000, cost_year: '2025-26' }, evidence: ev }],
      player(),
      { byLevel: { ncaa_d2: IN_RANGE } },
    );
    expect(fit).toMatchObject({ placed: true, level: 'ncaa_d2', group: 'possible_fit' });
    expect(list.groups.possible_fit[0]?.reasons).toEqual(fit.placed ? fit.reasons : []);
  });

  it('without an athletic result the school is Not enough data, with the academic label still shown', () => {
    const fit = schoolFit(evidence([560, 640], [560, 640]), 'ncaa_d1', player(), null);
    expect(fit).toMatchObject({ placed: true, group: 'not_enough_data', academic: { fit: 'fit' }, athletic: { status: 'not_enough_data' } });
  });

  it('below the level’s athletic standard: no group, because the list sets the school aside', () => {
    const fit = schoolFit(evidence([560, 640], [560, 640]), 'naia', player(), { status: 'below', standardsVersion: 'test-standards' });
    expect(fit).toMatchObject({ placed: true, group: null, reasons: [] });
  });

  it('schools outside the five levels get an academic comparison but no group', () => {
    const fit = schoolFit(evidence([560, 640], [560, 640]), 'uscaa', player(), IN_RANGE);
    expect(fit).toMatchObject({ placed: false, reason: 'LEVEL_NOT_SUGGESTED', academic: { fit: 'fit' } });
  });

  it('uses the per-division core-course GPA for eligibility', () => {
    const fit = schoolFit(evidence([560, 640], [560, 640]), 'ncaa_d1', player(), IN_RANGE, { ncaaCoreGpaDivisionI: 2.1, ncaaCoreGpaDivisionII: null });
    expect(fit).toMatchObject({ placed: true, group: 'reach', eligibility: { status: 'below' } });
    expect(groupFor('in_range', 'fit', 'below').group).toBe('reach');
  });
});

describe('player numbers on this device', () => {
  const filled = { ...EMPTY_PLAYER_NUMBERS, entryYear: '2027', gpa: '3.4', satErw: '610', satMath: '590' };

  it('round-trips every field', () => {
    expect(parsePlayerNumbers(serializePlayerNumbers(filled))).toEqual(filled);
    expect(Object.keys(parsePlayerNumbers(serializePlayerNumbers(filled)) ?? {})).toEqual([...PLAYER_FIELDS]);
  });

  it('treats anything unexpected as nothing saved', () => {
    expect(parsePlayerNumbers(null)).toBeNull();
    expect(parsePlayerNumbers('')).toBeNull();
    expect(parsePlayerNumbers('not json')).toBeNull();
    expect(parsePlayerNumbers(JSON.stringify({ v: 2, values: {} }))).toBeNull();
    expect(parsePlayerNumbers(JSON.stringify({ v: 1, values: { gpa: 3.4 } }))).toBeNull();
    expect(parsePlayerNumbers(JSON.stringify({ v: 1, values: { gpa: 'x'.repeat(21) } }))).toBeNull();
    expect(parsePlayerNumbers('x'.repeat(2001))).toBeNull();
  });

  it('fills fields an older save didn’t have with defaults, and ignores unknown keys', () => {
    const parsed = parsePlayerNumbers(JSON.stringify({ v: 1, values: { gpa: '3.0', email: 'player@example.test' } }));
    expect(parsed).toEqual({ ...EMPTY_PLAYER_NUMBERS, gpa: '3.0' });
    expect(parsed).not.toHaveProperty('email');
  });

  it('caps stored values at 20 characters', () => {
    const long = { ...filled, gpa: '3'.repeat(40) };
    expect(parsePlayerNumbers(serializePlayerNumbers(long))?.gpa).toHaveLength(20);
  });

  it('knows when nothing has been entered', () => {
    expect(hasAnyNumber(EMPTY_PLAYER_NUMBERS)).toBe(false);
    expect(hasAnyNumber({ ...EMPTY_PLAYER_NUMBERS, act: '24' })).toBe(true);
  });
});
