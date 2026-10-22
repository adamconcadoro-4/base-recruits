/**
 * Account roles. Mirrors the public.app_role enum.
 * athlete / parent / coach are chosen at signup; admin is only ever granted by
 * an existing admin (database: admin_grant_role, bootstrap_first_admin).
 */

export const APP_ROLES = ['athlete', 'parent', 'coach', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const SELF_SELECTABLE_ROLES = ['athlete', 'parent', 'coach'] as const satisfies readonly AppRole[];
export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<AppRole, string>> = {
  athlete: 'Athlete',
  parent: 'Parent or guardian',
  coach: 'College coach',
  admin: 'Administrator',
};

export const ROLE_HOME_PATHS: Readonly<Record<AppRole, string>> = {
  athlete: '/athlete',
  parent: '/parent',
  coach: '/coach',
  admin: '/admin',
};

/** When an account holds several roles and no primary role, land here first. */
const ROLE_PRECEDENCE: readonly AppRole[] = ['admin', 'coach', 'athlete', 'parent'];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

export function isSelfSelectableRole(value: unknown): value is SelfSelectableRole {
  return typeof value === 'string' && (SELF_SELECTABLE_ROLES as readonly string[]).includes(value);
}

/** Where a signed-in user lands after login. No roles yet → onboarding. */
export function homePathFor(roles: readonly AppRole[], primaryRole: AppRole | null): string {
  if (primaryRole && roles.includes(primaryRole)) return ROLE_HOME_PATHS[primaryRole];
  const first = ROLE_PRECEDENCE.find((role) => roles.includes(role));
  return first ? ROLE_HOME_PATHS[first] : '/onboarding';
}
