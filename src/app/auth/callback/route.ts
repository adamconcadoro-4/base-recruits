import { NextResponse, type NextRequest } from 'next/server';

import { safeNextPath } from '@/lib/auth/route-access';
import { createClient } from '@/lib/supabase/server';

/**
 * Email confirmation lands here with a one-time code (PKCE). Exchanging it
 * signs the person in on this device; then they continue to `next`, which must
 * be a path on this site.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'), '/dashboard');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL('/login?error=confirmation', request.url));
}
