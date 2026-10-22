'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getAccount } from '@/lib/auth/account';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { SnapshotError, loadSnapshot, stagingRows } from '@/lib/registry/snapshot';
import { createClient } from '@/lib/supabase/server';

const CHUNK = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function isAdmin(): Promise<boolean> {
  const account = await getAccount();
  return account.roles.includes('admin');
}

function refresh(jobId?: string) {
  revalidatePath('/admin/data');
  if (jobId) revalidatePath(`/admin/data/jobs/${jobId}`);
  revalidatePath('/schools');
  revalidatePath('/data-methodology');
}

/**
 * Stages a bundled snapshot: checks the file, creates a job, sends the records
 * in chunks, then asks the database to validate them and compute the changes.
 * Nothing is public until an administrator publishes the job.
 */
export async function stageSnapshotAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure("Your account can't do that.");
  const name = field(formData, 'snapshot');
  let file;
  try {
    file = await loadSnapshot(name);
  } catch (error) {
    return failure(error instanceof SnapshotError ? error.message : 'The snapshot could not be read.');
  }

  const supabase = await createClient();
  const { snapshot } = file;
  const { data: jobId, error: createError } = await supabase.rpc('admin_create_import_job', {
    p_snapshot_name: file.name,
    p_snapshot_sha256: file.fileSha256,
    p_content_sha256: snapshot.content_sha256,
    p_snapshot_format: snapshot.format,
    p_generated_at: snapshot.generated_at,
    p_sources: snapshot.sources,
    p_expected_rows: snapshot.records.length,
  });
  if (createError || typeof jobId !== 'string') {
    return failure(withDiagnostics(createError ? userMessageForDatabaseError(createError) : 'The import could not start.', createError));
  }

  const rows = stagingRows(snapshot);
  for (let start = 0; start < rows.length; start += CHUNK) {
    const { error } = await supabase.rpc('admin_stage_import_rows', { p_job_id: jobId, p_rows: rows.slice(start, start + CHUNK) });
    if (error) {
      await supabase.rpc('admin_discard_import_job', { p_job_id: jobId });
      refresh(jobId);
      return failure(withDiagnostics(`Staging stopped and the import was discarded: ${userMessageForDatabaseError(error)}`, error));
    }
  }
  const { error: finalizeError } = await supabase.rpc('admin_finalize_import_job', { p_job_id: jobId });
  if (finalizeError) {
    await supabase.rpc('admin_discard_import_job', { p_job_id: jobId });
    refresh(jobId);
    return failure(withDiagnostics(`Review could not be prepared and the import was discarded: ${userMessageForDatabaseError(finalizeError)}`, finalizeError));
  }
  refresh(jobId);
  redirect(`/admin/data/jobs/${jobId}`);
}

export async function publishJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = field(formData, 'jobId');
  const note = field(formData, 'note');
  if (!UUID.test(jobId)) return failure('That import was not found.');
  if (note.length > 2000) return failure('Keep the note under 2,000 characters.', { note: 'Too long.' });
  if (field(formData, 'confirm') !== 'yes') {
    return failure('Confirm that you reviewed the changes.', { confirm: 'Required before publishing.' });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_publish_import_job', { p_job_id: jobId, p_note: note || null });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  refresh(jobId);
  const result = data as { applied: number; marked_not_reported: number; skipped: number };
  return success(
    `Published. ${result.applied} records applied, ${result.marked_not_reported} marked not reported, ${result.skipped} skipped.`,
  );
}

export async function discardJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = field(formData, 'jobId');
  if (!UUID.test(jobId)) return failure('That import was not found.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_discard_import_job', { p_job_id: jobId });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  refresh(jobId);
  return success('Import discarded. Nothing was published.');
}

export async function restageJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = field(formData, 'jobId');
  if (!UUID.test(jobId)) return failure('That import was not found.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_restage_import_job', { p_job_id: jobId });
  if (error || typeof data !== 'string') return failure(withDiagnostics(error ? userMessageForDatabaseError(error) : 'Could not stage it again.', error));
  refresh(data);
  redirect(`/admin/data/jobs/${data}`);
}

export async function setDecisionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = field(formData, 'jobId');
  const unitid = Number(field(formData, 'unitid'));
  const decision = field(formData, 'decision');
  if (!UUID.test(jobId) || !Number.isInteger(unitid) || unitid <= 0) return failure('That row was not found.');
  if (decision !== 'apply' && decision !== 'skip') return failure('Choose apply or skip.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_import_decision', { p_job_id: jobId, p_unitid: unitid, p_decision: decision });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath(`/admin/data/jobs/${jobId}`);
  return success(decision === 'skip' ? 'Will be skipped.' : 'Will be applied.');
}
