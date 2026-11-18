import { describe, expect, it } from 'vitest';

import { fromAccountRow, readSubmittedNumbers, toAccountPayload, type SavedNumbersRow } from '@/lib/matching/account-numbers';
import { academicsLine, baseballLine } from '@/lib/matching/numbers-summary';
import { EMPTY_PLAYER_NUMBERS, type PlayerNumbers } from '@/lib/matching/player-store';

/**
 * Numbers saved to the account (F63): only checked values are stored, only
 * the chosen position's baseball numbers, and a saved row reads back as the
 * same form values. Synthetic fixtures.
 */

const numbers = (overrides: Partial<PlayerNumbers> = {}): PlayerNumbers => ({ ...EMPTY_PLAYER_NUMBERS, entryYear: '2027', ...overrides });

describe('toAccountPayload', () => {
  it('stores typed values, and only the chosen position’s baseball numbers', () => {
    const payload = toAccountPayload(
      numbers({ gpa: '3.4', satTotal: '1200', coreGpaDivisionI: '3.2', position: 'pitcher', fastball_mph: '88', exit_velocity_mph: '95' }),
      2026,
    );
    expect(payload).toMatchObject({
      applicant_type: 'first_year',
      entry_year: 2027,
      gpa: 3.4,
      gpa_scale: 4,
      gpa_type: 'unweighted',
      sat_total: 1200,
      act_composite: null,
      submit_scores: 'yes',
      core_gpa_division_i: 3.2,
      core_gpa_division_ii: null,
      main_position: 'pitcher',
      fastball_mph: 88,
      exit_velocity_mph: null,
    });
  });

  it('refuses numbers the comparison would refuse', () => {
    expect(toAccountPayload(numbers({ satTotal: '1605' }), 2026)).toBeNull();
    expect(toAccountPayload(numbers({ gpa: '3.4', gpaScale: '6' }), 2026)).toBeNull();
    expect(toAccountPayload(numbers({ entryYear: '2020' }), 2026)).toBeNull();
  });

  it('keeps "Not sure" as no GPA type', () => {
    expect(toAccountPayload(numbers({ gpa: '3.4', gpaType: '' }), 2026)?.gpa_type).toBeNull();
  });
});

describe('fromAccountRow', () => {
  const row: SavedNumbersRow = {
    applicant_type: 'transfer',
    entry_year: 2027,
    gpa: 3.6,
    gpa_scale: 4,
    gpa_type: 'weighted',
    sat_total: 1250,
    act_composite: null,
    submit_scores: 'undecided',
    core_gpa_division_i: null,
    core_gpa_division_ii: 3.1,
    main_position: 'catcher',
    fastball_mph: null,
    exit_velocity_mph: 92.5,
    sixty_yard_s: null,
    infield_velocity_mph: null,
    outfield_velocity_mph: null,
    catcher_velocity_mph: 78,
    pop_time_s: 2.05,
    verification: 'self_reported',
    updated_at: '2026-11-18T17:00:00Z',
  };

  it('reads back as the form’s values', () => {
    expect(fromAccountRow(row)).toEqual({
      ...EMPTY_PLAYER_NUMBERS,
      applicantType: 'transfer',
      entryYear: '2027',
      gpa: '3.6',
      gpaScale: '4',
      gpaType: 'weighted',
      satTotal: '1250',
      submitScores: 'undecided',
      coreGpaDivisionII: '3.1',
      position: 'catcher',
      exit_velocity_mph: '92.5',
      catcher_velocity_mph: '78',
      pop_time_s: '2.05',
    });
  });

  it('round-trips through the payload', () => {
    const back = fromAccountRow(row);
    expect(toAccountPayload(back, 2026)).toMatchObject({ gpa: 3.6, sat_total: 1250, main_position: 'catcher', pop_time_s: 2.05 });
  });
});

describe('readSubmittedNumbers', () => {
  it('accepts the form’s shape and nothing else', () => {
    expect(readSubmittedNumbers({ gpa: '3.4' })).toEqual({ ...EMPTY_PLAYER_NUMBERS, gpa: '3.4' });
    expect(readSubmittedNumbers({ gpa: 3.4 })).toBeNull();
    expect(readSubmittedNumbers(['3.4'])).toBeNull();
    expect(readSubmittedNumbers(null)).toBeNull();
  });
});

describe('summaries', () => {
  it('describes grades and baseball numbers in words', () => {
    const n = numbers({ gpa: '3.4', satTotal: '1200', position: 'pitcher', fastball_mph: '88' });
    expect(academicsLine(n)).toBe('GPA 3.4 out of 4.0 (unweighted); SAT 1200');
    expect(baseballLine(n)).toBe('Pitcher; fastball, top velocity 88 mph');
    expect(baseballLine(numbers())).toBe('');
  });
});
