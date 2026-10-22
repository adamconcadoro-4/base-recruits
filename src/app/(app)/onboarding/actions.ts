'use server';

import { redirect } from 'next/navigation';

import { dateOfBirthSchema, isoDate } from '@/app/(auth)/signup/schema';
import { birthDateMessage, checkBirthDate, todayUtc } from '@/lib/age/age-policy';
import { getAccount } from '@/lib/auth/account';
import { blockAgeGate, isAgeGateBlocked } from '@/lib/auth/age-gate';
import { isSelfSelectableRole } from '@/lib/auth/roles';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, type ActionState } from '@/lib/forms/action-state';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function chooseRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const accountType = field(formData, 'accountType');
  if (!isSelfSelectableRole(accountType)) return failure('Choose who this account is for.');

  // Unknown age counts as a minor, so the date of birth comes first.
  const account = await getAccount();
  if (accountType !== 'athlete' && account.isMinor) {
    return failure('Parent, guardian and coach accounts are for adults.');
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_onboarding', {
    p_account_type: accountType,
    p_display_name: field(formData, 'displayName') || null,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  redirect('/onboarding');
}

export async function recordBirthdateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (await isAgeGateBlocked()) return failure('Base Recruits accounts are for people 13 and older.');
  const parsed = dateOfBirthSchema.safeParse({
    month: field(formData, 'month'),
    day: field(formData, 'day'),
    year: field(formData, 'year'),
  });
  if (!parsed.success) return failure(birthDateMessage('invalid_date'));
  const dateOfBirth = isoDate(parsed.data.month, parsed.data.day, parsed.data.year);
  const check = checkBirthDate(dateOfBirth, todayUtc());
  if (!check.ok && check.reason !== 'under_minimum_age') return failure(birthDateMessage(check.reason));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_birthdate', { p_date_of_birth: dateOfBirth });
  if (error) return failure(userMessageForDatabaseError(error));

  if (data === 'under_minimum_age') {
    // No date was stored. Remove the account, sign out and block retries here.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.auth.signOut();
    if (user) {
      const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(user.id);
      if (deleteError) console.error('account deletion after age screen failed', { code: deleteError.code });
    }
    await blockAgeGate();
    redirect('/signup');
  }
  redirect('/dashboard');
}
