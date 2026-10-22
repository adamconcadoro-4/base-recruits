import { expect, test } from '@playwright/test';

import { PUBLIC_ROUTES } from '../../src/lib/auth/route-access';

// Product invariants 2 and 3: discovery never requires an account or payment.
test.describe('public pages stay open to anonymous visitors', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`anonymous visitor can open ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status() ?? 0).toBeLessThan(500);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('h1').first()).toBeVisible();
    });
  }

  test('the home page leads with the spec headline and the match call to action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Your Next Level Starts Here.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find my college matches' }).first()).toBeVisible();
  });

  test('an unknown school shows an honest not-found page, never an invented record', async ({ page }) => {
    const response = await page.goto('/schools/example-slug');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeVisible();
  });
});

const PROTECTED = ['/dashboard', '/onboarding', '/settings', '/athlete', '/parent', '/coach', '/coach/athletes', '/admin'];

test.describe('protected pages require signing in', () => {
  for (const path of PROTECTED) {
    test(`anonymous visitor is sent to log in from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    });
  }
});

test('responses carry the security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});
