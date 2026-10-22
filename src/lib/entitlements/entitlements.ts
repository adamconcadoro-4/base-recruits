/**
 * Capability decisions for server code and UI.
 *
 * Free-access guarantee, by construction: core capabilities are decided by
 * `decideCore()`, which receives only the viewer — it has no access to
 * subscription or entitlement data, so no code change to billing can gate a core
 * capability. Premium decisions are the only ones that read entitlements.
 *
 * Premium workflows are not sold until Stage 6 (billing) ships and the master
 * spec's "advertised features must actually work" rule is met, so
 * PREMIUM_BILLING_LIVE is false and every premium decision reports
 * 'premium_not_yet_available'.
 */

import type { Viewer } from '../auth/route-access';
import {
  CAPABILITIES,
  type CapabilityAudience,
  type CapabilityKey,
  type CoreCapabilityKey,
  type PremiumCapabilityKey,
} from './capabilities';

export const PREMIUM_BILLING_LIVE = false;

/** Read-only view of a subscriber's premium entitlements (Stage 6 provides the real one). */
export interface PremiumEntitlements {
  has(capability: PremiumCapabilityKey): boolean;
}

export const NO_PREMIUM_ENTITLEMENTS: PremiumEntitlements = Object.freeze({
  has: () => false,
});

export type DeniedReason =
  | 'sign_in_required'
  | 'role_required'
  | 'coach_verification_required'
  | 'premium_not_included'
  | 'premium_not_yet_available';

export type CapabilityDecision =
  | { readonly allowed: true; readonly basis: 'free_core' | 'premium_entitlement' }
  | { readonly allowed: false; readonly reason: DeniedReason };

function audienceDecision(audience: CapabilityAudience, viewer: Viewer): DeniedReason | null {
  if (audience === 'anyone') return null;
  if (viewer.kind === 'anonymous') return 'sign_in_required';
  switch (audience) {
    case 'registered':
      return null;
    case 'athlete':
    case 'parent':
    case 'admin':
      return viewer.roles.includes(audience) ? null : 'role_required';
    case 'verified_coach':
      if (!viewer.roles.includes('coach')) return 'role_required';
      return viewer.verifiedCoach ? null : 'coach_verification_required';
  }
}

/** Core capabilities: depends on the viewer only. Never pass billing data here. */
export function decideCore(capability: CoreCapabilityKey, viewer: Viewer): CapabilityDecision {
  const denied = audienceDecision(CAPABILITIES[capability].audience, viewer);
  return denied ? { allowed: false, reason: denied } : { allowed: true, basis: 'free_core' };
}

export function decidePremium(
  capability: PremiumCapabilityKey,
  viewer: Viewer,
  entitlements: PremiumEntitlements,
): CapabilityDecision {
  const denied = audienceDecision(CAPABILITIES[capability].audience, viewer);
  if (denied) return { allowed: false, reason: denied };
  if (!PREMIUM_BILLING_LIVE) return { allowed: false, reason: 'premium_not_yet_available' };
  return entitlements.has(capability)
    ? { allowed: true, basis: 'premium_entitlement' }
    : { allowed: false, reason: 'premium_not_included' };
}

function isCore(capability: CapabilityKey): capability is CoreCapabilityKey {
  return CAPABILITIES[capability].tier === 'core_free';
}

export function canUse(
  capability: CapabilityKey,
  viewer: Viewer,
  entitlements: PremiumEntitlements = NO_PREMIUM_ENTITLEMENTS,
): CapabilityDecision {
  return isCore(capability)
    ? decideCore(capability, viewer)
    : decidePremium(capability, viewer, entitlements);
}
