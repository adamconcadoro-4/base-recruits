/**
 * Search-engine indexing is OFF unless it is switched on deliberately.
 *
 * The site is indexed only when BOTH are true:
 *  - NEXT_PUBLIC_APP_ENV is `production`, and
 *  - ALLOW_INDEXING is exactly `true` (a server-only Vercel variable).
 *
 * Previews, staging, local builds and a production build without the switch
 * all send `noindex` on every page and a robots.txt that disallows crawling.
 * Turn it on only after launch sign-off (legal pages, support contact,
 * custom domain); see docs/deployment.md.
 */
export function indexingAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.NEXT_PUBLIC_APP_ENV === 'production' && env.ALLOW_INDEXING === 'true';
}

/** Signed-in areas. Never useful in search results, and they redirect to log in. */
export const PRIVATE_PREFIXES = ['/admin', '/dashboard', '/settings', '/onboarding', '/athlete', '/parent', '/coach'] as const;

/** Public pages worth listing in the sitemap (school pages are added from the registry). */
export const SITEMAP_PAGES = [
  '/',
  '/schools',
  '/match',
  '/how-it-works',
  '/athletes',
  '/transfers',
  '/coaches',
  '/pricing',
  '/resources',
  '/data-methodology',
  '/privacy',
  '/terms',
  '/accessibility',
  '/support',
] as const;
