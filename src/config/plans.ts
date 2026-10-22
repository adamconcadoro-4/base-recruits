/**
 * Optional paid plans — PRICES ARE HYPOTHESES FOR TESTING, not committed rates
 * (master spec §15). Prices live only here (and later in Stripe); permission
 * logic never reads them.
 *
 * Every plan's capability list is typed as PremiumCapabilityKey[], so a core
 * (free-forever) capability cannot be added to a plan without a type error, and
 * the database rejects it too (plan_capabilities guard, error BR020).
 */

import type { PremiumCapabilityKey } from '@/lib/entitlements/capabilities';

export type PlanKey = 'base_free' | 'base_recruit' | 'base_elite' | 'base_family';

export interface PlanDefinition {
  readonly key: PlanKey;
  readonly name: string;
  /** 'planned' = not purchasable; shown as upcoming and never billed. */
  readonly availability: 'free_forever' | 'planned';
  readonly proposedMonthlyPriceUsd: number;
  readonly priceIsHypothesis: boolean;
  readonly summary: string;
  /** Premium capabilities this plan adds on top of the free core. */
  readonly premiumCapabilities: readonly PremiumCapabilityKey[];
}

const RECRUIT_WORKFLOWS = [
  'recruiting_pipeline_crm',
  'scheduled_reminders',
  'outreach_templates',
  'document_task_checklists',
] as const satisfies readonly PremiumCapabilityKey[];

const ELITE_ANALYSIS = [
  'academic_improvement_planner',
  'athletic_trend_visualization',
  'personalized_recommendations',
  'advanced_transfer_organization',
  'engagement_analytics',
  'historical_scattergrams',
] as const satisfies readonly PremiumCapabilityKey[];

const FAMILY_COORDINATION = [
  'family_multi_athlete_workspace',
  'family_shared_calendar',
] as const satisfies readonly PremiumCapabilityKey[];

export const PLANS: readonly PlanDefinition[] = [
  {
    key: 'base_free',
    name: 'Base Free',
    availability: 'free_forever',
    proposedMonthlyPriceUsd: 0,
    priceIsHypothesis: false,
    summary:
      'School search, academic matching, comparisons, unlimited saved schools, a basic recruiting profile and consent-based visibility to verified coaches.',
    premiumCapabilities: [],
  },
  {
    key: 'base_recruit',
    name: 'Base Recruit',
    availability: 'planned',
    proposedMonthlyPriceUsd: 14.99,
    priceIsHypothesis: true,
    summary: 'Recruiting pipeline, reminders, outreach templates and per-school checklists.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS],
  },
  {
    key: 'base_elite',
    name: 'Base Elite',
    availability: 'planned',
    proposedMonthlyPriceUsd: 29.99,
    priceIsHypothesis: true,
    summary:
      'Everything in Recruit plus academic planning, athletic trends and recommendations. Historical scattergrams only where permissioned data exist.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS, ...ELITE_ANALYSIS],
  },
  {
    key: 'base_family',
    name: 'Base Family',
    availability: 'planned',
    proposedMonthlyPriceUsd: 39.99,
    priceIsHypothesis: true,
    summary: 'Everything in Elite plus a multi-athlete family workspace and shared calendars.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS, ...ELITE_ANALYSIS, ...FAMILY_COORDINATION],
  },
];
