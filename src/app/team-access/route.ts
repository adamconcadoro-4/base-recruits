import { NextResponse, type NextRequest } from 'next/server';

import { TEAM_ACCESS_PATH, sitePrivate, teamCode, teamCodeHtml } from '@/config/site-access';
import { TEAM_PASS_COOKIE, TEAM_PASS_MAX_AGE_SECONDS, sameText, teamPassValue } from '@/lib/auth/team-pass';

/**
 * The team code step in front of sign-in while the site is private
 * (src/config/site-access.ts). GET shows the form; POST checks the code.
 */

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

/** A same-site redirect. Relative, because a route handler's request.url can name another host than the browser used. */
function goTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

export function GET(request: NextRequest): NextResponse {
  if (!sitePrivate() || teamCode() === null) return goTo('/login');
  const wrong = request.nextUrl.searchParams.get('wrong') === '1';
  return new NextResponse(teamCodeHtml({ wrong }), { status: 200, headers: PAGE_HEADERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const code = teamCode();
  if (!sitePrivate() || code === null) return goTo('/login');

  let entered = '';
  try {
    const value = (await request.formData()).get('code');
    entered = typeof value === 'string' ? value.trim().slice(0, 200) : '';
  } catch {
    entered = '';
  }

  if (!entered || !sameText(entered, code)) {
    // Slows down guessing; the code itself should be long (see docs/deployment.md).
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return goTo(`${TEAM_ACCESS_PATH}?wrong=1`);
  }

  const response = goTo('/login');
  response.cookies.set(TEAM_PASS_COOKIE, await teamPassValue(code), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    maxAge: TEAM_PASS_MAX_AGE_SECONDS,
  });
  return response;
}
