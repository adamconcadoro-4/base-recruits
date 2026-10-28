/**
 * Ready-made hitting sessions from the Hitting Development Workbook (decision
 * F39). A plan can start from one: its drills become the plan's drills, in
 * the session's order, with each block's minutes as the starting dosage, and
 * the plan keeps the template so it can show the whole session (warm-up and
 * retest included).
 *
 * Only sessions built entirely from the drill library are offered. S1 uses a
 * youth game, and S4 and S8 use medicine-ball work, none of which is
 * imported, so they are left out.
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

/** Kept in step with the check on assessment_training_plans.session_template. */
export const SESSION_TEMPLATE_IDS = ['S2', 'S3', 'S5', 'S6', 'S7'] as const;
export type SessionTemplateId = (typeof SESSION_TEMPLATE_IDS)[number];

export interface SessionBlock {
  readonly label: string;
  readonly minutes: number;
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

export interface SessionTemplate {
  readonly id: SessionTemplateId;
  readonly name: string;
  readonly totalMinutes: number;
  readonly blocks: readonly SessionBlock[];
  /** Each library drill once, in session order. */
  readonly drills: readonly DrillDefinition[];
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
  return {
    id: source.sourceId as SessionTemplateId,
    name: source.name,
    totalMinutes: blocks.reduce((sum, item) => sum + item.minutes, 0),
    blocks,
    drills,
    sourceRow: source.sourceRow,
  };
}

export const SESSION_TEMPLATES: readonly SessionTemplate[] = SESSION_TEMPLATE_IDS.map((id) => {
  const source = HITTING_WORKBOOK.sessions.find((item) => item.sourceId === id);
  if (!source) throw new Error(`Session template ${id} is missing from the workbook content`);
  return template(source);
});

export function isSessionTemplateId(value: unknown): value is SessionTemplateId {
  return typeof value === 'string' && (SESSION_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function sessionTemplate(id: string | null | undefined): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((item) => item.id === id);
}

/** "S2 · Bailout / Landing Technical (about 30 minutes)" */
export function sessionTitle(item: SessionTemplate): string {
  return `${item.id} · ${item.name} (about ${item.totalMinutes} minutes)`;
}

const sentence = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** The plan drills a session starts with: each drill once, with its block's minutes as the dosage. */
export function templateAssignments(item: SessionTemplate): TemplateAssignment[] {
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
