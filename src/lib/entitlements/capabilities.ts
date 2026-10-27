/**
 * Capability catalog — the single list of what Base Recruits can do and whether
 * it is free forever (core_free) or an optional paid workflow (premium).
 *
 * Mirrors public.capabilities. A contract test fails if the two drift, and the
 * database refuses to re-classify, re-scope, rename, delete or sell a core
 * capability (error BR020).
 *
 * Product invariants (master spec §01) cited by `invariant`:
 *   1 core academic matching is free forever
 *   2 nationwide college baseball search is free forever
 *   3 first-visit discovery works without registration
 *   4 unlimited basic saved shortlists remain free
 *   5 basic athlete profiles and consent-based coach discoverability remain free
 *   6 verified college coaches get permanently free core access
 *  10 privacy and consent controls are part of the free product
 */

export type CapabilityTier = 'core_free' | 'premium';
export type CapabilityAudience = 'anyone' | 'registered' | 'athlete' | 'parent' | 'verified_coach' | 'admin';

export interface CapabilityDefinition {
  readonly tier: CapabilityTier;
  readonly audience: CapabilityAudience;
  readonly invariant: number | null;
  readonly description: string;
}

export const CAPABILITIES = {
  school_search: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 2,
    description: 'Explore college baseball programs.',
  },
  school_profile_view: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 2,
    description: 'See each school’s baseball program, admissions figures and published cost, with sources.',
  },
  academic_match_basic: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 1,
    description: 'Compare your test scores with each school’s published ranges, with the reasons explained.',
  },
  school_compare_basic: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 3,
    description: 'Compare up to five schools side by side.',
  },
  guest_shortlist: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 3,
    description: 'Save schools in your browser without an account.',
  },
  official_recruiting_links: {
    tier: 'core_free',
    audience: 'anyone',
    invariant: 2,
    description: 'Follow links to official team pages and recruiting questionnaires where we have them.',
  },
  shortlist_unlimited: {
    tier: 'core_free',
    audience: 'registered',
    invariant: 4,
    description: 'Save as many schools as you like to a free account.',
  },
  basic_recruiting_checklist: {
    tier: 'core_free',
    audience: 'registered',
    invariant: 4,
    description: 'Use the basic recruiting checklist.',
  },
  privacy_controls: {
    tier: 'core_free',
    audience: 'registered',
    invariant: 10,
    description: 'Manage consent, sharing, data export and deletion.',
  },
  family_link_basic: {
    tier: 'core_free',
    audience: 'registered',
    invariant: 10,
    description: 'Link a player and a parent or guardian, with the player’s approval.',
  },
  athlete_profile_basic: {
    tier: 'core_free',
    audience: 'athlete',
    invariant: 5,
    description: 'Create and maintain a basic recruiting profile.',
  },
  coach_discoverability: {
    tier: 'core_free',
    audience: 'athlete',
    invariant: 5,
    description: 'Choose whether verified college coaches can find you.',
  },
  coach_athlete_search: {
    tier: 'core_free',
    audience: 'verified_coach',
    invariant: 6,
    description: 'Search players who chose to be visible to verified coaches.',
  },
  coach_athlete_evaluation: {
    tier: 'core_free',
    audience: 'verified_coach',
    invariant: 6,
    description: 'Review the academic and athletic information players shared, with where each item came from.',
  },
  coach_recruiting_boards: {
    tier: 'core_free',
    audience: 'verified_coach',
    invariant: 6,
    description: 'Save players to private recruiting boards with notes.',
  },
  coach_messaging: {
    tier: 'core_free',
    audience: 'verified_coach',
    invariant: 6,
    description: 'Message players who allow coach messaging.',
  },
  recruiting_pipeline_crm: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Recruiting pipeline with custom stages and contact log.',
  },
  scheduled_reminders: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Scheduled reminders and follow-up calendar.',
  },
  outreach_templates: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Outreach templates and saved workflows.',
  },
  document_task_checklists: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Document and task checklists per school.',
  },
  academic_improvement_planner: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Deeper academic improvement planning.',
  },
  athletic_trend_visualization: {
    tier: 'premium',
    audience: 'athlete',
    invariant: null,
    description: 'Athletic metric trends over time.',
  },
  personalized_recommendations: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Personalized multi-factor recruiting recommendations.',
  },
  advanced_transfer_organization: {
    tier: 'premium',
    audience: 'athlete',
    invariant: null,
    description: 'Advanced organization for transfer searches.',
  },
  engagement_analytics: {
    tier: 'premium',
    audience: 'athlete',
    invariant: null,
    description: 'Privacy-safe engagement analytics.',
  },
  historical_scattergrams: {
    tier: 'premium',
    audience: 'registered',
    invariant: null,
    description: 'Historical admissions scattergrams where permissioned data exist (data-gated).',
  },
  family_multi_athlete_workspace: {
    tier: 'premium',
    audience: 'parent',
    invariant: null,
    description: 'Multi-athlete family workspace and household reporting.',
  },
  family_shared_calendar: {
    tier: 'premium',
    audience: 'parent',
    invariant: null,
    description: 'Synchronized family timelines and calendars.',
  },
} as const satisfies Record<string, CapabilityDefinition>;

export type CapabilityKey = keyof typeof CAPABILITIES;

export type CoreCapabilityKey = {
  [K in CapabilityKey]: (typeof CAPABILITIES)[K]['tier'] extends 'core_free' ? K : never;
}[CapabilityKey];

export type PremiumCapabilityKey = Exclude<CapabilityKey, CoreCapabilityKey>;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

export const CORE_CAPABILITY_KEYS = CAPABILITY_KEYS.filter(
  (key): key is CoreCapabilityKey => CAPABILITIES[key].tier === 'core_free',
);

export const PREMIUM_CAPABILITY_KEYS = CAPABILITY_KEYS.filter(
  (key): key is PremiumCapabilityKey => CAPABILITIES[key].tier === 'premium',
);

export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITIES, value);
}
