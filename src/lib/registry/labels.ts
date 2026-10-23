/**
 * Plain-language labels for registry values. A missing figure always reads as
 * "Not reported" with the source named, never as zero or a guess.
 */

import type { CampusSetting, InstitutionControl, InstitutionLevel, ProgramStatus, ProgramVerification, TestPolicy } from './types';

export const NOT_REPORTED = 'Not reported';

export const CONTROL_LABELS: Readonly<Record<InstitutionControl, string>> = {
  public: 'Public',
  private_nonprofit: 'Private nonprofit',
  private_for_profit: 'Private for-profit',
};

export const LEVEL_LABELS: Readonly<Record<InstitutionLevel, string>> = {
  four_year: 'Four-year',
  two_year: 'Two-year',
  less_than_two_year: 'Less than two-year',
};

export const SETTING_LABELS: Readonly<Record<CampusSetting, string>> = {
  city: 'City',
  suburb: 'Suburb',
  town: 'Town',
  rural: 'Rural',
};

/** IPEDS wording for each test policy, with the common short name. */
export const TEST_POLICY_LABELS: Readonly<Record<TestPolicy, { readonly short: string; readonly long: string }>> = {
  required: { short: 'Test required', long: 'SAT/ACT required to be considered for admission' },
  considered_not_required: {
    short: 'Test optional',
    long: 'SAT/ACT not required, but considered if submitted (test-optional)',
  },
  not_considered: { short: 'Test blind', long: 'SAT/ACT not considered, even if submitted (test-blind)' },
};

export const STATUS_LABELS: Readonly<Record<ProgramStatus, string>> = {
  active: 'Active program',
  not_reported: 'Not in the latest federal report',
  inactive: 'Program discontinued',
  suspended: 'Program suspended',
};

export const VERIFICATION_LABELS: Readonly<Record<ProgramVerification, { readonly short: string; readonly long: string }>> = {
  federal_report: {
    short: 'Federal report',
    long: 'Listed in the federal EADA report. The division shown is the school’s athletics classification in that report and has not yet been checked against the association or the team’s own site.',
  },
  association_directory: {
    short: 'Association directory checked',
    long: 'Checked by Base Recruits against the athletics association’s official directory.',
  },
  official_athletics_site: {
    short: 'Official athletics site checked',
    long: 'Checked by Base Recruits against the school’s official athletics website.',
  },
};

export const PREDOMINANT_DEGREE_LABELS: Readonly<Record<string, string>> = {
  certificate: 'Mostly certificates',
  associate: 'Mostly associate degrees',
  bachelors: 'Mostly bachelor’s degrees',
  graduate: 'Mostly graduate degrees',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatMoney(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? usd.format(value) : NOT_REPORTED;
}

export function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? whole.format(value) : NOT_REPORTED;
}

/** 0.0361 -> "3.6%"; 0.5795 -> "58%". Rates under 10% keep one decimal. */
export function formatRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NOT_REPORTED;
  const percent = value * 100;
  const digits = percent < 10 ? 1 : 0;
  return `${percent.toFixed(digits)}%`;
}

/** "590–690" for a 25th–75th percentile pair; Not reported when either is missing. */
export function formatRange(low: number | null | undefined, high: number | null | undefined): string {
  return typeof low === 'number' && typeof high === 'number' ? `${low}–${high}` : NOT_REPORTED;
}

/** "2024-25" -> "2024–25". */
export function formatAcademicYear(value: string | null | undefined): string {
  return value ? value.replace('-', '–') : NOT_REPORTED;
}

const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatRetrieved(iso: string | null | undefined): string {
  if (!iso) return 'unknown date';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'unknown date' : dateFormat.format(date);
}

export function placeLabel(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(', ') || 'Location not reported';
}

/** The host a link opens, for showing next to an external link. */
export function linkHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
