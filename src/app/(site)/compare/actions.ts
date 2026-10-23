'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COMPARE_COOKIE, COMPARE_COOKIE_MAX_AGE, readCompareCookie, withSchool } from '@/lib/registry/compare-selection';
import { MAX_COMPARE, SLUG_PATTERN } from '@/lib/registry/search-params';

/** Only same-site paths are allowed as a return address. */
function safeReturnPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && path.length <= 300 ? path : '/compare';
}

/**
 * Adds a school to the comparison selection, or removes it, from pages that
 * don't carry the selection in their URL (school pages, saved schools). Works
 * without JavaScript (a plain form post). A sixth school is refused with a
 * message on the comparison page; saved schools are never touched.
 */
export async function toggleCompare(formData: FormData): Promise<never> {
  const slug = String(formData.get('school') ?? '').trim().toLowerCase();
  const back = safeReturnPath(formData.get('back'));
  const store = await cookies();
  const current = readCompareCookie(store.get(COMPARE_COOKIE)?.value);
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) redirect(back);

  if (!current.includes(slug) && current.length >= MAX_COMPARE) {
    redirect(`/compare?schools=${current.join(',')}&full=1`);
  }
  const next = withSchool(current, slug, MAX_COMPARE);
  if (next.length === 0) {
    store.delete(COMPARE_COOKIE);
  } else {
    store.set(COMPARE_COOKIE, next.join(','), {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
      path: '/',
      maxAge: COMPARE_COOKIE_MAX_AGE,
    });
  }
  redirect(back);
}
