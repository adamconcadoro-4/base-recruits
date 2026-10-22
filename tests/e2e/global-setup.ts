import { createAccount, publishBundledRegistry, sql, yearsAgo } from './support';

/**
 * Creates the one test administrator through the documented bootstrap path
 * (private.bootstrap_first_admin, database owner only) and shares its email
 * with the tests, then publishes the bundled registry snapshot if the
 * database has none.
 */
export default async function globalSetup(): Promise<void> {
  const email = 'e2e-admin@example.test';
  try {
    await createAccount({ role: null, name: 'Test Administrator', dateOfBirth: yearsAgo(40), email });
  } catch (error) {
    if (!String(error).includes('already')) throw error;
  }
  const hasAdmin = sql("select exists (select 1 from public.user_roles where role = 'admin')");
  if (hasAdmin !== 't') {
    sql(`select private.bootstrap_first_admin('${email}')`);
  }
  process.env.E2E_ADMIN_EMAIL = email;

  // Public school pages need the registry; publish the bundled real snapshot once.
  const published = sql("select exists (select 1 from public.data_import_jobs where status = 'published')");
  if (published !== 't') {
    sql("update public.data_import_jobs set status = 'discarded', discarded_at = now() where status in ('staging', 'staged')");
    await publishBundledRegistry(email);
  }
}
