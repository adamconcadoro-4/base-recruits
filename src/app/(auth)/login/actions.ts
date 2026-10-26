'use server';

import { redirect } from 'next/navigation';

import { emailSchema } from '@/app/(auth)/signup/schema';
import { setPendingVerification } from '@/lib/auth/pending-verification';
import { safeNextPath } from '@/lib/auth/route-access';
import { failure, field, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

export async function logInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const email = field(formData, 'email');
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  if (!email || !password) {
    return failure('Enter your email and password.', {
      ...(email ? {} : { email: 'Enter your email.' }),
      ...(password ? {} : { password: 'Enter your password.' }),
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return failure('Confirm your email first: finish signing up with the code we emailed you, or reset your password.');
    }
    if (error.status === 429 || error.code === 'over_request_rate_limit') {
      return failure('Too many attempts. Please wait a few minutes and try again.');
    }
    return failure('That email and password don’t match an account.');
  }

  redirect(safeNextPath(field(formData, 'next'), '/dashboard'));
}

/**
 * Emails a 6-digit sign-in code to an existing account; the code alone logs
 * the person in on /verify. Never creates an account. The page answers the
 * same way for unknown addresses, so it doesn't reveal who has an account.
 */
export async function requestLoginCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(field(formData, 'email'));
  if (!parsed.success) return failure('Enter a valid email address.', { email: 'Enter a valid email address.' });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false } });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    return failure(withDiagnostics('Too many attempts. Please wait a few minutes and try again.', error));
  }

  await setPendingVerification({ purpose: 'login', email: parsed.data, next: safeNextPath(field(formData, 'next'), '/dashboard') });
  redirect('/verify');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
