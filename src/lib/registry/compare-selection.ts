/**
 * The comparison selection follows the visitor across normal navigation.
 *
 * Rules (they work without JavaScript):
 *  - An explicit list in the URL always wins: `/schools?compare=a,b` and
 *    `/compare?schools=a,b`. Those links are shareable. When one of them is
 *    opened, the request proxy stores the list in a first-party cookie, and an
 *    empty value (`?schools=`) clears it.
 *  - When one of those pages is opened WITHOUT its parameter (a header or
 *    footer link, a bookmark), the page shows the stored selection. There is
 *    no redirect: a redirect fetched by a background prefetch can be cached by
 *    the router and replayed later with an out-of-date list.
 *  - Prefetch requests (Next.js fetches visible links in the background) never
 *    store anything: only a page the visitor actually opens may change it.
 *  - At most five schools, each a valid slug, no duplicates. Unknown schools
 *    are dropped when the comparison loads.
 *  - The comparison is separate from saved schools: adding or removing one
 *    never changes the other.
 */

import { parseCompareList } from './search-params';

export const COMPARE_COOKIE = 'br_compare';
export const COMPARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** The query parameter that carries the selection on each page that has one. */
export const COMPARE_PARAM_BY_PATH: Readonly<Record<string, string>> = {
  '/schools': 'compare',
  '/compare': 'schools',
};

export function readCompareCookie(value: string | undefined): string[] {
  if (!value) return [];
  return parseCompareList(value.split(','));
}

/** True for background prefetches (Next.js router, browser speculation rules, link prefetch). */
export function isPrefetchRequest(headers: { get(name: string): string | null }): boolean {
  if (headers.get('next-router-prefetch')) return true;
  if (headers.get('next-router-segment-prefetch')) return true;
  if (headers.get('x-middleware-prefetch')) return true;
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`.toLowerCase();
  return purpose.includes('prefetch');
}

/**
 * What the request proxy should store for this request: the explicit list
 * (empty string clears), or undefined to leave the stored selection alone.
 */
export function compareToStore(url: URL, method: string, prefetch = false): string | undefined {
  const param = COMPARE_PARAM_BY_PATH[url.pathname];
  if (!param || method !== 'GET' || prefetch || !url.searchParams.has(param)) return undefined;
  return parseCompareList(url.searchParams.getAll(param).flatMap((v) => v.split(','))).join(',');
}

/**
 * The selection a page shows: the explicit URL list when the parameter is
 * present (even empty), otherwise the stored one.
 */
export function selectionFor(urlValue: string | readonly string[] | undefined, cookieValue: string | undefined): string[] {
  if (urlValue === undefined) return readCompareCookie(cookieValue);
  const values = typeof urlValue === 'string' ? [urlValue] : urlValue;
  return parseCompareList(values.flatMap((v) => v.split(',')));
}

/** `list` with `slug` added (when there is room) or removed. */
export function withSchool(list: readonly string[], slug: string, maxSize: number): string[] {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= maxSize ? [...list] : [...list, slug];
}

/** Reads the selection from `document.cookie` (client components). */
export function compareFromDocumentCookie(cookieString: string): string[] {
  for (const part of cookieString.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COMPARE_COOKIE) return readCompareCookie(decodeURIComponent(rest.join('=')));
  }
  return [];
}
