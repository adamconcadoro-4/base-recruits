'use server';

import { revalidatePath } from 'next/cache';

import { CONSENT_SCOPES } from '@/lib/consent/scopes';
import type { InviteState } from '@/lib/family/family';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

export async function turnOnCoachVisibilityAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_consent', {
    p_scope: 'coach_discovery',
    p_consent_text_version: CONSENT_SCOPES.coach_discovery.textVersion,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/athlete');
  return success('Saved.');
}

export async function turnOffCoachVisibilityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_consent', { p_grant_id: field(formData, 'grantId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/athlete');
  return success('Coach visibility is off.');
}

export async function createInviteAction(_previous: InviteState, _formData: FormData): Promise<InviteState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_family_invite');
  if (error) return failure(userMessageForDatabaseError(error));
  const row = (Array.isArray(data) ? data[0] : data) as { code?: string; expires_at?: string } | null;
  if (!row?.code) return failure('We couldn’t create a code. Please try again.');
  revalidatePath('/athlete');
  return { status: 'success', code: row.code, expiresAt: row.expires_at };
}

export async function approveLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_family_link', { p_link_id: field(formData, 'linkId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/athlete');
  return success('Approved.');
}

export async function endLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('end_family_link', { p_link_id: field(formData, 'linkId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/athlete');
  revalidatePath('/parent');
  return success('Access removed.');
}

export async function cancelInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_family_invite', { p_invite_id: field(formData, 'inviteId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/athlete');
  return success('Code cancelled.');
}
