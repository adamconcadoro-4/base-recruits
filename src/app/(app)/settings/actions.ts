'use server';

import { revalidatePath } from 'next/cache';

import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

export async function updateNameAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const displayName = field(formData, 'displayName');
  if (!displayName) return failure('Enter your name.', { displayName: 'Enter your name.' });
  if (displayName.length > 80) return failure('Use 80 characters or fewer.', { displayName: 'Use 80 characters or fewer.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return failure('Please sign in again.');
  // Row-level security limits this update to the signed-in user's own profile,
  // and only the display_name column is writable.
  const { data, error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id).select('id');
  if (error || !Array.isArray(data) || data.length !== 1) return failure('We couldn’t save your name. Please try again.');
  revalidatePath('/', 'layout');
  return success('Saved.');
}
