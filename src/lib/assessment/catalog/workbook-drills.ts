/**
 * Drill-library entries built from the Hitting Development Workbook
 * (decision F38): the 40 hitting drills H01–H40 and the rehearsals the
 * swing-flaw guide relies on. R04 needs a resistance band and stays out until
 * a qualified coach has reviewed it.
 *
 * Which assessment measures a drill works on: its section's measures plus
 * every measure whose possible flaws (catalog/flaws.ts) list the drill.
 * Pitch-selection drills (section D) work on swing decisions, which the
 * assessment does not score.
 */

import type { DrillDefinition, DrillRequirement, WorkbookDrillSource } from '@/lib/assessment/catalog/drills';
import { METRIC_FLAWS, requireFlaw } from '@/lib/assessment/catalog/flaws';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { HITTING_WORKBOOK, withWorkbookNames, type WorkbookDrill, type WorkbookRehearsal } from '@/lib/assessment/hitting-workbook/content';
import { PILLAR_KEYS, type PillarKey } from '@/lib/assessment/types';

/** Rehearsals left out of the library until a qualified coach reviews them. */
export const HELD_BACK_REHEARSALS: readonly string[] = ['R04'];

/** Measures for drills the flaw guide never names, by workbook section letter. */
const SECTION_FINDINGS: Readonly<Record<string, readonly string[]>> = {
  A: ['hit_contact_location_consistency', 'hit_solid_contact'],
  B: ['hit_stride_direction_repeatability', 'hit_balance_through_swing', 'hit_lower_body_consistency'],
  C: ['hit_fc_to_contact_ms', 'hit_timing_variation_ms', 'hit_drill_preparation'],
  D: [],
};

const DECISIONS_REASSESSMENT =
  'Swing decisions are not scored in the assessment. Count them in a 9-Zone Hitting decision round and compare comparable rounds.';

export function workbookDrillKey(sourceId: string): string {
  return `hit-${sourceId.toLowerCase()}`;
}

/** Measures whose possible flaws name this drill, in catalog order. */
function flawFindings(sourceId: string): string[] {
  return Object.entries(METRIC_FLAWS)
    .filter(([, flaws]) => flaws.some((id) => requireFlaw(id).drills.includes(sourceId)))
    .map(([metricKey]) => metricKey);
}

function pillarsOf(findings: readonly string[]): PillarKey[] {
  const used = new Set(findings.map((key) => requireMetric(key).pillar));
  return PILLAR_KEYS.filter((key) => used.has(key));
}

function reassessmentFor(findings: readonly string[]): string {
  if (findings.length === 0) return DECISIONS_REASSESSMENT;
  const names = findings.map((key) => requireMetric(key).name);
  return `${names.join('; ')} (same camera view and drill).`;
}

/** "Bat, fitted helmet, net (or cage)" → ["bat", "fitted helmet", "net (or cage)"]; the workbook's own log sheets are left out. */
function splitEquipment(value: string): string[] {
  return value
    .split(/[,;]\s*(?![^()]*\))/)
    .map((item) => item.trim())
    .filter((item) => item && !/^video log$/i.test(item))
    .map((item, index) => (index === 0 && /^[A-Z][a-z]/.test(item) ? item.charAt(0).toLowerCase() + item.slice(1) : item));
}

function source(
  item: { sourceId: string; sourceSheet: string; sourceRow: number },
  rest: Omit<WorkbookDrillSource, 'sourceId' | 'sourceSheet' | 'sourceRow'>,
): WorkbookDrillSource {
  return { sourceId: item.sourceId, sourceSheet: item.sourceSheet, sourceRow: item.sourceRow, ...rest };
}

function fromDrill(item: WorkbookDrill): DrillDefinition {
  const section = item.section.charAt(0);
  const linked = flawFindings(item.sourceId);
  const own = SECTION_FINDINGS[section] ?? [];
  const findings = Object.keys(METRIC_FLAWS).filter((key) => own.includes(key) || linked.includes(key));
  const requires: DrillRequirement[] = section === 'C' || section === 'D' ? ['partner'] : [];
  return {
    key: workbookDrillKey(item.sourceId),
    version: 1,
    discipline: 'hitting',
    name: item.name,
    pillars: pillarsOf(findings),
    findings,
    purpose: item.purpose,
    equipment: splitEquipment(item.equipment),
    requires,
    setup: item.setup,
    steps: item.steps,
    cues: [item.cue],
    dosage: `${item.suggestedRound} per round`,
    regression: withWorkbookNames(item.easier),
    progression: withWorkbookNames(item.progression),
    completion: item.success,
    reassessment: reassessmentFor(findings),
    workbook: source(item, {
      kind: 'drill',
      section: item.section,
      level: item.level,
      mistake: item.mistake,
      correction: withWorkbookNames(item.correction),
      safety: item.safety,
    }),
  };
}

function fromRehearsal(item: WorkbookRehearsal, drills: ReadonlyMap<string, DrillDefinition>): DrillDefinition {
  const linked = flawFindings(item.sourceId);
  const fed = item.feedsInto.flatMap((id) => drills.get(id)?.findings ?? []);
  const findings = linked.length > 0 ? linked : [...new Set(fed)];
  const leadsInto = item.feedsInto.map((id) => withWorkbookNames(id)).join(' or ');
  return {
    key: workbookDrillKey(item.sourceId),
    version: 1,
    discipline: 'hitting',
    name: item.name,
    pillars: pillarsOf(findings),
    findings,
    purpose: item.purpose,
    equipment: item.equipment === 'None' ? ['none'] : splitEquipment(item.equipment),
    requires: /video/i.test(item.equipment) && !/mirror or/i.test(item.equipment) ? ['video'] : [],
    setup: `Use it briefly before or between hitting rounds${leadsInto ? `, leading into ${leadsInto}` : ''}, then go back to hitting.`,
    steps: item.how.split(/;\s*/).map((step) => step.charAt(0).toUpperCase() + step.slice(1).replace(/\.$/, '') + '.'),
    cues: [item.cue],
    dosage: 'One short block, then back to hitting',
    regression: '',
    progression: leadsInto ? `Move on to ${leadsInto}.` : '',
    completion: '',
    reassessment: findings.length > 0 ? reassessmentFor(findings) : 'Repeat it the same way next time and compare with this time.',
    workbook: source(item, { kind: 'rehearsal', section: 'Rehearsals and feedback tools', level: null, mistake: null, correction: null, safety: null }),
  };
}

function build(): DrillDefinition[] {
  const drills = HITTING_WORKBOOK.drills.map(fromDrill);
  const bySource = new Map(HITTING_WORKBOOK.drills.map((item, index) => [item.sourceId, drills[index] as DrillDefinition]));
  const rehearsals = HITTING_WORKBOOK.rehearsals
    .filter((item) => !HELD_BACK_REHEARSALS.includes(item.sourceId))
    .map((item) => fromRehearsal(item, bySource));
  return [...drills, ...rehearsals];
}

export const WORKBOOK_DRILLS: readonly DrillDefinition[] = build();
