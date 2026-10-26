import 'server-only';

import { cache } from 'react';

import { parseSnapshot, type ReportSnapshot } from '@/lib/assessment/snapshot';
import type {
  AssessmentMode,
  AssessmentRelation,
  AssessmentStatus,
  Discipline,
  DeviceKind,
  EntryMethod,
  EvidenceCategory,
  MediaStatus,
  PitchType,
  PlanApproval,
  PlanStatus,
  QualityState,
  ReviewKind,
  RevisionStatus,
  SourceKind,
  TargetKind,
  TimingBasis,
} from '@/lib/assessment/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Reads for the Assessment pages. Every query runs as the signed-in person,
 * so row-level security decides what comes back; nothing here widens access.
 */

export interface AthleteOption {
  readonly athlete_id: string;
  readonly athlete_name: string | null;
  readonly relation: AssessmentRelation;
}

export interface AssessmentRow {
  readonly id: string;
  readonly athlete_id: string;
  readonly discipline: Discipline;
  readonly mode: AssessmentMode;
  readonly protocol_key: string;
  readonly protocol_version: number;
  readonly status: AssessmentStatus;
  readonly assessment_date: string;
  readonly age_band: string;
  readonly competition_level: string | null;
  readonly bats: string | null;
  readonly throws: string | null;
  readonly drill_type: string | null;
  readonly equipment: string | null;
  readonly bat_details: string | null;
  readonly camera_views: readonly string[];
  readonly environment: string | null;
  readonly surface: string | null;
  readonly capture_limitations: string | null;
  readonly notes: string | null;
  readonly rep_goal: number;
  readonly baseline_assessment_id: string | null;
  readonly reassessment_of_id: string | null;
  readonly reassessment_due_on: string | null;
  readonly draft_version: number;
  readonly current_revision_id: string | null;
  readonly last_reopen_reason: string | null;
  readonly review_requested_at: string | null;
  readonly reviewed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RepetitionRow {
  readonly id: string;
  readonly seq: number;
  readonly pitch_type: PitchType | null;
  readonly status: 'valid' | 'excluded';
  readonly exclusion_reason: string | null;
  readonly media_id: string | null;
  readonly clip_time_ms: number | null;
  readonly note: string | null;
}

export interface ObservationRow {
  readonly id: string;
  readonly repetition_id: string | null;
  readonly metric_key: string;
  readonly metric_version: number;
  readonly value: number | null;
  readonly unit: string;
  readonly source_value: number | null;
  readonly source_unit: string | null;
  readonly evidence_category: EvidenceCategory;
  readonly entry_method: EntryMethod;
  readonly source_kind: SourceKind;
  readonly quality_state: QualityState;
  readonly quality_reason: string | null;
  readonly device_kind: DeviceKind | null;
  readonly device_label: string | null;
  readonly media_id: string | null;
  readonly start_annotation_id: string | null;
  readonly end_annotation_id: string | null;
  readonly import_batch_id: string | null;
  readonly note: string | null;
  readonly reviewed_by: string | null;
  readonly updated_at: string;
}

export interface MediaRow {
  readonly id: string;
  readonly assessment_id: string;
  readonly athlete_id: string;
  readonly storage_path: string;
  readonly original_name: string | null;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly duration_ms: number | null;
  readonly camera_view: string | null;
  readonly timing_basis: TimingBasis;
  readonly slowdown_factor: number | null;
  readonly label: string | null;
  readonly status: MediaStatus;
  readonly created_at: string;
}

export interface AnnotationRow {
  readonly id: string;
  readonly media_id: string;
  readonly assessment_id: string;
  readonly repetition_id: string | null;
  readonly kind: 'event' | 'note' | 'drawing';
  readonly event_type: string | null;
  readonly time_ms: number;
  readonly note: string | null;
  readonly drawing: { shape: string; points: [[number, number], [number, number]]; color: string } | null;
  readonly author_id: string | null;
  readonly author_kind: SourceKind;
  readonly created_at: string;
}

export interface TargetRow {
  readonly id: string;
  readonly metric_key: string;
  readonly pitch_type: PitchType | null;
  readonly kind: TargetKind;
  readonly value_a: number;
  readonly value_b: number;
  readonly value_c: number | null;
  readonly source: string;
  readonly created_at: string;
}

export interface RevisionRow {
  readonly id: string;
  readonly assessment_id: string;
  readonly athlete_id: string;
  readonly revision: number;
  readonly status: RevisionStatus;
  readonly review_kind: ReviewKind;
  readonly published_at: string;
  readonly discipline: Discipline;
  readonly note: string | null;
  readonly snapshot: ReportSnapshot | null;
}

export interface PlanRow {
  readonly id: string;
  readonly athlete_id: string;
  readonly discipline: Discipline;
  readonly source_revision_id: string | null;
  readonly title: string;
  readonly status: PlanStatus;
  readonly approval: PlanApproval;
  readonly approved_at: string | null;
  readonly start_on: string;
  readonly review_on: string;
  readonly focus: ReadonlyArray<{ metric_key: string; pitch_type?: PitchType | null; summary?: string }>;
  readonly coach_notes: string | null;
  readonly revision: number;
  readonly created_at: string;
  readonly completed_at: string | null;
}

export interface AssignmentRow {
  readonly id: string;
  readonly plan_id: string;
  readonly position: number;
  readonly drill_key: string;
  readonly drill_version: number;
  readonly focus_metric_key: string | null;
  readonly reason: string;
  readonly dosage: string;
  readonly note: string | null;
  readonly status: 'active' | 'removed';
  readonly override_reason: string | null;
  readonly replaced_from: string | null;
}

export interface PlanRevisionRow {
  readonly id: string;
  readonly plan_id: string;
  readonly revision: number;
  readonly change: string;
  readonly reason: string | null;
  readonly approval: PlanApproval;
  readonly changed_by_kind: SourceKind;
  readonly created_at: string;
}

export interface TrainingLogRow {
  readonly id: string;
  readonly plan_id: string;
  readonly assignment_id: string;
  readonly completed_on: string;
  readonly sets_completed: number | null;
  readonly effort: number | null;
  readonly feedback: string | null;
  readonly media_id: string | null;
  readonly logged_by: string | null;
  readonly logger_kind: SourceKind;
  readonly created_at: string;
}

export interface CoachLinkRow {
  readonly link_id: string;
  readonly my_side: 'athlete' | 'coach' | 'guardian';
  readonly athlete_id: string;
  readonly athlete_name: string | null;
  readonly coach_id: string;
  readonly coach_name: string | null;
  readonly coach_email: string | null;
  readonly access: 'pending_athlete_approval' | 'awaiting_guardian' | 'active' | 'declined' | 'ended';
  readonly grant_id: string | null;
  readonly created_at: string;
  readonly approved_at: string | null;
}

/** Results of a read: rows, or a failure the page shows instead of an empty state. */
export interface Loaded<T> {
  readonly data: T;
  readonly failed: boolean;
}

const ASSESSMENT_COLUMNS =
  'id, athlete_id, discipline, mode, protocol_key, protocol_version, status, assessment_date, age_band, competition_level, bats, throws, drill_type, equipment, bat_details, camera_views, environment, surface, capture_limitations, notes, rep_goal, baseline_assessment_id, reassessment_of_id, reassessment_due_on, draft_version, current_revision_id, last_reopen_reason, review_requested_at, reviewed_at, created_at, updated_at';

export const getSwitches = cache(async (): Promise<{ enabled: boolean; video_enabled: boolean } | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('assessment_switches');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { enabled?: boolean; video_enabled?: boolean } | null;
  return { enabled: Boolean(row?.enabled), video_enabled: Boolean(row?.video_enabled) };
});

export const listAthletes = cache(async (): Promise<Loaded<AthleteOption[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('assessment_athletes');
  return { data: (data ?? []) as AthleteOption[], failed: Boolean(error) };
});

/** The athlete chosen by ?athlete=, else the first one the person can work on. */
export function chooseAthlete(options: readonly AthleteOption[], requested: string | undefined): AthleteOption | null {
  return options.find((option) => option.athlete_id === requested) ?? options[0] ?? null;
}

export async function listAssessments(athleteId: string): Promise<Loaded<AssessmentRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_COLUMNS)
    .eq('athlete_id', athleteId)
    .order('assessment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  return { data: (data ?? []) as unknown as AssessmentRow[], failed: Boolean(error) };
}

export const getAssessment = cache(async (id: string): Promise<AssessmentRow | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', id).maybeSingle();
  return (data ?? null) as unknown as AssessmentRow | null;
});

export async function getRepetitions(assessmentId: string): Promise<RepetitionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_repetitions')
    .select('id, seq, pitch_type, status, exclusion_reason, media_id, clip_time_ms, note')
    .eq('assessment_id', assessmentId)
    .order('seq');
  return (data ?? []) as RepetitionRow[];
}

export async function getObservations(assessmentId: string): Promise<ObservationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_observations')
    .select(
      'id, repetition_id, metric_key, metric_version, value, unit, source_value, source_unit, evidence_category, entry_method, source_kind, quality_state, quality_reason, device_kind, device_label, media_id, start_annotation_id, end_annotation_id, import_batch_id, note, reviewed_by, updated_at',
    )
    .eq('assessment_id', assessmentId)
    .order('metric_key');
  return ((data ?? []) as ObservationRow[]).map((row) => ({ ...row, value: row.value === null ? null : Number(row.value) }));
}

const MEDIA_COLUMNS =
  'id, assessment_id, athlete_id, storage_path, original_name, mime_type, byte_size, duration_ms, camera_view, timing_basis, slowdown_factor, label, status, created_at';

export async function getMediaForAssessment(assessmentId: string): Promise<MediaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_media')
    .select(MEDIA_COLUMNS)
    .eq('assessment_id', assessmentId)
    .neq('status', 'removed')
    .order('created_at');
  return (data ?? []) as MediaRow[];
}

export async function getMediaForAthlete(athleteId: string): Promise<MediaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_media')
    .select(MEDIA_COLUMNS)
    .eq('athlete_id', athleteId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as MediaRow[];
}

export async function getMedia(mediaId: string): Promise<MediaRow | null> {
  if (!isUuid(mediaId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('assessment_media').select(MEDIA_COLUMNS).eq('id', mediaId).maybeSingle();
  return (data ?? null) as MediaRow | null;
}

export async function getAnnotations(mediaId: string): Promise<AnnotationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_annotations')
    .select('id, media_id, assessment_id, repetition_id, kind, event_type, time_ms, note, drawing, author_id, author_kind, created_at')
    .eq('media_id', mediaId)
    .order('time_ms');
  return (data ?? []) as AnnotationRow[];
}

/** A short-lived playback link (15 minutes), created as the signed-in person under the storage policies. */
export async function playbackUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from('assessment-media').createSignedUrl(storagePath, 900);
  return error ? null : (data?.signedUrl ?? null);
}

export async function getTargets(athleteId: string): Promise<TargetRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_targets')
    .select('id, metric_key, pitch_type, kind, value_a, value_b, value_c, source, created_at')
    .eq('athlete_id', athleteId)
    .is('retired_at', null)
    .order('metric_key');
  return ((data ?? []) as TargetRow[]).map((row) => ({
    ...row,
    value_a: Number(row.value_a),
    value_b: Number(row.value_b),
    value_c: row.value_c === null ? null : Number(row.value_c),
  }));
}

const REVISION_COLUMNS = 'id, assessment_id, athlete_id, revision, status, review_kind, published_at, discipline, note, snapshot';

function withSnapshot(row: Record<string, unknown>): RevisionRow {
  return { ...(row as unknown as RevisionRow), snapshot: parseSnapshot(row.snapshot) };
}

export async function getRevisions(assessmentId: string): Promise<RevisionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_report_revisions')
    .select(REVISION_COLUMNS)
    .eq('assessment_id', assessmentId)
    .order('revision', { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(withSnapshot);
}

export async function getRevision(revisionId: string): Promise<RevisionRow | null> {
  if (!isUuid(revisionId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('assessment_report_revisions').select(REVISION_COLUMNS).eq('id', revisionId).maybeSingle();
  return data ? withSnapshot(data as Record<string, unknown>) : null;
}

/** Current published reports for an athlete, newest assessment first. */
export async function getCurrentReports(athleteId: string): Promise<RevisionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_report_revisions')
    .select(REVISION_COLUMNS)
    .eq('athlete_id', athleteId)
    .eq('status', 'current')
    .order('published_at', { ascending: false })
    .limit(100);
  return ((data ?? []) as Record<string, unknown>[]).map(withSnapshot);
}

export async function previewReport(assessmentId: string): Promise<ReportSnapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_assessment_report', { p_assessment_id: assessmentId });
  return error ? null : parseSnapshot(data);
}

export async function getPlans(athleteId: string): Promise<Loaded<PlanRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('assessment_training_plans')
    .select('id, athlete_id, discipline, source_revision_id, title, status, approval, approved_at, start_on, review_on, focus, coach_notes, revision, created_at, completed_at')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: (data ?? []) as PlanRow[], failed: Boolean(error) };
}

export async function getPlanDetails(planId: string): Promise<{
  assignments: AssignmentRow[];
  revisions: PlanRevisionRow[];
  logs: TrainingLogRow[];
}> {
  const supabase = await createClient();
  const [assignments, revisions, logs] = await Promise.all([
    supabase
      .from('assessment_plan_assignments')
      .select('id, plan_id, position, drill_key, drill_version, focus_metric_key, reason, dosage, note, status, override_reason, replaced_from')
      .eq('plan_id', planId)
      .order('position')
      .order('created_at'),
    supabase
      .from('assessment_plan_revisions')
      .select('id, plan_id, revision, change, reason, approval, changed_by_kind, created_at')
      .eq('plan_id', planId)
      .order('revision', { ascending: false }),
    supabase
      .from('assessment_training_logs')
      .select('id, plan_id, assignment_id, completed_on, sets_completed, effort, feedback, media_id, logged_by, logger_kind, created_at')
      .eq('plan_id', planId)
      .order('completed_on', { ascending: false })
      .limit(500),
  ]);
  return {
    assignments: (assignments.data ?? []) as AssignmentRow[],
    revisions: (revisions.data ?? []) as PlanRevisionRow[],
    logs: (logs.data ?? []) as TrainingLogRow[],
  };
}

export async function listCoachLinks(): Promise<Loaded<CoachLinkRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_development_coach_links');
  return { data: (data ?? []) as CoachLinkRow[], failed: Boolean(error) };
}

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
