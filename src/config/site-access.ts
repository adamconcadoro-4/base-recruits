/**
 * Private mode: takes the whole site off the public web without deleting anything.
 *
 * When SITE_PRIVATE is exactly "true" (a server-only Vercel variable; redeploy
 * after changing it), every page shows a short "coming soon" notice instead,
 * except for:
 *  - the sign-in, sign-up, code and reset pages, so the team can get in;
 *  - the SeamState API routes, which check their own secrets; and
 *  - anyone signed in with a team email below.
 * Sign-up is refused for every other email while the site is private, and
 * search engines are told not to index anything.
 *
 * Unset it (or set it to anything else) and redeploy to put the site back.
 */

/** The same two addresses the database allows as admins (migration 20261102000300). */
export const SITE_TEAM_EMAILS = ['adamconcadoro@gmail.com', 'jcaceres120@gmail.com'] as const;

/** Paths that stay reachable for everyone while the site is private. */
const OPEN_WHILE_PRIVATE = ['/login', '/signup', '/verify', '/reset', '/api/seamstate', '/robots.txt'] as const;

export function sitePrivate(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.SITE_PRIVATE === 'true';
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
  <a href="/login">Team sign in</a>
</main>
</body>
</html>`;
