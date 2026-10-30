import 'server-only';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { createAdminClient } from '@/lib/supabase/admin';
import { sessionCookieOptions } from '@/lib/supabase/cookie-options';
import { createClient } from '@/lib/supabase/server';

/**
 * Test accounts (supabase/migrations/20261030000100_admin_test_accounts.sql).
 *
 * An administrator tries the site as a test player or parent: accounts no real
 * person owns, created here with the server's key on a domain no one receives
 * mail for, and set up by the database only for the administrator who asked.
 * Switching signs this browser in to the test account with a one-time link the
 * server never sends; the administrator's own session is kept in an httpOnly
 * cookie so "Back to my admin account" can restore it.
 */

/** No mailbox exists at this domain, so no one can sign in to these addresses by email code. */
export const TEST_ACCOUNT_EMAIL_DOMAIN = 'test.baserecruits.app';

/** Holds the administrator's refresh token while the browser is in a test account. */
const ADMIN_RETURN_COOKIE = 'br-admin-return';
const ADMIN_RETURN_MAX_AGE = 60 * 60 * 12;

export type TestAccountKind = 'athlete' | 'parent';

/** True when the signed-in Auth user was created as a test account (app metadata only the server can set). */
export function isTestAccountUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return typeof user?.app_metadata?.br_test_account_requested_by === 'string';
}

function testEmail(kind: TestAccountKind): string {
  return `${kind === 'athlete' ? 'player' : 'parent'}-${randomUUID().slice(0, 8)}@${TEST_ACCOUNT_EMAIL_DOMAIN}`;
}

export type CreateTestFamilyResult =
  | { readonly ok: true; readonly familyNumber: number }
  | { readonly ok: false; readonly reason: 'not_configured' | 'auth_failed' | 'database'; readonly error?: { code?: string | null; message?: string | null } };

/**
 * Creates a test player (18+ or under 18) and, if asked, a linked parent who
 * can see and add to the player's assessments. Accounts the database refuses
 * are deleted again, so a failure leaves nothing behind.
 */
export async function createTestFamily(
  adminId: string,
  options: { readonly under18: boolean; readonly withParent: boolean },
): Promise<CreateTestFamilyResult> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, reason: 'not_configured' };
  }

  const kinds: TestAccountKind[] = options.withParent ? ['athlete', 'parent'] : ['athlete'];
  const created: Partial<Record<TestAccountKind, string>> = {};
  const cleanUp = async () => {
    await Promise.all(Object.values(created).map((id) => admin.auth.admin.deleteUser(id)));
  };

  for (const kind of kinds) {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail(kind),
      email_confirm: true,
      app_metadata: { br_test_account_requested_by: adminId },
    });
    if (error || !data.user) {
      await cleanUp();
      return { ok: false, reason: 'auth_failed', error: error ?? undefined };
    }
    created[kind] = data.user.id;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_setup_test_family', {
    p_athlete_id: created.athlete,
    p_parent_id: created.parent ?? null,
    p_athlete_under_18: options.under18,
  });
  if (error || typeof data !== 'number') {
    await cleanUp();
    return { ok: false, reason: 'database', error: error ?? undefined };
  }
  return { ok: true, familyNumber: data };
}

export type OpenTestAccountResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_configured' | 'not_allowed' | 'sign_in_failed'; readonly error?: { code?: string | null; message?: string | null } };

/**
 * Switches this browser to a test account. The database decides whether the
 * account is a test account this administrator may open, and audits it.
 */
export async function openTestAccount(testUserId: string): Promise<OpenTestAccountResult> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, reason: 'not_configured' };
  }

  const supabase = await createClient();
  const { data: email, error } = await supabase.rpc('admin_test_account_email', { p_user_id: testUserId });
  if (error || typeof email !== 'string') return { ok: false, reason: 'not_allowed', error: error ?? undefined };

  const { data: sessionData } = await supabase.auth.getSession();
  const adminRefreshToken = sessionData.session?.refresh_token;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { ok: false, reason: 'sign_in_failed', error: linkError ?? undefined };

  // Keep the administrator's session before it is replaced (only an
  // administrator gets this far, so this is always an administrator's session).
  const cookieStore = await cookies();
  if (adminRefreshToken) {
    cookieStore.set(ADMIN_RETURN_COOKIE, adminRefreshToken, {
      ...sessionCookieOptions(),
      sameSite: 'strict',
      maxAge: ADMIN_RETURN_MAX_AGE,
    });
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verifyError) {
    cookieStore.delete({ name: ADMIN_RETURN_COOKIE, path: '/' });
    return { ok: false, reason: 'sign_in_failed', error: verifyError };
  }
  return { ok: true };
}

/**
 * Leaves the test account (its session is revoked) and restores the
 * administrator's session if it is still valid. Returns false when the
 * administrator has to sign in again.
 */
export async function returnToAdminAccount(): Promise<boolean> {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const stored = cookieStore.get(ADMIN_RETURN_COOKIE)?.value;
  cookieStore.delete({ name: ADMIN_RETURN_COOKIE, path: '/' });

  await supabase.auth.signOut({ scope: 'local' });
  if (!stored) return false;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored });
  return !error && Boolean(data.session) && !isTestAccountUser(data.user);
}

/** Forgets the stored administrator session (used when signing out). */
export async function forgetAdminReturn(): Promise<void> {
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_RETURN_COOKIE)) cookieStore.delete({ name: ADMIN_RETURN_COOKIE, path: '/' });
}
