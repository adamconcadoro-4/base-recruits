/**
 * Drill-library entries built from the Hitting Master Workbook (decision F55):
 * 69 drills sorted by body area, added beside the Development Workbook's
 * drills (catalog/workbook-drills.ts), never replacing them.
 *
 * Which assessment measures a drill works on: its body area's measures plus
 * every measure whose possible flaws (catalog/flaws.ts) list the drill.
 * Medicine-ball drills and the pitch-recognition drills work on things the
 * assessment does not score, so they link to no measure and are never
 * suggested automatically: a coach or athlete adds them to a plan by choice.
 */

import type { DrillDefinition, DrillRequirement, WorkbookDrillSource } from '@/lib/assessment/catalog/drills';
import { METRIC_FLAWS, requireFlaw } from '@/lib/assessment/catalog/flaws';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import {
  MASTER_WORKBOOK,
  MASTER_WORKBOOK_COACH_REVIEWED,
  withMasterNames,
  type MasterCategory,
  type MasterDrill,
} from '@/lib/assessment/hitting-workbook/master';
import { PILLAR_KEYS, type PillarKey } from '@/lib/assessment/types';

/** Measures each body area works on, before flaw links are added. */
const CATEGORY_FINDINGS: Readonly<Record<MasterCategory, readonly string[]>> = {
  'Top hand / back arm': ['hit_barrel_delivery_consistency', 'hit_contact_location_consistency'],
  'Front leg': ['hit_stride_direction_repeatability', 'hit_balance_through_swing', 'hit_lower_body_consistency'],
  'Rear leg': ['hit_load_repeatability', 'hit_lower_body_consistency'],
  Posture: ['hit_balance_through_swing', 'hit_contact_location_consistency'],
  'Balance / head control': ['hit_balance_through_swing'],
  'Medicine ball': [],
};

/** Medicine-ball throws, including the one listed with the rear-leg drills. */
export const MEDICINE_BALL_DRILLS: readonly string[] = [
  'MW30',
  ...MASTER_WORKBOOK.drills.filter((item) => item.category === 'Medicine ball').map((item) => item.sourceId),
];
/** Pitch-recognition and swing/take tasks: decisions, which the assessment does not score. */
export const RECOGNITION_DRILLS: readonly string[] = ['MW55', 'MW56', 'MW57'];

/** Drills that need a tosser (they cannot be done off a tee). */
const NEEDS_PARTNER: readonly string[] = ['MW02', 'MW55', 'MW56', 'MW57'];
/** Drills whose whole point is reviewing video. */
const NEEDS_VIDEO: readonly string[] = ['MW10', 'MW20', 'MW29', 'MW31', 'MW34', 'MW44', 'MW52', 'MW54'];
/** Drills the workbook says need a coach: supervision, a coach-selected ball, or a coach running the counts. */
const NEEDS_COACH: readonly string[] = ['MW19', 'MW27', 'MW32', 'MW46', ...MEDICINE_BALL_DRILLS];

const SAFETY = MASTER_WORKBOOK.quickKey.find((item) => item.label === 'Safety and video')?.text ?? '';
const MEDICINE_BALL_SAFETY = MASTER_WORKBOOK.quickKey.find((item) => item.label === 'Medicine-ball kit')?.text ?? '';

const DECISIONS_REASSESSMENT =
  'Swing decisions are not scored in the assessment. Count them in a 9-Zone Hitting decision round and compare comparable rounds.';
const MEDICINE_BALL_REASSESSMENT =
  'Medicine-ball throws are not scored in the assessment. Compare normal swings before and after the throws, with the same camera view.';

function flawFindings(sourceId: string): string[] {
  return Object.entries(METRIC_FLAWS)
    .filter(([, flaws]) => flaws.some((id) => requireFlaw(id).drills.includes(sourceId)))
    .map(([metricKey]) => metricKey);
}

function findingsFor(item: MasterDrill): string[] {
  if (MEDICINE_BALL_DRILLS.includes(item.sourceId) || RECOGNITION_DRILLS.includes(item.sourceId)) return [];
  const own = CATEGORY_FINDINGS[item.category];
  const linked = flawFindings(item.sourceId);
  return Object.keys(METRIC_FLAWS).filter((key) => own.includes(key) || linked.includes(key));
}

function pillarsOf(findings: readonly string[]): PillarKey[] {
  const used = new Set(findings.map((key) => requireMetric(key).pillar));
  return PILLAR_KEYS.filter((key) => used.has(key));
}

function reassessmentFor(item: MasterDrill, findings: readonly string[]): string {
  if (RECOGNITION_DRILLS.includes(item.sourceId)) return DECISIONS_REASSESSMENT;
  if (MEDICINE_BALL_DRILLS.includes(item.sourceId)) return MEDICINE_BALL_REASSESSMENT;
  return `${findings.map((key) => requireMetric(key).name).join('; ')} (same camera view and drill).`;
}

/** "Tee, light bat, soft balls, net; close hand-view camera if available." → ["tee", "light bat", …]. */
function splitEquipment(value: string): string[] {
  return value
    .replace(/\.$/, '')
    .split(/[,;]\s*(?![^()]*\))/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => (index === 0 && /^[A-Z][a-z]/.test(part) ? part.charAt(0).toLowerCase() + part.slice(1) : part));
}

function requirementsFor(sourceId: string): DrillRequirement[] {
  const out: DrillRequirement[] = [];
  if (NEEDS_PARTNER.includes(sourceId)) out.push('partner');
  if (NEEDS_VIDEO.includes(sourceId)) out.push('video');
  if (NEEDS_COACH.includes(sourceId)) out.push('coach');
  return out;
}

function fromMaster(item: MasterDrill): DrillDefinition {
  const findings = findingsFor(item);
  const steps = item.steps.map(withMasterNames);
  const medicineBall = MEDICINE_BALL_DRILLS.includes(item.sourceId);
  const source: WorkbookDrillSource = {
    sourceId: item.sourceId,
    kind: 'drill',
    book: 'master',
    coachReviewed: MASTER_WORKBOOK_COACH_REVIEWED,
    section: medicineBall ? 'Medicine ball' : item.category,
    level: null,
    mistake: null,
    correction: null,
    safety: medicineBall ? MEDICINE_BALL_SAFETY : SAFETY,
    related: item.related ? withMasterNames(item.related) : null,
    filming: {
      views: item.filming.views,
      phase: item.filming.phase,
      review: withMasterNames(item.filming.review),
      feedback: item.filming.feedback,
      limits: withMasterNames(item.filming.limits),
    },
    sourceSheet: item.sourceSheet,
    sourceRow: item.sourceRow,
  };
  return {
    key: workbookDrillKey(item.sourceId),
    version: 1,
    discipline: 'hitting',
    name: item.name,
    pillars: pillarsOf(findings),
    findings,
    purpose: item.objective,
    equipment: splitEquipment(item.equipment),
    requires: requirementsFor(item.sourceId),
    setup: '',
    steps,
    cues: [],
    // The last step carries the workbook's round size ("Complete 6–10 reps, then five normal two-hand swings.").
    dosage: (steps[steps.length - 1] ?? '').slice(0, 200),
    regression: '',
    progression: '',
    completion: '',
    reassessment: reassessmentFor(item, findings),
    workbook: source,
  };
}

export const MASTER_DRILLS: readonly DrillDefinition[] = MASTER_WORKBOOK.drills.map(fromMaster);
