/**
 * Hitting Development Workbook content, version 1, imported from
 * data/hitting-workbook/Baseball_Hitting_Development_Workbook.xlsx by
 * scripts/hitting-workbook/extract.py. Only the hitting drills (H01–H40), the
 * rehearsals (R01–R07) and the swing-flaw guide (T01–T18) are imported. Every
 * record keeps its source sheet and row.
 *
 * Base Recruits wrote the workbook, and its hitting coaches reviewed the
 * drills and targets (decision F38). Limitations carried with the content:
 * drill names were rewritten and outside organisations' names and links
 * removed at the founder's request; the workbook rests on common coaching
 * practice, so nothing here is presented as a sourced fact; round sizes,
 * success targets and drill pairings are coaching targets, not validated
 * standards.
 */

import raw from '@/lib/assessment/hitting-workbook/content-v1.json';

export interface WorkbookDrill {
  /** The workbook's own id, e.g. "H07". */
  readonly sourceId: string;
  readonly section: string;
  readonly name: string;
  readonly level: string;
  readonly purpose: string;
  readonly equipment: string;
  readonly setup: string;
  readonly steps: readonly string[];
  readonly cue: string;
  readonly suggestedRound: string;
  readonly mistake: string;
  readonly correction: string;
  readonly easier: string;
  readonly progression: string;
  readonly success: string;
  readonly safety: string;
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export interface WorkbookRehearsal {
  readonly sourceId: string;
  readonly name: string;
  readonly purpose: string;
  readonly equipment: string;
  readonly how: string;
  readonly cue: string;
  /** Hitting drills this rehearsal leads into. */
  readonly feedsInto: readonly string[];
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export interface WorkbookFlaw {
  /** The workbook's own id, e.g. "T03". */
  readonly sourceId: string;
  readonly issue: string;
  readonly whatYouSee: string;
  /** How to tell the possible causes apart before choosing a drill. */
  readonly checks: string;
  readonly contributors: string;
  /** Drill and rehearsal ids in the workbook's order of preference. */
  readonly drills: readonly string[];
  readonly cue: string;
  readonly avoid: string;
  readonly progressMarker: string;
  readonly retest: string;
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export interface WorkbookContent {
  readonly version: string;
  readonly source: { readonly file: string; readonly sha256: string; readonly sheets: readonly string[] };
  readonly drills: readonly WorkbookDrill[];
  readonly rehearsals: readonly WorkbookRehearsal[];
  readonly flaws: readonly WorkbookFlaw[];
  readonly workflow: ReadonlyArray<{ readonly step: number; readonly label: string; readonly action: string; readonly sourceRow: number }>;
  readonly limitations: readonly string[];
}

export const HITTING_WORKBOOK = raw as unknown as WorkbookContent;

const names = new Map<string, string>([
  ...HITTING_WORKBOOK.drills.map((item) => [item.sourceId, item.name] as const),
  ...HITTING_WORKBOOK.rehearsals.map((item) => [item.sourceId, item.name] as const),
  ...HITTING_WORKBOOK.flaws.map((item) => [item.sourceId, item.issue] as const),
]);

/** The workbook's own log sheets do not exist on the site; its text refers to them by name. */
export function siteText(text: string): string {
  return text.replace(/\(Video Log\)/g, '(your video notes)').replace(/\bin Video Log\b/g, 'in your video notes');
}

/** The drill, rehearsal or flaw name for a workbook id ("H07" → "Full Strike-Zone Tee Map"). */
export function workbookName(sourceId: string): string | undefined {
  return names.get(sourceId);
}

const escaped = [...names.values()].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const idPattern = new RegExp(`\\b([HRT]\\d{2})\\b(?: (${escaped.join('|')}))?`, 'g');

/**
 * Spells out workbook ids (drills, rehearsals, flaws) in running text so readers on the site see names:
 * "H27; H32." → "Mixed-Location Read Toss (H27); Single-Zone Hunt (H32)."
 * An id already followed by its own name keeps that name once.
 */
export function withWorkbookNames(text: string): string {
  return text.replace(idPattern, (match, id: string, following: string | undefined) => {
    const name = names.get(id);
    if (!name) return match;
    if (!following || following === name) return `${name} (${id})`;
    return `${name} (${id}) ${following}`;
  });
}
