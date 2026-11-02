import { adminApiClient, registerSoftwarePasskey } from './passkey';
import { PASSWORD, admin, createAccount, publicClient, publishBundledRegistry, sql, yearsAgo } from './support';

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
  // Administrator access is limited to approved addresses (F55). Approve the
  // test administrator's address in this throwaway test database only.
  sql(`insert into private.admin_allowed_emails (email, note) values ('${email}', 'end-to-end test administrator') on conflict do nothing`);
  const hasAdmin = sql("select exists (select 1 from public.user_roles where role = 'admin')");
  if (hasAdmin !== 't') {
    sql(`select private.bootstrap_first_admin('${email}')`);
  }
  process.env.E2E_ADMIN_EMAIL = email;

  // Administrators need a passkey check (F57). Give the test administrator a
  // software passkey (replacing any from earlier runs) and share it with the tests.
  const { data: users } = await admin().auth.admin.listUsers({ perPage: 1000 });
  const adminId = users?.users.find((user) => user.email === email)?.id;
  if (!adminId) throw new Error('test administrator not found');
  const { data: oldPasskeys } = await admin().auth.admin.passkey.listPasskeys({ userId: adminId });
  for (const old of oldPasskeys ?? []) await admin().auth.admin.passkey.deletePasskey({ userId: adminId, passkeyId: old.id });
  const owner = publicClient();
  const { error: ownerSignIn } = await owner.auth.signInWithPassword({ email, password: PASSWORD });
  if (ownerSignIn) throw new Error(`admin sign-in failed: ${ownerSignIn.message}`);
  process.env.E2E_ADMIN_PASSKEY = JSON.stringify(await registerSoftwarePasskey(owner));
  await owner.auth.signOut();

  // Assessment ships switched off. Turn both database switches on through the
  // admin function, as an administrator would from the admin page. (The site
  // switch, NEXT_PUBLIC_ASSESSMENT_ENABLED, is set for the build in CI.)
  if (process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true') {
    const adminClient = await adminApiClient();
    const { error: switchError } = await adminClient.rpc('admin_set_assessment_switches', { p_enabled: true, p_video_enabled: true });
    if (switchError) throw new Error(`admin_set_assessment_switches failed: ${switchError.message}`);
    await adminClient.auth.signOut();
  }

  // Public school pages need the registry; publish the bundled real snapshot once.
  const published = sql("select exists (select 1 from public.data_import_jobs where status = 'published')");
  if (published !== 't') {
    sql("update public.data_import_jobs set status = 'discarded', discarded_at = now() where status in ('staging', 'staged')");
    await publishBundledRegistry();
  }
}
