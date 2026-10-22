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
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: options.emailConfirmed ?? true,
    user_metadata: options.role ? { account_type: options.role, display_name: options.name } : { display_name: options.name },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? 'no user'}`);
  const { error: birthdateError } = await admin().rpc('admin_record_birthdate', {
    p_user_id: data.user.id,
    p_date_of_birth: options.dateOfBirth,
  });
  if (birthdateError) throw new Error(`admin_record_birthdate failed: ${birthdateError.message}`);
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

/** The confirmation link from the local email catcher (Mailpit). */
export async function confirmationLink(email: string): Promise<string> {
  const base = (process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/+$/, '');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (search.ok) {
      const body = (await search.json()) as { messages?: Array<{ ID: string }> };
      const id = body.messages?.[0]?.ID;
      if (id) {
        const message = (await (await fetch(`${base}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
        const text = `${message.Text ?? ''} ${message.HTML ?? ''}`;
        const match = /https?:\/\/[^\s"'<>]*\/verify\?[^\s"'<>]+/.exec(text);
        if (match) return match[0].replace(/&amp;/g, '&');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No confirmation email arrived for ${email}`);
}
