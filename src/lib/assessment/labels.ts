/**
 * Plain-language labels for evidence, quality, status and review states.
 * "No data" must never read like poor performance, so missing results use
 * neutral wording and never a number.
 */

import type { ExclusionReason, MetricResult } from '@/lib/assessment/results';
import type {
  AssessmentRelation,
  AssessmentStatus,
  EntryMethod,
  MetricStatus,
  PillarStatus,
  QualityState,
  ResultEvidence,
  ReviewKind,
  SourceKind,
} from '@/lib/assessment/types';

export const EVIDENCE_LABELS: Readonly<Record<ResultEvidence | 'unavailable', string>> = {
  sensor_measurement: 'Sensor measurement',
  video_estimate: 'Video estimate',
  observation: 'Observation',
  derived_calculation: 'Derived calculation',
  unavailable: 'Unavailable',
};

export const ENTRY_METHOD_LABELS: Readonly<Record<EntryMethod, string>> = {
  manual_entry: 'Entered by hand',
  file_import: 'Imported from a file',
  device_connection: 'Direct device connection',
  in_app_review: 'Marked in the Film Room',
};

export const QUALITY_LABELS: Readonly<Record<QualityState, string>> = {
  not_reviewed: 'Not reviewed',
  usable: 'Usable',
  limited: 'Limited',
  excluded: 'Excluded',
  unable_to_assess: 'Unable to assess',
};

export const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  self: 'Self-assessed',
  development_coach: 'Development coach',
};

export const STATUS_LABELS: Readonly<Record<AssessmentStatus, string>> = {
  draft: 'Draft',
  ready_for_review: 'Ready for coach review',
  reviewed: 'Reviewed by coach',
  published: 'Published',
};

export const REVIEW_LABELS: Readonly<Record<ReviewKind, string>> = {
  self_assessed: 'Self-assessment report',
  coach_reviewed: 'Coach-reviewed report',
};

export const RELATION_LABELS: Readonly<Record<AssessmentRelation, string>> = {
  athlete: 'You',
  guardian: 'Linked parent or guardian',
  development_coach: 'Development coach',
};

export const METRIC_STATUS_LABELS: Readonly<Record<MetricStatus, string>> = {
  ok: 'Enough evidence',
  insufficient: 'Not enough valid evidence yet',
  not_collected: 'Not collected',
  unable_to_assess: 'Unable to assess',
  mixed_devices: 'Values from different devices — not combined',
};

export const PILLAR_STATUS_LABELS: Readonly<Record<PillarStatus, string>> = {
  complete: 'Complete',
  incomplete: 'Incomplete — required evidence missing',
  descriptive: 'Described, not scored',
  no_data: 'No data yet',
};

export const EXCLUSION_LABELS: Readonly<Record<ExclusionReason, string>> = {
  not_collected: 'Not collected',
  insufficient: 'Not enough valid evidence',
  unable_to_assess: 'Unable to assess',
  mixed_devices: 'Different devices, not combined',
  not_scored: 'Described, not scored (no rubric or coach target)',
};

/**
 * The evidence label for one result, naming who observed it: "Coach
 * observation", "Self-assessed observation", "Sensor measurement (entered by
 * hand)" and so on.
 */
export function evidenceLabel(result: Pick<MetricResult, 'evidence' | 'source_kinds' | 'entry_methods' | 'status'>): string {
  if (result.evidence.length === 0) return EVIDENCE_LABELS.unavailable;
  const parts = result.evidence.map((category) => {
    if (category === 'observation') {
      const coach = result.source_kinds.includes('development_coach');
      const self = result.source_kinds.includes('self');
      if (coach && self) return 'Coach and self-assessed observations';
      return coach ? 'Coach observation' : 'Self-assessed observation';
    }
    return EVIDENCE_LABELS[category];
  });
  const methods = result.entry_methods.map((method) => ENTRY_METHOD_LABELS[method].toLowerCase());
  const manualSensor = result.evidence.includes('sensor_measurement') && result.entry_methods.includes('manual_entry');
  const label = parts.join(' · ');
  if (manualSensor || (result.evidence.includes('sensor_measurement') && methods.length > 0)) {
    return `${label} (${methods.join(', ')})`;
  }
  return label;
}

/** Whether a reviewer label can say "coach-reviewed": only a development coach can review. */
export function scoreLabel(method: 'rubric' | 'target' | 'descriptive', sourceKinds: readonly SourceKind[]): string {
  if (method === 'rubric') {
    return sourceKinds.includes('development_coach') ? 'Rubric score (coach)' : 'Rubric score (self-assessed)';
  }
  if (method === 'target') return 'Target attainment';
  return 'Not scored';
}
