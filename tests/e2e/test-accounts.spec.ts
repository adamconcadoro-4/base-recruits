import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { logIn, sql } from './support';

/**
 * Administrators' test accounts, end to end against the real local stack: the
 * administrator creates a test player and parent, opens each one in this
 * browser, uploads a clip as the player, and comes back to the admin account
 * without signing in again.
 */

const CLIP = path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-pattern.webm');
const assessmentOn = process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true';

function adminEmail(): string {
  const email = process.env.E2E_ADMIN_EMAIL;
  if (!email) throw new Error('E2E_ADMIN_EMAIL is set by the global setup');
  return email;
}

async function openFromAdmin(page: Page, family: number, button: 'Open as this player' | 'Open as this parent'): Promise<void> {
  await page.goto('/admin/test-accounts');
  const card = page.locator('li', { has: page.getByRole('heading', { name: `Test family ${family}`, exact: true }) });
  await card.getByRole('button', { name: button }).click();
  await page.waitForURL(button === 'Open as this player' ? '**/athlete' : '**/parent');
}

async function backToAdmin(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to my admin account' }).click();
  await page.waitForURL('**/admin/test-accounts');
  await expect(page.getByRole('region', { name: 'Test account' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Test accounts' })).toBeVisible();
}

test('an administrator tries the site as a test player and a test parent', async ({ page }) => {
  test.setTimeout(180_000);
  await logIn(page, adminEmail());

  await page.goto('/admin/test-accounts');
  await page.getByRole('radio', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Create test family' }).click();
  const ready = page.getByText(/Test family \d+ is ready/);
  await expect(ready).toBeVisible({ timeout: 20_000 });
  const family = Number(/Test family (\d+)/.exec((await ready.textContent()) ?? '')?.[1]);
  expect(family).toBeGreaterThan(0);

  const playerId = sql(`select user_id from public.test_accounts where family_number = ${family} and kind = 'athlete'`);
  expect(sql(`select email from auth.users where id = '${playerId}'`)).toMatch(/@test\.baserecruits\.app$/);
  expect(sql(`select count(*) from public.family_links where athlete_id = '${playerId}' and status = 'active'`)).toBe('1');

  // As the player: the banner, then a clip upload through the normal pages.
  await openFromAdmin(page, family, 'Open as this player');
  await expect(page.getByRole('region', { name: 'Test account' })).toContainText(`Test player ${family} (18+)`);
  expect(sql(`select count(*) from public.audit_events where action = 'test_account.opened' and subject_user_id = '${playerId}'`)).toBe('1');
  if (assessmentOn) {
    await page.goto('/assessment/new?discipline=hitting');
    await page.getByRole('radio', { name: /video plus measured ball data/ }).check();
    await page.getByLabel('Drill', { exact: true }).selectOption('front_toss');
    await page.getByRole('checkbox', { name: /camera facing the athlete’s chest/ }).check();
    await page.getByRole('button', { name: 'Start the assessment' }).click();
    await page.waitForURL(/\/assessment\/[0-9a-f-]{36}\?step=clips$/);
    await page.getByLabel('Video file').setInputFiles(CLIP);
    await page.getByRole('button', { name: 'Upload clip' }).click();
    await expect(page.getByText('Uploaded test-pattern.webm.')).toBeVisible({ timeout: 30_000 });
    expect(sql(`select count(*) from public.assessment_media where athlete_id = '${playerId}' and status = 'uploaded'`)).toBe('1');
  }
  await backToAdmin(page);

  // As the parent: linked to the player.
  await openFromAdmin(page, family, 'Open as this parent');
  await expect(page.getByRole('region', { name: 'Test account' })).toContainText(`Test parent ${family}`);
  await expect(page.getByText(`Test player ${family} (18+)`).first()).toBeVisible();
  await backToAdmin(page);

  // Signing out of a test account forgets the stored admin session.
  await openFromAdmin(page, family, 'Open as this player');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'br-admin-return')).toBe(false);
});

test('people who are not administrators cannot reach test accounts', async ({ page }) => {
  await page.goto('/admin/test-accounts');
  await page.waitForURL((url) => url.pathname.startsWith('/login'));
});
