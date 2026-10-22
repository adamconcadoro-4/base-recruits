/**
 * Session cookie settings. The browser never calls Supabase directly (every
 * Supabase call runs on the server), so the session cookie can be hidden from
 * page scripts (httpOnly) and, on https sites, sent only over https.
 */
export function sessionCookieOptions() {
  return {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    // 30 days; the refresh token keeps rotating within that window.
    maxAge: 60 * 60 * 24 * 30,
  };
}
