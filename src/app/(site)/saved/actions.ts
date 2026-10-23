'use server';

import { schoolsBySlugs } from '@/lib/registry/queries';
import { SLUG_PATTERN } from '@/lib/registry/search-params';
import type { SchoolSummary } from '@/lib/registry/types';
import { createClient } from '@/lib/supabase/server';

function cleanSlugs(values: readonly unknown[], max: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const slug = value.trim().toLowerCase();
    if (slug.length <= 120 && SLUG_PATTERN.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export type SaveResult = { readonly ok: true; readonly saved: boolean } | { readonly ok: false; readonly message: string };

/** Saves or removes one school in the signed-in user's account. */
export async function setAccountSaved(slug: string, saved: boolean): Promise<SaveResult> {
  const [clean] = cleanSlugs([slug], 1);
  if (!clean) return { ok: false, message: 'That school could not be found.' };
  const supabase = await createClient();
  if (saved) {
    const { error } = await supabase.rpc('save_schools', { p_slugs: [clean] });
    if (error) return { ok: false, message: error.code === 'BR001' ? 'Sign in again to save schools to your account.' : 'Saving didn’t work. Try again.' };
    return { ok: true, saved: true };
  }
  const { error } = await supabase.rpc('unsave_school', { p_slug: clean });
  if (error) return { ok: false, message: 'Removing didn’t work. Try again.' };
  return { ok: true, saved: false };
}

export type MergeResult =
  | { readonly status: 'signed_out' }
  | { readonly status: 'merged'; readonly added: number; readonly moved: readonly string[] }
  | { readonly status: 'failed' };

/**
 * Moves a browser's guest list into the signed-in account. Idempotent: schools
 * already saved stay as they are. The browser clears only the schools listed
 * in `moved`, so a failure never loses anything.
 */
export async function mergeGuestSaves(slugs: readonly unknown[]): Promise<MergeResult> {
  const clean = cleanSlugs(Array.isArray(slugs) ? slugs : [], 1000);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== 'string') return { status: 'signed_out' };
  if (clean.length === 0) return { status: 'merged', added: 0, moved: [] };
  const { data, error } = await supabase.rpc('save_schools', { p_slugs: clean });
  if (error || !data) return { status: 'failed' };
  const result = data as { added: number; saved: string[]; unknown: string[] };
  // Unknown or unlisted schools can't be saved to an account; they are dropped
  // from the browser list too, since no one can open them.
  return { status: 'merged', added: result.added, moved: [...result.saved, ...result.unknown] };
}

/** Summaries for a guest's browser list (free, no account). */
export async function lookupSchools(slugs: readonly unknown[]): Promise<readonly SchoolSummary[] | 'failed'> {
  return schoolsBySlugs(cleanSlugs(Array.isArray(slugs) ? slugs : [], 1000));
}
