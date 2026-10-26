/**
 * The assessment results engine, calculation version calc-v1.
 *
 * Turns an assessment's observations into metric results and pillar results.
 * The database runs the same calculation (private.assessment_results) when a
 * report is previewed or published; the contract test feeds identical inputs
 * to both and requires identical output. This TypeScript version powers the
 * fictional sample report and unit tests.
 */

import { requireMetric, type MetricDefinition } from '@/lib/assessment/catalog/metrics';
import { protocolMetricsForPillar, type ProtocolDefinition } from '@/lib/assessment/catalog/protocols';
import type {
  AssessmentResults,
  ExclusionReason,
  MetricResult,
  PillarContribution,
  PillarResult,
  ResultPercentile,
  ResultStatistic,
  ResultTarget,
} from '@/lib/assessment/results';
import {
  coefficientOfVariation,
  median,
  percentileRank,
  rate,
  rubricScore,
  sampleStandardDeviation,
  targetFromStored,
  targetScore,
  weightedMean,
} from '@/lib/assessment/scoring';
import {
  CALCULATION_VERSION,
  ELIGIBLE_QUALITY_STATES,
  PITCH_TYPES,
  pillarsFor,
  type DeviceKind,
  type EntryMethod,
  type EvidenceCategory,
  type MetricStatus,
  type PitchType,
  type QualityState,
  type ResultEvidence,
  type ScoringMethod,
  type SourceKind,
  type TargetKind,
} from '@/lib/assessment/types';
import { round1, round3 } from '@/lib/assessment/units';

export interface EngineObservation {
  readonly id: string;
  readonly metric_key: string;
  readonly repetition_id: string | null;
  /** The repetition's pitch type (pitching only). */
  readonly pitch_type: PitchType | null;
  /** The repetition's status; null for assessment-level observations. */
  readonly repetition_status: 'valid' | 'excluded' | null;
  readonly value: number | null;
  readonly quality_state: QualityState;
  readonly evidence_category: EvidenceCategory;
  readonly entry_method: EntryMethod;
  readonly source_kind: SourceKind;
  readonly device_kind: DeviceKind | null;
  readonly device_label: string | null;
  readonly reviewed: boolean;
  /** ISO timestamp; the newest eligible rating wins within a source. */
  readonly updated_at: string;
}

export interface EngineTarget {
  readonly id: string;
  readonly metric_key: string;
  readonly pitch_type: PitchType | null;
  readonly kind: TargetKind;
  readonly value_a: number;
  readonly value_b: number;
  readonly value_c: number | null;
  readonly source: string;
}

/** An approved reference dataset already matched to this assessment's protocol and cohort. */
export interface EngineReference {
  readonly metric_key: string;
  readonly pitch_type: PitchType | null;
  readonly release_id: string;
  readonly dataset_version: string;
  readonly values: readonly number[];
}

export interface EngineInput {
  readonly protocol: ProtocolDefinition;
  readonly observations: readonly EngineObservation[];
  readonly targets: readonly EngineTarget[];
  readonly references: readonly EngineReference[];
}

const ELIGIBLE = new Set<QualityState>(ELIGIBLE_QUALITY_STATES);

export function normalizeDeviceLabel(label: string | null | undefined): string | null {
  const normalized = (label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === '' ? null : normalized;
}

function isEligible(observation: EngineObservation): boolean {
  return (
    observation.value !== null &&
    ELIGIBLE.has(observation.quality_state) &&
    (observation.repetition_id === null || observation.repetition_status === 'valid')
  );
}

const sortedUnique = <T extends string>(values: Iterable<T | null>): T[] =>
  [...new Set([...values].filter((value): value is T => value !== null))].sort();

function statisticFor(definition: MetricDefinition): ResultStatistic {
  switch (definition.aggregation) {
    case 'single':
      return 'rating';
    case 'median':
      return 'median';
    case 'rate':
      return 'rate';
    case 'sd':
      return 'sd';
    case 'cv':
      return 'cv';
  }
}

function pitchOrder(pitch: PitchType | null): number {
  return pitch === null ? -1 : PITCH_TYPES.indexOf(pitch);
}

interface Group {
  readonly pitch: PitchType | null;
  readonly observations: readonly EngineObservation[];
}

function groupsFor(definition: MetricDefinition, observations: readonly EngineObservation[]): Group[] {
  if (!definition.perPitchType) return [{ pitch: null, observations }];
  const byPitch = new Map<PitchType, EngineObservation[]>();
  for (const observation of observations) {
    if (observation.pitch_type === null) continue;
    const list = byPitch.get(observation.pitch_type) ?? [];
    list.push(observation);
    byPitch.set(observation.pitch_type, list);
  }
  const groups: Group[] = [...byPitch.entries()]
    .sort(([a], [b]) => pitchOrder(a) - pitchOrder(b))
    .map(([pitch, list]) => ({ pitch, observations: list }));
  // Rates also get an all-pitches row; velocity, spin and movement never mix pitch types.
  if (definition.aggregation === 'rate' || groups.length === 0) groups.unshift({ pitch: null, observations });
  return groups;
}

function findTarget(targets: readonly EngineTarget[], key: string, pitch: PitchType | null): ResultTarget | null {
  const match = targets.find((target) => target.metric_key === key && target.pitch_type === pitch);
  return match
    ? { id: match.id, kind: match.kind, value_a: match.value_a, value_b: match.value_b, value_c: match.value_c, source: match.source }
    : null;
}

function findPercentile(
  references: readonly EngineReference[],
  key: string,
  pitch: PitchType | null,
  value: number | null,
): ResultPercentile | null {
  if (value === null) return null;
  const reference = references.find((item) => item.metric_key === key && item.pitch_type === pitch);
  if (!reference || reference.values.length === 0) return null;
  return {
    release_id: reference.release_id,
    dataset_version: reference.dataset_version,
    reference_count: reference.values.length,
    value: percentileRank(value, reference.values),
  };
}

interface Summary {
  readonly status: MetricStatus;
  readonly value: number | null;
  readonly peak: number | null;
  readonly validCount: number;
  readonly excludedCount: number;
  readonly used: readonly EngineObservation[];
  readonly all: readonly EngineObservation[];
}

function summarizeRating(observations: readonly EngineObservation[]): Summary {
  if (observations.length === 0) {
    return { status: 'not_collected', value: null, peak: null, validCount: 0, excludedCount: 0, used: [], all: [] };
  }
  const eligible = observations.filter(isEligible);
  const chosen = [...eligible].sort((a, b) => {
    const source = (a.source_kind === 'development_coach' ? 0 : 1) - (b.source_kind === 'development_coach' ? 0 : 1);
    if (source !== 0) return source;
    if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  })[0];
  const excludedCount = observations.length - eligible.length;
  if (!chosen) {
    const unable = observations.some((item) => item.quality_state === 'unable_to_assess');
    return {
      status: unable ? 'unable_to_assess' : 'insufficient',
      value: null,
      peak: null,
      validCount: 0,
      excludedCount,
      used: [],
      all: observations,
    };
  }
  return {
    status: 'ok',
    value: chosen.value,
    peak: null,
    validCount: 1,
    excludedCount,
    used: [chosen],
    all: observations,
  };
}

function summarizeValues(
  definition: MetricDefinition,
  observations: readonly EngineObservation[],
  calculation: 'median' | 'rate' | 'sd' | 'cv',
): Summary {
  if (observations.length === 0) {
    return { status: 'not_collected', value: null, peak: null, validCount: 0, excludedCount: 0, used: [], all: [] };
  }
  const eligible = observations.filter(isEligible);
  const excludedCount = observations.length - eligible.length;
  const deviceSource = definition.derived ? requireMetric(definition.derived.from) : definition;
  if (deviceSource.requiresDevice && sortedUnique(eligible.map((item) => normalizeDeviceLabel(item.device_label))).length > 1) {
    return { status: 'mixed_devices', value: null, peak: null, validCount: eligible.length, excludedCount, used: eligible, all: observations };
  }
  const values = eligible.map((item) => item.value as number);
  let value: number | null;
  switch (calculation) {
    case 'median':
      value = median(values);
      break;
    case 'rate':
      value = rate(values);
      break;
    case 'sd':
      value = sampleStandardDeviation(values);
      break;
    case 'cv':
      value = coefficientOfVariation(values);
      break;
  }
  const peak = definition.hasPeak && values.length > 0 ? Math.max(...values) : null;
  const status: MetricStatus = eligible.length >= definition.minValidCount && value !== null ? 'ok' : 'insufficient';
  return {
    status,
    value: value === null ? null : round3(value),
    peak: peak === null ? null : round3(peak),
    validCount: eligible.length,
    excludedCount,
    used: eligible,
    all: observations,
  };
}

function metricRows(definition: MetricDefinition, input: EngineInput, version: number): MetricResult[] {
  const sourceKey = definition.derived ? definition.derived.from : definition.key;
  const observations = input.observations.filter((item) => item.metric_key === sourceKey);
  const statistic = statisticFor(definition);
  const rows: MetricResult[] = [];

  for (const group of groupsFor(definition, observations)) {
    const summary =
      definition.aggregation === 'single'
        ? summarizeRating(group.observations)
        : summarizeValues(definition, group.observations, definition.aggregation);

    const target = definition.scoring === 'targetable' ? findTarget(input.targets, definition.key, group.pitch) : null;
    let method: ScoringMethod = 'descriptive';
    let score: number | null = null;
    if (definition.scoring === 'rubric') {
      method = 'rubric';
      if (summary.status === 'ok' && summary.value !== null) score = rubricScore(summary.value);
    } else if (target) {
      method = 'target';
      if (summary.status === 'ok' && summary.value !== null) score = targetScore(summary.value, targetFromStored(target));
    }

    const evidence: ResultEvidence[] = definition.derived
      ? summary.all.length > 0
        ? ['derived_calculation']
        : []
      : sortedUnique(summary.used.map((item) => item.evidence_category));
    rows.push({
      metric_key: definition.key,
      metric_version: version,
      pillar: definition.pillar,
      pitch_type: group.pitch,
      status: summary.status,
      statistic,
      value: summary.status === 'mixed_devices' ? null : summary.value,
      peak: summary.status === 'mixed_devices' ? null : summary.peak,
      valid_count: summary.validCount,
      excluded_count: summary.excludedCount,
      min_count: definition.minValidCount,
      evidence,
      input_evidence: definition.derived ? sortedUnique(summary.used.map((item) => item.evidence_category)) : [],
      entry_methods: sortedUnique(summary.used.map((item) => item.entry_method)),
      source_kinds: sortedUnique(summary.used.map((item) => item.source_kind)),
      device_kinds: sortedUnique(summary.used.map((item) => item.device_kind)),
      devices: sortedUnique(summary.used.map((item) => normalizeDeviceLabel(item.device_label))),
      reviewed_count: summary.used.filter((item) => item.reviewed).length,
      limited_count: summary.used.filter((item) => item.quality_state === 'limited').length,
      method,
      score: score === null ? null : round1(score),
      target,
      percentile:
        definition.scoring === 'rubric' || summary.status !== 'ok'
          ? null
          : findPercentile(input.references, definition.key, group.pitch, summary.value),
      inputs: summary.used.map((item) => item.id).sort(),
    });
  }
  return rows;
}

/** One metric's contribution to its pillar: the all-pitches row if scored, else the mean of scored pitch-type rows. */
function contributionScore(rows: readonly MetricResult[]): number | null {
  const combined = rows.find((row) => row.pitch_type === null);
  if (combined && combined.score !== null) return combined.score;
  const scored = rows.filter((row) => row.pitch_type !== null && row.score !== null).map((row) => row.score as number);
  if (scored.length === 0) return null;
  return round1(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

function exclusionReason(rows: readonly MetricResult[]): ExclusionReason {
  const statuses = new Set(rows.map((row) => row.status));
  if (statuses.has('ok')) return 'not_scored';
  if (statuses.has('mixed_devices')) return 'mixed_devices';
  if (statuses.has('insufficient')) return 'insufficient';
  if (statuses.has('unable_to_assess')) return 'unable_to_assess';
  return 'not_collected';
}

export function computeAssessmentResults(input: EngineInput): AssessmentResults {
  const metrics: MetricResult[] = [];
  for (const item of input.protocol.metrics) {
    metrics.push(...metricRows(requireMetric(item.key), input, item.version));
  }

  const pillars: PillarResult[] = pillarsFor(input.protocol.discipline).map((pillarKey) => {
    const pillarMetrics = protocolMetricsForPillar(input.protocol, pillarKey);
    const required = pillarMetrics.filter((item) => item.required).map((item) => item.key);
    const rowsFor = (key: string) => metrics.filter((row) => row.metric_key === key);
    const missingRequired = required.filter((key) => !rowsFor(key).some((row) => row.status === 'ok'));
    const included: PillarContribution[] = [];
    const excluded: Array<{ metric_key: string; reason: ExclusionReason }> = [];
    for (const item of pillarMetrics) {
      const rows = rowsFor(item.key);
      const score = contributionScore(rows);
      if (score === null) {
        excluded.push({ metric_key: item.key, reason: exclusionReason(rows) });
      } else {
        const scoredRows = rows.filter((row) => row.score !== null);
        included.push({
          metric_key: item.key,
          weight: item.weight,
          score,
          evidence: sortedUnique(scoredRows.flatMap((row) => row.evidence)),
          source_kinds: sortedUnique(scoredRows.flatMap((row) => row.source_kinds)),
        });
      }
    }
    const anyData = pillarMetrics.some((item) => rowsFor(item.key).some((row) => row.status !== 'not_collected'));
    let status: PillarResult['status'];
    if (!anyData) status = 'no_data';
    else if (missingRequired.length > 0) status = 'incomplete';
    else if (included.length === 0) status = 'descriptive';
    else status = 'complete';
    return {
      pillar: pillarKey,
      status,
      score: status === 'complete' ? weightedMean(included) : null,
      required,
      missing_required: missingRequired,
      included,
      excluded,
    };
  });

  return { calculation_version: CALCULATION_VERSION, metrics, pillars };
}
