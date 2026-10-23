/**
 * Age rules for signup, onboarding and consent.
 *
 * Mirrors the database (private.age_in_years, private.validate_birthdate):
 * - Accounts require age 13 or older. The signup age screen is neutral (it does
 *   not hint at the "right" answer) and an under-13 date of birth is never stored.
 * - Ages 13–17 are minors. An unknown age is treated as a minor (protective default).
 * - A February 29 birthday reaches a new age on March 1 in non-leap years,
 *   matching PostgreSQL's age() so the app and database always agree.
 *
 * Dates are plain calendar dates (no time zone). Callers pass "today" explicitly;
 * server code uses todayUtc() because the database evaluates current_date in UTC.
 */

export const MINIMUM_ACCOUNT_AGE = 13;
export const AGE_OF_MAJORITY = 18;
export const MAX_PLAUSIBLE_AGE = 120;

export interface CalendarDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

export type AgeBand = 'minor' | 'adult';

/**
 * What public.record_birthdate / admin_record_birthdate return. On
 * 'under_minimum_age' nothing is stored except a block on retrying, and the app
 * signs the person out and deletes the account.
 */
export type BirthdateRecordResult = AgeBand | 'under_minimum_age';

export type BirthDateCheck =
  | { readonly ok: true; readonly age: number; readonly band: AgeBand; readonly date: CalendarDate }
  | {
      readonly ok: false;
      readonly reason: 'invalid_date' | 'in_future' | 'implausible' | 'under_minimum_age';
    };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/** Strictly parses YYYY-MM-DD into a real calendar date; anything else is null. */
export function parseCalendarDate(input: string): CalendarDate | null {
  const match = ISO_DATE.exec(input.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function formatCalendarDate(date: CalendarDate): string {
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function todayUtc(now: Date = new Date()): CalendarDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** Whole years between birth and `on` (same semantics as PostgreSQL age()). */
export function ageOn(birth: CalendarDate, on: CalendarDate): number {
  const hadBirthdayThisYear = on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  return on.year - birth.year - (hadBirthdayThisYear ? 0 : 1);
}

/** The date a person reaches `years` years of age (Feb 29 → Mar 1 in non-leap years). */
export function anniversaryDate(birth: CalendarDate, years: number): CalendarDate {
  const year = birth.year + years;
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return { year, month: 3, day: 1 };
  }
  return { year, month: birth.month, day: birth.day };
}

export function majorityDate(birth: CalendarDate): CalendarDate {
  return anniversaryDate(birth, AGE_OF_MAJORITY);
}

/** Unknown birth date → minor. */
export function isMinorOn(birth: CalendarDate | null, on: CalendarDate): boolean {
  if (!birth) return true;
  return ageOn(birth, on) < AGE_OF_MAJORITY;
}

/** Calendar subtraction with PostgreSQL semantics (day clamped to month end). */
export function subtractYears(date: CalendarDate, years: number): CalendarDate {
  const year = date.year - years;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

export function checkBirthDate(input: string, today: CalendarDate): BirthDateCheck {
  const date = parseCalendarDate(input);
  if (!date) return { ok: false, reason: 'invalid_date' };
  if (compareCalendarDates(date, today) > 0) return { ok: false, reason: 'in_future' };
  // Same rule as the database: date_of_birth < current_date - interval '120 years'.
  if (compareCalendarDates(date, subtractYears(today, MAX_PLAUSIBLE_AGE)) < 0) {
    return { ok: false, reason: 'implausible' };
  }
  const age = ageOn(date, today);
  if (age < MINIMUM_ACCOUNT_AGE) return { ok: false, reason: 'under_minimum_age' };
  return { ok: true, age, band: age < AGE_OF_MAJORITY ? 'minor' : 'adult', date };
}

/**
 * User-facing copy for a failed check. The under-13 message is deliberately
 * plain: it does not invite the person to try a different date.
 */
export function birthDateMessage(reason: Extract<BirthDateCheck, { ok: false }>['reason']): string {
  switch (reason) {
    case 'invalid_date':
      return 'Enter your date of birth as month, day and year.';
    case 'in_future':
    case 'implausible':
      return 'Check the date of birth you entered.';
    case 'under_minimum_age':
      return 'Base Recruits accounts are for people 13 and older. You can still search schools and compare your scores without an account.';
  }
}
