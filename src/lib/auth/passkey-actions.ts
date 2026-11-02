'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { PASSKEY_PROMPT_SKIPPED_COOKIE } from '@/lib/auth/after-sign-in';
import { safeNextPath } from '@/lib/auth/route-access';
import { nowInSeconds, recentEnoughToAddPasskey } from '@/lib/auth/sign-in-methods';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

/**
 * Passkey sign-in and setup. Supabase Auth issues every challenge and checks
 * every answer; these actions only carry them between the browser and Supabase
 * (the browser never calls Supabase directly, so the session stays in an
 * httpOnly cookie).
 */

type Json = Record<string, unknown>;

export type PasskeyStart =
  | { readonly ok: true; readonly challengeId: string; readonly options: Json }
  | { readonly ok: false; readonly message: string };

export type PasskeyFinish = { readonly ok: true; readonly redirectTo: string } | { readonly ok: false; readonly message: string };

const MAX_CREDENTIAL_BYTES = 16_384;

function messageFor(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'passkey_disabled':
      return 'Face ID and fingerprint sign-in isn’t switched on yet. Use an emailed code for now.';
    case 'webauthn_credential_not_found':
      return 'That passkey isn’t linked to a Base Recruits account any more. Log in with an emailed code, then set up Face ID again in Settings.';
    case 'webauthn_challenge_expired':
    case 'webauthn_challenge_not_found':
      return 'That took too long. Try again.';
    case 'webauthn_credential_exists':
      return 'This device already has a passkey for your account.';
    case 'too_many_passkeys':
      return 'Your account has the most passkeys allowed. Remove one in Settings first.';
    case 'email_not_confirmed':
      return 'Finish creating your account with the emailed code first.';
    case 'user_banned':
      return 'This account can’t sign in.';
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return fallback;
  }
}

function validInput(challengeId: unknown, credential: unknown): credential is Json {
  if (typeof challengeId !== 'string' || challengeId.length === 0 || challengeId.length > 100) return false;
  if (credential === null || typeof credential !== 'object' || Array.isArray(credential)) return false;
  try {
    return JSON.stringify(credential).length <= MAX_CREDENTIAL_BYTES;
  } catch {
    return false;
  }
}

export async function startPasskeySignInAction(): Promise<PasskeyStart> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.passkey.startAuthentication();
  if (error || !data) return { ok: false, message: messageFor(error?.code, 'We couldn’t start passkey sign-in. Please try again.') };
  return { ok: true, challengeId: data.challenge_id, options: data.options as unknown as Json };
}

export async function finishPasskeySignInAction(challengeId: string, credential: Json, next: string): Promise<PasskeyFinish> {
  if (!validInput(challengeId, credential)) return { ok: false, message: 'That took too long. Try again.' };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.passkey.verifyAuthentication({
    challengeId,
    credential: credential as never,
  });
  if (error || !data?.session) {
    return { ok: false, message: messageFor(error?.code, 'That passkey didn’t work. Try again, or use an emailed code.') };
  }
  return { ok: true, redirectTo: safeNextPath(next, '/dashboard') };
}

export async function startPasskeySetupAction(): Promise<PasskeyStart> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (typeof claims?.sub !== 'string') return { ok: false, message: 'Please log in again.' };
  // A session left signed in on a shared computer can't quietly add its own
  // passkey: adding one needs a sign-in within the last 15 minutes.
  if (!recentEnoughToAddPasskey(claims.amr, nowInSeconds())) {
    return { ok: false, message: 'For your security, log in again (an emailed code is fine), then set up Face ID within 15 minutes.' };
  }
  const { data, error } = await supabase.auth.passkey.startRegistration();
  if (error || !data) return { ok: false, message: messageFor(error?.code, 'We couldn’t start setup. Please try again.') };
  return { ok: true, challengeId: data.challenge_id, options: data.options as unknown as Json };
}

export async function finishPasskeySetupAction(challengeId: string, credential: Json, next: string): Promise<PasskeyFinish> {
  if (!validInput(challengeId, credential)) return { ok: false, message: 'That took too long. Try again.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.passkey.verifyRegistration({ challengeId, credential: credential as never });
  if (error) return { ok: false, message: messageFor(error.code, 'We couldn’t save that passkey. Please try again.') };
  revalidatePath('/settings');
  return { ok: true, redirectTo: safeNextPath(next, '/settings') };
}

export async function removePasskeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const passkeyId = field(formData, 'passkeyId');
  if (!/^[0-9a-f-]{36}$/i.test(passkeyId)) return failure('Choose a passkey to remove.');
  const supabase = await createClient();
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) return failure(messageFor(error.code, 'We couldn’t remove that passkey. Please try again.'));
  revalidatePath('/settings');
  return success('Removed. That device can no longer sign in with Face ID or fingerprint.');
}

/** "Not now" on the Face ID offer: don't offer again on this browser for 30 days. */
export async function skipPasskeySetupAction(next: string): Promise<PasskeyFinish> {
  const cookieStore = await cookies();
  cookieStore.set(PASSKEY_PROMPT_SKIPPED_COOKIE, '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true, redirectTo: safeNextPath(next, '/dashboard') };
}

