'use server';

import { revalidatePath } from 'next/cache';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { readSubmittedNumbers, toAccountPayload } from '@/lib/matching/account-numbers';
import { createClient } from '@/lib/supabase/server';

/**
 * Saving the player's numbers to their account (decision F63). Called only
 * when a signed-in athlete ticks "Save to my account"; the database checks the
 * role, the values and who may read them.
 */
export type AccountNumbersResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export async function saveMyNumbersAction(submitted: unknown): Promise<AccountNumbersResult> {
  const numbers = readSubmittedNumbers(submitted);
  const payload = numbers ? toAccountPayload(numbers, new Date().getUTCFullYear()) : null;
  if (!payload) return { ok: false, message: 'Check your numbers, then save again.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_my_numbers', { p_numbers: payload });
  if (error) {
    return { ok: false, message: error.code === 'BR001' ? 'Sign in again to save your numbers to your account.' : userMessageForDatabaseError(error) };
  }
  revalidatePath('/athlete');
  return { ok: true };
}

export async function deleteMyNumbersAction(): Promise<AccountNumbersResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_my_numbers');
  if (error) return { ok: false, message: 'Removing your numbers from your account didn’t work. Try again.' };
  revalidatePath('/athlete');
  return { ok: true };
}
