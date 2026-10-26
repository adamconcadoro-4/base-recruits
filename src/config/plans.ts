/**
 * Optional paid plans — PRICES ARE PROPOSALS, not on sale (decision F8).
 * Prices live only here (and later in Stripe); permission logic never reads
 * them. Names and prices follow the founder's monetization brief of
 * 2026-10-25 (Starter / Plus / Pro). Discovery and academic matching stay in
 * the free core (decision F19); billing is built after launch, when the
 * plan-to-capability assignments below are revised to match the tiers.
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
  /** Paid once a year; 0 for the free core. */
  readonly proposedAnnualPriceUsd: number;
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
    proposedAnnualPriceUsd: 0,
    priceIsHypothesis: false,
    summary:
      'School search, academic matching, comparisons, unlimited saved schools, a basic recruiting profile and consent-based visibility to verified coaches.',
    premiumCapabilities: [],
  },
  {
    key: 'base_recruit',
    name: 'Starter',
    availability: 'planned',
    proposedMonthlyPriceUsd: 9.99,
    proposedAnnualPriceUsd: 99,
    priceIsHypothesis: true,
    summary: 'A recruiting timeline that lays out the steps and dates for your class year.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS],
  },
  {
    key: 'base_elite',
    name: 'Plus',
    availability: 'planned',
    proposedMonthlyPriceUsd: 14.99,
    proposedAnnualPriceUsd: 149,
    priceIsHypothesis: true,
    summary:
      'Everything in Starter plus a recruiting contact tracker, a coach outreach planner with email templates, deadline reminders, a task checklist and a progress dashboard.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS, ...ELITE_ANALYSIS],
  },
  {
    key: 'base_family',
    name: 'Pro',
    availability: 'planned',
    proposedMonthlyPriceUsd: 19.99,
    proposedAnnualPriceUsd: 199,
    priceIsHypothesis: true,
    summary:
      'Everything in Plus plus a shared family workspace, recruiting analytics, cost and scholarship planning, and expense tracking.',
    premiumCapabilities: [...RECRUIT_WORKFLOWS, ...ELITE_ANALYSIS, ...FAMILY_COORDINATION],
  },
];
