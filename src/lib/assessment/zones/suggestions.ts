/**
 * Review prompts for the next session, from repeated evidence only. A zone is
 * considered only with at least MIN_ZONE_SAMPLE scored strike swings, and the
 * prompt says what it is based on, the drill from the workbook, the stage to
 * work at, one cue and how to reassess. The thresholds are prompts for the
 * coach's review, not validated standards, and nothing here changes a stage
 * or a score by itself.
 */

import { drillsForZone, zoneDefinition, type ZoneDrill } from '@/lib/assessment/zones/content';
import type { MetricResult, ZoneSummary } from '@/lib/assessment/zones/metrics';
import type { ZoneId } from '@/lib/assessment/zones/types';

/** Fewest scored strike swings in a zone before it can be named in a prompt. */
export const MIN_ZONE_SAMPLE = 8;
/** Fewest scored decisions before a decision prompt. */
export const MIN_DECISION_SAMPLE = 10;
/** Rates below these (percent) prompt a review. Planning choices, not standards. */
export const REVIEW_BELOW = 50;
export const SIMPLIFY_BELOW = 30;

export interface ZonePrompt {
  readonly zone: ZoneId | null;
  readonly finding: string;
  readonly sample: number;
  readonly drill: ZoneDrill | null;
  /** Stage to work at next: the current stage, or one lower when results were far below. */
  readonly suggestedStage: number;
  readonly cue: string;
  readonly reassessment: string;
}

const REASSESS =
  'Repeat a comparable round — same stage, delivery source, assignment and batting side — and compare the counts, not single swings.';

function rateText(result: MetricResult): string {
  return `${result.numerator} of ${result.denominator} (${result.value}%)`;
}

function pickDrill(zone: ZoneId, decision: boolean): ZoneDrill | null {
  const drills = drillsForZone(zone);
  if (decision) return drills.find((drill) => drill.name.toLowerCase().includes('chase')) ?? drills[0] ?? null;
  return drills.find((drill) => drill.level === 'Tee') ?? drills[0] ?? null;
}

/**
 * Up to two zone prompts (the workbook works on two priority zones at a time)
 * and at most one decision prompt.
 */
export function zonePrompts(
  summary: ZoneSummary,
  currentStage: (zone: ZoneId) => number,
  focusZone: ZoneId | null,
): readonly ZonePrompt[] {
  const candidates: Array<{ zone: ZoneId; result: MetricResult; label: string }> = [];
  for (const breakdown of summary.byZone) {
    for (const [label, result] of [
      ['Correct depth', breakdown.pitch.depth],
      ['Strike contact', breakdown.pitch.strike_contact],
    ] as const) {
      if (result.denominator >= MIN_ZONE_SAMPLE && result.value !== null && result.value < REVIEW_BELOW) {
        candidates.push({ zone: breakdown.zone, result, label });
      }
    }
  }
  candidates.sort((a, b) => (a.result.value ?? 0) - (b.result.value ?? 0));
  const prompts: ZonePrompt[] = [];
  for (const candidate of candidates) {
    if (prompts.length >= 2) break;
    if (prompts.some((prompt) => prompt.zone === candidate.zone)) continue;
    const stage = currentStage(candidate.zone);
    prompts.push({
      zone: candidate.zone,
      finding: `${candidate.label} on Zone ${candidate.zone} strike swings: ${rateText(candidate.result)}.`,
      sample: candidate.result.denominator,
      drill: pickDrill(candidate.zone, false),
      suggestedStage: (candidate.result.value ?? 0) < SIMPLIFY_BELOW ? Math.max(1, stage - 1) : stage,
      cue: zoneDefinition(candidate.zone).cue,
      reassessment: REASSESS,
    });
  }
  const decision = summary.pitch.decision;
  if (decision.denominator >= MIN_DECISION_SAMPLE && decision.value !== null && decision.value < REVIEW_BELOW + 10 && focusZone) {
    prompts.push({
      zone: focusZone,
      finding: `Decisions: ${rateText(decision)} correct; chase ${summary.pitch.chase.value === null ? 'N/A' : rateText(summary.pitch.chase)}.`,
      sample: decision.denominator,
      drill: pickDrill(focusZone, true),
      suggestedStage: currentStage(focusZone),
      cue: 'Swing at the assigned strikes; take everything else.',
      reassessment: REASSESS,
    });
  }
  return prompts;
}
