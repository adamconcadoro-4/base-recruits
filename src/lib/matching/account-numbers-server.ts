import 'server-only';

import { getAccount } from '@/lib/auth/account';
import { fromAccountRow, type AccountNumbers, type SavedNumbersRow } from '@/lib/matching/account-numbers';
import { createClient } from '@/lib/supabase/server';

/**
 * For pages with the numbers form: null unless the visitor is a signed-in
 * athlete (the only accounts that can save numbers, F63); otherwise what is
 * saved to their account. A failed read counts as nothing saved, so the
 * device copy is used and nothing is lost.
 */
export async function loadAccountNumbers(): Promise<AccountNumbers | null> {
  const account = await getAccount();
  if (!account.userId || !account.roles.includes('athlete')) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_numbers');
  if (error) return { saved: null };
  const row = (Array.isArray(data) ? data[0] : data) as SavedNumbersRow | undefined | null;
  return { saved: row ? fromAccountRow(row) : null };
}
