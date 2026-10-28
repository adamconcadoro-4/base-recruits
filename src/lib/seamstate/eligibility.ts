/**
 * Which mechanics a clip can support, swing by swing (policy seamstate-evidence-v1).
 *
 * A finding is gated on its own needs: an invisible ball does not block body
 * observations, and a missing foot does not block head movement. The numeric
 * thresholds below are engineering limits for the pose model's visibility
 * scores, chosen to be conservative and configurable; they are not
 * scientific thresholds and are revisited with the evaluation harness.
 */

import { CAMERA_VIEW_LABELS } from '@/lib/assessment/catalog/context';
import type { MechanicDefinition } from '@/lib/seamstate/catalog/mechanics';
import { RETAKE_TIPS, ROLE_GROUPS } from '@/lib/seamstate/landmarks';
import { assessableSwings, captureFps, hasEvent, swingVisibility, type EvidencePacket, type SwingSummary } from '@/lib/seamstate/packet';

export const ELIGIBILITY_LIMITS = {
  /** Minimum mean visibility of each required landmark inside a swing window. */
  minLandmarkVisibility: 0.5,
  /** Minimum share of the swing window in which the athlete was tracked. */
  minTrackedFraction: 0.8,
} as const;

const GROUP_REASONS: Readonly<Record<keyof typeof ROLE_GROUPS, string>> = {
  feet: 'The hitter’s feet were not clearly visible.',
  legs: 'The hitter’s legs were not clearly visible.',
  hands: 'The hitter’s hands were not clearly visible.',
  torso: 'The hitter’s upper body was not clearly visible.',
  head: 'The hitter’s head was not clearly visible.',
};

export type EligibilityStatus = 'eligible' | 'limited' | 'unavailable';
export type TimingClaims = 'milliseconds' | 'order_only' | 'none';

export interface MechanicEligibility {
  readonly mechanicKey: string;
  readonly status: EligibilityStatus;
  /** Plain-language reasons, shown under "What this video cannot tell us" when limited or unavailable. */
  readonly reasons: readonly string[];
  /** Specific retake instructions, at most one per landmark group. */
  readonly retakeTips: readonly string[];
  /** A different camera view that would make this mechanic assessable. */
  readonly viewRequest: string | null;
  /** Indexes of the swings this mechanic can be judged on. */
  readonly eligibleSwings: readonly number[];
  readonly timingClaims: TimingClaims;
  /** Whether "observed in n of m swings" style repeated-pattern claims are allowed. */
  readonly patternAllowed: boolean;
}

function missingGroups(mechanic: MechanicDefinition, swing: SwingSummary): (keyof typeof ROLE_GROUPS)[] {
  const groups = new Set<keyof typeof ROLE_GROUPS>();
  for (const role of mechanic.landmarks) {
    if (swingVisibility(swing, role) >= ELIGIBILITY_LIMITS.minLandmarkVisibility) continue;
    for (const [group, roles] of Object.entries(ROLE_GROUPS) as [keyof typeof ROLE_GROUPS, readonly string[]][]) {
      if (roles.includes(role)) {
        groups.add(group);
        break;
      }
    }
  }
  return [...groups];
}

function timingClaimsFor(mechanic: MechanicDefinition, packet: EvidencePacket): TimingClaims {
  if (mechanic.minFpsForTiming === null) return 'none';
  const fps = captureFps(packet.timing);
  return fps !== null && fps >= mechanic.minFpsForTiming ? 'milliseconds' : 'order_only';
}

export function mechanicEligibility(mechanic: MechanicDefinition, packet: EvidencePacket): MechanicEligibility {
  const base = { mechanicKey: mechanic.key, retakeTips: [] as string[], viewRequest: null as string | null };
  const setting = packet.capture.setting.setting;
  if (!mechanic.settings.includes(setting)) {
    return { ...base, status: 'unavailable', reasons: [`${mechanic.name} is not assessed for this setting.`], eligibleSwings: [], timingClaims: 'none', patternAllowed: false };
  }
  if (!mechanic.views.includes(packet.capture.cameraView)) {
    const preferred = mechanic.views[0];
    const request = preferred ? `Add a clip filmed as: ${CAMERA_VIEW_LABELS[preferred]}.` : null;
    return {
      ...base,
      status: 'unavailable',
      reasons: [`${mechanic.name} cannot be seen from this camera view.`],
      viewRequest: request,
      eligibleSwings: [],
      timingClaims: 'none',
      patternAllowed: false,
    };
  }

  const swings = assessableSwings(packet);
  if (swings.length === 0) {
    return { ...base, status: 'unavailable', reasons: ['No assessable swing was found in this clip.'], eligibleSwings: [], timingClaims: 'none', patternAllowed: false };
  }

  const reasons = new Set<string>();
  const tips = new Set<string>();
  const eligible: number[] = [];
  for (const swing of swings) {
    let ok = true;
    if (swing.trackedFraction < ELIGIBILITY_LIMITS.minTrackedFraction) {
      ok = false;
      reasons.add('The hitter was not tracked through the whole swing.');
    }
    for (const event of mechanic.events) {
      if (!hasEvent(swing, event)) {
        ok = false;
        reasons.add(`The ${event.replace(/_/g, ' ')} moment could not be located.`);
      }
    }
    const groups = missingGroups(mechanic, swing);
    if (groups.length > 0) {
      ok = false;
      for (const group of groups) {
        reasons.add(GROUP_REASONS[group]);
        tips.add(RETAKE_TIPS[group]);
      }
    }
    if (ok) eligible.push(swing.index);
  }

  const timingClaims = timingClaimsFor(mechanic, packet);
  if (timingClaims === 'order_only') reasons.add('The clip’s real frame rate is too low or unknown for timing in milliseconds; only the order of events is reported.');

  const status: EligibilityStatus =
    eligible.length === 0 ? 'unavailable' : eligible.length < swings.length || timingClaims === 'order_only' ? 'limited' : 'eligible';
  return {
    ...base,
    status,
    reasons: [...reasons],
    retakeTips: [...tips],
    eligibleSwings: eligible,
    timingClaims,
    patternAllowed: eligible.length >= mechanic.minSwings.pattern,
  };
}
