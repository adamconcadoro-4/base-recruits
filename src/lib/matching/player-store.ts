/**
 * The player's academic numbers, remembered in this browser only so every
 * school page can show "your fit" without asking again (decision F45).
 *
 * - Stored in this device's localStorage, never sent to Base Recruits, never
 *   put in a link, never logged. The page says so and offers "Forget my numbers".
 * - Stored as the raw form values, and validated again with
 *   parseApplicantInput / parseCoreGpa every time they are used.
 * - Anything unexpected in storage (old version, wrong shape, oversized) is
 *   treated as nothing saved.
 *
 * The parse/serialize functions are pure; the read/save/forget helpers touch
 * window.localStorage and tolerate it being missing or blocked.
 */

export const PLAYER_NUMBERS_KEY = 'br.player-numbers.v1';

export const PLAYER_FIELDS = [
  'applicantType',
  'entryYear',
  'gpa',
  'gpaScale',
  'gpaType',
  'satErw',
  'satMath',
  'act',
  'submitScores',
  'coreGpaDivisionI',
  'coreGpaDivisionII',
] as const;
export type PlayerField = (typeof PLAYER_FIELDS)[number];
export type PlayerNumbers = Readonly<Record<PlayerField, string>>;

export const EMPTY_PLAYER_NUMBERS: PlayerNumbers = {
  applicantType: 'first_year',
  entryYear: '',
  gpa: '',
  gpaScale: '4',
  gpaType: 'unweighted',
  satErw: '',
  satMath: '',
  act: '',
  submitScores: 'yes',
  coreGpaDivisionI: '',
  coreGpaDivisionII: '',
};

const MAX_VALUE_LENGTH = 20;

export function serializePlayerNumbers(numbers: PlayerNumbers): string {
  const values: Record<string, string> = {};
  for (const field of PLAYER_FIELDS) values[field] = numbers[field].slice(0, MAX_VALUE_LENGTH);
  return JSON.stringify({ v: 1, values });
}

/** Stored text → numbers, or null when nothing usable is stored. */
export function parsePlayerNumbers(text: string | null): PlayerNumbers | null {
  if (!text || text.length > 2000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== 1) return null;
  const values = (data as { values?: unknown }).values;
  if (typeof values !== 'object' || values === null) return null;
  const out: Record<string, string> = { ...EMPTY_PLAYER_NUMBERS };
  for (const field of PLAYER_FIELDS) {
    const value = (values as Record<string, unknown>)[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) return null;
    out[field] = value;
  }
  return out as PlayerNumbers;
}

/** True when the player has entered at least one number worth comparing. */
export function hasAnyNumber(numbers: PlayerNumbers): boolean {
  return ['gpa', 'satErw', 'satMath', 'act', 'coreGpaDivisionI', 'coreGpaDivisionII'].some((f) => numbers[f as PlayerField].trim() !== '');
}

export function readPlayerNumbers(): PlayerNumbers | null {
  try {
    return parsePlayerNumbers(window.localStorage.getItem(PLAYER_NUMBERS_KEY));
  } catch {
    return null;
  }
}

/** Returns false when this browser won't store them (private window, blocked storage). */
export function savePlayerNumbers(numbers: PlayerNumbers): boolean {
  try {
    window.localStorage.setItem(PLAYER_NUMBERS_KEY, serializePlayerNumbers(numbers));
    return true;
  } catch {
    return false;
  }
}

export function forgetPlayerNumbers(): void {
  try {
    window.localStorage.removeItem(PLAYER_NUMBERS_KEY);
  } catch {
    // Nothing stored, or storage blocked: nothing to forget.
  }
}
