'use server';

import { redirect } from 'next/navigation';

import { emailSchema } from '@/app/(auth)/signup/schema';
import { setPendingVerification } from '@/lib/auth/pending-verification';
import { failure, field, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

/** Sends a sign-in code to an existing account. Unknown addresses get the same answer. */
export async function requestResetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(field(formData, 'email'));
  if (!parsed.success) return failure('Enter a valid email address.', { email: 'Enter a valid email address.' });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false } });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    return failure('Too many attempts. Please wait a few minutes and try again.');
  }

  await setPendingVerification({ purpose: 'reset', email: parsed.data });
  redirect('/verify');
}
