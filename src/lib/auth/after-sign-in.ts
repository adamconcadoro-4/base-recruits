import 'server-only';

import { cookies } from 'next/headers';

import type { createClient } from '@/lib/supabase/server';

/** The client that just signed the person in (it holds the new session). */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Set when someone answers "Not now" to the Face ID offer (30 days, this browser only). */
export const PASSKEY_PROMPT_SKIPPED_COOKIE = 'br_passkey_offer_skipped';

export const PASSKEY_SETUP_PATH = '/settings/passkey';

export function passkeySetupPath(next: string): string {
  return next === '/dashboard' ? PASSKEY_SETUP_PATH : `${PASSKEY_SETUP_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * After an emailed-code or password sign-in: offer Face ID / fingerprint setup
 * to accounts with no passkey yet (unless this browser said "Not now"), then
 * continue to `next`. Any problem asking Supabase (for example passkeys not
 * switched on) just continues to `next`.
 */
export async function afterSignInPath(supabase: SupabaseServerClient, next: string): Promise<string> {
  const cookieStore = await cookies();
  if (cookieStore.get(PASSKEY_PROMPT_SKIPPED_COOKIE)) return next;
  try {
    const { data, error } = await supabase.auth.passkey.list();
    if (error || !Array.isArray(data) || data.length > 0) return next;
    return passkeySetupPath(next);
  } catch {
    return next;
  }
}
