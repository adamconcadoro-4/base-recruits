/**
 * 9-Zone Hitting content, version 1, imported from the workbook
 * data/zone-hitting/9_Zone_Hitting_Drills_and_Tracking.xlsx by
 * scripts/zone-content/extract.py. Every record keeps its source sheet and
 * row. The database mirrors the zones, drills, stages, pairings and
 * constraints (public.zone_*); a contract test keeps them identical.
 *
 * Source limitations carried with the content: the original numbered
 * references have no verifiable source list; suggested volumes are planning
 * guidance; advancement needs coach review; contact-depth references are
 * individualized cues, not universal measurements.
 */

import raw from '@/lib/assessment/zones/content-v1.json';
import type { ZoneId } from '@/lib/assessment/zones/types';

export interface ZoneDefinition {
  readonly zone: ZoneId;
  readonly location: string;
  readonly placement: string;
  readonly depthCue: string;
  readonly targetLane: string;
  readonly cue: string;
  readonly desiredResult: string;
  readonly commonMisses: string;
  readonly sourceRow: number;
}

export interface ZoneDrill {
  /** The workbook's own id, e.g. "Z9-04". */
  readonly sourceId: string;
  /** Internal key (stable across content versions). */
  readonly key: string;
  readonly version: number;
  readonly zone: ZoneId;
  readonly name: string;
  readonly level: string;
  readonly setup: string;
  readonly suggestedVolume: string;
  readonly execution: string;
  readonly depthCue: string;
  readonly targetLane: string;
  readonly cue: string;
  readonly track: string;
  readonly watchFor: string;
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export interface ZoneStage {
  readonly stage: number;
  readonly name: string;
  readonly source: string;
  readonly newDemand: string;
  readonly suggestedVolume: string;
  readonly instructions: string;
  readonly measures: string;
  readonly nextStep: string;
  readonly sourceRow: number;
}

export interface ZonePairing {
  readonly key: string;
  readonly zones: readonly ZoneId[];
  readonly name: string;
  readonly purpose: string;
  readonly sourceRow: number;
}

export interface ZoneConstraint {
  readonly key: string;
  readonly category: string;
  readonly name: string;
  readonly deliverySetup: string;
  readonly hitterAssignment: string;
  readonly measure: string;
  readonly volumeNote: string;
  readonly sourceRow: number;
}

export interface ZoneContent {
  readonly version: string;
  readonly source: { readonly file: string; readonly sha256: string; readonly sheets: readonly string[] };
  readonly startHere: ReadonlyArray<{ readonly topic: string; readonly text: string; readonly sourceRow: number }>;
  readonly zones: readonly ZoneDefinition[];
  readonly drills: readonly ZoneDrill[];
  readonly stages: readonly ZoneStage[];
  readonly pairings: readonly ZonePairing[];
  readonly constraints: readonly ZoneConstraint[];
  readonly baselineTests: ReadonlyArray<{ block: string; setup: string; volume: string; measure: string; notes: string; sourceRow: number }>;
  readonly sessionPlan: ReadonlyArray<{ segment: string; time: string; volume: string; task: string; review: string; sourceRow: number }>;
  readonly codingGuide: ReadonlyArray<{ field: string; rule: string; sourceRow: number }>;
  readonly dashboard: ReadonlyArray<{ metric: string; formula: string; definition: string; sourceRow: number }>;
  readonly roundReview: ReadonlyArray<{ step: string; prompt: string; sourceRow: number }>;
  readonly postSessionEval: ReadonlyArray<{ field: string; sourceRow: number }>;
  readonly deliveryPlan: ReadonlyArray<{ finding: string; plan: string; guardrail: string; sourceRow: number }>;
  readonly pitchLogColumns: readonly string[];
  readonly dailyLogColumns: readonly string[];
}

export const ZONE_CONTENT = raw as unknown as ZoneContent;

/** Where the downloadable copy of the workbook is served (signed-in, Assessment switched on). */
export const ZONE_WORKBOOK_PATH = '/assessment/hitting/zones/workbook';

const zoneMap = new Map(ZONE_CONTENT.zones.map((item) => [item.zone, item]));
const drillMap = new Map(ZONE_CONTENT.drills.map((item) => [item.key, item]));
const stageMap = new Map(ZONE_CONTENT.stages.map((item) => [item.stage, item]));
const constraintMap = new Map(ZONE_CONTENT.constraints.map((item) => [item.key, item]));
const pairingMap = new Map(ZONE_CONTENT.pairings.map((item) => [item.key, item]));

export function zoneDefinition(zone: ZoneId): ZoneDefinition {
  const found = zoneMap.get(zone);
  if (!found) throw new Error(`Unknown zone ${zone}`);
  return found;
}

export function zoneDrill(key: string): ZoneDrill | undefined {
  return drillMap.get(key);
}

export function zoneStage(stage: number): ZoneStage | undefined {
  return stageMap.get(stage);
}

export function zoneConstraint(key: string): ZoneConstraint | undefined {
  return constraintMap.get(key);
}

export function zonePairing(key: string): ZonePairing | undefined {
  return pairingMap.get(key);
}

export function drillsForZone(zone: ZoneId): readonly ZoneDrill[] {
  return ZONE_CONTENT.drills.filter((item) => item.zone === zone);
}

export const ZONE_DRILL_LEVELS: readonly string[] = [...new Set(ZONE_CONTENT.drills.map((item) => item.level))];
export const ZONE_CONSTRAINT_CATEGORIES: readonly string[] = [...new Set(ZONE_CONTENT.constraints.map((item) => item.category))];
