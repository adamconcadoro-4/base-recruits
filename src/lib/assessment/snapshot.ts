/**
 * Frozen report snapshots. A published report revision stores everything it
 * shows: the assessment context, the review, the results with their inputs,
 * targets and versions. Correcting an observation later never changes it; a
 * new revision is published instead.
 *
 * The database builds snapshots (private.assessment_snapshot); this module
 * describes their shape and checks it when reading one back.
 */

import type {
  AgeBand,
  BattingSide,
  CameraView,
  CompetitionLevel,
  DrillType,
  Environment,
  ThrowingHand,
} from '@/lib/assessment/catalog/context';
import type { AssessmentResults } from '@/lib/assessment/results';
import {
  SNAPSHOT_SCHEMA,
  type AssessmentMode,
  type Discipline,
  type PitchType,
  type ReviewKind,
  type TimingBasis,
} from '@/lib/assessment/types';

export interface SnapshotAssessment {
  readonly id: string;
  readonly athlete_id: string;
  readonly athlete_name: string | null;
  readonly discipline: Discipline;
  readonly mode: AssessmentMode;
  readonly protocol_key: string;
  readonly protocol_version: number;
  readonly assessment_date: string;
  readonly age_band: AgeBand;
  readonly competition_level: CompetitionLevel | null;
  readonly bats: BattingSide | null;
  readonly throws: ThrowingHand | null;
  readonly drill_type: DrillType | null;
  readonly equipment: string | null;
  readonly bat_details: string | null;
  readonly camera_views: readonly CameraView[];
  readonly environment: Environment | null;
  readonly surface: string | null;
  readonly capture_limitations: string | null;
  readonly notes: string | null;
  readonly rep_goal: number;
  readonly repetitions: {
    readonly total: number;
    readonly valid: number;
    readonly excluded: number;
    readonly by_pitch_type: ReadonlyArray<{ readonly pitch_type: PitchType; readonly valid: number }>;
  };
  readonly baseline_assessment_id: string | null;
  readonly reassessment_of_id: string | null;
  readonly reassessment_due_on: string | null;
}

export interface SnapshotReview {
  readonly kind: ReviewKind;
  readonly reviewer_id: string | null;
  readonly reviewer_name: string | null;
  readonly published_by: string;
  readonly published_by_name: string | null;
  readonly published_at: string;
  readonly revision: number;
  readonly note: string | null;
}

export interface SnapshotClip {
  readonly id: string;
  readonly label: string | null;
  readonly camera_view: CameraView | null;
  readonly timing_basis: TimingBasis;
}

export interface ReportSnapshot {
  readonly schema: typeof SNAPSHOT_SCHEMA;
  readonly assessment: SnapshotAssessment;
  /** Null in a preview (nothing has been published yet). */
  readonly review: SnapshotReview | null;
  readonly results: AssessmentResults;
  readonly clips: readonly SnapshotClip[];
  /** True only when at least one approved reference dataset matched a metric in this report. */
  readonly benchmarks_available: boolean;
  /** Present only on the fictional sample report. */
  readonly fictional?: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the shape of a snapshot read from the database (or a preview) and
 * returns it typed, or null if it is not a v1 report snapshot.
 */
export function parseSnapshot(value: unknown): ReportSnapshot | null {
  if (!isRecord(value) || value.schema !== SNAPSHOT_SCHEMA) return null;
  const { assessment, results, clips } = value;
  if (!isRecord(assessment) || typeof assessment.id !== 'string' || typeof assessment.discipline !== 'string') return null;
  if (!isRecord(results) || !Array.isArray(results.metrics) || !Array.isArray(results.pillars)) return null;
  if (!Array.isArray(clips)) return null;
  if (value.review !== null && !isRecord(value.review)) return null;
  return value as unknown as ReportSnapshot;
}
