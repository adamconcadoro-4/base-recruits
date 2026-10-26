/**
 * Rules-based development priorities and drill suggestions.
 *
 * Deterministic and explainable: findings come only from scored results with
 * enough valid evidence, and every suggestion says which finding produced it,
 * what to practise and how the next assessment will check it. No language
 * model is involved. Suggestions are self-directed until a development coach
 * approves a plan.
 */

import { drillsFor, type DrillDefinition, type DrillRequirement } from '@/lib/assessment/catalog/drills';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import type { MetricResult } from '@/lib/assessment/results';
import type { Discipline, PillarKey, PitchType, ResultEvidence, ScoringMethod, SourceKind } from '@/lib/assessment/types';

/** At most this many primary focus areas in one development block. */
export const MAX_FOCUS_AREAS = 3;
/** At most this many drills suggested for one focus area. */
export const MAX_DRILLS_PER_FOCUS = 2;

export type FindingSeverity = 'priority' | 'watch';

export interface Finding {
  readonly metricKey: string;
  readonly pillar: PillarKey;
  readonly pitchType: PitchType | null;
  readonly severity: FindingSeverity;
  readonly method: ScoringMethod;
  readonly score: number;
  /** The rating or summary value behind the score. */
  readonly value: number;
  readonly evidence: readonly ResultEvidence[];
  readonly sourceKinds: readonly SourceKind[];
  /** 1 (weakest) to 3 (strongest): self-observed < video estimate or derived < coach-observed or measured; limited inputs lower it. */
  readonly evidenceStrength: number;
  /** One sentence describing the finding with its evidence. */
  readonly summary: string;
}

function evidenceStrength(result: MetricResult): number {
  let strength = 1;
  if (result.evidence.includes('sensor_measurement')) strength = 3;
  else if (result.evidence.includes('observation') && result.source_kinds.includes('development_coach')) strength = 3;
  else if (result.evidence.includes('video_estimate') || result.evidence.includes('derived_calculation')) strength = 2;
  if (result.limited_count > 0) strength -= 1;
  return Math.max(1, strength);
}

function whoObserved(result: MetricResult): string {
  if (result.method === 'rubric') {
    return result.source_kinds.includes('development_coach') ? 'by your development coach' : 'in your self-assessment';
  }
  return '';
}

function describe(result: MetricResult, severity: FindingSeverity): string {
  const definition = requireMetric(result.metric_key);
  const name = result.pitch_type ? `${definition.name} (${PITCH_TYPE_LABELS[result.pitch_type]})` : definition.name;
  const value = result.value ?? 0;
  const score = result.score ?? 0;
  if (result.method === 'rubric') {
    return `${name} was rated ${value} of 5 ${whoObserved(result)} (rubric score ${score}).`;
  }
  const level = severity === 'priority' ? 'well short of' : 'short of';
  return `${name} is ${level} the target your coach set (target attainment ${score} of 100, from ${result.valid_count} valid repetitions).`;
}

/** Findings from scored results: rubric ratings of 1–2 (priority) or 3 (watch); target attainment below 50 (priority) or 50–74 (watch). */
export function findingsFrom(results: readonly MetricResult[]): Finding[] {
  const findings: Finding[] = [];
  results.forEach((result) => {
    if (result.status !== 'ok' || result.score === null || result.value === null) return;
    let severity: FindingSeverity | null = null;
    if (result.method === 'rubric') {
      if (result.value <= 2) severity = 'priority';
      else if (result.value === 3) severity = 'watch';
    } else if (result.method === 'target') {
      if (result.score < 50) severity = 'priority';
      else if (result.score < 75) severity = 'watch';
    }
    if (!severity) return;
    findings.push({
      metricKey: result.metric_key,
      pillar: result.pillar,
      pitchType: result.pitch_type,
      severity,
      method: result.method,
      score: result.score,
      value: result.value,
      evidence: result.evidence,
      sourceKinds: result.source_kinds,
      evidenceStrength: evidenceStrength(result),
      summary: describe(result, severity),
    });
  });
  const order = new Map(results.map((result, index) => [`${result.metric_key}:${result.pitch_type ?? ''}`, index]));
  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'priority' ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    if (a.evidenceStrength !== b.evidenceStrength) return b.evidenceStrength - a.evidenceStrength;
    return (order.get(`${a.metricKey}:${a.pitchType ?? ''}`) ?? 0) - (order.get(`${b.metricKey}:${b.pitchType ?? ''}`) ?? 0);
  });
}

export interface PlanPreferences {
  /** Metrics the coach or athlete wants addressed first (in order). */
  readonly priorityMetrics?: readonly string[];
  /** What the athlete has available; drills needing something missing are skipped. */
  readonly available?: Readonly<Partial<Record<DrillRequirement, boolean>>>;
  readonly maxFocusAreas?: number;
}

export interface DrillSuggestion {
  readonly drill: DrillDefinition;
  readonly finding: Finding;
  /** Why it was suggested, naming the finding and its evidence. */
  readonly reason: string;
  /** How progress will be checked. */
  readonly evaluation: string;
}

export interface PlanSuggestion {
  readonly focus: readonly Finding[];
  readonly suggestions: readonly DrillSuggestion[];
  /** Findings left for a later block so this one stays focused. */
  readonly deferred: readonly Finding[];
}

/**
 * Chooses up to three focus areas (preferring different pillars and any
 * priorities the coach or athlete named) and up to two drills for each.
 */
export function suggestPlan(discipline: Discipline, results: readonly MetricResult[], preferences: PlanPreferences = {}): PlanSuggestion {
  const maxFocus = Math.min(preferences.maxFocusAreas ?? MAX_FOCUS_AREAS, MAX_FOCUS_AREAS);
  const priority = preferences.priorityMetrics ?? [];
  const all = findingsFrom(results).sort((a, b) => {
    const pa = priority.indexOf(a.metricKey);
    const pb = priority.indexOf(b.metricKey);
    if (pa !== pb) return (pa === -1 ? Number.MAX_SAFE_INTEGER : pa) - (pb === -1 ? Number.MAX_SAFE_INTEGER : pb);
    return 0;
  });

  // One finding per metric; then prefer spreading focus across pillars.
  const unique: Finding[] = [];
  for (const finding of all) {
    if (!unique.some((item) => item.metricKey === finding.metricKey)) unique.push(finding);
  }
  const focus: Finding[] = [];
  for (const finding of unique) {
    if (focus.length >= maxFocus) break;
    if (!focus.some((item) => item.pillar === finding.pillar)) focus.push(finding);
  }
  for (const finding of unique) {
    if (focus.length >= maxFocus) break;
    if (!focus.includes(finding)) focus.push(finding);
  }

  const available = preferences.available ?? {};
  const usable = (drill: DrillDefinition) => drill.requires.every((requirement) => available[requirement] !== false);
  const chosen = new Set<string>();
  const suggestions: DrillSuggestion[] = [];
  for (const finding of focus) {
    const candidates = drillsFor(discipline).filter(
      (drill) => drill.findings.includes(finding.metricKey) && usable(drill) && !chosen.has(drill.key),
    );
    for (const drill of candidates.slice(0, MAX_DRILLS_PER_FOCUS)) {
      chosen.add(drill.key);
      suggestions.push({
        drill,
        finding,
        reason: `Suggested because ${finding.summary.charAt(0).toLowerCase()}${finding.summary.slice(1)} This drill works on ${PILLARS[finding.pillar].name}: ${drill.purpose.charAt(0).toLowerCase()}${drill.purpose.slice(1)}`,
        evaluation: drill.reassessment,
      });
    }
  }

  return { focus, suggestions, deferred: unique.filter((finding) => !focus.includes(finding)) };
}

/** Evidence-supported strengths: rubric ratings of 4–5 or target attainment of 90 or more. */
export function strengthsFrom(results: readonly MetricResult[]): MetricResult[] {
  return results.filter(
    (result) =>
      result.status === 'ok' &&
      result.score !== null &&
      result.value !== null &&
      ((result.method === 'rubric' && result.value >= 4) || (result.method === 'target' && result.score >= 90)),
  );
}
