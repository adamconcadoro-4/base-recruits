import { describe, expect, it } from 'vitest';

import { FEATURES, availabilityLabel, isLive } from '@/config/availability';
import { readCompareCookie, sharedCompareList, withSchool } from '@/lib/registry/compare-selection';
import { DIVISION_SHORTCUTS, TWO_YEAR_DIVISIONS, normalizeDivisionValues, shortcutHref, type DivisionShortcut } from '@/lib/registry/divisions';
import { explorerQuery, parseExplorerParams, toSearchArgs } from '@/lib/registry/search-params';
import { indexingAllowed } from '@/lib/seo/indexing';

/** Turns a link like `/schools?division=a&division=b` into the parser's input. */
function paramsOf(href: string): Record<string, string[]> {
  const search = new URL(href, 'https://example.test').searchParams;
  return Object.fromEntries([...new Set(search.keys())].map((k) => [k, search.getAll(k)]));
}

describe('division links (BR-05)', () => {
  it('translates legacy and alternative spellings to canonical codes', () => {
    expect(normalizeDivisionValues(['ncaa-d1'])).toEqual({ codes: ['ncaa_d1'], unrecognized: [], translated: true });
    expect(normalizeDivisionValues(['NCAA_D2', ' d3 '])).toMatchObject({ codes: ['ncaa_d2', 'ncaa_d3'] });
    expect(normalizeDivisionValues(['juco']).codes).toEqual([...TWO_YEAR_DIVISIONS]);
    expect(normalizeDivisionValues(['ncaa_d1', 'd1']).codes).toEqual(['ncaa_d1']);
  });

  it('reports values it does not recognise instead of silently showing everything', () => {
    expect(normalizeDivisionValues(['ncaa_d9', 'naia'])).toMatchObject({ codes: ['naia'], unrecognized: ['ncaa_d9'] });
    const state = parseExplorerParams({ division: 'ncaa_d9', state: 'XX' });
    expect(state.divisions).toEqual([]);
    expect(state.ignored).toEqual(['division “ncaa_d9”', 'state “XX”']);
  });

  it('a home-page shortcut and the same filter chosen by hand give the same search', () => {
    for (const key of Object.keys(DIVISION_SHORTCUTS) as DivisionShortcut[]) {
      const fromLink = parseExplorerParams(paramsOf(shortcutHref(key)));
      const byHand = parseExplorerParams({ division: [...DIVISION_SHORTCUTS[key].codes] });
      expect(fromLink.ignored).toEqual([]);
      expect(toSearchArgs(fromLink)).toEqual(toSearchArgs(byHand));
    }
  });

  it('the old ncaa-d1 link searches NCAA Division I', () => {
    expect(toSearchArgs(parseExplorerParams({ division: 'ncaa-d1' })).p_divisions).toEqual(['ncaa_d1']);
  });

  it('the two-year shortcut includes every two-year association', () => {
    expect(shortcutHref('two_year')).toBe('/schools?division=njcaa_d1&division=njcaa_d2&division=njcaa_d3&division=cccaa&division=nwac');
  });

  it('keeps search page sizes within the database limit', () => {
    const state = parseExplorerParams({});
    expect(toSearchArgs(state, 500).p_limit).toBe(100);
    expect(toSearchArgs(state, 0).p_limit).toBe(1);
  });
});

describe('comparison selection (BR-06)', () => {
  it('a shared link shows its own list; no list (or an empty one) means the visitor\'s own selection', () => {
    expect(sharedCompareList('a,b')).toEqual(['a', 'b']);
    expect(sharedCompareList(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
    expect(sharedCompareList(undefined)).toBeNull();
    expect(sharedCompareList('')).toBeNull();
    expect(sharedCompareList([' ', ''])).toBeNull();
  });

  it('keeps at most five valid schools and ignores tampered values', () => {
    expect(sharedCompareList('a,b,c,d,e,f')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(readCompareCookie('a,../etc,Bad Slug,<script>,b')).toEqual(['a', 'b']);
    expect(readCompareCookie(undefined)).toEqual([]);
  });

  it('adding and removing respects the five-school limit', () => {
    expect(withSchool(['a'], 'b')).toEqual(['a', 'b']);
    expect(withSchool(['a', 'b'], 'a')).toEqual(['b']);
    expect(withSchool(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('search links never carry the comparison, so opening one cannot change it', () => {
    const state = parseExplorerParams({ q: 'texas', compare: 'a,b', page: '2' });
    expect(explorerQuery(state)).toBe('?q=texas&page=2');
    expect(explorerQuery(state, { page: 3 })).toBe('?q=texas&page=3');
  });
});

describe('search indexing switch (BR-13)', () => {
  it('is off unless production AND explicitly allowed', () => {
    expect(indexingAllowed({})).toBe(false);
    expect(indexingAllowed({ NEXT_PUBLIC_APP_ENV: 'production' })).toBe(false);
    expect(indexingAllowed({ NEXT_PUBLIC_APP_ENV: 'staging', ALLOW_INDEXING: 'true' })).toBe(false);
    expect(indexingAllowed({ NEXT_PUBLIC_APP_ENV: 'production', ALLOW_INDEXING: '1' })).toBe(false);
    expect(indexingAllowed({ NEXT_PUBLIC_APP_ENV: 'production', ALLOW_INDEXING: 'true' })).toBe(true);
  });
});

describe('feature availability (BR-07)', () => {
  it('only live features are described as working today', () => {
    expect(isLive('school_search')).toBe(true);
    expect(isLive('academic_comparison')).toBe(true);
    expect(isLive('majors')).toBe(false);
    expect(isLive('athlete_profile')).toBe(false);
    expect(isLive('paid_plans')).toBe(false);
  });

  it('labels early and planned features plainly', () => {
    expect(availabilityLabel('available')).toBeNull();
    expect(availabilityLabel('pilot')).toBe('Early version');
    expect(availabilityLabel('planned')).toBe('Coming later');
    expect(FEATURES.academic_comparison.status).toBe('pilot');
  });
});
