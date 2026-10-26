import 'server-only';

import { revalidatePath } from 'next/cache';

import { assessmentSiteEnabled } from '@/config/assessment';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

/** Shared plumbing for Assessment server actions: the site switch, one database function, revalidation. */

export const SWITCHED_OFF = 'Assessment isn’t switched on yet.';

export function switchedOff(): ActionState | null {
  return assessmentSiteEnabled() ? null : failure(SWITCHED_OFF);
}

export async function callRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  if (!assessmentSiteEnabled()) return { data: null, error: SWITCHED_OFF };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: null, error: withDiagnostics(userMessageForDatabaseError(error), error) };
  return { data: data as T, error: null };
}

/** Runs one database function for a form and returns its result as an ActionState. */
export async function rpcAction(
  name: string,
  args: Record<string, unknown>,
  successMessage: string,
  paths: readonly string[] = ['/assessment'],
): Promise<ActionState> {
  const { error } = await callRpc(name, args);
  if (error) return failure(error);
  for (const path of paths) revalidatePath(path, 'layout');
  return success(successMessage);
}

/** A number from a form field: null when blank, NaN when not a number. */
export function numberField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

export function textOrNull(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}
