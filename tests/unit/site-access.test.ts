import { describe, expect, it } from 'vitest';

import { emailSignInRefused, isTeamEmail, privateSiteDecision, siteAccessAllowed, sitePrivate, teamCode, teamCodeHtml } from '@/config/site-access';
import { sameText, teamPassValid, teamPassValue } from '@/lib/auth/team-pass';
import { indexingAllowed } from '@/lib/seo/indexing';

const PRIVATE = { SITE_PRIVATE: 'true' };
const PUBLIC = {};

describe('private mode (SITE_PRIVATE)', () => {
  it('is off unless the variable is exactly "true"', () => {
    expect(sitePrivate(PUBLIC)).toBe(false);
    expect(sitePrivate({ SITE_PRIVATE: 'TRUE' })).toBe(false);
    expect(sitePrivate({ SITE_PRIVATE: '1' })).toBe(false);
    expect(sitePrivate(PRIVATE)).toBe(true);
  });

  it('changes nothing when the site is public', () => {
    for (const path of ['/', '/schools', '/admin', '/dashboard']) {
      expect(siteAccessAllowed(path, null, PUBLIC)).toBe(true);
    }
  });

  it('hides every page from anonymous visitors while private', () => {
    for (const path of ['/', '/schools', '/schools/example-slug', '/pricing', '/privacy', '/dashboard', '/admin', '/assessment']) {
      expect(siteAccessAllowed(path, null, PRIVATE)).toBe(false);
    }
  });

  it('keeps sign-in, sign-up, code, reset and the SeamState API reachable', () => {
    for (const path of ['/login', '/login/code', '/signup', '/verify', '/reset', '/api/seamstate/callback', '/api/seamstate/dispatch', '/robots.txt']) {
      expect(siteAccessAllowed(path, null, PRIVATE)).toBe(true);
    }
  });

  it('does not open look-alike paths', () => {
    expect(siteAccessAllowed('/login-help', null, PRIVATE)).toBe(false);
    expect(siteAccessAllowed('/api/other', null, PRIVATE)).toBe(false);
  });

  it('lets only the two team emails see the full site', () => {
    expect(siteAccessAllowed('/', 'adamconcadoro@gmail.com', PRIVATE)).toBe(true);
    expect(siteAccessAllowed('/admin', 'JCaceres120@gmail.com', PRIVATE)).toBe(true);
    expect(siteAccessAllowed('/', 'someone@example.com', PRIVATE)).toBe(false);
    expect(isTeamEmail(null)).toBe(false);
    expect(isTeamEmail('adamconcadoro@gmail.com.evil.test')).toBe(false);
  });

  it('turns search indexing off even if indexing is switched on', () => {
    const live = { NEXT_PUBLIC_APP_ENV: 'production', ALLOW_INDEXING: 'true' };
    expect(indexingAllowed(live)).toBe(true);
    expect(indexingAllowed({ ...live, ...PRIVATE })).toBe(false);
  });
});

describe('team code in front of sign-in (SITE_TEAM_CODE)', () => {
  const WITH_CODE = { SITE_PRIVATE: 'true', SITE_TEAM_CODE: 'curveball-bullpen-42' };

  it('is only used while private, with a code of at least 8 characters', () => {
    expect(teamCode({ SITE_TEAM_CODE: 'short' })).toBeNull();
    expect(teamCode({})).toBeNull();
    expect(teamCode(WITH_CODE)).toBe('curveball-bullpen-42');
    expect(privateSiteDecision('/login', null, false, { SITE_TEAM_CODE: 'curveball-bullpen-42' })).toBe('allow');
    expect(privateSiteDecision('/login', null, false, PRIVATE)).toBe('allow');
  });

  it('asks for the code before the sign-in, sign-up, code and reset pages', () => {
    for (const path of ['/login', '/login/code', '/signup', '/verify', '/reset']) {
      expect(privateSiteDecision(path, null, false, WITH_CODE)).toBe('team_code');
      expect(privateSiteDecision(path, null, true, WITH_CODE)).toBe('allow');
    }
  });

  it('keeps the code page and the SeamState API reachable, and everything else hidden', () => {
    expect(privateSiteDecision('/team-access', null, false, WITH_CODE)).toBe('allow');
    expect(privateSiteDecision('/api/seamstate/callback', null, false, WITH_CODE)).toBe('allow');
    expect(privateSiteDecision('/', null, true, WITH_CODE)).toBe('coming_soon');
    expect(privateSiteDecision('/dashboard', 'someone@example.com', true, WITH_CODE)).toBe('coming_soon');
  });

  it('lets test accounts an administrator opened see the site, but not look-alike emails', () => {
    expect(privateSiteDecision('/assessment', { email: 'player-1a2b3c4d@test.baserecruits.app', testAccount: true }, false, WITH_CODE)).toBe('allow');
    expect(privateSiteDecision('/assessment', { email: 'player-1a2b3c4d@test.baserecruits.app' }, false, WITH_CODE)).toBe('coming_soon');
    expect(privateSiteDecision('/assessment', { email: 'adamconcadoro+athlete@gmail.com', testAccount: false }, true, WITH_CODE)).toBe('coming_soon');
  });

  it('lets signed-in team members straight through', () => {
    expect(privateSiteDecision('/login', 'adamconcadoro@gmail.com', false, WITH_CODE)).toBe('allow');
    expect(privateSiteDecision('/admin', 'jcaceres120@gmail.com', false, WITH_CODE)).toBe('allow');
  });

  it('remembers the code as a keyed hash that stops working when the code changes', async () => {
    const pass = await teamPassValue('curveball-bullpen-42');
    expect(pass).not.toContain('curveball');
    expect(pass).toMatch(/^[0-9a-f]{64}$/);
    expect(await teamPassValid(pass, 'curveball-bullpen-42')).toBe(true);
    expect(await teamPassValid(pass, 'a-new-team-code-99')).toBe(false);
    expect(await teamPassValid(undefined, 'curveball-bullpen-42')).toBe(false);
    expect(await teamPassValid(pass, null)).toBe(false);
    expect(sameText('abc', 'abc')).toBe(true);
    expect(sameText('abc', 'abd')).toBe(false);
    expect(sameText('abc', 'abcd')).toBe(false);
  });

  it('shows the error only after a wrong code', () => {
    expect(teamCodeHtml({ wrong: false })).not.toContain('role="alert"');
    expect(teamCodeHtml({ wrong: true })).toContain('That code isn');
  });
});

describe('sign-in lock while private', () => {
  it('refuses every email except the two team emails', () => {
    expect(emailSignInRefused('adamconcadoro@gmail.com', PRIVATE)).toBe(false);
    expect(emailSignInRefused(' JCaceres120@gmail.com ', PRIVATE)).toBe(false);
    expect(emailSignInRefused('someone@example.com', PRIVATE)).toBe(true);
    expect(emailSignInRefused('player-1234abcd@test.baserecruits.app', PRIVATE)).toBe(true);
  });

  it('refuses nothing once the site is public again', () => {
    expect(emailSignInRefused('someone@example.com', PUBLIC)).toBe(false);
  });
});
