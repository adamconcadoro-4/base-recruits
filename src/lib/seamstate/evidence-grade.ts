/**
 * Evidence grade for one finding (policy seamstate-evidence-v1).
 *
 * Computed by code from what was actually tracked, never by the language
 * model. A grade says how much support the footage gives a finding: it is
 * not a probability that the finding is correct, and it is separate from
 * score coverage. Thresholds are engineering limits (see eligibility.ts).
 */

import type { MechanicDefinition } from '@/lib/seamstate/catalog/mechanics';
import type { MechanicEligibility } from '@/lib/seamstate/eligibility';
import { swingVisibility, type EvidencePacket } from '@/lib/seamstate/packet';
import type { EvidenceGrade } from '@/lib/seamstate/types';

export const GRADE_LIMITS = {
  strong: { visibility: 0.8, tracked: 0.95, swings: 3 },
  moderate: { visibility: 0.65, tracked: 0.85 },
} as const;

export interface GradeResult {
  readonly grade: EvidenceGrade;
  readonly reasons: readonly string[];
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Grade the evidence behind a finding about `swingIndexes` of `mechanic`.
 * Only swings that are eligible for the mechanic count.
 */
export function gradeEvidence(
  mechanic: MechanicDefinition,
  eligibility: MechanicEligibility,
  packet: EvidencePacket,
  swingIndexes: readonly number[],
): GradeResult {
  const swings = packet.swings.filter((swing) => swingIndexes.includes(swing.index) && eligibility.eligibleSwings.includes(swing.index));
  if (swings.length === 0) return { grade: 'insufficient', reasons: ['No eligible swing supports this finding.'] };

  const visibility = Math.min(...swings.map((swing) => mean(mechanic.landmarks.map((role) => swingVisibility(swing, role)))));
  const tracked = Math.min(...swings.map((swing) => swing.trackedFraction));
  const preferredView = mechanic.views[0] === packet.capture.cameraView;
  const timingShort = mechanic.minFpsForTiming !== null && eligibility.timingClaims !== 'milliseconds';

  const reasons: string[] = [];
  reasons.push(swings.length === 1 ? 'Based on one swing.' : `Based on ${swings.length} swings.`);
  if (!preferredView) reasons.push('Filmed from a usable but not the preferred camera view.');
  if (timingShort) reasons.push('Frame rate too low or unknown for timing in milliseconds.');

  const strong = GRADE_LIMITS.strong;
  if (preferredView && !timingShort && visibility >= strong.visibility && tracked >= strong.tracked && swings.length >= strong.swings) {
    reasons.push('Required body points were clearly tracked in every swing.');
    return { grade: 'strong', reasons };
  }
  const moderate = GRADE_LIMITS.moderate;
  if (visibility >= moderate.visibility && tracked >= moderate.tracked) {
    reasons.push('Required body points were mostly clearly tracked.');
    return { grade: 'moderate', reasons };
  }
  reasons.push('Some required body points were only partly visible.');
  return { grade: 'limited', reasons };
}
