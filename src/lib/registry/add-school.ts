/**
 * Adding a school the federal athletics report leaves out (service academies,
 * men's colleges, schools without federal aid, brand-new teams).
 *
 * The database function admin_add_baseball_program enforces every rule again;
 * this module gives the form field-level messages first.
 */

import { STATE_NAMES } from './states';
import { CONTROLS, DIVISION_CODES, LEVELS, type InstitutionControl, type InstitutionLevel } from './types';

/** Ways an added school can be confirmed. The federal report is not one of them. */
export const ADD_VERIFICATIONS = ['official_athletics_site', 'association_directory'] as const;
export type AddVerification = (typeof ADD_VERIFICATIONS)[number];

export interface AddSchoolInput {
  readonly unitid: number;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly websiteUrl: string;
  readonly control: InstitutionControl;
  readonly level: InstitutionLevel;
  readonly season: string;
  readonly association: string;
  readonly division: string;
  readonly conference: string | null;
  readonly athleticsUrl: string | null;
  readonly verification: AddVerification;
  readonly evidenceUrl: string;
  readonly note: string;
}

export type AddSchoolResult =
  | { readonly ok: true; readonly value: AddSchoolInput }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

/**
 * Seasons an addition can be confirmed for: the one just finished (a team
 * whose next roster isn't posted yet), the one under way, and the next one.
 * In October 2026 that is ['2025-26', '2026-27', '2027-28'].
 */
export function addableSeasons(now: Date = new Date()): readonly string[] {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1; // seasons turn over on July 1
  return [start - 1, start, start + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`);
}

/** The season under way, which the form selects by default. */
export function currentSeason(now: Date = new Date()): string {
  return addableSeasons(now)[1] ?? '';
}

function isHttpsUrl(value: string): boolean {
  if (!value || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && /\.[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/** Reads and checks the "Add a school" form. */
export function parseAddSchool(read: (name: string) => string, now: Date = new Date()): AddSchoolResult {
  const errors: Record<string, string> = {};
  const unitidText = read('unitid');
  const unitid = /^[0-9]{6}$/.test(unitidText) ? Number(unitidText) : NaN;
  if (!Number.isInteger(unitid) || unitid < 100000) errors.unitid = 'Enter the six-digit federal school ID (IPEDS UNITID).';

  const name = read('name');
  if (name.length < 2 || name.length > 200) errors.name = "Enter the school's official name.";
  const city = read('city');
  if (!city || city.length > 100) errors.city = 'Enter the city.';
  const state = read('state').toUpperCase();
  if (!(state in STATE_NAMES)) errors.state = 'Choose the state.';

  const websiteUrl = read('websiteUrl');
  if (!isHttpsUrl(websiteUrl)) errors.websiteUrl = "Use the school's full https:// web address.";
  const control = read('control');
  if (!(CONTROLS as readonly string[]).includes(control)) errors.control = 'Choose public or private.';
  const level = read('level');
  if (!(LEVELS as readonly string[]).includes(level)) errors.level = "Choose the school's level.";

  const season = read('season');
  if (!addableSeasons(now).includes(season)) errors.season = 'Choose the season you confirmed.';
  const [association = '', division = ''] = read('division').split('|');
  if (!association || !(DIVISION_CODES as readonly string[]).includes(division)) errors.division = 'Choose a division.';

  const conference = read('conference');
  if (conference && (conference.length < 2 || conference.length > 120)) errors.conference = 'Use 2–120 characters, or leave it blank.';
  const athleticsUrl = read('athleticsUrl');
  if (athleticsUrl && !isHttpsUrl(athleticsUrl)) errors.athleticsUrl = 'Use a full https:// link, or leave it blank.';

  const verification = read('verification');
  if (!(ADD_VERIFICATIONS as readonly string[]).includes(verification)) errors.verification = 'Choose how you confirmed the team.';
  const evidenceUrl = read('evidenceUrl');
  if (!isHttpsUrl(evidenceUrl)) errors.evidenceUrl = 'Link the official page that shows the team (https://).';

  const note = read('note');
  if (note.length < 5 || note.length > 1000) errors.note = 'Explain what you checked (5–1,000 characters).';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      unitid,
      name,
      city,
      state,
      websiteUrl,
      control: control as InstitutionControl,
      level: level as InstitutionLevel,
      season,
      association,
      division,
      conference: conference || null,
      athleticsUrl: athleticsUrl || null,
      verification: verification as AddVerification,
      evidenceUrl,
      note,
    },
  };
}
