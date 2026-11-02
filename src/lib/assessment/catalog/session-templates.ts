/**
 * Ready-made hitting sessions. A plan can start from one: its drills become
 * the plan's drills, in the session's order, and the plan keeps the template
 * so it can show the whole session (warm-up or preparation and retest
 * included).
 *
 * Two kinds:
 * - Sessions S2, S3, S5, S6 and S7 from the Hitting Development Workbook
 *   (decision F39), timed in minutes. Only sessions built entirely from the
 *   drill library are offered: S1 uses a youth game, and S4 and S8 use that
 *   workbook's medicine-ball work, none of which is imported.
 * - The six stages of the Hitting Master Workbook's paired progression, ST1–
 *   ST6 (decision F56), counted in reps: a rear-leg, a front-leg and an
 *   upper-body drill, each four drill reps then four normal swings, between a
 *   six-swing baseline and a six-swing exit check. Each stage offers one
 *   optional focus block (posture, balance/head control or medicine ball);
 *   a plan takes at most one of them.
 */

import { drill, type DrillDefinition } from '@/lib/assessment/catalog/drills';
import { workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import {
  HITTING_WORKBOOK,
  siteText,
  withWorkbookNames,
  type WorkbookSession,
  type WorkbookWarmupActivity,
  type WorkbookWarmupRoutine,
} from '@/lib/assessment/hitting-workbook/content';
import { MASTER_WORKBOOK, withMasterNames, type FocusSlot, type MasterStage, type StageSlot } from '@/lib/assessment/hitting-workbook/master';

/** The six progression stages, in order. */
export const STAGE_IDS = ['ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6'] as const;
/** Kept in step with the check on assessment_training_plans.session_template. */
export const SESSION_TEMPLATE_IDS = ['S2', 'S3', 'S5', 'S6', 'S7', ...STAGE_IDS] as const;
export type SessionTemplateId = (typeof SESSION_TEMPLATE_IDS)[number];

export interface SessionBlock {
  readonly label: string;
  /** Minutes for a timed session; null for a progression stage, which is counted in reps. */
  readonly minutes: number | null;
  /** Reps for a progression stage ("4 drill reps, then 4 normal swings"); null for a timed session. */
  readonly dose: string | null;
  /** The block as written, with ids spelled out as names. */
  readonly activity: string;
  readonly focus: string;
  /** Library drills in this block, in order (none for warm-up, retest and review blocks). */
  readonly drills: readonly DrillDefinition[];
  /** The warm-up routine this block uses, if any. */
  readonly warmup: WarmupRoutine | null;
}

export interface WarmupRoutine {
  readonly id: string;
  readonly name: string;
  readonly time: string;
  readonly note: string;
  /** Activities in order; "WU04/WU05" offers a choice and becomes one step. */
  readonly steps: ReadonlyArray<{ readonly activities: readonly WorkbookWarmupActivity[]; readonly detail: string }>;
}

export interface FocusOption {
  readonly slot: FocusSlot;
  /** "Posture", "Balance and head control" or "Medicine ball". */
  readonly label: string;
  readonly drill: DrillDefinition;
  readonly dose: string;
  readonly run: string;
}

export interface StageDetails {
  readonly number: number;
  readonly goal: string;
  /** The one cue to say during normal swings. */
  readonly cue: string;
  readonly kit: string;
  readonly normalSwings: string;
  readonly exit: string;
  /** What to do if the hitter is not ready (or, at the last stage, is ready). */
  readonly next: string;
  /** Choose at most one. */
  readonly focusOptions: readonly FocusOption[];
}

export interface SessionTemplate {
  readonly id: SessionTemplateId;
  readonly kind: 'session' | 'stage';
  readonly name: string;
  /** Sum of the blocks' minutes for a timed session; null for a stage. */
  readonly totalMinutes: number | null;
  /** "about 30 minutes" or, for a stage, the workbook's planning allowance. */
  readonly length: string;
  readonly blocks: readonly SessionBlock[];
  /** Each library drill once, in session order (a stage's optional focus drills are not included). */
  readonly drills: readonly DrillDefinition[];
  /** Set for a progression stage. */
  readonly stage: StageDetails | null;
  readonly sourceRow: number;
}

export interface TemplateAssignment {
  readonly drill: DrillDefinition;
  readonly block: SessionBlock;
  readonly dosage: string;
  readonly reason: string;
}

// The workbook's readiness check points at its Readiness Log, which is not imported; the
// parents' guide states the same check in words.
const ACTIVITY_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [[/^Readiness Log check; /, 'Readiness check (no pain, not exhausted); then ']];

function siteActivity(text: string): string {
  return withWorkbookNames(ACTIVITY_REWRITES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), siteText(text)));
}

const activities = new Map(HITTING_WORKBOOK.warmupActivities.map((item) => [item.sourceId, item]));

function warmupRoutine(item: WorkbookWarmupRoutine): WarmupRoutine {
  const steps = item.sequence.split(/\s*→\s*/).map((part) => {
    const ids = part.match(/WU\d{2}/g) ?? [];
    const detail = part.replace(/^[\sWU\d/]+/, '').trim();
    return { activities: ids.map((id) => activities.get(id)).filter((found): found is WorkbookWarmupActivity => Boolean(found)), detail };
  });
  return { id: item.sourceId, name: item.name, time: item.time, note: item.note, steps };
}

const routines = new Map(HITTING_WORKBOOK.warmupRoutines.map((item) => [item.sourceId, warmupRoutine(item)]));

function block(item: WorkbookSession['blocks'][number]): SessionBlock {
  const ids = item.ids.match(/\b(?:WR\d|[HR]\d{2})\b/g) ?? [];
  const drills = ids
    .filter((id) => !id.startsWith('WR'))
    .map((id) => drill(workbookDrillKey(id)))
    .filter((found): found is DrillDefinition => Boolean(found));
  const warmupId = ids.find((id) => id.startsWith('WR'));
  return {
    label: item.label,
    minutes: item.minutes,
    dose: null,
    activity: siteActivity(item.activity),
    focus: item.focus,
    drills,
    warmup: warmupId ? (routines.get(warmupId) ?? null) : null,
  };
}

function template(source: WorkbookSession): SessionTemplate {
  const blocks = source.blocks.map(block);
  const drills: DrillDefinition[] = [];
  for (const item of blocks.flatMap((entry) => entry.drills)) if (!drills.includes(item)) drills.push(item);
  const totalMinutes = blocks.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
  return {
    id: source.sourceId as SessionTemplateId,
    kind: 'session',
    name: source.name,
    totalMinutes,
    length: `about ${totalMinutes} minutes`,
    blocks,
    drills,
    stage: null,
    sourceRow: source.sourceRow,
  };
}

const SLOT_LABELS: Readonly<Record<StageSlot, string>> = { rear: 'Rear-leg block', front: 'Front-leg block', upper: 'Upper-body block' };
const FOCUS_LABELS: Readonly<Record<FocusSlot, string>> = { P: 'Posture', B: 'Balance and head control', M: 'Medicine ball' };

/**
 * "4 + 4" → "4 drill reps, then 4 normal swings" (the workbook's shared key). A focus block counts task reps (dry
 * rehearsals and takes count); a medicine-ball block counts throws in total, not per side.
 */
function repDose(value: string, unit = 'drill reps'): string {
  const match = value.match(/^(\d+) \+ (\d+)$/);
  return match ? `${match[1]} ${unit}, then ${match[2]} normal swings` : value;
}

function requireDrill(sourceId: string): DrillDefinition {
  const found = drill(workbookDrillKey(sourceId));
  if (!found) throw new Error(`Drill ${sourceId} is missing from the library`);
  return found;
}

const structure = new Map(MASTER_WORKBOOK.structure.map((item) => [item.block, item]));
function structureRow(block: string): { dose: string; task: string } {
  const found = structure.get(block);
  if (!found) throw new Error(`Session structure block ${block} is missing from the master workbook content`);
  return found;
}

const STAGE_LENGTH = (() => {
  const text = MASTER_WORKBOOK.howToUse.find((item) => item.label === 'Session length')?.text ?? '';
  const range = text.match(/(\d+–\d+) minutes/);
  return range ? `about ${range[1]} minutes` : 'length varies';
})();

function stageTemplate(source: MasterStage): SessionTemplate {
  const plain = (block: string, activity: string, focus: string): SessionBlock => ({
    label: block,
    minutes: null,
    dose: structureRow(block).dose,
    activity,
    focus,
    drills: [],
    warmup: null,
  });
  const drillBlocks: SessionBlock[] = source.blocks.map((item) => {
    const entry = requireDrill(item.drill);
    return {
      label: SLOT_LABELS[item.slot],
      minutes: null,
      dose: repDose(item.dose),
      activity: `${entry.name}: ${withMasterNames(item.run)}`,
      focus: `Watch for ${item.watch.charAt(0).toLowerCase()}${item.watch.slice(1)}`,
      drills: [entry],
      warmup: null,
    };
  });
  const blocks: SessionBlock[] = [
    plain('Preparation', structureRow('Preparation').task, ''),
    plain('Baseline', structureRow('Baseline').task, source.normalSwings),
    ...drillBlocks,
    plain('Exit check', structureRow('Exit check').task, withMasterNames(source.exit)),
    plain('Review', withMasterNames(structureRow('Review').task), withMasterNames(source.next)),
  ];
  return {
    id: source.id as SessionTemplateId,
    kind: 'stage',
    name: source.name,
    totalMinutes: null,
    length: STAGE_LENGTH,
    blocks,
    drills: drillBlocks.flatMap((item) => item.drills),
    stage: {
      number: source.number,
      goal: source.goal,
      cue: source.cue,
      kit: source.kit,
      normalSwings: source.normalSwings,
      exit: withMasterNames(source.exit),
      next: withMasterNames(source.next),
      focusOptions: source.focus.map((item) => ({
        slot: item.slot,
        label: FOCUS_LABELS[item.slot],
        drill: requireDrill(item.drill),
        dose: repDose(item.dose, item.slot === 'M' ? 'throws in total' : 'task reps'),
        run: withMasterNames(item.run),
      })),
    },
    sourceRow: source.sourceRow,
  };
}

export const SESSION_TEMPLATES: readonly SessionTemplate[] = SESSION_TEMPLATE_IDS.map((id) => {
  const stage = MASTER_WORKBOOK.stages.find((item) => item.id === id);
  if (stage) return stageTemplate(stage);
  const source = HITTING_WORKBOOK.sessions.find((item) => item.sourceId === id);
  if (!source) throw new Error(`Session template ${id} is missing from the workbook content`);
  return template(source);
});

/** The Development Workbook's timed sessions. */
export const WORKBOOK_SESSIONS: readonly SessionTemplate[] = SESSION_TEMPLATES.filter((item) => item.kind === 'session');
/** The Master Workbook's six progression stages, in order. */
export const PROGRESSION_STAGES: readonly SessionTemplate[] = SESSION_TEMPLATES.filter((item) => item.kind === 'stage');

export function isSessionTemplateId(value: unknown): value is SessionTemplateId {
  return typeof value === 'string' && (SESSION_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function sessionTemplate(id: string | null | undefined): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((item) => item.id === id);
}

/** "S2 · Bailout / Landing Technical (about 30 minutes)" or "Stage 1 · Gather, Land, Deliver (about 30–40 minutes)" */
export function sessionTitle(item: SessionTemplate): string {
  if (item.stage) return `Stage ${item.stage.number} · ${item.name} (${item.length})`;
  return `${item.id} · ${item.name} (${item.length})`;
}

const sentence = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** The plan drills a session starts with: each drill once, with its block's minutes (or a stage block's reps) as the dosage. */
export function templateAssignments(item: SessionTemplate): TemplateAssignment[] {
  if (item.stage) {
    const stage = item.stage;
    return item.blocks
      .filter((block) => block.drills.length > 0)
      .map((block) => ({
        drill: block.drills[0] as DrillDefinition,
        block,
        dosage: `${block.label}: ${block.dose}. ${block.activity}`.slice(0, 200),
        reason: `From Stage ${stage.number} (${item.name}), ${block.label.toLowerCase()}. ${sentence(block.focus)}`.slice(0, 600),
      }));
  }
  return item.drills.map((entry) => {
    const home = item.blocks.find((candidate) => candidate.drills.includes(entry)) as SessionBlock;
    return {
      drill: entry,
      block: home,
      dosage: `${home.label} block, about ${home.minutes} min: ${home.activity}`.slice(0, 200),
      reason: `From session ${item.id} (${item.name}), ${home.label.toLowerCase()} block. Coach focus: ${sentence(home.focus)}`.slice(0, 600),
    };
  });
}

/** A stage's optional focus drills as plan drills, left unticked: the plan takes at most one. */
export function focusAssignments(item: SessionTemplate): Array<TemplateAssignment & { readonly option: FocusOption }> {
  const stage = item.stage;
  if (!stage) return [];
  return stage.focusOptions.map((option) => {
    const block: SessionBlock = {
      label: `Optional ${option.label.toLowerCase()} focus`,
      minutes: null,
      dose: option.dose,
      activity: `${option.drill.name}: ${option.run}`,
      focus: 'Choose at most one focus block per session.',
      drills: [option.drill],
      warmup: null,
    };
    return {
      option,
      drill: option.drill,
      block,
      dosage: `Optional ${option.label.toLowerCase()} focus, before the rear-leg block: ${option.dose}. ${option.run}`.slice(0, 200),
      reason: `From Stage ${stage.number} (${item.name}), optional ${option.label.toLowerCase()} focus. At most one focus block per session.`.slice(0, 600),
    };
  });
}

/** Why a set of chosen drills breaks a stage's rule of at most one focus block, or null. */
export function focusProblem(item: SessionTemplate | undefined, drillKeys: readonly string[]): string | null {
  if (!item?.stage) return null;
  const chosen = item.stage.focusOptions.filter((option) => drillKeys.includes(option.drill.key));
  return chosen.length > 1 ? 'Choose at most one optional focus block (posture, balance or medicine ball) for a stage.' : null;
}
