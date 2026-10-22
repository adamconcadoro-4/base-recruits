/**
 * Helpers for end-to-end tests. Every account created here is synthetic test
 * data in a local Supabase stack; nothing is sent to a real inbox.
 */

import { execFileSync } from 'node:child_process';

import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const PASSWORD = 'diamond-practice-2026';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set for the end-to-end tests (see README).`);
  return value;
}

let adminClient: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  adminClient ??= createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function uniqueEmail(prefix: string, domain = 'example.test'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}@${domain}`;
}

/** An ISO date `years` years before today (UTC), minus `extraDays`. */
export function yearsAgo(years: number, extraDays = 0): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() - extraDays));
  return date.toISOString().slice(0, 10);
}

export interface TestAccount {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/**
 * A confirmed account created through the Auth admin API, with its date of
 * birth recorded through the same server-only function the signup flow uses.
 */
export async function createAccount(options: {
  readonly role: 'athlete' | 'parent' | 'coach' | null;
  readonly name: string;
  readonly dateOfBirth: string;
  readonly email?: string;
  readonly emailConfirmed?: boolean;
}): Promise<TestAccount> {
  const email = options.email ?? uniqueEmail(options.role ?? 'user', options.role === 'coach' ? 'example.edu' : 'example.test');
  const confirmed = options.emailConfirmed ?? true;
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: confirmed });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? 'no user'}`);
  if (confirmed) {
    // Confirmation wipes any password set before it, so set it again after.
    const { error: passwordError } = await admin().auth.admin.updateUserById(data.user.id, { password: PASSWORD });
    if (passwordError) throw new Error(`password update failed: ${passwordError.message}`);
  }
  const { error: birthdateError } = await admin().rpc('admin_record_birthdate', {
    p_user_id: data.user.id,
    p_date_of_birth: options.dateOfBirth,
  });
  if (birthdateError) throw new Error(`admin_record_birthdate failed: ${birthdateError.message}`);

  // The owner's one-time role choice, exactly as onboarding makes it.
  if (confirmed && (options.role || options.name)) {
    const owner = publicClient();
    const { error: signInError } = await owner.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);
    if (options.role) {
      const { error: roleError } = await owner.rpc('complete_onboarding', {
        p_account_type: options.role,
        p_display_name: options.name,
      });
      if (roleError) throw new Error(`complete_onboarding failed: ${roleError.message}`);
    } else {
      const { error: nameError } = await owner.from('profiles').update({ display_name: options.name }).eq('id', data.user.id);
      if (nameError) throw new Error(`name update failed: ${nameError.message}`);
    }
    await owner.auth.signOut();
  }
  return { id: data.user.id, email, name: options.name };
}

/** Runs one SQL statement as the database owner (test setup only). */
export function sql(statement: string): string {
  return execFileSync(process.env.PSQL ?? 'psql', [env('DATABASE_URL'), '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    encoding: 'utf8',
  }).trim();
}

export async function logIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

export async function fillBirthDate(page: Page, isoDate: string): Promise<void> {
  const [year, month, day] = isoDate.split('-');
  await page.getByLabel('Month', { exact: true }).selectOption(String(Number(month)));
  await page.getByLabel('Day', { exact: true }).fill(String(Number(day)));
  await page.getByLabel('Year', { exact: true }).fill(year ?? '');
}

/** The newest 6-digit code emailed to this address (local Mailpit). */
export async function emailCode(email: string, after: Date = new Date(0)): Promise<string> {
  const base = (process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/+$/, '');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (search.ok) {
      const body = (await search.json()) as { messages?: Array<{ ID: string; Created?: string }> };
      const newest = (body.messages ?? []).filter((message) => !message.Created || new Date(message.Created) >= after)[0];
      if (newest) {
        const message = (await (await fetch(`${base}/api/v1/message/${newest.ID}`)).json()) as { Text?: string; HTML?: string };
        const match = /\b(\d{6})\b/.exec(`${message.Text ?? ''} ${message.HTML ?? ''}`);
        if (match?.[1]) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No code arrived for ${email}`);
}

/** A client with only the public key, as anyone on the internet could use. */
export function publicClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Waits for the code page; if it does not appear, fails with what the page shows instead. */
export async function reachVerifyPage(page: Page): Promise<void> {
  try {
    await page.waitForURL('**/verify', { timeout: 20_000 });
  } catch {
    const shown = (await page.locator('main').innerText().catch(() => '(no main content)')).replace(/\s+/g, ' ');
    throw new Error(`Did not reach the code page (${page.url()}). The page shows: ${shown.slice(0, 600)}`);
  }
}

/** Goes through the site's sign-up: age screen, account details, emailed code, password. */
export async function signUpThroughSite(
  page: Page,
  options: { readonly email: string; readonly name: string; readonly dateOfBirth: string; readonly role: RegExp },
): Promise<void> {
  const requestedAt = new Date(Date.now() - 2000);
  await page.goto('/signup');
  await fillBirthDate(page, options.dateOfBirth);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: options.role }).check();
  await page.getByLabel('Your name').fill(options.name);
  await page.getByLabel('Email', { exact: true }).fill(options.email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await reachVerifyPage(page);
  await page.getByLabel('6-digit code').fill(await emailCode(options.email, requestedAt));
  await page.getByLabel('Create a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL((url) => url.pathname !== '/verify');
}

/**
 * Publishes the bundled registry snapshot through the same admin functions the
 * import screen uses (create, stage in chunks, review, publish), signed in as
 * the test administrator. Real records only; nothing here is invented.
 */
export async function publishBundledRegistry(adminEmail: string): Promise<void> {
  const { readdirSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { createHash } = await import('node:crypto');
  const directory = path.join(process.cwd(), 'data', 'snapshots');
  const name = readdirSync(directory).filter((n) => /^registry-\d{4}-\d{2}\.json$/.test(n)).sort().reverse()[0];
  if (!name) throw new Error('no bundled registry snapshot');
  const bytes = readFileSync(path.join(directory, name));
  const snapshot = JSON.parse(bytes.toString('utf8')) as {
    format: string;
    generated_at: string;
    content_sha256: string;
    sources: unknown[];
    issues: { unitid: number | null }[];
    records: { unitid: number }[];
  };
  const admin = publicClient();
  const { error: signInError } = await admin.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw new Error(`admin sign-in failed: ${signInError.message}`);
  const { data: jobId, error: createError } = await admin.rpc('admin_create_import_job', {
    p_snapshot_name: name,
    p_snapshot_sha256: createHash('sha256').update(bytes).digest('hex'),
    p_content_sha256: snapshot.content_sha256,
    p_snapshot_format: snapshot.format,
    p_generated_at: snapshot.generated_at,
    p_sources: snapshot.sources,
    p_expected_rows: snapshot.records.length,
  });
  if (createError) throw new Error(`admin_create_import_job: ${createError.message}`);
  const rows = snapshot.records.map((record) => ({
    unitid: record.unitid,
    record,
    issues: snapshot.issues.filter((i) => i.unitid === record.unitid),
  }));
  for (let start = 0; start < rows.length; start += 250) {
    const { error } = await admin.rpc('admin_stage_import_rows', { p_job_id: jobId, p_rows: rows.slice(start, start + 250) });
    if (error) throw new Error(`admin_stage_import_rows: ${error.message}`);
  }
  const { error: finalizeError } = await admin.rpc('admin_finalize_import_job', { p_job_id: jobId });
  if (finalizeError) throw new Error(`admin_finalize_import_job: ${finalizeError.message}`);
  const { error: publishError } = await admin.rpc('admin_publish_import_job', { p_job_id: jobId, p_note: 'End-to-end test setup' });
  if (publishError) throw new Error(`admin_publish_import_job: ${publishError.message}`);
  await admin.auth.signOut();
}
