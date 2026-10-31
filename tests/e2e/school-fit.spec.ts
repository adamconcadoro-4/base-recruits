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
  // No baseball numbers yet: the page leads with the academic result and the minimum to compete.
  await expect(fit.getByText('Academic reach', { exact: true }).first()).toBeVisible();
  await expect(fit.getByText('Likely meets the academic minimum we check', { exact: true }).first()).toBeVisible();
  await expect(fit.getByText(/Add your position and baseball numbers to see your overall fit/)).toBeVisible();
  await expect(fit.getByText('Not enough data', { exact: true })).toHaveCount(0);

  // Baseball numbers complete the picture: an 86 mph fastball is in the D1 typical range (public benchmarks).
  await fit.getByRole('button', { name: 'Edit my numbers' }).click();
  await fit.getByLabel('Main position').selectOption('pitcher');
  await fit.getByLabel('Fastball, top velocity (mph)').fill('86');
  await fit.getByRole('button', { name: 'See your fit' }).click();
  await expect(fit.getByText('In range', { exact: true })).toBeVisible();
  await expect(fit.getByText('Reach', { exact: true })).toBeVisible();
  await expect(fit.getByRole('link', { name: /BaseballPath/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.goto('/schools/long-beach-city-college-ca');
  const jc = page.getByRole('region', { name: 'Your fit' });
  await expect(jc.getByRole('heading', { name: 'Your fit with Long Beach City College' })).toBeVisible();
  // An open-admission school (College Scorecard) is an academic fit even without admissions figures (F48).
  await expect(page.getByText('Open admission', { exact: true })).toBeVisible();
  await expect(jc.getByText('Academic fit', { exact: true }).first()).toBeVisible();
  await expect(jc.getByText('Not checked', { exact: true }).first()).toBeVisible();
  // 86 mph meets the junior-college guideline (NCSA), so with an academic fit the school is a Strong fit.
  await expect(jc.getByText('In range', { exact: true })).toBeVisible();
  await expect(jc.getByText('Strong fit', { exact: true })).toBeVisible();
  await expect(jc.getByRole('link', { name: /NCSA/ })).toBeVisible();

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
