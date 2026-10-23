import { describe, expect, it } from 'vitest';

import { FEATURES, availabilityLabel, isLive } from '@/config/availability';
import {
  COMPARE_COOKIE,
  compareFromDocumentCookie,
  compareToStore,
  isPrefetchRequest,
  readCompareCookie,
  selectionFor,
  withSchool,
} from '@/lib/registry/compare-selection';
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
    expect(compareToStore(at('/schools?compare=a,b'), 'GET')).toBe('a,b');
    expect(compareToStore(at('/compare?schools=c'), 'GET')).toBe('c');
    expect(compareToStore(at('/compare?schools='), 'GET')).toBe('');
  });

  it('stores nothing for plain links, other pages, non-GET requests or prefetches', () => {
    expect(compareToStore(at('/compare'), 'GET')).toBeUndefined();
    expect(compareToStore(at('/schools?q=texas'), 'GET')).toBeUndefined();
    expect(compareToStore(at('/schools/a?compare=b'), 'GET')).toBeUndefined();
    expect(compareToStore(at('/compare?schools=a'), 'POST')).toBeUndefined();
    expect(compareToStore(at('/compare?schools='), 'GET', true)).toBeUndefined();
    expect(compareToStore(at('/schools?compare=a,c'), 'GET', true)).toBeUndefined();
  });

  it('recognises background prefetch requests', () => {
    const headers = (entries: Record<string, string>) => new Headers(entries);
    expect(isPrefetchRequest(headers({ 'next-router-prefetch': '1' }))).toBe(true);
    expect(isPrefetchRequest(headers({ 'next-router-segment-prefetch': '/_tree' }))).toBe(true);
    expect(isPrefetchRequest(headers({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetchRequest(headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true);
    expect(isPrefetchRequest(headers({ rsc: '1' }))).toBe(false);
    expect(isPrefetchRequest(headers({}))).toBe(false);
  });

  it('a page shows the URL list when present (even empty), otherwise the stored one', () => {
    expect(selectionFor(undefined, 'a,b')).toEqual(['a', 'b']);
    expect(selectionFor('c', 'a,b')).toEqual(['c']);
    expect(selectionFor('', 'a,b')).toEqual([]);
    expect(selectionFor(['a', 'b,c'], undefined)).toEqual(['a', 'b', 'c']);
    expect(selectionFor(undefined, undefined)).toEqual([]);
  });

  it('stores at most five valid schools and ignores tampered cookies', () => {
    expect(compareToStore(at('/compare?schools=a,b,c,d,e,f'), 'GET')).toBe('a,b,c,d,e');
    expect(readCompareCookie('a,../etc,Bad Slug,<script>,b')).toEqual(['a', 'b']);
    expect(selectionFor(undefined, '../etc')).toEqual([]);
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
