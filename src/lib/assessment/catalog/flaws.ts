/**
 * Swing-flaw guide (T01–T18) from the Hitting Development Workbook.
 *
 * Each flaw says what it looks like, how to tell its possible causes apart,
 * which drills to try (in the workbook's order), what to avoid and how to
 * retest. METRIC_FLAWS links each hitting assessment measure to the flaws that
 * can produce a weak result on it, most direct first. One result can have
 * several causes, so a finding is only ever told which flaws are *possible*,
 * with the checks to tell them apart; nothing here diagnoses a swing.
 *
 * Chasing (T15) and freezing (T16) are pitch decisions, which the assessment
 * does not measure; they are practised and counted in 9-Zone Hitting decision
 * rounds, so no assessment measure links to them.
 *
 * Each flaw's drills are the Development Workbook's own list followed by the
 * Master Workbook drills mapped to it (catalog/master-flaw-links.ts, F56).
 */

import { MASTER_FLAW_DRILLS } from '@/lib/assessment/catalog/master-flaw-links';
import { HITTING_WORKBOOK, siteText, withWorkbookNames, type WorkbookFlaw } from '@/lib/assessment/hitting-workbook/content';

export type FlawId =
  | 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08' | 'T09'
  | 'T10' | 'T11' | 'T12' | 'T13' | 'T14' | 'T15' | 'T16' | 'T17' | 'T18';

/** Hitting measures → flaws that can explain a weak result, most direct first. */
export const METRIC_FLAWS: Readonly<Record<string, readonly FlawId[]>> = {
  hit_load_repeatability: ['T04', 'T17'],
  hit_drill_preparation: ['T09', 'T17'],
  hit_fc_to_contact_ms: ['T09', 'T10'],
  hit_timing_variation_ms: ['T17', 'T10'],
  hit_contact_location_consistency: ['T11', 'T02', 'T06'],
  hit_barrel_delivery_consistency: ['T03', 'T04', 'T05'],
  hit_attack_angle_deg: ['T05', 'T12'],
  hit_stride_direction_repeatability: ['T01', 'T02', 'T07'],
  hit_balance_through_swing: ['T08', 'T14', 'T07', 'T06'],
  hit_lower_body_consistency: ['T08', 'T01'],
  hit_launch_angle_deg: ['T12', 'T13'],
  hit_solid_contact: ['T12', 'T13', 'T14', 'T11'],
  hit_output_consistency_pct: ['T18'],
};

/** Flaws about swing decisions, practised in 9-Zone Hitting rather than scored in the assessment. */
export const DECISION_FLAWS: readonly FlawId[] = ['T15', 'T16'];

const forSite = (text: string) => withWorkbookNames(siteText(text));

/** The guide as shown on the site: ids in the text spelled out as names, no references to the workbook's own sheets, Master Workbook drills added. */
export const FLAWS: readonly WorkbookFlaw[] = HITTING_WORKBOOK.flaws.map((item) => ({
  ...item,
  drills: [...item.drills, ...(MASTER_FLAW_DRILLS[item.sourceId as FlawId] ?? [])],
  whatYouSee: forSite(item.whatYouSee),
  checks: forSite(item.checks),
  contributors: forSite(item.contributors),
  avoid: forSite(item.avoid),
  progressMarker: forSite(item.progressMarker),
  retest: forSite(item.retest),
}));

/** The workbook's observe → hypothesis → test → retest → decide routine. */
export const FLAW_WORKFLOW = HITTING_WORKBOOK.workflow.map((item) => ({ ...item, action: siteText(item.action) }));

const flawMap = new Map(FLAWS.map((item) => [item.sourceId, item]));

export function requireFlaw(id: FlawId): WorkbookFlaw {
  const found = flawMap.get(id);
  if (!found) throw new Error(`Unknown flaw ${id}`);
  return found;
}

/** The flaws that can explain a weak result on one measure (empty when none applies). */
export function flawsForMetric(metricKey: string): readonly WorkbookFlaw[] {
  return (METRIC_FLAWS[metricKey] ?? []).map(requireFlaw);
}

/** The measures a flaw can show up in. */
export function metricsForFlaw(id: FlawId): readonly string[] {
  return Object.entries(METRIC_FLAWS)
    .filter(([, flaws]) => flaws.includes(id))
    .map(([metricKey]) => metricKey);
}
