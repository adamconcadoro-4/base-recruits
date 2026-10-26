/**
 * Dates on the site are shown in Eastern time, where Base Recruits is based,
 * so "checked on" dates match the founders' calendar instead of UTC.
 *
 * Calendar dates stored without a time ("2026-10-25") are shown as written:
 * reading them in Eastern time would move them to the day before.
 */
export const SITE_TIME_ZONE = 'America/New_York';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The time zone to format a stored value in: Eastern for timestamps, UTC for plain calendar dates. */
export function displayTimeZone(value: string): string {
  return DATE_ONLY.test(value) ? 'UTC' : SITE_TIME_ZONE;
}

/** A Date for a stored value; plain calendar dates are read as that day. */
export function parseStoredDate(value: string): Date {
  return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
}
