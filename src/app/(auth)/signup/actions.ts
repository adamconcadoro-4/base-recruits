'use server';

import { redirect } from 'next/navigation';

import { accountSchema, dateOfBirthSchema, isoDate, type AgeStepState } from '@/app/(auth)/signup/schema';
import { birthDateMessage, checkBirthDate, todayUtc } from '@/lib/age/age-policy';
import { blockAgeGate, isAgeGateBlocked } from '@/lib/auth/age-gate';
import { failure, field, type ActionState } from '@/lib/forms/action-state';
import { createAdminClient } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

function readBirthDate(formData: FormData) {
  return dateOfBirthSchema.safeParse({
    month: field(formData, 'month'),
    day: field(formData, 'day'),
    year: field(formData, 'year'),
  });
}

/**
 * Step 1: the neutral age screen. Nothing is stored. An under-13 answer blocks
 * this browser from retrying and no account step is offered.
 */
export async function checkAgeAction(_previous: AgeStepState, formData: FormData): Promise<AgeStepState> {
  if (await isAgeGateBlocked()) return { status: 'error', blocked: true };

  const parsed = readBirthDate(formData);
  if (!parsed.success) {
    return failure('Enter your date of birth as month, day and year.', { dateOfBirth: birthDateMessage('invalid_date') });
  }
  const { month, day, year } = parsed.data;
  const check = checkBirthDate(isoDate(month, day, year), todayUtc());
  if (!check.ok) {
    if (check.reason === 'under_minimum_age') {
      await blockAgeGate();
      return { status: 'error', blocked: true };
    }
    return failure(birthDateMessage(check.reason), { dateOfBirth: birthDateMessage(check.reason) });
  }
  return { status: 'success', passed: true, adult: check.band === 'adult' };
}

/** Step 2: create the account, then record the date of birth server-side. */
export async function signUpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (await isAgeGateBlocked()) {
    return failure('Base Recruits accounts are for people 13 and older.');
  }

  const birth = readBirthDate(formData);
  if (!birth.success) return failure('Start again with your date of birth.');
  const dateOfBirth = isoDate(birth.data.month, birth.data.day, birth.data.year);
  const check = checkBirthDate(dateOfBirth, todayUtc());
  if (!check.ok) {
    if (check.reason === 'under_minimum_age') {
      await blockAgeGate();
      return failure('Base Recruits accounts are for people 13 and older.');
    }
    return failure(birthDateMessage(check.reason));
  }

  const parsed = accountSchema.safeParse({
    accountType: field(formData, 'accountType'),
    displayName: field(formData, 'displayName'),
    email: field(formData, 'email'),
    password: typeof formData.get('password') === 'string' ? (formData.get('password') as string) : '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return failure('Check the highlighted fields.', fieldErrors);
  }
  const { accountType, displayName, email, password } = parsed.data;

  if (accountType !== 'athlete' && check.band === 'minor') {
    return failure('Parent, guardian and coach accounts are for adults.', {
      accountType: 'Parent, guardian and coach accounts are for adults.',
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: { account_type: accountType, display_name: displayName },
    },
  });

  if (error) {
    if (error.code === 'weak_password') {
      return failure('Choose a stronger password.', { password: 'Choose a stronger password.' });
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return failure('Too many attempts. Please wait a few minutes and try again.');
    }
    if (error.code === 'email_address_invalid') {
      return failure('Enter a valid email address.', { email: 'Enter a valid email address.' });
    }
    return failure('We couldn’t create your account. Please try again.');
  }

  // A brand-new account has an identity; an address that is already registered
  // returns a placeholder user, and we respond identically so the form never
  // reveals who has an account.
  const user = data.user;
  if (user && (user.identities?.length ?? 0) > 0) {
    const admin = createAdminClient();
    const { error: birthdateError } = await admin.rpc('admin_record_birthdate', {
      p_user_id: user.id,
      p_date_of_birth: dateOfBirth,
    });
    if (birthdateError) {
      // The account still works: onboarding asks for the date of birth again.
      console.error('admin_record_birthdate failed', { code: birthdateError.code });
    }
  }

  redirect('/signup/check-email');
}
