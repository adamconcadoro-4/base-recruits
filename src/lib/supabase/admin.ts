import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseSecretKey, supabaseUrl } from './env';

/**
 * Service-role client. The database grants the service role one API function
 * for test setup (public.admin_record_birthdate), the six SeamState worker
 * callbacks (seamstate_worker_*, each refusing stale or unauthorized work),
 * and no direct table writes. The app uses this client for: deleting an
 * account after an under-13 answer (Auth admin API); deleting Assessment clip
 * files after the database has authorized and recorded their removal
 * (src/lib/assessment/server/storage.ts); and the SeamState worker connection
 * (src/lib/seamstate/server/worker.ts), after verifying the worker's signature.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
