/**
 * Hitting Master Workbook content, version 1, imported from
 * data/hitting-workbook/Baseball_Hitting_Master_Workbook.xlsx by
 * scripts/hitting-workbook/extract_master.py (decision F55). Imported: the
 * 69-drill library sorted by body area, with each drill's filming and
 * video-review notes; the six coach stage cards of the paired practice
 * progression; and the progression's session structure, advancement rules,
 * workload adjustments, pairing substitutions, focus alternatives and
 * medicine-ball rules. Every record keeps its source sheet and row.
 *
 * The workbook arrived with branded drill names and outside sources. At the
 * founder's request (2026-11-02) every drill has a generic Base Recruits name
 * and every outside organisation's name, link and source reference was removed
 * before import. The workbook's own numbers (#1–#69) become ids MW01–MW69 on
 * the site. Rep counts, pairings and the 4-of-6 advancement rule are coaching
 * proposals, not validated standards, and the video-review notes describe
 * what to look for on film, not a validated measurement.
 */

import raw from '@/lib/assessment/hitting-workbook/master-v1.json';

/**
 * Whether Base Recruits hitting coaches have reviewed this workbook. Until they
 * have, drill pages say so and SeamState marks its suggestions from it as not
 * coach-reviewed. Change to true (with a decision note) once they have.
 */
export const MASTER_WORKBOOK_COACH_REVIEWED = false;

export const MASTER_CATEGORIES = ['Top hand / back arm', 'Front leg', 'Rear leg', 'Posture', 'Balance / head control', 'Medicine ball'] as const;
export type MasterCategory = (typeof MASTER_CATEGORIES)[number];

export interface MasterFilming {
  /** Camera views and the body points to watch. */
  readonly views: string;
  /** Which part of the movement to review. */
  readonly phase: string;
  /** What to look for on video, and what is not a fault. */
  readonly review: string;
  /** An example of the feedback a coach might give after review. */
  readonly feedback: string;
  /** What video cannot tell you about this drill. */
  readonly limits: string;
}

export interface MasterDrill {
  /** "MW22" */
  readonly sourceId: string;
  /** The workbook's own number, 1–69. */
  readonly number: number;
  readonly category: MasterCategory;
  readonly name: string;
  /** Other drills this one builds on, as written ("#30 Rotational Medicine-Ball Throw"), or null. */
  readonly related: string | null;
  readonly objective: string;
  readonly equipment: string;
  readonly steps: readonly string[];
  readonly filming: MasterFilming;
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export type StageSlot = 'rear' | 'front' | 'upper';
export type FocusSlot = 'P' | 'B' | 'M';

export interface MasterStage {
  /** "ST1" */
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly goal: string;
  /** The one integration cue to say during normal swings. */
  readonly cue: string;
  readonly kit: string;
  /** How the baseline, transfer and exit swings are set up. */
  readonly normalSwings: string;
  readonly blocks: ReadonlyArray<{ readonly slot: StageSlot; readonly drill: string; readonly dose: string; readonly run: string; readonly watch: string; readonly sourceRow: number }>;
  /** Optional focus: posture (P), balance/head control (B) or medicine ball (M). At most one per session. */
  readonly focus: ReadonlyArray<{ readonly slot: FocusSlot; readonly drill: string; readonly dose: string; readonly run: string; readonly sourceRow: number }>;
  readonly exit: string;
  /** "If not ready: …" or, for the last stage, "If ready: …". */
  readonly next: string;
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

export interface LabelledText {
  readonly label: string;
  readonly text: string;
  readonly sourceRow: number;
}

export interface MasterWorkbookContent {
  readonly version: string;
  readonly source: { readonly file: string; readonly sha256: string; readonly sheets: readonly string[] };
  readonly drills: readonly MasterDrill[];
  readonly quickKey: readonly LabelledText[];
  readonly stages: readonly MasterStage[];
  readonly decisions: ReadonlyArray<{ readonly text: string; readonly sourceRow: number }>;
  readonly howToUse: readonly LabelledText[];
  readonly equipment: readonly LabelledText[];
  /** Preparation, baseline, the three drill blocks, exit check and review. */
  readonly structure: ReadonlyArray<{ readonly block: string; readonly dose: string; readonly task: string; readonly sourceRow: number }>;
  readonly advancement: readonly LabelledText[];
  readonly adjustments: ReadonlyArray<{ readonly situation: string; readonly adjustment: string; readonly check: string; readonly sourceRow: number }>;
  readonly substitutions: ReadonlyArray<{
    readonly pattern: string;
    readonly rear: string;
    readonly front: string;
    readonly upper: string;
    readonly caution: string;
    readonly sourceRow: number;
  }>;
  readonly focusAlternatives: readonly LabelledText[];
  readonly medicineBall: readonly LabelledText[];
  readonly limitations: readonly string[];
}

export const MASTER_WORKBOOK = raw as unknown as MasterWorkbookContent;

export function masterId(number: number | string): string {
  return `MW${String(number).padStart(2, '0')}`;
}

const byNumber = new Map(MASTER_WORKBOOK.drills.map((item) => [item.number, item]));
const byId = new Map(MASTER_WORKBOOK.drills.map((item) => [item.sourceId, item]));

export function masterDrill(sourceId: string): MasterDrill | undefined {
  return byId.get(sourceId);
}

const escaped = MASTER_WORKBOOK.drills
  .map((item) => item.name)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const reference = new RegExp(`(?:#|\\bdrill )(\\d{1,2})(?:–(\\d{1,2}))?(?: (${escaped.join('|')}))?`, 'g');

/**
 * Spells out the workbook's drill numbers in running text so readers see names and site ids:
 * "#22 Rear-Hip Hinge Pause, or #24" → "Rear-Hip Hinge Pause (MW22), or Step-Back Tee Swings (MW24)";
 * "#38–40" → "MW38–MW40"; "substitute drill 26" → "substitute Rear-Leg Balance Start (MW26)".
 */
export function withMasterNames(text: string): string {
  return text.replace(reference, (match, first: string, last: string | undefined, following: string | undefined) => {
    if (last) return `${masterId(first)}–${masterId(last)}`;
    const item = byNumber.get(Number(first));
    if (!item) return match;
    if (!following || following === item.name) return `${item.name} (${item.sourceId})`;
    return `${item.name} (${item.sourceId}) ${following}`;
  });
}
