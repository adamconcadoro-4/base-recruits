import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseSecretKey, supabaseUrl } from './env';

/**
 * Service-role client. The database grants the service role exactly one API
 * function (public.admin_record_birthdate, used only by test setup) and no
 * direct table writes. The app uses this client for one thing: deleting an
 * account after an under-13 answer (Auth admin API).
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
