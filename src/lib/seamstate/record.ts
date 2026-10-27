/**
 * What gets saved for one analysis (public.seamstate_analyses and
 * public.seamstate_findings, through seamstate_worker_save_analysis).
 * Framework-free and deterministic, so the saved shape is tested directly.
 */

import type { DrillRequirement } from '@/lib/assessment/catalog/drills';
import { suggestDrills, DRILL_RULES_VERSION } from '@/lib/seamstate/drill-rules';
import type { EvidencePacket } from '@/lib/seamstate/packet';
import type { ValidationResult } from '@/lib/seamstate/validate';
import {
  EVIDENCE_POLICY_VERSION,
  INTERPRETATION_SCHEMA_VERSION,
  MECHANIC_CATALOG_VERSION,
  type ClipVerdict,
} from '@/lib/seamstate/types';

/** Why there are no AI findings, when there are none. */
export type InterpretationStatus =
  | 'interpreted'
  | 'not_needed' // no swing, a retake, or the hitter must be chosen first
  | 'not_configured' // the AI provider is not set up yet
  | 'declined' // the provider declined the request
  | 'malformed' // the provider's answer did not match the contract
  | 'provider_error';

export interface AnalysisRecord {
  readonly state: 'complete' | 'partial';
  readonly analysis: Record<string, unknown>;
  readonly findings: readonly Record<string, unknown>[];
}

/** Drills assume video only; a partner or radar is not assumed. */
export const DEFAULT_DRILL_EQUIPMENT: readonly DrillRequirement[] = ['video'];

export function analysisRecord(input: {
  readonly packet: EvidencePacket;
  readonly verdict: ClipVerdict;
  readonly reasons: readonly string[];
  readonly versions: Readonly<Record<string, string>>;
  readonly status: InterpretationStatus;
  readonly modelId: string | null;
  readonly validation: ValidationResult | null;
  readonly framesShown: readonly string[];
}): AnalysisRecord {
  const { packet, verdict, reasons, versions, status, modelId, validation, framesShown } = input;
  const validated = validation?.ok ? validation : null;
  const findings = (validated?.findings ?? []).map((finding, position) => ({
    position,
    mechanic_key: finding.mechanicKey,
    mechanic_version: finding.mechanicVersion,
    pillar: finding.pillar,
    category: finding.category,
    priority: finding.priority,
    swing_indexes: finding.swingIndexes,
    observation: finding.observation,
    interpretation: finding.interpretation,
    suggested_experiment: finding.suggestedExperiment,
    reassessment: finding.reassessment,
    cue: finding.cue,
    evidence_frame_ids: finding.evidenceFrameIds,
    limitations: finding.limitations,
    alternative_explanations: finding.alternativeExplanations,
    eligible_swing_count: finding.eligibleSwingCount,
    observed_swing_count: finding.observedSwingCount,
    evidence_grade: finding.evidenceGrade,
    evidence_grade_reasons: finding.evidenceGradeReasons,
    drill_suggestions: suggestDrills(finding, DEFAULT_DRILL_EQUIPMENT),
  }));
  const unableToAssess = validated?.unableToAssess ?? [];
  const complete = status === 'interpreted' && verdict === 'suitable' && unableToAssess.length === 0;
  return {
    state: complete || status === 'not_needed' ? 'complete' : 'partial',
    analysis: {
      clip_verdict: verdict,
      pipeline_version: versions.worker ?? 'unknown',
      catalog_version: MECHANIC_CATALOG_VERSION,
      policy_version: EVIDENCE_POLICY_VERSION,
      schema_version: INTERPRETATION_SCHEMA_VERSION,
      model_id: modelId,
      packet,
      result: {
        interpretation: status,
        verdictReasons: reasons,
        unableToAssess,
        eligibility: validated?.eligibility ?? [],
        swingContact: validated?.swingContact ?? [],
        rejected: validated?.rejected ?? [],
        malformedIssues: validation && !validation.ok ? validation.issues : [],
        framesShown,
        versions: { ...versions, drills: DRILL_RULES_VERSION },
      },
    },
    findings,
  };
}
