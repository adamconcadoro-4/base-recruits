'use server';

import { revalidatePath } from 'next/cache';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { isFamilyRelationship, redeemOutcomeMessage } from '@/lib/family/family';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

export async function redeemCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const code = field(formData, 'code').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const relationship = field(formData, 'relationship');
  const fieldErrors: Record<string, string> = {};
  if (code.length !== 12) fieldErrors.code = 'Enter the 12-character code from the athlete.';
  if (!isFamilyRelationship(relationship)) fieldErrors.relationship = 'Choose your relationship to the athlete.';
  if (Object.keys(fieldErrors).length > 0) return failure('Check the highlighted fields.', fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_family_invite', { p_code: code, p_relationship: relationship });
  if (error) return failure(userMessageForDatabaseError(error));
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
  const result = redeemOutcomeMessage(row?.outcome ?? '');
  if (!result.ok) return failure(result.message);
  revalidatePath('/parent');
  return success(result.message);
}

export async function approveConsentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_consent_as_guardian', { p_grant_id: field(formData, 'grantId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/parent');
  return success('Approved.');
}

export async function leaveLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('end_family_link', { p_link_id: field(formData, 'linkId') });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/parent');
  return success('Link removed.');
}
