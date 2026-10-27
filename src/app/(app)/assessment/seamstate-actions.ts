'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { callRpc, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { CONSENT_SCOPES } from '@/lib/consent/scopes';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { field, failure, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { captureFromForm } from '@/lib/seamstate/capture-form';
import { seamstateReadiness } from '@/lib/seamstate/server/config';
import { dispatchDueJobs } from '@/lib/seamstate/server/worker';
import { createClient } from '@/lib/supabase/server';

/**
 * Asks for a SeamState analysis of one uploaded hitting clip. The database
 * checks permission (including a guardian's approval for a minor), the switch,
 * the spending limits and the swing details; the worker is started after the
 * answer is sent, so the page never waits on it.
 */
export async function requestSwingAnalysisAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  if (!seamstateReadiness().ready) return failure('Swing analysis isn’t available yet.');
  const assessmentId = field(formData, 'assessmentId');
  const capture = captureFromForm(formData);
  if (!capture.ok) return failure(capture.message, capture.fieldErrors);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seamstate_request_analysis', {
    p_media_id: field(formData, 'mediaId'),
    p_context: capture.context,
    p_idempotency_key: field(formData, 'requestKey'),
  });
  if (error) {
    // The limit messages are written for people and say which limit was reached.
    const message = error.code === 'BR005' && error.message ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` : userMessageForDatabaseError(error);
    return failure(withDiagnostics(message, error));
  }
  const row = (Array.isArray(data) ? data[0] : data) as { created?: boolean } | null;
  after(async () => {
    await dispatchDueJobs();
  });
  revalidatePath(`/assessment/${assessmentId}`);
  return success(row?.created === false ? 'This clip is already being analyzed.' : 'Analysis requested. This page shows each step as it happens.');
}

export async function cancelSwingAnalysisAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const assessmentId = field(formData, 'assessmentId');
  const { error } = await callRpc('seamstate_cancel_analysis', { p_job_id: field(formData, 'jobId') });
  if (error) return failure(error);
  revalidatePath(`/assessment/${assessmentId}`);
  return success('Analysis cancelled.');
}

/** The athlete's own permission. A minor's waits for a linked parent or legal guardian. */
export async function allowSwingAnalysisAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('grant_consent', {
    p_scope: 'seamstate_analysis',
    p_consent_text_version: CONSENT_SCOPES.seamstate_analysis.textVersion,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  const row = (Array.isArray(data) ? data[0] : data) as { status?: string } | null;
  revalidatePath(`/assessment/${field(formData, 'assessmentId')}`);
  revalidatePath('/athlete');
  return success(
    row?.status === 'pending_guardian'
      ? 'Saved. A linked parent or legal guardian needs to approve this from their account before any clip is analyzed.'
      : 'Saved. You can now ask for a swing analysis. You can turn this off at any time.',
  );
}

/** Stops sending stills. An analysis under way is cancelled before anything more is sent; finished reports stay. */
export async function stopSwingAnalysisPermissionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_consent', { p_grant_id: field(formData, 'grantId') });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath(`/assessment/${field(formData, 'assessmentId')}`);
  revalidatePath('/athlete');
  return success('SeamState analysis is off. Nothing more is sent, and any analysis under way is cancelled.');
}

export async function reviewFindingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const action = field(formData, 'action');
  if (action !== 'approve' && action !== 'reject' && action !== 'note') return failure('Choose approve, reject or add a note.');
  const note = textOrNull(formData, 'note');
  if (action === 'note' && !note) return failure('Write a note first.', { note: 'Write a note.' });
  const { error } = await callRpc('seamstate_review_finding', { p_finding_id: field(formData, 'findingId'), p_action: action, p_note: note });
  if (error) return failure(error);
  revalidatePath(`/assessment/${field(formData, 'assessmentId')}/swing/${field(formData, 'jobId')}`);
  return success(action === 'approve' ? 'Approved.' : action === 'reject' ? 'Rejected. The finding stays visible, marked as rejected.' : 'Note added.');
}
