/**
 * The player's numbers saved to their account (decision F63, 2026-11-18), as
 * opposed to the copy remembered on this device (player-store.ts).
 *
 * - Saving is the athlete's choice, made with a checkbox on the numbers form.
 *   The database keeps typed values (supabase/migrations/20261118000100_athlete_numbers.sql),
 *   all self-reported and shown as "Needs transcripts for verification".
 * - Only numbers that pass the same checks as the comparison (readPlayerInput)
 *   are saved, and only the baseball numbers of the chosen position.
 * - A linked parent sees them only while the athlete shares with that parent;
 *   coaches never see them.
 *
 * Pure functions with relative, type-only imports.
 */

import { ATHLETIC_METRICS, POSITION_METRICS, isPosition, type AthleticMetric } from './athletic';
import { readPlayerInput } from './player-input';
import { EMPTY_PLAYER_NUMBERS, parsePlayerNumbers, type PlayerNumbers } from './player-store';

/** One row of public.my_numbers() / public.family_shared_numbers(). */
export interface SavedNumbersRow {
  readonly applicant_type: 'first_year' | 'transfer';
  readonly entry_year: number | null;
  readonly gpa: number | null;
  readonly gpa_scale: number;
  readonly gpa_type: 'unweighted' | 'weighted' | null;
  readonly sat_total: number | null;
  readonly act_composite: number | null;
  readonly submit_scores: 'yes' | 'no' | 'undecided';
  readonly core_gpa_division_i: number | null;
  readonly core_gpa_division_ii: number | null;
  readonly main_position: string | null;
  readonly fastball_mph: number | null;
  readonly exit_velocity_mph: number | null;
  readonly sixty_yard_s: number | null;
  readonly infield_velocity_mph: number | null;
  readonly outfield_velocity_mph: number | null;
  readonly catcher_velocity_mph: number | null;
  readonly pop_time_s: number | null;
  readonly verification: 'self_reported';
  readonly updated_at: string;
}

/** What the numbers form needs to know about the account. Null for visitors who can't save to an account. */
export interface AccountNumbers {
  /** The numbers saved to the account, or null when nothing is saved. */
  readonly saved: PlayerNumbers | null;
}

const GPA_SCALES = [4, 5, 100] as const;

export type AccountPayload = Readonly<Record<string, string | number | null>>;

/**
 * Numbers → what save_my_numbers stores, or null when they don't pass the
 * comparison's checks (the form shows those errors first, so this is a guard).
 */
export function toAccountPayload(numbers: PlayerNumbers, thisYear: number): AccountPayload | null {
  const read = readPlayerInput(numbers, thisYear);
  if (!read.ok) return null;
  const { input, extras, athletic } = read;
  const scale = input.gpa?.scale ?? Number(numbers.gpaScale);
  if (!(GPA_SCALES as readonly number[]).includes(scale)) return null;
  const metrics: Record<AthleticMetric, number | null> = {
    fastball_mph: null,
    exit_velocity_mph: null,
    sixty_yard_s: null,
    infield_velocity_mph: null,
    outfield_velocity_mph: null,
    catcher_velocity_mph: null,
    pop_time_s: null,
  };
  if (athletic) for (const metric of POSITION_METRICS[athletic.position]) metrics[metric] = athletic.metrics[metric] ?? null;
  return {
    applicant_type: input.applicantType,
    entry_year: input.entryYear,
    gpa: input.gpa?.value ?? null,
    gpa_scale: scale,
    gpa_type: numbers.gpaType === 'weighted' || numbers.gpaType === 'unweighted' ? numbers.gpaType : null,
    sat_total: input.sat?.total ?? null,
    act_composite: input.act?.composite ?? null,
    submit_scores: input.submitScores,
    core_gpa_division_i: extras.ncaaCoreGpaDivisionI,
    core_gpa_division_ii: extras.ncaaCoreGpaDivisionII,
    main_position: athletic?.position ?? null,
    ...metrics,
  };
}

const text = (value: number | null | undefined): string => (value === null || value === undefined ? '' : String(Number(value)));

/** A saved row → the form's values. */
export function fromAccountRow(row: SavedNumbersRow): PlayerNumbers {
  const position = row.main_position && isPosition(row.main_position) ? row.main_position : '';
  const out: Record<string, string> = {
    ...EMPTY_PLAYER_NUMBERS,
    applicantType: row.applicant_type === 'transfer' ? 'transfer' : 'first_year',
    entryYear: text(row.entry_year),
    gpa: text(row.gpa),
    gpaScale: text(row.gpa_scale) || '4',
    gpaType: row.gpa_type ?? '',
    satTotal: text(row.sat_total),
    act: text(row.act_composite),
    submitScores: row.submit_scores,
    coreGpaDivisionI: text(row.core_gpa_division_i),
    coreGpaDivisionII: text(row.core_gpa_division_ii),
    position,
  };
  for (const metric of ATHLETIC_METRICS) out[metric] = text(row[metric]);
  return out as PlayerNumbers;
}

/** Whatever the browser sent → numbers, or null when it isn't the form's shape. */
export function readSubmittedNumbers(value: unknown): PlayerNumbers | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  let json: string;
  try {
    json = JSON.stringify({ v: 1, values: value });
  } catch {
    return null;
  }
  return parsePlayerNumbers(json);
}
