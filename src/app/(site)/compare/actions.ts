'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COMPARE_COOKIE, COMPARE_COOKIE_MAX_AGE, readCompareCookie, withSchool } from '@/lib/registry/compare-selection';
import { MAX_COMPARE, SLUG_PATTERN, parseCompareList } from '@/lib/registry/search-params';

/**
 * The only ways the comparison selection changes: explicit form posts. They
 * work without JavaScript, are never triggered by link prefetching, and
 * setting a cookie in a server action refreshes the router cache.
 * Saved schools are never touched.
 */

/** Only same-site paths are allowed as a return address. */
function safeReturnPath(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && path.length <= 500 ? path : fallback;
}

async function writeSelection(list: readonly string[]): Promise<void> {
  const store = await cookies();
  if (list.length === 0) {
    store.delete(COMPARE_COOKIE);
    return;
  }
  store.set(COMPARE_COOKIE, list.join(','), {
    // Only the server reads it; it holds public school identifiers.
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    path: '/',
    maxAge: COMPARE_COOKIE_MAX_AGE,
  });
}

/** Adds a school (when there is room) or removes it. A sixth school is refused with a message on /compare. */
export async function toggleCompare(formData: FormData): Promise<never> {
  const slug = String(formData.get('school') ?? '').trim().toLowerCase();
  const back = safeReturnPath(formData.get('back'), '/compare');
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) redirect(back);
  const current = readCompareCookie((await cookies()).get(COMPARE_COOKIE)?.value);
  if (!current.includes(slug) && current.length >= MAX_COMPARE) redirect('/compare?full=1');
  await writeSelection(withSchool(current, slug));
  redirect(back);
}

/** Empties the comparison. */
export async function clearCompare(formData: FormData): Promise<never> {
  await writeSelection([]);
  redirect(safeReturnPath(formData.get('back'), '/compare'));
}

/** Replaces the visitor's comparison with a shared list ("Make this my comparison"). */
export async function adoptComparison(formData: FormData): Promise<never> {
  const list = parseCompareList(String(formData.get('schools') ?? '').split(','));
  await writeSelection(list);
  redirect('/compare');
}
