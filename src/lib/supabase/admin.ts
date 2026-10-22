import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseSecretKey, supabaseUrl } from './env';

/**
 * Service-role client. The database grants the service role exactly one API
 * function (public.admin_record_birthdate) and no direct table writes, so this
 * client is used for two things only: recording the age-screen date of birth
 * for a brand-new account, and deleting an account after an under-13 answer.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
