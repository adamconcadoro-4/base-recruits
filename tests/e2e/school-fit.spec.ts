import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * "Your fit" on school pages (decision F45): a player enters their numbers
 * once, sees their fit on every school page, and can forget them. Numbers stay
 * in the browser. Data: the bundled 2024-25 registry snapshot.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('enter numbers once, see the fit on every school page, then forget them', async ({ page }) => {
  await page.goto('/schools/stanford-university-ca');
  const fit = page.getByRole('region', { name: 'Your fit' });
  await expect(fit.getByText('remembered on this device only')).toBeVisible();

  await fit.getByLabel('GPA', { exact: true }).fill('3.4');
  await fit.getByLabel('SAT Reading and Writing').fill('500');
  await fit.getByLabel('SAT Math').fill('500');
  await fit.getByRole('button', { name: 'See your fit' }).click();

  await expect(fit.getByRole('heading', { name: 'Your fit with Stanford University' })).toBeFocused();
  await expect(fit.getByText('Academic reach', { exact: true })).toBeVisible();
  // No athletic standards are loaded yet, so the overall result can't be placed.
  await expect(fit.getByText('Not enough data', { exact: true })).toBeVisible();
  await expect(fit.getByText('Likely meets the academic minimum we check', { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.goto('/schools/long-beach-city-college-ca');
  const jc = page.getByRole('region', { name: 'Your fit' });
  await expect(jc.getByRole('heading', { name: 'Your fit with Long Beach City College' })).toBeVisible();
  await expect(jc.getByText('Academics not compared', { exact: true })).toBeVisible();
  await expect(jc.getByText('Not checked', { exact: true })).toBeVisible();

  await jc.getByRole('button', { name: 'Forget my numbers' }).click();
  await expect(jc.getByRole('button', { name: 'See your fit' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Your fit' }).getByRole('button', { name: 'See your fit' })).toBeVisible();
});

test('an invalid number is explained and nothing is shown until it is fixed', async ({ page }) => {
  await page.goto('/schools/stanford-university-ca');
  const fit = page.getByRole('region', { name: 'Your fit' });
  await fit.getByLabel('SAT Math').fill('900');
  await fit.getByRole('button', { name: 'See your fit' }).click();
  await expect(fit.getByRole('alert')).toContainText('Enter a section score from 200 to 800');
  await expect(fit.getByRole('heading', { name: /Your fit with/ })).toHaveCount(0);
});
