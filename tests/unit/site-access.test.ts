import { describe, expect, it } from 'vitest';

import { isTeamEmail, siteAccessAllowed, sitePrivate } from '@/config/site-access';
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
