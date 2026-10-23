import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

/**
 * Whether the request carries a valid signed-in session (checked locally from
 * the session token, no extra round trip). Used only to choose how a page
 * behaves, for example where Save keeps a school; the database still checks
 * every read and write.
 */
export const isSignedIn = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === 'string';
});
