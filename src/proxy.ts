import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { findProtectedRoute, loginRedirectFor } from '@/lib/auth/route-access';
import { COMPARE_COOKIE, COMPARE_COOKIE_MAX_AGE, decideCompare, isPrefetchRequest } from '@/lib/registry/compare-selection';
import { sessionCookieOptions } from '@/lib/supabase/cookie-options';

/** Stores (or clears) the comparison selection on the outgoing response. */
function storeCompare(response: NextResponse, value: string | undefined, secure: boolean): NextResponse {
  if (value === undefined) return response;
  if (value === '') {
    response.cookies.delete(COMPARE_COOKIE);
  } else {
    response.cookies.set(COMPARE_COOKIE, value, {
      // Readable by the page so client-rendered lists can show "In comparison";
      // it holds only public school identifiers.
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: COMPARE_COOKIE_MAX_AGE,
    });
  }
  return response;
}

/**
 * Runs before every page request:
 *  1. keeps the comparison selection across navigation (see
 *     src/lib/registry/compare-selection.ts),
 *  2. refreshes the Supabase session cookie, and
 *  3. sends anonymous visitors on protected prefixes to sign in.
 * Role, onboarding and coach-verification gates run in the protected layouts
 * (src/lib/auth/guard.ts), and the database enforces everything again with RLS.
 * Public discovery pages never require an account.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isProtected = findProtectedRoute(request.nextUrl.pathname) !== null;
  const secure = request.nextUrl.protocol === 'https:';

  const compare = decideCompare(
    new URL(request.url),
    request.method,
    request.cookies.get(COMPARE_COOKIE)?.value,
    isPrefetchRequest(request.headers),
  );
  if (compare.redirectTo) return NextResponse.redirect(compare.redirectTo);

  if (!url || !key) {
    // Supabase is not configured (e.g. a marketing-only preview): public pages
    // still work; protected pages cannot.
    return isProtected
      ? NextResponse.redirect(new URL(loginRedirectFor(request.nextUrl.pathname), request.url))
      : storeCompare(NextResponse.next({ request }), compare.store, secure);
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

  if (!signedIn && isProtected) {
    const redirect = NextResponse.redirect(new URL(loginRedirectFor(request.nextUrl.pathname), request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [name, value] of Object.entries(refreshHeaders)) redirect.headers.set(name, value);
    return redirect;
  }
  return storeCompare(response, compare.store, secure);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
};
