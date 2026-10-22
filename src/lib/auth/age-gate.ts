import 'server-only';

import { cookies } from 'next/headers';

/**
 * After an under-13 answer at the age screen, this browser is blocked from
 * retrying for a day. The cookie holds no personal information and no account
 * is created.
 */
const AGE_GATE_COOKIE = 'br_age_gate';
const BLOCK_SECONDS = 60 * 60 * 24;

export async function isAgeGateBlocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(AGE_GATE_COOKIE)?.value === 'blocked';
}

export async function blockAgeGate(): Promise<void> {
  const store = await cookies();
  store.set(AGE_GATE_COOKIE, 'blocked', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    path: '/',
    maxAge: BLOCK_SECONDS,
  });
}
