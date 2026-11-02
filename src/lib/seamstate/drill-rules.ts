/**
 * Finding → drill rules (SeamState drill engine, rules version seamstate-drills-v1).
 *
 * Drills come only from the existing Assessment catalog
 * (src/lib/assessment/catalog/drills.ts), matched through each mechanic's
 * related metrics. The model never chooses or writes a drill; it may only
 * explain one that these rules selected. A mechanic with no matching drill
 * gets none rather than an unrelated one.
 */

import { drillsFor, type DrillDefinition, type DrillRequirement } from '@/lib/assessment/catalog/drills';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { requireMechanic } from '@/lib/seamstate/catalog/mechanics';
import type { ValidatedFinding } from '@/lib/seamstate/validate';

export const DRILL_RULES_VERSION = 'seamstate-drills-v1';
/** At most this many drills per finding. */
export const MAX_DRILLS_PER_FINDING = 2;
/**
 * The starter drill catalog has not been reviewed by a qualified hitting coach
 * yet (decision F26). Development Workbook drills have been (F38); Master
 * Workbook drills not yet (F55). Each suggestion carries its own label.
 */
export const DRILL_CATALOG_COACH_REVIEWED = false;

function coachReviewed(drill: DrillDefinition): boolean {
  return DRILL_CATALOG_COACH_REVIEWED || drill.workbook?.coachReviewed === true;
}

export interface DrillSuggestion {
  readonly drillKey: string;
  readonly drillVersion: number;
  readonly mechanicKey: string;
  /** Why this drill: the finding and the catalog link that selected it. */
  readonly rationale: string;
  readonly cue: string;
  /** Dosage is the catalog's editable starting point, never a prescription from the model. */
  readonly dosage: string;
  readonly dosageSource: 'catalog_starting_point';
  readonly reassessment: string;
  readonly coachReviewed: boolean;
}

function usable(drill: DrillDefinition, available: readonly DrillRequirement[]): boolean {
  return drill.requires.every((requirement) => available.includes(requirement));
}

/**
 * Drill suggestions for one validated finding. Only adjustments get drills.
 * `available` lists what the athlete has (a partner, video); radar-only drills
 * are skipped unless a radar is available.
 */
export function suggestDrills(finding: ValidatedFinding, available: readonly DrillRequirement[]): readonly DrillSuggestion[] {
  if (finding.category !== 'adjustment') return [];
  const definition = requireMechanic(finding.mechanicKey);
  const matches = drillsFor('hitting')
    .filter((drill) => drill.findings.some((metric) => definition.relatedMetrics.includes(metric)))
    .filter((drill) => usable(drill, available))
    // Prefer drills addressing the first related metric (the closest match).
    .sort((a, b) => rank(a, definition.relatedMetrics) - rank(b, definition.relatedMetrics));
  return matches.slice(0, MAX_DRILLS_PER_FINDING).map((drill) => ({
    drillKey: drill.key,
    drillVersion: drill.version,
    mechanicKey: finding.mechanicKey,
    rationale: `Suggested for “${definition.name}”: this library drill works on ${drill.findings
      .filter((metric) => definition.relatedMetrics.includes(metric))
      .map((metric) => requireMetric(metric).name.toLowerCase())
      .join(' and ')}.`,
    cue: finding.cue ?? drill.cues[0] ?? drill.purpose,
    dosage: drill.dosage,
    dosageSource: 'catalog_starting_point',
    reassessment: drill.reassessment,
    coachReviewed: coachReviewed(drill),
  }));
}

function rank(drill: DrillDefinition, related: readonly string[]): number {
  const positions = drill.findings.map((metric) => related.indexOf(metric)).filter((position) => position >= 0);
  return positions.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...positions);
}
