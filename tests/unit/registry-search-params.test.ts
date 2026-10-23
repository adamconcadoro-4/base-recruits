import { describe, expect, it } from 'vitest';

import {
  MAX_COMPARE,
  explorerQuery,
  figureFilters,
  parseCompareList,
  parseExplorerParams,
  toSearchArgs,
  toggleCompare,
} from '@/lib/registry/search-params';

describe('explorer URL state', () => {
  it('keeps only known values and drops everything else', () => {
    const state = parseExplorerParams({
      q: '  Stanford ',
      state: 'ca',
      division: ['ncaa_d1', 'ncaa_d9', "naia'; drop table"],
      control: 'public,secret',
      level: 'two_year',
      setting: ['city', 'moon'],
      test: 'not_considered',
      size: 'huge',
      rate: '35',
      cost: '35000',
      sort: 'cost',
      page: '3',
    });
    expect(state.q).toBe('Stanford');
    expect(state.state).toBe('CA');
    expect(state.divisions).toEqual(['ncaa_d1']);
    expect(state.controls).toEqual(['public']);
    expect(state.levels).toEqual(['two_year']);
    expect(state.settings).toEqual(['city']);
    expect(state.tests).toEqual(['not_considered']);
    expect(state.size).toBeNull();
    expect(state.rate).toBe('35');
    expect(state.cost).toBe('35000');
    expect(state.sort).toBe('cost');
    expect(state.page).toBe(3);
  });

  it('rejects unknown states and bad page numbers', () => {
    expect(parseExplorerParams({ state: 'XX', page: '-2' })).toMatchObject({ state: null, page: 1 });
    expect(parseExplorerParams({ page: '99999' }).page).toBe(1);
    expect(parseExplorerParams({ q: 'x'.repeat(300) }).q).toHaveLength(100);
  });

  it('maps filters to the database arguments', () => {
    const args = toSearchArgs(parseExplorerParams({ size: 'medium', rate: '60plus', cost: '20000', page: '2' }));
    expect(args).toMatchObject({
      p_min_enrollment: 2000,
      p_max_enrollment: 4999,
      p_min_admission_rate: 0.6,
      p_max_admission_rate: null,
      p_max_cost: 20000,
      p_sort: 'name',
      p_limit: 20,
      p_offset: 20,
      p_query: null,
      p_divisions: null,
    });
    expect(toSearchArgs(parseExplorerParams({ q: 'texas' })).p_sort).toBe('relevance');
  });

  it('notes which filters leave out schools without that figure', () => {
    expect(figureFilters(parseExplorerParams({ rate: '15', cost: '50000' }))).toEqual(['admission rate', 'cost of attendance']);
    expect(figureFilters(parseExplorerParams({ division: 'naia' }))).toEqual([]);
  });

  it('round-trips through the query string', () => {
    // The comparison is not part of search links (it changes only through form posts).
    const state = parseExplorerParams({ q: 'A&M', division: ['ncaa_d1', 'naia'], page: '2' });
    const query = explorerQuery(state);
    const again = parseExplorerParams(Object.fromEntries(
      [...new URLSearchParams(query.slice(1)).keys()].map((k) => [k, new URLSearchParams(query.slice(1)).getAll(k)]),
    ));
    expect(again).toEqual(state);
    expect(explorerQuery(parseExplorerParams({}))).toBe('');
  });
});

describe('compare list', () => {
  it('keeps at most five valid, distinct slugs', () => {
    expect(parseCompareList(['a', 'b', 'a', 'Bad Slug', '../etc', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(MAX_COMPARE).toBe(5);
  });

  it('adds when there is room and removes when present', () => {
    expect(toggleCompare(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleCompare(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleCompare(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
