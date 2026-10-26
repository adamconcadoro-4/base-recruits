/**
 * Units and conversions for imported and hand-entered measurements.
 *
 * Values are stored in one canonical unit per metric. An import may supply a
 * different unit; the original value and unit are kept on the observation and
 * the conversion is recorded. Mirrors private.assessment_convert_unit() — a
 * contract test runs the same cases through both.
 */

import type { CanonicalUnit } from '@/lib/assessment/types';

export const UNIT_LABELS: Readonly<Record<CanonicalUnit, string>> = {
  rating: 'rating (1–5)',
  ms: 'ms',
  mph: 'mph',
  deg: '°',
  rpm: 'rpm',
  in: 'in',
  percent: '%',
  yes_no: 'yes/no',
};

/** Source units accepted for each canonical unit. */
export const ACCEPTED_UNITS: Readonly<Record<CanonicalUnit, readonly string[]>> = {
  rating: ['rating'],
  ms: ['ms', 's'],
  mph: ['mph', 'km/h', 'm/s'],
  deg: ['deg'],
  rpm: ['rpm'],
  in: ['in', 'cm'],
  percent: ['percent'],
  yes_no: ['yes_no'],
};

const ALIASES: Readonly<Record<string, string>> = {
  milliseconds: 'ms',
  millisecond: 'ms',
  sec: 's',
  secs: 's',
  second: 's',
  seconds: 's',
  kph: 'km/h',
  kmh: 'km/h',
  'km/hr': 'km/h',
  mps: 'm/s',
  'mi/h': 'mph',
  degree: 'deg',
  degrees: 'deg',
  '°': 'deg',
  inch: 'in',
  inches: 'in',
  centimeters: 'cm',
  centimetres: 'cm',
  '%': 'percent',
  pct: 'percent',
  'yes/no': 'yes_no',
  boolean: 'yes_no',
  bool: 'yes_no',
};

/** Normalizes a unit as typed in a file ("KPH", " km/h ") to its code, or null when empty. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) return null;
  return ALIASES[trimmed] ?? trimmed;
}

/** Rounds to three decimals, half away from zero (PostgreSQL numeric round()). */
export function round3(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 1000 + 1e-9)) / 1000;
}

/** Rounds to one decimal, half away from zero (PostgreSQL numeric round()). */
export function round1(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 10 + 1e-9)) / 10;
}

/**
 * Converts a value from a source unit into the canonical unit, rounded to
 * three decimals. Returns null when the source unit is not accepted for it.
 */
export function convertToCanonical(value: number, sourceUnit: string, canonical: CanonicalUnit): number | null {
  const unit = normalizeUnit(sourceUnit);
  if (unit === null || !ACCEPTED_UNITS[canonical].includes(unit)) return null;
  if (!Number.isFinite(value)) return null;
  switch (unit) {
    case 's':
      return round3(value * 1000);
    case 'km/h':
      return round3(value / 1.609344);
    case 'm/s':
      return round3((value * 3600) / 1609.344);
    case 'cm':
      return round3(value / 2.54);
    default:
      return round3(value);
  }
}

/** Display text for a value in its canonical unit; null values read "Not collected". */
export function formatValue(value: number | null | undefined, unit: CanonicalUnit, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Not collected';
  if (unit === 'rating') return `${value} of 5`;
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(digits);
  switch (unit) {
    case 'percent':
      return `${rounded}%`;
    case 'deg':
      return `${rounded}°`;
    case 'yes_no':
      return value === 1 ? 'Yes' : 'No';
    default:
      return `${rounded} ${UNIT_LABELS[unit]}`;
  }
}
