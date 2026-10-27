import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
}

const PUBLIC_PAGES = [
  '/',
  '/schools',
  '/schools?q=texas&division=ncaa_d1&compare=stanford-university-ca',
  '/schools/stanford-university-ca',
  '/schools/long-beach-city-college-ca',
  '/compare',
  '/compare?schools=stanford-university-ca,harvard-university-ma,long-beach-city-college-ca',
  '/data-methodology',
  '/match',
  '/saved',
  '/support',
  '/athletes',
  '/transfers',
  '/schools/stanford-university-ca/correction',
  '/how-it-works',
  '/coaches',
  '/pricing',
  '/login',
  '/login/code',
  '/signup',
  '/reset',
  '/privacy',
  // Assessment's public pages (a not-found page when the site switch is off).
  '/player-assessment',
  '/player-assessment/sample',
];

for (const path of PUBLIC_PAGES) {
  test(`${path} meets WCAG 2.2 AA automated checks`, async ({ page }) => {
    await page.goto(path);
    expect(await violations(page)).toEqual([]);
  });
}

test('the signup account step meets WCAG 2.2 AA automated checks', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Month', { exact: true }).selectOption('6');
  await page.getByLabel('Day', { exact: true }).fill('15');
  await page.getByLabel('Year', { exact: true }).fill(yearsAgo(20).slice(0, 4));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('the athlete home meets WCAG 2.2 AA automated checks', async ({ page }) => {
  const athlete = await createAccount({ role: 'athlete', name: 'Axe Athlete', dateOfBirth: yearsAgo(16) });
  await logIn(page, athlete.email);
  await expect(page).toHaveURL('/athlete');
  expect(await violations(page)).toEqual([]);
});

test('score comparison results meet WCAG 2.2 AA automated checks', async ({ page }) => {
  await page.goto('/match');
  await page.getByLabel('SAT Math').fill('650');
  await page.getByLabel('State', { exact: true }).selectOption('VT');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused();
  await expect(page.getByRole('article').first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('a failed comparison moves focus to the list of problems', async ({ page }) => {
  await page.goto('/match');
  await page.getByLabel('SAT Math').fill('805');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const problems = page.getByRole('alert').filter({ hasText: 'Check this field' });
  await expect(problems).toBeFocused();
  await expect(page.getByLabel('SAT Math')).toHaveAttribute('aria-invalid', 'true');
  expect(await violations(page)).toEqual([]);
});

test('the keyboard can reach the main call to action and skip link', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
});

test('the mobile menu opens and closes with the keyboard', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout only');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'Explore programs' }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
