import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { COMING_SOON_HTML, TEAM_ACCESS_PATH, privateSiteDecision, teamCode, type PrivateSiteDecision } from '@/config/site-access';
import { TEAM_PASS_COOKIE, teamPassValid } from '@/lib/auth/team-pass';
import { findProtectedRoute, signedOutRedirectFor } from '@/lib/auth/route-access';
import { sessionCookieOptions } from '@/lib/supabase/cookie-options';

/**
 * Runs before every page request:
 *  1. refreshes the Supabase session cookie, and
 *  2. sends anonymous visitors on protected prefixes to sign in, and
 *  3. while the site is private (SITE_PRIVATE=true), shows everyone except the
 *     team a "coming soon" page, and asks for the team code (SITE_TEAM_CODE)
 *     before the sign-in pages (src/config/site-access.ts).
 * It never changes the comparison selection: only form posts do.
 * Role, onboarding and coach-verification gates run in the protected layouts
 * (src/lib/auth/guard.ts), and the database enforces everything again with RLS.
 * Public discovery pages never require an account.
 */
function comingSoon(): NextResponse {
  return new NextResponse(COMING_SOON_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/** The coming-soon page, or (for the sign-in pages) the team code step. */
function privateResponse(decision: Exclude<PrivateSiteDecision, 'allow'>, request: NextRequest): NextResponse {
  if (decision === 'coming_soon') return comingSoon();
  const redirect = NextResponse.redirect(new URL(TEAM_ACCESS_PATH, request.url), 303);
  redirect.headers.set('Cache-Control', 'no-store');
  return redirect;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isProtected = findProtectedRoute(request.nextUrl.pathname) !== null;

  const hasTeamPass = await teamPassValid(request.cookies.get(TEAM_PASS_COOKIE)?.value, teamCode());

  if (!url || !key) {
    const decision = privateSiteDecision(request.nextUrl.pathname, null, hasTeamPass);
    if (decision !== 'allow') return privateResponse(decision, request);
    // Supabase is not configured (e.g. a marketing-only preview): public pages
    // still work; protected pages cannot.
    return isProtected
      ? NextResponse.redirect(new URL(signedOutRedirectFor(request.nextUrl.pathname), request.url))
      : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  // Headers Supabase asks for when it refreshes a session (no-store caching),
  // so a shared cache can never hand one person's session cookie to another.
  let refreshHeaders: Record<string, string> = {};
  const supabase = createServerClient(url, key, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        refreshHeaders = { ...(headers ?? {}) };
        for (const [name, value] of Object.entries(refreshHeaders)) response.headers.set(name, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === 'string';
  const email = signedIn && typeof data?.claims?.email === 'string' ? data.claims.email : null;

  const decision = privateSiteDecision(request.nextUrl.pathname, email, hasTeamPass);
  if (decision !== 'allow') {
    const blocked = privateResponse(decision, request);
    for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
    return blocked;
  }

  if (!signedIn && isProtected) {
    const redirect = NextResponse.redirect(new URL(signedOutRedirectFor(request.nextUrl.pathname), request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [name, value] of Object.entries(refreshHeaders)) redirect.headers.set(name, value);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
};
