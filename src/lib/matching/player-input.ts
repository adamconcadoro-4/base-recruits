/**
 * The player's stored numbers (player-store.ts) turned into what the rules
 * read: an ApplicantInput, the NCAA core-course GPAs and the baseball numbers.
 * One place, so the school page's "Your fit" and the My schools list validate
 * exactly the same way.
 *
 * Pure functions with relative, type-only imports.
 */

import { parseAthleticInput, type AthleticInput } from './athletic';
import { parseCoreGpa, type EligibilityExtras } from './eligibility';
import type { PlayerField, PlayerNumbers } from './player-store';
import { parseApplicantInput, type ApplicantInput } from './rules';

export type PlayerErrors = Partial<Record<PlayerField, string>>;

export type PlayerInputResult =
  | {
      readonly ok: true;
      readonly input: ApplicantInput;
      readonly extras: EligibilityExtras;
      /** Null when no position was chosen. */
      readonly athletic: AthleticInput | null;
    }
  | { readonly ok: false; readonly errors: PlayerErrors };

export function readPlayerInput(numbers: PlayerNumbers, thisYear: number): PlayerInputResult {
  const parsed = parseApplicantInput(
    {
      applicantType: numbers.applicantType,
      entryYear: numbers.entryYear,
      satErw: numbers.satErw,
      satMath: numbers.satMath,
      act: numbers.act,
      submitScores: numbers.submitScores,
      gpa: numbers.gpa,
      gpaScale: numbers.gpaScale,
      gpaType: numbers.gpaType,
    },
    thisYear,
  );
  const errors: PlayerErrors = parsed.ok ? {} : { ...(parsed.errors as PlayerErrors) };
  const d1 = parseCoreGpa(numbers.coreGpaDivisionI);
  const d2 = parseCoreGpa(numbers.coreGpaDivisionII);
  if (!d1.ok) errors.coreGpaDivisionI = d1.error;
  if (!d2.ok) errors.coreGpaDivisionII = d2.error;
  const athletic = parseAthleticInput({
    position: numbers.position,
    fastball_mph: numbers.fastball_mph,
    exit_velocity_mph: numbers.exit_velocity_mph,
    sixty_yard_s: numbers.sixty_yard_s,
    infield_velocity_mph: numbers.infield_velocity_mph,
    outfield_velocity_mph: numbers.outfield_velocity_mph,
    catcher_velocity_mph: numbers.catcher_velocity_mph,
    pop_time_s: numbers.pop_time_s,
  });
  if (!athletic.ok) Object.assign(errors, athletic.errors);
  if (!parsed.ok || !d1.ok || !d2.ok || !athletic.ok) return { ok: false, errors };
  return {
    ok: true,
    input: parsed.input,
    extras: { ncaaCoreGpaDivisionI: d1.value, ncaaCoreGpaDivisionII: d2.value },
    athletic: athletic.input,
  };
}

/** True when the player typed any grade or test score (the parts that need transcripts to verify). */
export function hasTypedAcademics(numbers: PlayerNumbers): boolean {
  return (['gpa', 'satErw', 'satMath', 'act', 'coreGpaDivisionI', 'coreGpaDivisionII'] as const).some((f) => numbers[f].trim() !== '');
}
