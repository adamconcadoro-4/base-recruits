/**
 * What the product can actually do today. The single source every page reads
 * before describing a feature, so the home page, audience pages, pricing,
 * navigation and account prompts never promise something that isn't built.
 *
 * Statuses:
 *   available    works now, for everyone it is meant for
 *   pilot        works now in an early, deliberately limited form
 *   planned      not built yet; pages may describe it only as coming later
 *   unavailable  built but switched off for now
 *
 * Change a status here (and only here) when a feature ships or is paused.
 */

import { assessmentSiteEnabled } from '@/config/assessment';
import type { CapabilityKey } from '@/lib/entitlements/capabilities';

export type Availability = 'available' | 'pilot' | 'planned' | 'unavailable';

export interface Feature {
  readonly status: Availability;
  /** Plain-language name used in copy. */
  readonly name: string;
  /** One sentence on what works today (or why it doesn't yet). */
  readonly now: string;
}

export const FEATURES = {
  school_search: {
    status: 'available',
    name: 'School search',
    now: 'Search colleges that reported a baseball team in the latest federal athletics report.',
  },
  school_profiles: {
    status: 'available',
    name: 'School pages',
    now: 'Each school page shows its baseball division, admissions figures and published cost, with sources and years.',
  },
  compare: {
    status: 'available',
    name: 'Compare',
    now: 'Compare up to five schools side by side.',
  },
  saved_schools: {
    status: 'available',
    name: 'Saved schools',
    now: 'Save as many schools as you like, in this browser or in a free account.',
  },
  academic_comparison: {
    status: 'pilot',
    name: 'Academic comparison',
    now: 'Compare your SAT or ACT with the score ranges schools reported for a past entering class. GPA comparisons and current testing policies are limited by the data available.',
  },
  correction_reports: {
    status: 'available',
    name: 'Correction reports',
    now: 'Signed-in users can report a wrong or missing fact on any school page.',
  },
  accounts: {
    status: 'available',
    name: 'Free accounts',
    now: 'Create a free account to keep your saved schools.',
  },
  majors: {
    status: 'planned',
    name: 'Majors',
    now: 'Majors offered by each school are not imported yet.',
  },
  athlete_profile: {
    status: 'planned',
    name: 'Recruiting profile',
    now: 'Recruiting profiles that verified coaches can find are not open yet.',
  },
  coach_tools: {
    status: 'planned',
    name: 'Coach search and boards',
    now: 'Coaches can apply for verification now; athlete search, boards and messaging open later.',
  },
  coach_verification: {
    status: 'pilot',
    name: 'Coach verification',
    now: 'College coaches can create an account and apply for verification.',
  },
  family_access: {
    status: 'pilot',
    name: 'Family accounts',
    now: 'Athletes can link a parent or guardian account. Shared planning tools come later.',
  },
  transfer_comparison: {
    status: 'planned',
    name: 'Transfer comparison',
    now: 'Transfer athletes can browse schools; transfer-specific admission comparisons are not built yet.',
  },
  privacy_tools: {
    status: 'planned',
    name: 'Self-service privacy tools',
    now: 'Self-service data export and account deletion are not built yet.',
  },
  assessment: {
    status: assessmentSiteEnabled() ? 'pilot' : 'unavailable',
    name: 'Player assessment',
    now: 'Hitting and pitching assessments with video review, transparent scoring and training plans. Switched off until it opens.',
  },
  paid_plans: {
    status: 'planned',
    name: 'Optional paid plans',
    now: 'No paid plan is on sale and nothing is billed.',
  },
} as const satisfies Record<string, Feature>;

export type FeatureKey = keyof typeof FEATURES;

export function isLive(key: FeatureKey): boolean {
  const status: Availability = FEATURES[key].status;
  return status === 'available' || status === 'pilot';
}

/** Short label for a status chip; null for features that are simply available. */
export function availabilityLabel(status: Availability): string | null {
  switch (status) {
    case 'available':
      return null;
    case 'pilot':
      return 'Early version';
    case 'planned':
      return 'Coming later';
    case 'unavailable':
      return 'Temporarily unavailable';
  }
}

/**
 * Which feature delivers each free capability, so the pricing page can say
 * which free benefits work today and which are still coming.
 */
export const CAPABILITY_FEATURE: Readonly<Partial<Record<CapabilityKey, FeatureKey>>> = {
  school_search: 'school_search',
  school_profile_view: 'school_profiles',
  academic_match_basic: 'academic_comparison',
  school_compare_basic: 'compare',
  guest_shortlist: 'saved_schools',
  official_recruiting_links: 'school_profiles',
  shortlist_unlimited: 'saved_schools',
  basic_recruiting_checklist: 'athlete_profile',
  privacy_controls: 'privacy_tools',
  family_link_basic: 'family_access',
  athlete_profile_basic: 'athlete_profile',
  coach_discoverability: 'athlete_profile',
  coach_athlete_search: 'coach_tools',
  coach_athlete_evaluation: 'coach_tools',
  coach_recruiting_boards: 'coach_tools',
  coach_messaging: 'coach_tools',
};

export function capabilityAvailability(key: CapabilityKey): Availability {
  const feature = CAPABILITY_FEATURE[key];
  return feature ? FEATURES[feature].status : 'planned';
}
