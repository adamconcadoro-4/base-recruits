import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { findProtectedRoute, loginRedirectFor } from '@/lib/auth/route-access';

/**
 * Runs before every page request:
 *  1. refreshes the Supabase session cookie, and
 *  2. sends anonymous visitors on protected prefixes to sign in.
 * Role, onboarding and coach-verification gates run in the protected layouts
 * (src/lib/auth/guard.ts), and the database enforces everything again with RLS.
 * Public discovery pages never require an account.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isProtected = findProtectedRoute(request.nextUrl.pathname) !== null;

  if (!url || !key) {
    // Supabase is not configured (e.g. a marketing-only preview): public pages
    // still work; protected pages cannot.
    return isProtected
      ? NextResponse.redirect(new URL(loginRedirectFor(request.nextUrl.pathname), request.url))
      : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === 'string';

  if (!signedIn && isProtected) {
    const redirect = NextResponse.redirect(new URL(loginRedirectFor(request.nextUrl.pathname), request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
};
