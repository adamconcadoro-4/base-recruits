'use server';

import { redirect } from 'next/navigation';

import { verificationSchema } from '@/app/(auth)/signup/schema';
import { checkBirthDate, todayUtc } from '@/lib/age/age-policy';
import { blockAgeGate } from '@/lib/auth/age-gate';
import { clearPendingVerification, readPendingVerification } from '@/lib/auth/pending-verification';
import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const START_AGAIN = 'This code request has expired. Start again to get a new code.';

/**
 * Verify the emailed code, then, as the person who proved they own the email,
 * set the account's password, sign out every other session, and apply the
 * sign-up details from this browser. Anything someone else attached to an
 * unconfirmed account for this email is gone: the database wipes any earlier
 * password and metadata at the moment the email is confirmed
 * (private.reset_credentials_on_confirmation), and never trusts sign-up metadata.
 */
export async function verifyCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const pending = await readPendingVerification();
  if (!pending) return failure(START_AGAIN);

  const parsed = verificationSchema.safeParse({
    code: field(formData, 'code').replace(/\s+/g, ''),
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

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: pending.email,
    token: parsed.data.code,
    type: 'email',
  });
  if (verifyError) {
    return failure(withDiagnostics('That code is wrong or has expired. Check the latest email, or send a new code.', verifyError), {
      code: 'That code is wrong or has expired.',
    });
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (passwordError && passwordError.code !== 'same_password') {
    // The account now has no usable password (the earlier one, if any, was
    // wiped at confirmation). Sign out; the owner can set one with a new code.
    await supabase.auth.signOut();
    if (passwordError.code === 'weak_password') {
      return failure('Choose a stronger password, then enter a new code.', { password: 'Choose a stronger password.' });
    }
    return failure(withDiagnostics('We couldn’t set your password. Send a new code and try again.', passwordError));
  }
  await supabase.auth.signOut({ scope: 'others' });

  if (pending.purpose === 'signup') {
    if (pending.dateOfBirth) {
      const { data: band, error } = await supabase.rpc('record_birthdate', { p_date_of_birth: pending.dateOfBirth });
      if (band === 'under_minimum_age') {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await supabase.auth.signOut();
        if (user) await createAdminClient().auth.admin.deleteUser(user.id);
        await blockAgeGate();
        await clearPendingVerification();
        redirect('/signup');
      }
      // BR004: a date of birth is already recorded (an existing account).
      if (error && error.code !== 'BR004') console.error('record_birthdate failed', { code: error.code });
    }
    // The browser-held details are re-checked here (the database also refuses
    // adult roles without a recorded adult date of birth).
    const birth = pending.dateOfBirth ? checkBirthDate(pending.dateOfBirth, todayUtc()) : null;
    const adult = birth !== null && birth.ok && birth.band === 'adult';
    if (pending.accountType && (pending.accountType === 'athlete' || adult)) {
      const { error } = await supabase.rpc('complete_onboarding', {
        p_account_type: pending.accountType,
        p_display_name: pending.displayName ?? null,
      });
      // BR004: the account already has a role (an existing account).
      if (error && error.code !== 'BR004') console.error('complete_onboarding failed', { code: error.code });
    }
  }

  await clearPendingVerification();
  redirect('/dashboard');
}

export async function resendCodeAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const pending = await readPendingVerification();
  if (!pending) return failure(START_AGAIN);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: pending.email,
    options: { shouldCreateUser: pending.purpose === 'signup' },
  });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    return failure('Please wait a minute before asking for another code.');
  }
  // Other errors (for example an unknown address on a password reset) get the
  // same answer, so this form never reveals who has an account.
  return success('If that address can receive email, a new code is on its way.');
}
