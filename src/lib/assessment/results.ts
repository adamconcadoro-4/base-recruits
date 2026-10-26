/**
 * Result shapes shared by the database (private.assessment_results) and the
 * TypeScript engine. Field names are snake_case because they are stored in
 * frozen report snapshots as JSON.
 */

import type {
  DeviceKind,
  EntryMethod,
  EvidenceCategory,
  MetricStatus,
  PillarKey,
  PillarStatus,
  PitchType,
  ResultEvidence,
  ScoringMethod,
  SourceKind,
  TargetKind,
} from '@/lib/assessment/types';

export type ResultStatistic = 'rating' | 'median' | 'rate' | 'sd' | 'cv';

export interface ResultTarget {
  readonly id: string;
  readonly kind: TargetKind;
  readonly value_a: number;
  readonly value_b: number;
  readonly value_c: number | null;
  readonly source: string;
}

export interface ResultPercentile {
  readonly release_id: string;
  readonly dataset_version: string;
  readonly reference_count: number;
  readonly value: number;
}

export interface MetricResult {
  readonly metric_key: string;
  readonly metric_version: number;
  readonly pillar: PillarKey;
  /** Null for metrics that are not split by pitch type, and for the all-pitches row of a rate. */
  readonly pitch_type: PitchType | null;
  readonly status: MetricStatus;
  readonly statistic: ResultStatistic;
  /** The typical value: the rating, median, rate, standard deviation or coefficient of variation. */
  readonly value: number | null;
  /** Highest valid value, only for metrics that show a peak. Never used as the typical value. */
  readonly peak: number | null;
  readonly valid_count: number;
  readonly excluded_count: number;
  readonly min_count: number;
  /** Evidence category of the result itself ("derived_calculation" for derived metrics). */
  readonly evidence: readonly ResultEvidence[];
  /** Evidence categories of the inputs to a derived calculation; empty otherwise. */
  readonly input_evidence: readonly EvidenceCategory[];
  readonly entry_methods: readonly EntryMethod[];
  readonly source_kinds: readonly SourceKind[];
  readonly device_kinds: readonly DeviceKind[];
  readonly devices: readonly string[];
  /** How many of the inputs a development coach reviewed, and how many were marked limited. */
  readonly reviewed_count: number;
  readonly limited_count: number;
  readonly method: ScoringMethod;
  readonly score: number | null;
  readonly target: ResultTarget | null;
  readonly percentile: ResultPercentile | null;
  /** Observation ids the result was calculated from. */
  readonly inputs: readonly string[];
}

export type ExclusionReason = 'not_collected' | 'insufficient' | 'unable_to_assess' | 'mixed_devices' | 'not_scored';

export interface PillarContribution {
  readonly metric_key: string;
  readonly weight: number;
  readonly score: number;
  readonly evidence: readonly ResultEvidence[];
  readonly source_kinds: readonly SourceKind[];
}

export interface PillarResult {
  readonly pillar: PillarKey;
  readonly status: PillarStatus;
  /** Shown only when status is "complete". */
  readonly score: number | null;
  readonly required: readonly string[];
  readonly missing_required: readonly string[];
  readonly included: readonly PillarContribution[];
  readonly excluded: ReadonlyArray<{ readonly metric_key: string; readonly reason: ExclusionReason }>;
}

export interface AssessmentResults {
  readonly calculation_version: string;
  readonly metrics: readonly MetricResult[];
  readonly pillars: readonly PillarResult[];
}
