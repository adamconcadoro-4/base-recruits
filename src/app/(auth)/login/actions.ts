'use server';

import { redirect } from 'next/navigation';

import { safeNextPath } from '@/lib/auth/route-access';
import { failure, field, type ActionState } from '@/lib/forms/action-state';
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

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
