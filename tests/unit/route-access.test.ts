import { describe, expect, it } from 'vitest';

import { homePathFor, isSelfSelectableRole } from '@/lib/auth/roles';
import {
  ANONYMOUS,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
  evaluateRouteAccess,
  normalizePath,
  safeNextPath,
  signedOutRedirectFor,
  type Viewer,
} from '@/lib/auth/route-access';

const signedIn = (overrides: Partial<Extract<Viewer, { kind: 'signed_in' }>> = {}): Viewer => ({
  kind: 'signed_in',
  userId: '00000000-0000-4000-8000-000000000001',
  roles: ['athlete'],
  onboardingComplete: true,
  verifiedCoach: false,
  ...overrides,
});

describe('public routes (product invariants 2 and 3)', () => {
  it('are reachable without an account', () => {
    for (const path of PUBLIC_ROUTES) {
      expect(evaluateRouteAccess(path, ANONYMOUS)).toEqual({ allowed: true });
    }
  });

  it('are never shadowed by a protected prefix', () => {
    for (const path of PUBLIC_ROUTES) {
      for (const route of PROTECTED_ROUTES) {
        expect(path === route.prefix || path.startsWith(`${route.prefix}/`)).toBe(false);
      }
    }
  });

  it('do not confuse /coaches (public) with /coach (protected)', () => {
    expect(evaluateRouteAccess('/coaches', ANONYMOUS)).toEqual({ allowed: true });
    expect(evaluateRouteAccess('/coach', ANONYMOUS).allowed).toBe(false);
  });
});

describe('route requirements', () => {
  it('can only express sign-in, role, onboarding and coach verification — never payment', () => {
    const allowedKeys = new Set(['role', 'verifiedCoach', 'duringOnboarding']);
    for (const route of PROTECTED_ROUTES) {
      for (const key of Object.keys(route.requirement)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });
});

describe('evaluateRouteAccess', () => {
  it('sends anonymous visitors to login with a safe return path', () => {
    expect(evaluateRouteAccess('/athlete/settings', ANONYMOUS)).toEqual({
      allowed: false,
      reason: 'sign_in_required',
      redirectTo: '/login?next=%2Fathlete%2Fsettings',
    });
  });

  it('sends accounts without a role or birth date to onboarding', () => {
    const viewer = signedIn({ roles: [], onboardingComplete: false });
    expect(evaluateRouteAccess('/dashboard', viewer)).toMatchObject({ reason: 'onboarding_required' });
    expect(evaluateRouteAccess('/onboarding', viewer)).toEqual({ allowed: true });
  });

  it('keeps each role to its own area', () => {
    expect(evaluateRouteAccess('/athlete', signedIn())).toEqual({ allowed: true });
    expect(evaluateRouteAccess('/admin', signedIn())).toMatchObject({ reason: 'role_required' });
    expect(evaluateRouteAccess('/parent/athletes', signedIn())).toMatchObject({ reason: 'role_required' });
    expect(evaluateRouteAccess('/coach', signedIn())).toMatchObject({ reason: 'role_required' });
  });

  it('lets an unverified coach manage verification but not use coach tools', () => {
    const coach = signedIn({ roles: ['coach'] });
    expect(evaluateRouteAccess('/coach', coach)).toEqual({ allowed: true });
    expect(evaluateRouteAccess('/coach/verification', coach)).toEqual({ allowed: true });
    for (const path of ['/coach/athletes', '/coach/boards/12', '/coach/messages']) {
      expect(evaluateRouteAccess(path, coach)).toEqual({
        allowed: false,
        reason: 'coach_verification_required',
        redirectTo: '/coach/verification',
      });
    }
  });

  it('gives verified coaches every coach tool with no subscription', () => {
    const coach = signedIn({ roles: ['coach'], verifiedCoach: true });
    for (const path of ['/coach/athletes', '/coach/boards', '/coach/messages']) {
      expect(evaluateRouteAccess(path, coach)).toEqual({ allowed: true });
    }
  });

  it('sends signed-out visitors to Assessment to its public explanation, and lets any onboarded account in', () => {
    for (const path of ['/assessment', '/assessment/film', '/assessment/0b6c2c3e-0000-4000-8000-000000000001/report']) {
      expect(evaluateRouteAccess(path, ANONYMOUS)).toEqual({
        allowed: false,
        reason: 'sign_in_required',
        redirectTo: '/player-assessment',
      });
      expect(signedOutRedirectFor(path)).toBe('/player-assessment');
    }
    expect(signedOutRedirectFor('/athlete')).toBe('/login?next=%2Fathlete');
    for (const roles of [['athlete'], ['parent'], ['coach'], ['development_coach']] as const) {
      expect(evaluateRouteAccess('/assessment', signedIn({ roles: [...roles] }))).toEqual({ allowed: true });
    }
    expect(evaluateRouteAccess('/assessment', signedIn({ roles: [], onboardingComplete: false }))).toMatchObject({
      reason: 'onboarding_required',
    });
  });

  it('normalizes paths before matching', () => {
    expect(normalizePath('/admin/')).toBe('/admin');
    expect(normalizePath('//admin//users?x=1')).toBe('/admin/users');
    expect(evaluateRouteAccess('/admin/?tab=1', signedIn()).allowed).toBe(false);
    expect(evaluateRouteAccess('/administration', signedIn())).toEqual({ allowed: true });
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/athlete/schools?list=reach')).toBe('/athlete/schools?list=reach');
  });

  it('rejects anything that could leave the site', () => {
    for (const attack of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/ok\u0000']) {
      expect(safeNextPath(attack)).toBe('/dashboard');
    }
    expect(safeNextPath(null, '/')).toBe('/');
  });

  it('rejects paths whose dot segments collapse to another site', () => {
    for (const attack of ['/.//evil.com', '/%2e//evil.com', '/a/..//evil.com', '/./%2e//evil.com/x']) {
      expect(safeNextPath(attack)).toBe('/dashboard');
    }
  });

  it('never returns a protocol-relative path', () => {
    for (const candidate of ['/', '/a/../b', '/athlete/./schools', '/x?next=//y']) {
      expect(safeNextPath(candidate).startsWith('//')).toBe(false);
    }
  });
});

describe('roles', () => {
  it('never lets admin be self-selected', () => {
    expect(isSelfSelectableRole('admin')).toBe(false);
    expect(isSelfSelectableRole('coach')).toBe(true);
    expect(isSelfSelectableRole('development_coach')).toBe(true);
  });

  it('sends development coaches to Assessment', () => {
    expect(homePathFor(['development_coach'], 'development_coach')).toBe('/assessment');
  });

  it('routes people to their primary role home, or onboarding', () => {
    expect(homePathFor(['athlete', 'parent'], 'parent')).toBe('/parent');
    expect(homePathFor(['parent', 'coach'], null)).toBe('/coach');
    expect(homePathFor([], null)).toBe('/onboarding');
    expect(homePathFor(['athlete'], 'coach')).toBe('/athlete');
  });
});
