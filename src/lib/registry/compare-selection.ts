/**
 * The comparison selection follows the visitor across normal navigation.
 *
 * Rules (applied by the request proxy, so they work without JavaScript):
 *  - The selection lives in the URL: `/schools?compare=a,b` and
 *    `/compare?schools=a,b`. Those links are shareable.
 *  - Whenever one of those pages is opened WITH its parameter, that list
 *    becomes the visitor's stored selection (an explicit URL always wins, and
 *    an empty value, `?schools=`, clears it).
 *  - When one of those pages is opened WITHOUT its parameter (a header or
 *    footer link, a bookmark, the back button to a plain URL), the stored
 *    selection is restored by redirecting to the same page with it.
 *  - At most five schools, each a valid slug, no duplicates. Unknown schools
 *    are dropped when the comparison loads.
 *  - The comparison is separate from saved schools: adding or removing one
 *    never changes the other.
 *  - Prefetch requests (Next.js fetches visible links in the background) never
 *    store or restore anything: only a page the visitor actually opens may
 *    change the selection.
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

export interface CompareDecision {
  /** Where to send the visitor to restore their selection, if anywhere. */
  readonly redirectTo: URL | null;
  /** The value to store (empty string clears), or undefined to leave it. */
  readonly store: string | undefined;
}

/** True for background prefetches (Next.js router, browser speculation rules, link prefetch). */
export function isPrefetchRequest(headers: { get(name: string): string | null }): boolean {
  if (headers.get('next-router-prefetch')) return true;
  if (headers.get('x-middleware-prefetch')) return true;
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`.toLowerCase();
  return purpose.includes('prefetch');
}

export function decideCompare(url: URL, method: string, cookieValue: string | undefined, prefetch = false): CompareDecision {
  const param = COMPARE_PARAM_BY_PATH[url.pathname];
  if (!param || method !== 'GET' || prefetch) return { redirectTo: null, store: undefined };

  if (url.searchParams.has(param)) {
    const list = parseCompareList(url.searchParams.getAll(param).flatMap((v) => v.split(',')));
    return { redirectTo: null, store: list.join(',') };
  }

  const stored = readCompareCookie(cookieValue);
  if (stored.length === 0) return { redirectTo: null, store: undefined };
  const target = new URL(url);
  target.searchParams.set(param, stored.join(','));
  return { redirectTo: target, store: undefined };
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
