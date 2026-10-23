/**
 * The visitor's comparison selection (up to five schools).
 *
 * Rules:
 *  - The selection lives in one first-party cookie and changes ONLY through an
 *    explicit form post (Add to compare, Remove, Clear, Make this my
 *    comparison). Opening, prefetching or caching a page never changes it, so
 *    background prefetches and out-of-order requests cannot rewrite it.
 *  - Every page that shows the selection (search, school pages, saved schools,
 *    /compare) reads the cookie, so it follows the visitor everywhere and
 *    works without JavaScript.
 *  - `/compare?schools=a,b` is a shared, read-only view of someone's list. It
 *    does not change the visitor's own selection unless they choose "Make this
 *    my comparison".
 *  - At most five schools, each a valid slug, no duplicates. Unknown schools
 *    are dropped when the comparison loads.
 *  - The comparison is separate from saved schools: adding or removing one
 *    never changes the other.
 */

import { MAX_COMPARE, parseCompareList } from './search-params';

export const COMPARE_COOKIE = 'br_compare';
export const COMPARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function readCompareCookie(value: string | undefined): string[] {
  if (!value) return [];
  return parseCompareList(value.split(','));
}

/**
 * The list in a shared `/compare?schools=` link, or null when the link has no
 * (or an empty) list and the visitor's own selection should be shown.
 */
export function sharedCompareList(urlValue: string | readonly string[] | undefined): string[] | null {
  if (urlValue === undefined) return null;
  const values = (typeof urlValue === 'string' ? [urlValue] : urlValue).flatMap((v) => v.split(',')).map((v) => v.trim());
  if (!values.some(Boolean)) return null;
  return parseCompareList(values);
}

/** `list` with `slug` added (when there is room) or removed. */
export function withSchool(list: readonly string[], slug: string, maxSize: number = MAX_COMPARE): string[] {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= maxSize ? [...list] : [...list, slug];
}
