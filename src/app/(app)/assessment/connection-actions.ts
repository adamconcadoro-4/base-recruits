'use server';

import { revalidatePath } from 'next/cache';

import { callRpc, rpcAction, switchedOff } from '@/lib/assessment/server/actions';
import { field, failure, success, type ActionState } from '@/lib/forms/action-state';

const PATHS = ['/assessment/coaches', '/assessment', '/parent'];

export interface CoachCodeState extends ActionState {
  readonly code?: string;
  readonly expiresAt?: string;
}

/** Creates a one-time code the athlete gives to their development coach. Shown once. */
export async function createCoachCodeAction(_previous: CoachCodeState, _formData: FormData): Promise<CoachCodeState> {
  const { data, error } = await callRpc<Array<{ code: string; expires_at: string }>>('create_development_coach_invite', {});
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return failure(error ?? 'We couldn’t create a code.');
  revalidatePath('/assessment/coaches');
  return { status: 'success', code: row.code, expiresAt: row.expires_at };
}

export async function cancelCoachCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('cancel_development_coach_invite', { p_invite_id: field(formData, 'inviteId') }, 'Code cancelled.', PATHS);
}

const REDEEM_MESSAGES: Readonly<Record<string, string>> = {
  pending_athlete_approval: 'Code accepted. The athlete needs to approve the connection from their account.',
  invalid_or_expired: 'That code isn’t valid or has expired. Ask the athlete for a new one.',
  too_many_attempts: 'Too many attempts. Please wait a while and try again.',
  athlete_link_limit_reached: 'This athlete already has the most development coaches allowed.',
};

/** A development coach enters an athlete's code. */
export async function redeemCoachCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const code = field(formData, 'code').replace(/[\s-]/g, '').toUpperCase();
  if (code.length < 6) return failure('Enter the code the athlete gave you.', { code: 'Enter the code.' });
  const { data, error } = await callRpc<Array<{ outcome: string }>>('redeem_development_coach_invite', { p_code: code });
  if (error) return failure(error);
  const outcome = Array.isArray(data) ? data[0]?.outcome : undefined;
  revalidatePath('/assessment/coaches');
  if (outcome === 'pending_athlete_approval') return success(REDEEM_MESSAGES.pending_athlete_approval ?? 'Code accepted.');
  return failure(REDEEM_MESSAGES[outcome ?? ''] ?? 'That code didn’t work.');
}

export async function approveCoachLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = await callRpc<string>('approve_development_coach_link', { p_link_id: field(formData, 'linkId') });
  if (error) return failure(error);
  for (const path of PATHS) revalidatePath(path);
  return success(
    data === 'active'
      ? 'Approved. Your development coach can now work on your assessments.'
      : 'Approved. Because you are under 18, a linked parent or guardian also needs to approve before the coach can see anything.',
  );
}

export async function declineCoachLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('decline_development_coach_link', { p_link_id: field(formData, 'linkId') }, 'Declined.', PATHS);
}

export async function endCoachLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('end_development_coach_link', { p_link_id: field(formData, 'linkId') }, 'Connection ended.', PATHS);
}

export async function shareWithFamilyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'share_assessments_with_family',
    { p_link_id: field(formData, 'linkId') },
    'Shared. They can now see and help with your assessments.',
    PATHS,
  );
}

export async function revokeShareAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('revoke_consent', { p_grant_id: field(formData, 'grantId') }, 'Sharing stopped.', PATHS);
}

const SHARE_MESSAGES: Readonly<Record<string, string>> = {
  not_found: 'No verified college coach uses that email address on Base Recruits.',
  too_many_attempts: 'Too many attempts. Please wait a while and try again.',
};

/** Shares the athlete's published reports (never clips or working data) with one verified college coach. */
export async function shareReportsWithCoachAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const email = field(formData, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return failure('Enter the coach’s work email address.', { email: 'Enter an email address.' });
  const { data, error } = await callRpc<Array<{ outcome: string; coach_name: string | null; status: string | null }>>(
    'share_assessment_reports_with_coach',
    { p_email: email },
  );
  if (error) return failure(error);
  const row = Array.isArray(data) ? data[0] : undefined;
  revalidatePath('/assessment/coaches');
  if (row?.outcome === 'shared') {
    return success(
      row.status === 'pending_guardian'
        ? `Shared with ${row.coach_name ?? 'the coach'} once your parent or guardian approves.`
        : `Your published reports are now shared with ${row.coach_name ?? 'the coach'}.`,
    );
  }
  return failure(SHARE_MESSAGES[row?.outcome ?? ''] ?? 'That didn’t work. Check the email and try again.');
}
