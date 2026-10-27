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

  test('the home page leads with the spec headline and calls to action that work today', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Know your college baseball options.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore Baseball Programs' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Compare your scores' }).first()).toBeVisible();
    await expect(page.getByText(/Find my (college )?matches/i)).toHaveCount(0);
  });

  test('on a phone, search results come first and filters are one tap away', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout only');
    await page.goto('/schools');
    await expect(page.getByRole('button', { name: 'Show schools' })).toBeVisible();
    await expect(page.locator('details#filters')).not.toHaveAttribute('open', /.*/);
    const first = page.getByRole('article').first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeVisible();
    await page.getByText('Filters', { exact: true }).click();
    await expect(page.getByLabel('State', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
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

test('search engines are told not to index the site until launch is switched on', async ({ page, request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('<loc>');
  await page.goto('/schools/stanford-university-ca');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/schools\/stanford-university-ca$/);
});

test('responses carry the security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});
