/**
 * One definition of the baseball divisions for URLs, filters, validation and
 * display. The codes are the database's athletic_divisions codes; a contract
 * test keeps DIVISION_CODES (types.ts) in step with the database.
 *
 * Links and old bookmarks may use other spellings (for example the home page
 * once linked to `division=ncaa-d1`). normalizeDivisionValues maps the
 * supported legacy spellings to canonical codes and reports anything it does
 * not recognise, so the search can say so instead of quietly showing every
 * school.
 */

import { DIVISION_CODES, type DivisionCode } from './types';

export interface DivisionGroup {
  readonly key: string;
  readonly label: string;
  readonly divisions: readonly (readonly [DivisionCode, string])[];
}

export const DIVISION_GROUPS: readonly DivisionGroup[] = [
  { key: 'ncaa', label: 'NCAA', divisions: [['ncaa_d1', 'Division I'], ['ncaa_d2', 'Division II'], ['ncaa_d3', 'Division III']] },
  { key: 'naia', label: 'NAIA', divisions: [['naia', 'NAIA']] },
  {
    key: 'two_year',
    label: 'Two-year colleges',
    divisions: [
      ['njcaa_d1', 'NJCAA Division I'],
      ['njcaa_d2', 'NJCAA Division II'],
      ['njcaa_d3', 'NJCAA Division III'],
      ['cccaa', 'CCCAA (California)'],
      ['nwac', 'NWAC (Northwest)'],
    ],
  },
  {
    key: 'other',
    label: 'Other associations',
    divisions: [
      ['uscaa', 'USCAA'],
      ['nccaa_d1', 'NCCAA Division I'],
      ['nccaa_d2', 'NCCAA Division II'],
      ['independent', 'Independent'],
      ['other', 'Other (as reported)'],
    ],
  },
];

/**
 * The two-year (junior college) group: every two-year association in the
 * registry, not only the NJCAA. Two-year colleges in the "Other" bucket are
 * found under Other until their division is confirmed.
 */
export const TWO_YEAR_DIVISIONS: readonly DivisionCode[] = ['njcaa_d1', 'njcaa_d2', 'njcaa_d3', 'cccaa', 'nwac'];

/** Shortcuts used by the home page; each expands to canonical codes. */
export const DIVISION_SHORTCUTS = {
  ncaa_d1: { label: 'NCAA Division I', codes: ['ncaa_d1'] },
  ncaa_d2: { label: 'NCAA Division II', codes: ['ncaa_d2'] },
  ncaa_d3: { label: 'NCAA Division III', codes: ['ncaa_d3'] },
  naia: { label: 'NAIA', codes: ['naia'] },
  two_year: { label: 'Two-year colleges (NJCAA, CCCAA, NWAC)', codes: TWO_YEAR_DIVISIONS },
} as const satisfies Record<string, { readonly label: string; readonly codes: readonly DivisionCode[] }>;

export type DivisionShortcut = keyof typeof DIVISION_SHORTCUTS;

/** Legacy or alternative spellings and what they mean. */
const ALIASES: Readonly<Record<string, readonly DivisionCode[]>> = {
  'ncaa-d1': ['ncaa_d1'],
  'ncaa-d2': ['ncaa_d2'],
  'ncaa-d3': ['ncaa_d3'],
  d1: ['ncaa_d1'],
  d2: ['ncaa_d2'],
  d3: ['ncaa_d3'],
  'njcaa-d1': ['njcaa_d1'],
  'njcaa-d2': ['njcaa_d2'],
  'njcaa-d3': ['njcaa_d3'],
  'nccaa-d1': ['nccaa_d1'],
  'nccaa-d2': ['nccaa_d2'],
  juco: TWO_YEAR_DIVISIONS,
  two_year: TWO_YEAR_DIVISIONS,
  'two-year': TWO_YEAR_DIVISIONS,
  jc: TWO_YEAR_DIVISIONS,
};

export function isDivisionCode(value: string): value is DivisionCode {
  return (DIVISION_CODES as readonly string[]).includes(value);
}

export interface NormalizedDivisions {
  readonly codes: readonly DivisionCode[];
  /** Values that are neither a code nor a supported alias (trimmed, at most 40 characters each). */
  readonly unrecognized: readonly string[];
  /** True when at least one legacy spelling was translated. */
  readonly translated: boolean;
}

export function normalizeDivisionValues(values: readonly string[]): NormalizedDivisions {
  const codes: DivisionCode[] = [];
  const unrecognized: string[] = [];
  let translated = false;
  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (isDivisionCode(value)) {
      codes.push(value);
      continue;
    }
    const alias = ALIASES[value];
    if (alias) {
      codes.push(...alias);
      translated = true;
      continue;
    }
    unrecognized.push(raw.trim().slice(0, 40));
  }
  return { codes: [...new Set(codes)], unrecognized: [...new Set(unrecognized)], translated };
}

/** The explorer URL for a home-page shortcut, in canonical form. */
export function shortcutHref(shortcut: DivisionShortcut): string {
  const params = new URLSearchParams();
  for (const code of DIVISION_SHORTCUTS[shortcut].codes) params.append('division', code);
  return `/schools?${params.toString()}`;
}

export function divisionLabel(code: DivisionCode): string {
  for (const group of DIVISION_GROUPS) {
    for (const [value, label] of group.divisions) {
      if (value === code) return group.key === 'ncaa' ? `NCAA ${label}` : label;
    }
  }
  return code;
}
