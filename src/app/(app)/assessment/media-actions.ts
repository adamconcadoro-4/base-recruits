'use server';

import { revalidatePath } from 'next/cache';

import { callRpc, numberField, rpcAction, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { field, failure, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'assessment-media';

export type UploadStart =
  | { readonly ok: true; readonly mediaId: string; readonly uploadUrl: string }
  | { readonly ok: false; readonly message: string };

/**
 * Registers a clip and returns a one-time signed upload link for it. The
 * database checks type, size, permission and the video switch; storage
 * policies check the path again when the link is created and used.
 */
export async function beginUploadAction(input: {
  readonly assessmentId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly cameraView: string | null;
  readonly timingBasis: string;
  readonly slowdownFactor: number | null;
  readonly label: string | null;
}): Promise<UploadStart> {
  const off = switchedOff();
  if (off) return { ok: false, message: off.message ?? 'Assessment is switched off.' };
  const { data, error } = await callRpc<Array<{ media_id: string; storage_path: string }>>('begin_assessment_upload', {
    p_assessment_id: input.assessmentId,
    p_file_name: input.fileName.slice(0, 200),
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_camera_view: input.cameraView,
    p_timing_basis: input.timingBasis,
    p_slowdown_factor: input.slowdownFactor,
    p_label: input.label,
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { ok: false, message: error ?? 'We couldn’t start the upload.' };
  const supabase = await createClient();
  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(row.storage_path);
  if (signError || !signed) {
    await callRpc('remove_assessment_media', { p_media_id: row.media_id });
    return { ok: false, message: 'We couldn’t prepare the upload. Please try again.' };
  }
  return { ok: true, mediaId: row.media_id, uploadUrl: signed.signedUrl };
}

export async function completeUploadAction(input: {
  readonly assessmentId: string;
  readonly mediaId: string;
  readonly durationMs: number | null;
}): Promise<{ readonly ok: boolean; readonly message?: string }> {
  const duration = input.durationMs !== null && Number.isFinite(input.durationMs) ? Math.round(input.durationMs) : null;
  const { error } = await callRpc('complete_assessment_upload', { p_media_id: input.mediaId, p_duration_ms: duration });
  if (error) return { ok: false, message: error };
  revalidatePath(`/assessment/${input.assessmentId}`);
  revalidatePath('/assessment/film');
  return { ok: true };
}

/** Cancels a clip whose upload failed, removing any partial file. */
export async function cancelUploadAction(input: { readonly mediaId: string }): Promise<void> {
  const { data } = await callRpc<string>('remove_assessment_media', { p_media_id: input.mediaId });
  if (data) {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET).remove([data]);
  }
}

export async function updateMediaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const factor = numberField(formData, 'slowdown_factor');
  return rpcAction(
    'update_assessment_media',
    {
      p_media_id: field(formData, 'mediaId'),
      p_label: textOrNull(formData, 'label'),
      p_camera_view: textOrNull(formData, 'camera_view'),
      p_timing_basis: field(formData, 'timing_basis') || 'unknown',
      p_slowdown_factor: factor === null || Number.isNaN(factor) ? null : factor,
    },
    'Clip details saved.',
    [`/assessment/${id}`, '/assessment/film'],
  );
}

/** Removes the clip record, then deletes the file from storage. */
export async function removeMediaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = field(formData, 'assessmentId');
  const { data, error } = await callRpc<string>('remove_assessment_media', { p_media_id: field(formData, 'mediaId') });
  if (error) return failure(error);
  if (data) {
    const supabase = await createClient();
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([data]);
    if (storageError) return failure('The clip was removed from the assessment, but its file could not be deleted yet.');
  }
  revalidatePath(`/assessment/${id}`);
  revalidatePath('/assessment/film');
  return success('Clip removed and its file deleted.');
}

export interface AnnotationInput {
  readonly mediaId: string;
  readonly kind: 'event' | 'note' | 'drawing';
  readonly eventType: string | null;
  readonly timeMs: number;
  readonly note: string | null;
  readonly drawing: { shape: string; points: [[number, number], [number, number]]; color: string } | null;
  readonly repetitionId: string | null;
}

export async function addAnnotationAction(
  input: AnnotationInput,
): Promise<{ readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string }> {
  const { data, error } = await callRpc<string>('add_assessment_annotation', {
    p_media_id: input.mediaId,
    p_kind: input.kind,
    p_event_type: input.eventType,
    p_time_ms: Math.max(0, Math.round(input.timeMs)),
    p_note: input.note,
    p_drawing: input.drawing,
    p_repetition_id: input.repetitionId,
  });
  if (error || !data) return { ok: false, message: error ?? 'We couldn’t save that.' };
  revalidatePath('/assessment/film');
  return { ok: true, id: data };
}

export async function deleteAnnotationAction(input: { readonly annotationId: string }): Promise<{ readonly ok: boolean; readonly message?: string }> {
  const { error } = await callRpc('delete_assessment_annotation', { p_annotation_id: input.annotationId });
  if (error) return { ok: false, message: error };
  revalidatePath('/assessment/film');
  return { ok: true };
}

/** Turns two event markers on one repetition into a timing value (a video estimate). */
export async function recordIntervalAction(input: {
  readonly repetitionId: string;
  readonly metricKey: string;
  readonly startAnnotationId: string;
  readonly endAnnotationId: string;
  readonly assessmentId: string;
}): Promise<{ readonly ok: boolean; readonly message: string }> {
  const { error } = await callRpc('record_interval_from_markers', {
    p_repetition_id: input.repetitionId,
    p_metric_key: input.metricKey,
    p_start_annotation_id: input.startAnnotationId,
    p_end_annotation_id: input.endAnnotationId,
  });
  if (error) return { ok: false, message: error };
  revalidatePath(`/assessment/${input.assessmentId}`);
  revalidatePath('/assessment/film');
  return { ok: true, message: 'Timing saved as a video estimate.' };
}
