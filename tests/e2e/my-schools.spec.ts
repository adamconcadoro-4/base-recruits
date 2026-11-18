import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The My schools list: numbers entered once sort every program at the chosen
 * levels into the four groups, the same numbers carry over to school pages,
 * and nothing leaves the browser. Data: the bundled 2024-25 registry snapshot.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('enter numbers once, see every D1–D3 program grouped, then the same numbers on a school page', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') sent.push(r.postData() ?? '');
  });

  await page.goto('/my-schools');
  const form = page.getByRole('form', { name: 'Your numbers for My schools' });
  await expect(form.getByText('remembered on this device only')).toBeVisible();
  await form.getByLabel('GPA', { exact: true }).fill('3.4');
  await form.getByLabel('SAT total score').fill('1200');
  await form.getByRole('button', { name: 'Show my schools' }).click();

  // No baseball numbers yet: every school is Not enough data, sub-grouped by the academic result.
  await expect(page.getByRole('heading', { name: 'Your numbers', level: 2 })).toBeFocused();
  await expect(page.getByText('Needs transcripts for verification', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add baseball numbers' })).toBeVisible();
  const notEnough = page.getByRole('region', { name: 'Not enough data' });
  await expect(notEnough.getByRole('heading', { name: /^Academic fit \(\d+\)$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add baseball numbers' }).click();
  await page.getByLabel('Main position').selectOption('pitcher');
  await page.getByLabel('Fastball, top velocity (mph)').fill('88');
  await page.getByRole('button', { name: 'Show my schools' }).click();

  const strong = page.getByRole('region', { name: 'Strong fit' });
  await expect(strong.getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText('schools at the levels you chose');
  // D1, D2 and D3 by default; NAIA and junior college are off until ticked.
  await expect(page.getByRole('row', { name: /NCAA Division III/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /NAIA/ })).toHaveCount(0);
  await page.locator('summary', { hasText: 'Filters' }).click();
  await page.getByLabel('NAIA').check();
  await expect(page.getByRole('row', { name: /NAIA/ })).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Nothing about the player was posted to the server.
  expect(sent.filter((body) => body.includes('3.4') || body.includes('1200'))).toEqual([]);

  // The same numbers open straight to the result on a school page.
  await page.goto('/schools/stanford-university-ca');
  const fit = page.getByRole('region', { name: 'Your fit' });
  await expect(fit.getByRole('heading', { name: 'Your fit with Stanford University' })).toBeVisible();
  await expect(fit.getByText(/Needs transcripts for verification/)).toBeVisible();

  // Filters and numbers are remembered on this device.
  await page.goto('/my-schools');
  await expect(page.getByRole('row', { name: /NAIA/ })).toBeVisible();
  await page.getByRole('button', { name: 'Forget my numbers' }).click();
  await expect(page.getByRole('button', { name: 'Show my schools' })).toBeVisible();
});
