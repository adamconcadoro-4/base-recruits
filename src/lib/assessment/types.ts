/**
 * Base Recruits Assessment — shared vocabulary.
 *
 * Every value list here mirrors a CHECK constraint or column domain in the
 * assessment migrations; tests/contract/assessment-catalog.test.ts keeps the
 * two identical. Framework-free: no React, Next.js or Supabase imports.
 */

export const DISCIPLINES = ['hitting', 'pitching'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/**
 * Assessment modes describe how much evidence an assessment can contain.
 * `lab` is modelled for external motion-capture and force data but cannot be
 * started: nothing in this release imports or validates lab data.
 */
export const ASSESSMENT_MODES = ['video_coach', 'instrumented', 'lab'] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];
export const SELECTABLE_MODES = ['video_coach', 'instrumented'] as const satisfies readonly AssessmentMode[];

export const HITTING_PILLARS = ['load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output'] as const;
export const PITCHING_PILLARS = ['lower_body_delivery', 'movement_timing', 'arm_delivery', 'pitch_performance'] as const;
export const PILLAR_KEYS = [...HITTING_PILLARS, ...PITCHING_PILLARS] as const;
export type PillarKey = (typeof PILLAR_KEYS)[number];

/** How a stored observation was obtained. "Derived" and "Unavailable" exist only in results. */
export const EVIDENCE_CATEGORIES = ['sensor_measurement', 'video_estimate', 'observation'] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];
export type ResultEvidence = EvidenceCategory | 'derived_calculation';

/** How a value entered the application. Direct device connections are not built yet. */
export const ENTRY_METHODS = ['manual_entry', 'file_import', 'device_connection', 'in_app_review'] as const;
export type EntryMethod = (typeof ENTRY_METHODS)[number];

/** Reviewable quality of one observation. These are reasons-backed states, never accuracy probabilities. */
export const QUALITY_STATES = ['not_reviewed', 'usable', 'limited', 'excluded', 'unable_to_assess'] as const;
export type QualityState = (typeof QUALITY_STATES)[number];
/** States that count toward results. */
export const ELIGIBLE_QUALITY_STATES: readonly QualityState[] = ['not_reviewed', 'usable', 'limited'];

/** Who entered an observation: the athlete's side (athlete or linked family) or the athlete's development coach. */
export const SOURCE_KINDS = ['self', 'development_coach'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const ASSESSMENT_STATUSES = ['draft', 'ready_for_review', 'reviewed', 'published'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const REVIEW_KINDS = ['self_assessed', 'coach_reviewed'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVISION_STATUSES = ['current', 'superseded'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const PITCH_TYPES = [
  'four_seam',
  'two_seam',
  'sinker',
  'cutter',
  'slider',
  'sweeper',
  'curveball',
  'changeup',
  'splitter',
  'knuckleball',
  'other',
] as const;
export type PitchType = (typeof PITCH_TYPES)[number];

export const DEVICE_KINDS = ['radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const TARGET_KINDS = ['higher_is_better', 'lower_is_better', 'target_range'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Canonical units stored in the database. Imports may arrive in other units (see units.ts). */
export const CANONICAL_UNITS = ['rating', 'ms', 'mph', 'deg', 'rpm', 'in', 'percent', 'yes_no'] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

export const METRIC_STATUSES = ['ok', 'insufficient', 'not_collected', 'unable_to_assess', 'mixed_devices'] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

export const PILLAR_STATUSES = ['complete', 'incomplete', 'descriptive', 'no_data'] as const;
export type PillarStatus = (typeof PILLAR_STATUSES)[number];

export const SCORING_METHODS = ['rubric', 'target', 'descriptive'] as const;
export type ScoringMethod = (typeof SCORING_METHODS)[number];

export const PLAN_STATUSES = ['active', 'completed'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_APPROVALS = ['self_directed', 'coach_approved'] as const;
export type PlanApproval = (typeof PLAN_APPROVALS)[number];

export const MEDIA_STATUSES = ['pending', 'uploaded', 'removed'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const TIMING_BASES = ['real_time', 'slow_motion', 'unknown'] as const;
export type TimingBasis = (typeof TIMING_BASES)[number];

/** The relation that lets a signed-in person work on an athlete's assessments. */
export const ASSESSMENT_RELATIONS = ['athlete', 'guardian', 'development_coach'] as const;
export type AssessmentRelation = (typeof ASSESSMENT_RELATIONS)[number];

/** Version of the result calculation (summary statistics, scoring and pillar aggregation). */
export const CALCULATION_VERSION = 'calc-v1';
/** Shape version of a frozen report snapshot. */
export const SNAPSHOT_SCHEMA = 'assessment-report-v1';

export function isDiscipline(value: unknown): value is Discipline {
  return typeof value === 'string' && (DISCIPLINES as readonly string[]).includes(value);
}

export function isPitchType(value: unknown): value is PitchType {
  return typeof value === 'string' && (PITCH_TYPES as readonly string[]).includes(value);
}

export function pillarsFor(discipline: Discipline): readonly PillarKey[] {
  return discipline === 'hitting' ? HITTING_PILLARS : PITCHING_PILLARS;
}
