import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * What this browser is waiting to verify with an emailed code. Sign-up details
 * (role, name, age-screen date of birth) are kept here, in the browser that
 * passed the age screen, and applied only after the code proves the person
 * owns the email. Nothing is attached to the account before that, because
 * anyone can create an unconfirmed account for any email address.
 */
const COOKIE = 'br_pending_verification';
const MAX_AGE_SECONDS = 60 * 60;

const pendingSchema = z.object({
  /** signup: new account; reset: new password; login: sign in with the code alone. */
  purpose: z.enum(['signup', 'reset', 'login']),
  /** Where to go after a code login (checked again with safeNextPath before use). */
  next: z.string().max(500).optional(),
  email: z.string().min(3).max(254),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountType: z.enum(['athlete', 'parent', 'coach']).optional(),
  displayName: z.string().max(80).optional(),
});

export type PendingVerification = z.infer<typeof pendingSchema>;

function secureCookies(): boolean {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');
}

export async function setPendingVerification(pending: PendingVerification): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, Buffer.from(JSON.stringify(pending), 'utf8').toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingVerification(): Promise<PendingVerification | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function clearPendingVerification(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
