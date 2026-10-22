import { describe, expect, it } from 'vitest';

import {
  ageOn,
  checkBirthDate,
  formatCalendarDate,
  isMinorOn,
  majorityDate,
  parseCalendarDate,
  todayUtc,
  type CalendarDate,
} from '@/lib/age/age-policy';

const d = (iso: string): CalendarDate => {
  const parsed = parseCalendarDate(iso);
  if (!parsed) throw new Error(`bad test date ${iso}`);
  return parsed;
};

describe('parseCalendarDate', () => {
  it('accepts real calendar dates only', () => {
    expect(parseCalendarDate('2008-02-29')).toEqual({ year: 2008, month: 2, day: 29 });
    expect(parseCalendarDate('2007-02-29')).toBeNull();
    expect(parseCalendarDate('2010-13-01')).toBeNull();
    expect(parseCalendarDate('2010-04-31')).toBeNull();
    expect(parseCalendarDate('04/05/2010')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
  });

  it('round-trips through formatCalendarDate', () => {
    expect(formatCalendarDate(d('2009-01-05'))).toBe('2009-01-05');
  });
});

describe('ageOn', () => {
  it('counts whole years and waits for the birthday', () => {
    expect(ageOn(d('2010-06-15'), d('2023-06-14'))).toBe(12);
    expect(ageOn(d('2010-06-15'), d('2023-06-15'))).toBe(13);
  });

  it('matches PostgreSQL for February 29 birthdays', () => {
    // Same expectations as the database test (private.age_in_years).
    expect(ageOn(d('2008-02-29'), d('2026-02-28'))).toBe(17);
    expect(ageOn(d('2008-02-29'), d('2026-03-01'))).toBe(18);
    expect(ageOn(d('2008-02-29'), d('2028-02-29'))).toBe(20);
  });
});

describe('majorityDate', () => {
  it('is the 18th birthday, or March 1 for a Feb 29 birthday in a non-leap year', () => {
    expect(majorityDate(d('2009-11-02'))).toEqual(d('2027-11-02'));
    expect(majorityDate(d('2008-02-29'))).toEqual(d('2026-03-01'));
    expect(majorityDate(d('2006-02-28'))).toEqual(d('2024-02-28'));
  });
});

describe('isMinorOn', () => {
  it('treats unknown age as a minor', () => {
    expect(isMinorOn(null, d('2026-10-21'))).toBe(true);
  });

  it('switches at the 18th birthday', () => {
    expect(isMinorOn(d('2008-10-22'), d('2026-10-21'))).toBe(true);
    expect(isMinorOn(d('2008-10-21'), d('2026-10-21'))).toBe(false);
  });
});

describe('checkBirthDate (neutral age screen)', () => {
  const today = d('2026-10-21');

  it('blocks anyone under 13 without storing anything', () => {
    expect(checkBirthDate('2013-10-22', today)).toEqual({ ok: false, reason: 'under_minimum_age' });
  });

  it('allows a 13th birthday today and classifies minors and adults', () => {
    const thirteen = checkBirthDate('2013-10-21', today);
    expect(thirteen.ok && thirteen.band).toBe('minor');
    const adult = checkBirthDate('2008-10-21', today);
    expect(adult.ok && adult.band).toBe('adult');
  });

  it('rejects malformed, future and implausible dates', () => {
    expect(checkBirthDate('not a date', today)).toEqual({ ok: false, reason: 'invalid_date' });
    expect(checkBirthDate('2026-10-22', today)).toEqual({ ok: false, reason: 'in_future' });
    expect(checkBirthDate('1906-10-20', today)).toEqual({ ok: false, reason: 'implausible' });
    expect(checkBirthDate('1906-10-21', today).ok).toBe(true);
  });
});

describe('todayUtc', () => {
  it('uses the UTC calendar date, like the database', () => {
    expect(todayUtc(new Date('2026-10-21T23:30:00-04:00'))).toEqual(d('2026-10-22'));
  });
});
