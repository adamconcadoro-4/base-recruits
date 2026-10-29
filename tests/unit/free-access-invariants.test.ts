/**
 * Free-access regression suite (master spec §01, "Architecture requirement").
 * If a future change puts discovery, matching, comparison, shortlists, athlete
 * visibility or verified-coach tools behind payment, these tests fail.
 */
import { describe, expect, it } from 'vitest';

import { PLANS } from '@/config/plans';
import type { AppRole } from '@/lib/auth/roles';
import { ANONYMOUS, type Viewer } from '@/lib/auth/route-access';
import {
  CAPABILITIES,
  CORE_CAPABILITY_KEYS,
  PREMIUM_CAPABILITY_KEYS,
  type PremiumCapabilityKey,
} from '@/lib/entitlements/capabilities';
import {
  NO_PREMIUM_ENTITLEMENTS,
  PREMIUM_BILLING_LIVE,
  canUse,
  type PremiumEntitlements,
} from '@/lib/entitlements/entitlements';

const viewer = (roles: readonly AppRole[], verifiedCoach = false): Viewer => ({
  kind: 'signed_in',
  userId: '00000000-0000-4000-8000-000000000002',
  roles,
  onboardingComplete: true,
  verifiedCoach,
});

const ALL_PREMIUM: PremiumEntitlements = { has: () => true };
const THROWING: PremiumEntitlements = {
  has: () => {
    throw new Error('core capability consulted billing data');
  },
};
const ENTITLEMENT_STATES: readonly PremiumEntitlements[] = [NO_PREMIUM_ENTITLEMENTS, ALL_PREMIUM, THROWING];

const VIEWERS: readonly Viewer[] = [
  ANONYMOUS,
  viewer(['athlete']),
  viewer(['parent']),
  viewer(['coach'], false),
  viewer(['coach'], true),
  viewer(['admin']),
  viewer(['athlete', 'parent']),
];

describe('the free core', () => {
  it('is exactly the sixteen capabilities the product guarantees', () => {
    expect([...CORE_CAPABILITY_KEYS].sort()).toEqual([
      'academic_match_basic',
      'athlete_profile_basic',
      'basic_recruiting_checklist',
      'coach_athlete_evaluation',
      'coach_athlete_search',
      'coach_discoverability',
      'coach_messaging',
      'coach_recruiting_boards',
      'family_link_basic',
      'guest_shortlist',
      'official_recruiting_links',
      'privacy_controls',
      'school_compare_basic',
      'school_profile_view',
      'school_search',
      'shortlist_unlimited',
    ]);
  });

  it('cites the product invariant behind every core capability', () => {
    for (const key of CORE_CAPABILITY_KEYS) {
      expect(CAPABILITIES[key].invariant).not.toBeNull();
    }
  });

  it('gives the same answer whatever the viewer has (or has not) paid for', () => {
    for (const key of CORE_CAPABILITY_KEYS) {
      for (const v of VIEWERS) {
        const baseline = canUse(key, v, NO_PREMIUM_ENTITLEMENTS);
        for (const entitlements of ENTITLEMENT_STATES) {
          expect(canUse(key, v, entitlements)).toEqual(baseline);
        }
      }
    }
  });

  it('never denies a core capability for payment reasons', () => {
    for (const key of CORE_CAPABILITY_KEYS) {
      for (const v of VIEWERS) {
        const decision = canUse(key, v);
        if (!decision.allowed) {
          expect(['sign_in_required', 'role_required', 'coach_verification_required']).toContain(decision.reason);
        }
      }
    }
  });

  it('lets anonymous visitors search, match, compare and shortlist (first-visit discovery)', () => {
    for (const key of ['school_search', 'school_profile_view', 'academic_match_basic', 'school_compare_basic', 'guest_shortlist'] as const) {
      expect(canUse(key, ANONYMOUS)).toEqual({ allowed: true, basis: 'free_core' });
    }
  });

  it('lets any free account save unlimited schools', () => {
    expect(canUse('shortlist_unlimited', viewer(['parent']))).toEqual({ allowed: true, basis: 'free_core' });
    expect(canUse('shortlist_unlimited', ANONYMOUS)).toEqual({ allowed: false, reason: 'sign_in_required' });
  });

  it('lets every athlete choose coach visibility for free', () => {
    expect(canUse('coach_discoverability', viewer(['athlete']))).toEqual({ allowed: true, basis: 'free_core' });
  });

  it('gates coach tools on verification only', () => {
    for (const key of ['coach_athlete_search', 'coach_athlete_evaluation', 'coach_recruiting_boards', 'coach_messaging'] as const) {
      expect(canUse(key, viewer(['coach'], false))).toEqual({ allowed: false, reason: 'coach_verification_required' });
      expect(canUse(key, viewer(['coach'], true), NO_PREMIUM_ENTITLEMENTS)).toEqual({ allowed: true, basis: 'free_core' });
    }
  });
});

describe('premium workflows', () => {
  it('are not sold before billing ships', () => {
    expect(PREMIUM_BILLING_LIVE).toBe(false);
    for (const key of PREMIUM_CAPABILITY_KEYS) {
      const decision = canUse(key, viewer(['athlete', 'parent']), ALL_PREMIUM);
      expect(decision.allowed).toBe(false);
    }
  });
});

describe('plans', () => {
  it('never include a core capability', () => {
    const core = new Set<string>(CORE_CAPABILITY_KEYS);
    for (const plan of PLANS) {
      for (const capability of plan.premiumCapabilities) {
        expect(core.has(capability)).toBe(false);
      }
    }
  });

  it('keep the free plan free and mark paid plans as planned price hypotheses', () => {
    const free = PLANS.find((plan) => plan.key === 'base_free');
    expect(free?.proposedMonthlyPriceUsd).toBe(0);
    expect(free?.availability).toBe('free_forever');
    for (const plan of PLANS.filter((p) => p.key !== 'base_free')) {
      expect(['planned', 'retired']).toContain(plan.availability);
      expect(plan.priceIsHypothesis).toBe(true);
    }
  });

  it('offer only Plus and Pro now that Starter is retired', () => {
    expect(PLANS.filter((p) => p.availability === 'planned').map((p) => p.name)).toEqual(['Plus', 'Pro']);
    expect(PLANS.find((p) => p.key === 'base_recruit')?.availability).toBe('retired');
  });

  it('price each planned plan at the founder-approved proposals, with annual billing cheaper than twelve months', () => {
    const byName = Object.fromEntries(PLANS.map((plan) => [plan.name, plan]));
    expect([byName.Plus?.proposedMonthlyPriceUsd, byName.Pro?.proposedMonthlyPriceUsd]).toEqual([24.99, 29.99]);
    expect([byName.Plus?.proposedAnnualPriceUsd, byName.Pro?.proposedAnnualPriceUsd]).toEqual([249, 299]);
    for (const plan of PLANS.filter((p) => p.availability === 'planned')) {
      const saving = 1 - plan.proposedAnnualPriceUsd / (plan.proposedMonthlyPriceUsd * 12);
      // "About 17%" on the brief: every plan saves between 16% and 18% a year.
      expect(saving > 0.16 && saving < 0.18).toBe(true);
    }
  });

  it('give each planned plan a short value statement and a bullet list', () => {
    for (const plan of PLANS.filter((p) => p.availability === 'planned')) {
      expect(plan.summary.length > 0 && plan.summary.length <= 120).toBe(true);
      expect((plan.summary.match(/[.!?](\s|$)/g) ?? []).length <= 2).toBe(true);
      expect(plan.features.length >= 2).toBe(true);
    }
  });

  it('only reference premium capabilities that exist', () => {
    const premium = new Set<PremiumCapabilityKey>(PREMIUM_CAPABILITY_KEYS);
    for (const plan of PLANS) {
      for (const capability of plan.premiumCapabilities) {
        expect(premium.has(capability)).toBe(true);
      }
    }
  });
});
