/**
 * Server-side route access policy.
 *
 * Used by the request proxy (session gate) and by every protected layout
 * (role gate). The database enforces the same rules again through RLS, so a
 * mistake here can hide a page but never expose data.
 *
 * Structural free-access guarantee: a route requirement can ask for sign-in, a
 * role, completed onboarding or coach verification — the type has no way to
 * express payment or a subscription. Public discovery routes have no rule at all.
 */

import type { AppRole } from './roles';

export type Viewer =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'signed_in';
      readonly userId: string;
      readonly roles: readonly AppRole[];
      /** false until the account has a role and a recorded date of birth */
      readonly onboardingComplete: boolean;
      readonly verifiedCoach: boolean;
    };

export const ANONYMOUS: Viewer = { kind: 'anonymous' };

interface RouteRequirement {
  readonly role?: AppRole;
  readonly verifiedCoach?: true;
  /** Reachable before onboarding is complete (the onboarding pages themselves). */
  readonly duringOnboarding?: true;
}

export interface ProtectedRoute {
  readonly prefix: string;
  readonly requirement: RouteRequirement;
}

/** Every route under these prefixes requires a signed-in user. */
export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  { prefix: '/onboarding', requirement: { duringOnboarding: true } },
  { prefix: '/dashboard', requirement: {} },
  { prefix: '/settings', requirement: {} },
  { prefix: '/athlete', requirement: { role: 'athlete' } },
  { prefix: '/parent', requirement: { role: 'parent' } },
  { prefix: '/coach', requirement: { role: 'coach' } },
  { prefix: '/coach/athletes', requirement: { role: 'coach', verifiedCoach: true } },
  { prefix: '/coach/boards', requirement: { role: 'coach', verifiedCoach: true } },
  { prefix: '/coach/messages', requirement: { role: 'coach', verifiedCoach: true } },
  { prefix: '/admin', requirement: { role: 'admin' } },
];

/**
 * Public routes from the product spec. They must stay reachable by anonymous
 * visitors (product invariants 2 and 3); tests assert this.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/schools',
  '/schools/example-slug',
  '/match',
  '/compare',
  '/saved',
  '/support',
  '/how-it-works',
  '/athletes',
  '/transfers',
  '/coaches',
  '/pricing',
  '/resources',
  '/login',
  '/signup',
  '/privacy',
  '/terms',
  '/data-methodology',
  '/accessibility',
] as const;

export type DenialReason = 'sign_in_required' | 'onboarding_required' | 'role_required' | 'coach_verification_required';

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason; readonly redirectTo: string };

export const COACH_VERIFICATION_PATH = '/coach/verification';
export const ONBOARDING_PATH = '/onboarding';

export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? '/';
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed || '/';
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function findProtectedRoute(pathname: string): ProtectedRoute | null {
  const path = normalizePath(pathname);
  let best: ProtectedRoute | null = null;
  for (const route of PROTECTED_ROUTES) {
    if (matchesPrefix(path, route.prefix) && (!best || route.prefix.length > best.prefix.length)) {
      best = route;
    }
  }
  return best;
}

/**
 * Only same-site relative paths are accepted as post-login destinations, so a
 * crafted ?next= cannot send people to another site.
 */
export function safeNextPath(candidate: string | null | undefined, fallback = '/dashboard'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback;
  if ([...candidate].some((character) => character.charCodeAt(0) < 0x20)) return fallback;
  try {
    const url = new URL(candidate, 'https://base-recruits.invalid');
    if (url.origin !== 'https://base-recruits.invalid') return fallback;
    // Dot segments can collapse to a protocol-relative path ("/.//evil.com"
    // becomes "//evil.com"), which a later redirect would treat as another
    // site, so check the normalized result too.
    const path = url.pathname;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
    return `${path}${url.search}`;
  } catch {
    return fallback;
  }
}

export function loginRedirectFor(pathname: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(normalizePath(pathname)))}`;
}

export function evaluateRouteAccess(pathname: string, viewer: Viewer): AccessDecision {
  const route = findProtectedRoute(pathname);
  if (!route) return { allowed: true };

  if (viewer.kind === 'anonymous') {
    return { allowed: false, reason: 'sign_in_required', redirectTo: loginRedirectFor(pathname) };
  }

  const { requirement } = route;
  if (!viewer.onboardingComplete && !requirement.duringOnboarding) {
    return { allowed: false, reason: 'onboarding_required', redirectTo: ONBOARDING_PATH };
  }
  if (requirement.role && !viewer.roles.includes(requirement.role)) {
    return { allowed: false, reason: 'role_required', redirectTo: '/dashboard' };
  }
  if (requirement.verifiedCoach && !viewer.verifiedCoach) {
    return { allowed: false, reason: 'coach_verification_required', redirectTo: COACH_VERIFICATION_PATH };
  }
  return { allowed: true };
}
