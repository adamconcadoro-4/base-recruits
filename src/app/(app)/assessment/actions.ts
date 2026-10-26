'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { protocol as findProtocol } from '@/lib/assessment/catalog/protocols';
import { callRpc, numberField, rpcAction, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { deleteClipFiles } from '@/lib/assessment/server/storage';
import { field, failure, success, type ActionState } from '@/lib/forms/action-state';

const CONTEXT_FIELDS = [
  'competition_level',
  'bats',
  'throws',
  'drill_type',
  'equipment',
  'bat_details',
  'environment',
  'surface',
  'capture_limitations',
  'notes',
] as const;

export interface ContextInput {
  readonly competition_level?: string | null;
  readonly bats?: string | null;
  readonly throws?: string | null;
  readonly drill_type?: string | null;
  readonly equipment?: string | null;
  readonly bat_details?: string | null;
  readonly environment?: string | null;
  readonly surface?: string | null;
  readonly capture_limitations?: string | null;
  readonly notes?: string | null;
  readonly camera_views?: readonly string[];
  readonly rep_goal: number;
}

function contextFromForm(formData: FormData): ContextInput {
  const context: Record<string, unknown> = {};
  for (const name of CONTEXT_FIELDS) context[name] = textOrNull(formData, name);
  context.camera_views = formData.getAll('camera_views').filter((value): value is string => typeof value === 'string');
  context.rep_goal = numberField(formData, 'rep_goal') ?? 0;
  return context as unknown as ContextInput;
}

// ------------------------------------------------------------------ assessments

export async function createAssessmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const [key, version] = field(formData, 'protocol').split('@');
  const chosen = key && version ? findProtocol(key, Number(version)) : undefined;
  if (!chosen) return failure('Choose what kind of assessment this is.', { protocol: 'Choose an assessment type.' });
  const date = field(formData, 'assessment_date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure('Enter the assessment date.', { assessment_date: 'Enter a date.' });
  const { data, error } = await callRpc<string>('create_assessment', {
    p_athlete_id: field(formData, 'athlete_id'),
    p_protocol_key: chosen.key,
    p_protocol_version: chosen.version,
    p_assessment_date: date,
    p_context: contextFromForm(formData),
  });
  if (error || !data) return failure(error ?? 'We couldn’t start the assessment. Please try again.');
  revalidatePath('/assessment', 'layout');
  redirect(`/assessment/${data}?step=clips`);
}

/** Autosave from the details form. Returns the new version, or a message the form shows with a retry. */
export async function saveContextAction(input: {
  readonly assessmentId: string;
  readonly version: number;
  readonly date: string;
  readonly context: ContextInput;
}): Promise<{ readonly ok: true; readonly version: number } | { readonly ok: false; readonly message: string; readonly conflict: boolean }> {
  const { data, error } = await callRpc<number>('update_assessment_context', {
    p_assessment_id: input.assessmentId,
    p_expected_version: input.version,
    p_assessment_date: input.date,
    p_context: input.context,
  });
  if (error || typeof data !== 'number') {
    const message = error ?? 'We couldn’t save your changes.';
    return { ok: false, message, conflict: /another window/i.test(message) };
  }
  revalidatePath(`/assessment/${input.assessmentId}`);
  return { ok: true, version: data };
}

export async function setAssessmentStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const status = field(formData, 'status');
  const message =
    status === 'ready_for_review' ? 'Sent for coach review.' : status === 'reviewed' ? 'Marked reviewed.' : 'Back to draft.';
  return rpcAction('set_assessment_status', { p_assessment_id: id, p_status: status }, message, [`/assessment/${id}`]);
}

/**
 * Deletes a draft that was never published. The database checks that first,
 * under lock, and only then marks its clips removed and returns their paths;
 * the files are deleted, then the draft. A failure part-way can be retried.
 */
export async function deleteAssessmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const id = field(formData, 'assessmentId');
  const { data: paths, error } = await callRpc<string[]>('begin_assessment_deletion', { p_assessment_id: id });
  if (error) return failure(error);
  if (!(await deleteClipFiles(paths ?? []))) {
    return failure('The clips were removed but their files could not be deleted yet. Please try again.');
  }
  const { error: deleteError } = await callRpc('delete_assessment', { p_assessment_id: id });
  if (deleteError) return failure(deleteError);
  revalidatePath('/assessment', 'layout');
  redirect('/assessment');
}

// ------------------------------------------------------------------ repetitions

export async function addRepetitionsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const count = numberField(formData, 'count');
  if (count === null || !Number.isInteger(count)) return failure('Enter how many repetitions to add.', { count: 'Enter a whole number.' });
  return rpcAction(
    'add_assessment_repetitions',
    { p_assessment_id: id, p_count: count, p_pitch_type: textOrNull(formData, 'pitch_type') },
    count === 1 ? 'Added one repetition.' : `Added ${count} repetitions.`,
    [`/assessment/${id}`],
  );
}

export async function updateRepetitionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const clipTime = numberField(formData, 'clip_time_s');
  return rpcAction(
    'update_assessment_repetition',
    {
      p_repetition_id: field(formData, 'repetitionId'),
      p_pitch_type: textOrNull(formData, 'pitch_type'),
      p_media_id: textOrNull(formData, 'media_id'),
      p_clip_time_ms: clipTime === null || Number.isNaN(clipTime) ? null : Math.round(clipTime * 1000),
      p_note: textOrNull(formData, 'note'),
    },
    'Saved.',
    [`/assessment/${id}`],
  );
}

export async function setRepetitionStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const status = field(formData, 'status');
  return rpcAction(
    'set_assessment_repetition_status',
    { p_repetition_id: field(formData, 'repetitionId'), p_status: status, p_reason: textOrNull(formData, 'reason') },
    status === 'excluded' ? 'Excluded, with the reason kept.' : 'Counted again.',
    [`/assessment/${id}`],
  );
}

export async function deleteRepetitionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction('delete_assessment_repetition', { p_repetition_id: field(formData, 'repetitionId') }, 'Deleted.', [
    `/assessment/${id}`,
  ]);
}

// ------------------------------------------------------------------ observations

export async function recordObservationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const unable = field(formData, 'unable') === 'true' || field(formData, 'value') === 'unable';
  const raw = field(formData, 'value');
  let value: number | null = null;
  if (!unable) {
    if (raw === 'yes') value = 1;
    else if (raw === 'no') value = 0;
    else {
      value = numberField(formData, 'value');
      if (value === null || Number.isNaN(value)) return failure('Enter a number or choose a rating.', { value: 'Enter a value.' });
    }
  }
  return rpcAction(
    'record_assessment_observation',
    {
      p_assessment_id: id,
      p_metric_key: field(formData, 'metric'),
      p_repetition_id: textOrNull(formData, 'repetitionId'),
      p_value: value,
      p_unable_to_assess: unable,
      p_quality_reason: textOrNull(formData, 'reason'),
      p_evidence_category: textOrNull(formData, 'evidence'),
      p_device_kind: textOrNull(formData, 'device_kind'),
      p_device_label: textOrNull(formData, 'device_label'),
      p_source_timestamp: null,
      p_note: textOrNull(formData, 'note'),
    },
    unable ? 'Saved as unable to assess.' : 'Saved.',
    [`/assessment/${id}`],
  );
}

/**
 * Saves one metric for many repetitions at once (fields named "rep:<id>").
 * Blank boxes are left as they are; each value is checked by the database.
 */
export async function recordRepetitionValuesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const id = field(formData, 'assessmentId');
  const metricKey = field(formData, 'metric');
  let saved = 0;
  const problems: string[] = [];
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith('rep:') || typeof raw !== 'string' || raw.trim() === '') continue;
    const repetitionId = name.slice(4);
    // Boxes are pre-filled with what is recorded; only changed values are saved, so
    // reviews, devices and import or Film Room provenance of the others stay as they are.
    if (raw.trim() === field(formData, `was:${repetitionId}`)) continue;
    const seq = field(formData, `seq:${repetitionId}`);
    const text = raw.trim().toLowerCase();
    const value = text === 'yes' ? 1 : text === 'no' ? 0 : Number(text);
    if (!Number.isFinite(value)) {
      problems.push(`#${seq}: enter a number`);
      continue;
    }
    const { error } = await callRpc('record_assessment_observation', {
      p_assessment_id: id,
      p_metric_key: metricKey,
      p_repetition_id: repetitionId,
      p_value: value,
      p_unable_to_assess: false,
      p_quality_reason: null,
      p_evidence_category: textOrNull(formData, 'evidence'),
      p_device_kind: textOrNull(formData, 'device_kind'),
      p_device_label: textOrNull(formData, 'device_label'),
      p_source_timestamp: null,
      p_note: null,
    });
    if (error) problems.push(`#${seq}: ${error}`);
    else saved += 1;
  }
  revalidatePath(`/assessment/${id}`);
  if (problems.length > 0) {
    return failure(`Saved ${saved}. Not saved — ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '; and more' : ''}`);
  }
  if (saved === 0) return failure('Nothing changed. Enter or change at least one value.');
  return success(saved === 1 ? 'Saved 1 value.' : `Saved ${saved} values.`);
}

export async function setObservationQualityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction(
    'set_observation_quality',
    { p_observation_id: field(formData, 'observationId'), p_quality_state: field(formData, 'quality'), p_reason: textOrNull(formData, 'reason') },
    'Review saved.',
    [`/assessment/${id}`],
  );
}

export async function deleteObservationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction('delete_assessment_observation', { p_observation_id: field(formData, 'observationId') }, 'Removed.', [
    `/assessment/${id}`,
  ]);
}

// ------------------------------------------------------------------ targets

export async function setTargetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const a = numberField(formData, 'value_a');
  const b = numberField(formData, 'value_b');
  const c = numberField(formData, 'value_c');
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b) || (c !== null && Number.isNaN(c))) {
    return failure('Enter every number for the target.');
  }
  return rpcAction(
    'set_assessment_target',
    {
      p_athlete_id: field(formData, 'athleteId'),
      p_metric_key: field(formData, 'metric'),
      p_pitch_type: textOrNull(formData, 'pitch_type'),
      p_kind: field(formData, 'kind'),
      p_value_a: a,
      p_value_b: b,
      p_value_c: c,
      p_source: field(formData, 'source'),
    },
    'Target saved. It applies to previews now and to reports published from now on.',
  );
}

export async function retireTargetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('retire_assessment_target', { p_target_id: field(formData, 'targetId') }, 'Target retired.');
}

// ------------------------------------------------------------------ CSV import

export interface ImportOutcome {
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected_count: number;
  readonly rejected: ReadonlyArray<{ readonly row: number; readonly reason: string }>;
}

export async function importMeasurementsAction(input: {
  readonly assessmentId: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly rows: ReadonlyArray<Record<string, unknown>>;
}): Promise<{ readonly ok: true; readonly outcome: ImportOutcome } | { readonly ok: false; readonly message: string }> {
  const { data, error } = await callRpc<ImportOutcome>('import_assessment_measurements', {
    p_assessment_id: input.assessmentId,
    p_file_name: input.fileName.slice(0, 160),
    p_file_sha256: input.sha256,
    p_rows: input.rows,
  });
  if (error || !data) return { ok: false, message: error ?? 'The import did not complete. Nothing was saved.' };
  revalidatePath(`/assessment/${input.assessmentId}`);
  return { ok: true, outcome: data };
}

// ------------------------------------------------------------------ publishing and reassessment

export async function publishAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const { data, error } = await callRpc<string>('publish_assessment', { p_assessment_id: id, p_note: textOrNull(formData, 'note') });
  if (error || !data) return failure(error ?? 'We couldn’t publish the report. Please try again.');
  revalidatePath('/assessment', 'layout');
  redirect(`/assessment/${id}/report`);
}

export async function reopenAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction(
    'reopen_assessment',
    { p_assessment_id: id, p_reason: field(formData, 'reason') },
    'Reopened for corrections. The published report stays as it is until you publish a new revision.',
    [`/assessment/${id}`],
  );
}

export async function setBaselineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction(
    'set_assessment_baseline',
    { p_assessment_id: id, p_baseline_id: textOrNull(formData, 'baselineId') },
    'Baseline saved.',
    [`/assessment/${id}`, '/assessment/progress'],
  );
}

export async function setReassessmentDateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  return rpcAction(
    'set_reassessment_date',
    { p_assessment_id: id, p_due_on: textOrNull(formData, 'due_on') },
    'Reassessment date saved.',
    [`/assessment/${id}`],
  );
}

export async function createReassessmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const { data, error } = await callRpc<string>('create_reassessment', {
    p_previous_id: id,
    p_assessment_date: field(formData, 'assessment_date'),
  });
  if (error || !data) return failure(error ?? 'We couldn’t start the reassessment.');
  revalidatePath('/assessment', 'layout');
  redirect(`/assessment/${data}?step=clips`);
}
