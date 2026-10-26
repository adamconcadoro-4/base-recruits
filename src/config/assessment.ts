/**
 * Site switch for Base Recruits Assessment.
 *
 * Assessment appears on the site only when NEXT_PUBLIC_ASSESSMENT_ENABLED is
 * exactly "true" when the site is built. It is unset in production, so the
 * Assessment tab, pages and the development-coach sign-up option stay hidden.
 *
 * The database has its own switches (admin → Assessment), which refuse every
 * Assessment write and every video upload until an administrator turns them
 * on. Both must be on for Assessment to work; either one alone keeps it off.
 */
export function assessmentSiteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true';
}
