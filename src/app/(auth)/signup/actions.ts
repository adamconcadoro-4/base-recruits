'use server';

import { redirect } from 'next/navigation';

import { accountSchema, dateOfBirthSchema, isoDate, type AgeStepState } from '@/app/(auth)/signup/schema';
import { assessmentSiteEnabled } from '@/config/assessment';
import { birthDateMessage, checkBirthDate, todayUtc } from '@/lib/age/age-policy';
import { blockAgeGate, isAgeGateBlocked } from '@/lib/auth/age-gate';
import { failure, field, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { setPendingVerification } from '@/lib/auth/pending-verification';
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

/**
 * Step 2: send a 6-digit code to the email. No account details are attached
 * yet; they are applied after the code proves the person owns the email
 * (see src/app/(auth)/verify/actions.ts).
 */
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
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return failure('Check the highlighted fields.', fieldErrors);
  }
  const { accountType, displayName, email } = parsed.data;

  if (accountType === 'development_coach' && !assessmentSiteEnabled()) {
    return failure('Development coach accounts are not open yet.', { accountType: 'Development coach accounts are not open yet.' });
  }

  if (accountType !== 'athlete' && check.band === 'minor') {
    return failure('Parent, guardian and coach accounts are for adults.', {
      accountType: 'Parent, guardian and coach accounts are for adults.',
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
      return failure(withDiagnostics('Too many attempts. Please wait a few minutes and try again.', error));
    }
    if (error.code === 'email_address_invalid') {
      return failure('Enter a valid email address.', { email: 'Enter a valid email address.' });
    }
    return failure(withDiagnostics('We couldn’t send a code to that address. Please try again.', error));
  }

  await setPendingVerification({ purpose: 'signup', email, dateOfBirth, accountType, displayName });
  redirect('/verify');
}
