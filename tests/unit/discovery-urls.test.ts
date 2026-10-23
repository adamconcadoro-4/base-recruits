import { describe, expect, it } from 'vitest';

import { FEATURES, availabilityLabel, isLive } from '@/config/availability';
import { COMPARE_COOKIE, compareFromDocumentCookie, decideCompare, readCompareCookie, withSchool } from '@/lib/registry/compare-selection';
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

describe('comparison selection follows the visitor (BR-06)', () => {
  const at = (path: string) => new URL(path, 'https://example.test');

  it('an explicit URL is stored, and an empty value clears', () => {
    expect(decideCompare(at('/schools?compare=a,b'), 'GET', undefined)).toEqual({ redirectTo: null, store: 'a,b' });
    expect(decideCompare(at('/compare?schools=c'), 'GET', 'a,b')).toEqual({ redirectTo: null, store: 'c' });
    expect(decideCompare(at('/compare?schools='), 'GET', 'a,b')).toEqual({ redirectTo: null, store: '' });
  });

  it('a plain link restores the stored selection, keeping other parameters', () => {
    const decision = decideCompare(at('/schools?q=texas'), 'GET', 'a,b');
    expect(decision.store).toBeUndefined();
    expect(decision.redirectTo?.pathname).toBe('/schools');
    expect(decision.redirectTo?.searchParams.get('q')).toBe('texas');
    expect(decision.redirectTo?.searchParams.get('compare')).toBe('a,b');
    expect(decideCompare(at('/compare'), 'GET', 'a,b').redirectTo?.searchParams.get('schools')).toBe('a,b');
  });

  it('does nothing without a stored selection, for other pages, or for non-GET requests', () => {
    expect(decideCompare(at('/compare'), 'GET', undefined)).toEqual({ redirectTo: null, store: undefined });
    expect(decideCompare(at('/compare'), 'GET', '')).toEqual({ redirectTo: null, store: undefined });
    expect(decideCompare(at('/schools/a'), 'GET', 'a,b')).toEqual({ redirectTo: null, store: undefined });
    expect(decideCompare(at('/compare'), 'POST', 'a,b')).toEqual({ redirectTo: null, store: undefined });
  });

  it('stores at most five valid schools and ignores tampered cookies', () => {
    expect(decideCompare(at('/compare?schools=a,b,c,d,e,f'), 'GET', undefined).store).toBe('a,b,c,d,e');
    expect(readCompareCookie('a,../etc,Bad Slug,<script>,b')).toEqual(['a', 'b']);
    expect(decideCompare(at('/compare'), 'GET', '../etc').redirectTo).toBeNull();
  });

  it('adding and removing respects the five-school limit', () => {
    expect(withSchool(['a'], 'b', 5)).toEqual(['a', 'b']);
    expect(withSchool(['a', 'b'], 'a', 5)).toEqual(['b']);
    expect(withSchool(['a', 'b', 'c', 'd', 'e'], 'f', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('client components read the same cookie', () => {
    expect(compareFromDocumentCookie(`x=1; ${COMPARE_COOKIE}=a%2Cb; y=2`)).toEqual(['a', 'b']);
    expect(compareFromDocumentCookie('x=1')).toEqual([]);
  });

  it('clearing the comparison from the search writes an explicit empty value', () => {
    const state = parseExplorerParams({ q: 'texas', compare: 'a,b' });
    expect(explorerQuery(state, { compare: [] })).toBe('?q=texas&compare=');
    expect(explorerQuery(parseExplorerParams({ q: 'texas' }), { compare: [] })).toBe('?q=texas');
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
