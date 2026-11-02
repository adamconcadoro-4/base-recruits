/**
 * Private mode: takes the whole site off the public web without deleting anything.
 *
 * When SITE_PRIVATE is exactly "true" (a server-only Vercel variable; redeploy
 * after changing it), every page shows a short "coming soon" notice instead,
 * except for:
 *  - the sign-in, sign-up, code and reset pages, so the team can get in
 *    (behind a team code when SITE_TEAM_CODE is set, see below);
 *  - the SeamState API routes, which check their own secrets; and
 *  - anyone signed in with a team email below, and test accounts an
 *    administrator opened (Admin → Test accounts), which no one can sign in to
 *    any other way.
 * Sign-up is refused for every other email while the site is private, and
 * search engines are told not to index anything.
 *
 * Unset it (or set it to anything else) and redeploy to put the site back.
 */

/** The same two addresses the database allows as admins (migration 20261102000300). */
export const SITE_TEAM_EMAILS = ['adamconcadoro@gmail.com', 'jcaceres120@gmail.com'] as const;

/** Paths that stay reachable for everyone while the site is private. */
const OPEN_WHILE_PRIVATE = ['/login', '/signup', '/verify', '/reset', '/team-access', '/api/seamstate', '/robots.txt'] as const;

/**
 * Team code (2026-11-02, founder: "add a code needed to login to the Team sign
 * in link"). While private, and when SITE_TEAM_CODE is set (server-only Vercel
 * variable, at least 8 characters), the sign-in, sign-up, code and reset pages
 * first ask for that code at /team-access. A correct code is remembered on that
 * browser for 30 days (src/lib/auth/team-pass.ts); changing the variable makes
 * every browser enter the new code. Team members already signed in skip it.
 */
const NEEDS_TEAM_CODE = ['/login', '/signup', '/verify', '/reset'] as const;

export const TEAM_ACCESS_PATH = '/team-access';

export const MINIMUM_TEAM_CODE_LENGTH = 8;

export function sitePrivate(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.SITE_PRIVATE === 'true';
}

/** The team code, when private mode uses one (unset or too short means no code is asked for). */
export function teamCode(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const code = env.SITE_TEAM_CODE?.trim();
  return code && code.length >= MINIMUM_TEAM_CODE_LENGTH ? code : null;
}

function needsTeamCode(pathname: string): boolean {
  return NEEDS_TEAM_CODE.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type PrivateSiteDecision = 'allow' | 'coming_soon' | 'team_code';

/** The signed-in account as the proxy sees it: its email, and whether the server created it as a test account. */
export interface SiteViewer {
  readonly email: string | null;
  readonly testAccount?: boolean;
}

/**
 * What a request may see. `viewer` is the signed-in account (or its email, or
 * null); `hasTeamPass` is whether this browser entered the current team code.
 */
export function privateSiteDecision(
  pathname: string,
  viewer: SiteViewer | string | null,
  hasTeamPass: boolean,
  env: Readonly<Record<string, string | undefined>> = process.env,
): PrivateSiteDecision {
  const signedIn: SiteViewer = typeof viewer === 'string' || viewer === null ? { email: viewer } : viewer;
  if (!sitePrivate(env) || isTeamEmail(signedIn.email) || signedIn.testAccount === true) return 'allow';
  if (!openWhilePrivate(pathname)) return 'coming_soon';
  if (needsTeamCode(pathname) && teamCode(env) !== null && !hasTeamPass) return 'team_code';
  return 'allow';
}

export function isTeamEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return SITE_TEAM_EMAILS.some((teamEmail) => teamEmail === normalized);
}

function openWhilePrivate(pathname: string): boolean {
  return OPEN_WHILE_PRIVATE.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Whether a request may see the real site. `email` is the signed-in account's email, or null. */
export function siteAccessAllowed(pathname: string, email: string | null, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!sitePrivate(env)) return true;
  return openWhilePrivate(pathname) || isTeamEmail(email);
}

/** The page everyone else sees while the site is private. Self-contained: no site navigation or links into the app. */
export const COMING_SOON_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Base Recruits | Coming soon</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
  main { max-width: 32rem; padding: 2rem 1.5rem; text-align: center; }
  h1 { font-size: 1.75rem; margin: 0 0 0.75rem; }
  p { line-height: 1.6; margin: 0 0 1rem; color: #334155; }
  a { color: #1d4ed8; font-size: 0.875rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f8fafc; }
    p { color: #cbd5e1; }
    a { color: #93c5fd; }
  }
</style>
</head>
<body>
<main>
  <h1>Base Recruits is coming soon</h1>
  <p>We're getting the site ready. Please check back later.</p>
  <a href="/team-access">Team sign in</a>
</main>
</body>
</html>`;

/** The team code page (private mode with SITE_TEAM_CODE set). Self-contained like the coming-soon page. */
export function teamCodeHtml(options: { readonly wrong: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Base Recruits | Team sign in</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
  main { width: 100%; max-width: 24rem; padding: 2rem 1.5rem; box-sizing: border-box; }
  h1 { font-size: 1.75rem; margin: 0 0 0.75rem; }
  p { line-height: 1.6; margin: 0 0 1rem; color: #334155; }
  label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
  input { width: 100%; box-sizing: border-box; font: inherit; padding: 0.7rem 0.8rem; border: 2px solid #475569; border-radius: 0.375rem; background: #fff; color: #0f172a; }
  button { margin-top: 1rem; width: 100%; font: inherit; font-weight: 600; padding: 0.75rem 1rem; border: 0; border-radius: 0.375rem; background: #1d4ed8; color: #fff; cursor: pointer; }
  .error { border-left: 4px solid #b91c1c; padding: 0.5rem 0.75rem; background: #fef2f2; color: #7f1d1d; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f8fafc; }
    p { color: #cbd5e1; }
    input { background: #1e293b; color: #f8fafc; border-color: #94a3b8; }
    .error { background: #450a0a; color: #fecaca; }
  }
</style>
</head>
<body>
<main>
  <h1>Team sign in</h1>
  <p>Base Recruits isn't open yet. Enter the team code to continue to sign in.</p>
  ${options.wrong ? '<p class="error" role="alert">That code isn\'t right. Try again.</p>' : ''}
  <form method="post" action="${TEAM_ACCESS_PATH}">
    <label for="code">Team code</label>
    <input id="code" name="code" type="password" autocomplete="off" required autofocus>
    <button type="submit">Continue</button>
  </form>
</main>
</body>
</html>`;
}
