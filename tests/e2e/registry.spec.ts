import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

/**
 * Stage 2 exit gate: real institutions with confirmed baseball programs are
 * searchable, source-backed fields display with their years, missing data is
 * shown honestly, and an administrator can reconcile and republish records.
 * Data: the bundled EADA 2024-25 / College Scorecard snapshot, published by
 * global setup through the admin import functions.
 */

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.test';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Waits for the Decide section to report the publish, and fails with whatever it shows instead. */
async function expectPublished(page: Page, text: RegExp): Promise<void> {
  const decide = page.getByRole('region', { name: 'Decide' });
  try {
    await expect(decide).toContainText(text, { timeout: 45_000 });
  } catch {
    const shown = (await decide.innerText().catch(() => '(no Decide section)')).replace(/\s+/g, ' ');
    throw new Error(`Publishing did not report success. The section shows: ${shown.slice(0, 600)}`);
  }
}

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('visitors (no account)', () => {
  test('search finds a real school with its division and data years', async ({ page }) => {
    await page.goto('/schools');
    await expect(page.getByRole('heading', { level: 1, name: 'Find college baseball programs' })).toBeVisible();
    await expect(page.getByText(/colleges reported a baseball team in the 2024–25 federal athletics report/)).toBeVisible();
    await page.getByLabel('School name or city').fill('Stanford');
    await page.getByRole('button', { name: 'Show schools' }).click();
    await expect(page).toHaveURL(/q=Stanford/);
    const card = page.getByRole('article', { name: 'Stanford University' });
    await expect(card).toBeVisible();
    await expect(card.getByText('NCAA Division I', { exact: true })).toBeVisible();
    await expect(card.getByText('3.6%')).toBeVisible();
    await expect(card.getByText('(Fall 2024)').first()).toBeVisible();
    await expect(card.getByText('$92,892')).toBeVisible();
    await expect(card.getByText('(2025–26)')).toBeVisible();
  });

  test('division filters use the federal classification', async ({ page }) => {
    await page.goto('/schools');
    await page.getByLabel('CCCAA (California)').check();
    await page.getByRole('button', { name: 'Show schools' }).click();
    await expect(page.getByText(/Showing 1–20 of 88 programs/)).toBeVisible();
    await expect(page.getByRole('article').first().getByText('CCCAA', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByText(/Showing 21–40 of 88 programs/)).toBeVisible();
  });

  test('figure filters say which schools they leave out', async ({ page }) => {
    await page.goto('/schools?rate=15&state=CA');
    await expect(page.getByText("Filtering by admission rate leaves out schools that don't report that figure.")).toBeVisible();
    await expect(page.getByRole('article', { name: 'Stanford University' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Long Beach City College' })).toHaveCount(0);
  });

  test('a school page shows every figure with its source and year', async ({ page }) => {
    await page.goto('/schools/stanford-university-ca');
    await expect(page.getByRole('heading', { level: 1, name: 'Stanford University' })).toBeVisible();
    const baseball = page.getByRole('region', { name: 'Baseball program' });
    await expect(baseball.getByText('NCAA Division I', { exact: true })).toBeVisible();
    await expect(baseball.getByText('Federal report', { exact: true })).toBeVisible();
    await expect(baseball.getByText('Not yet verified').first()).toBeVisible();
    const admissions = page.getByRole('region', { name: 'Admissions' });
    await expect(admissions.getByRole('heading', { name: 'Current testing policy' })).toBeVisible();
    await expect(admissions.getByText('Not yet checked.')).toBeVisible();
    await expect(admissions.getByRole('heading', { name: 'The Fall 2024 entering class (historical)' })).toBeVisible();
    await expect(admissions.getByText('3.6%')).toBeVisible();
    await expect(admissions.getByText('770–800')).toBeVisible();
    await expect(admissions.getByText('Not reported in federal data')).toBeVisible();
    const cost = page.getByRole('region', { name: 'Published cost' });
    await expect(cost.getByText('Sticker prices for the 2025–26 academic year, before any financial aid.')).toBeVisible();
    await expect(cost.getByText('$92,892')).toBeVisible();
    await expect(cost.getByRole('link', { name: /net price/ })).toHaveAttribute('href', /^https:\/\/financialaid\.stanford\.edu\//);
    const sources = page.getByRole('region', { name: 'Sources' });
    await expect(sources.getByText('U.S. Department of Education, Equity in Athletics Data Analysis')).toBeVisible();
    await expect(sources.getByText(/EADA_2024-2025\.zip, retrieved/)).toBeVisible();
    await expect(sources.getByText('U.S. Department of Education, College Scorecard (IPEDS data)')).toBeVisible();
  });

  test('missing figures read as not reported, never zero', async ({ page }) => {
    await page.goto('/schools/long-beach-city-college-ca');
    await expect(page.getByRole('heading', { level: 1, name: 'Long Beach City College' })).toBeVisible();
    const admissions = page.getByRole('region', { name: 'Admissions' });
    await expect(admissions.getByText('Not reported.')).toBeVisible();
    await expect(admissions.getByText('%')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Baseball program' }).getByText('CCCAA', { exact: true })).toBeVisible();
  });

  test('compare: add from search, compare side by side, remove', async ({ page }) => {
    await page.goto('/schools?q=Stanford');
    await page.getByRole('button', { name: 'Add to compare: Stanford University' }).click();
    await expect(page.getByText('1 of 5 schools picked to compare')).toBeVisible();
    await page.getByLabel('School name or city').fill('Harvard');
    await page.getByRole('button', { name: 'Show schools' }).click();
    await page.getByRole('button', { name: 'Add to compare: Harvard University' }).click();
    await expect(page.getByText('2 of 5 schools picked to compare')).toBeVisible();
    await page.getByRole('link', { name: 'Compare now' }).click();
    await expect(page).toHaveURL('/compare');
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: /Stanford University/ })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: /Harvard University/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /^Test policy, past class/ })).toContainText('Test optional');
    await expect(table.getByRole('row', { name: /^Test policy, past class/ })).toContainText('Test required');
    await expect(table.getByRole('row', { name: /^GPA/ })).toContainText('Not reported in federal data');
    await page.getByRole('button', { name: 'Remove Stanford University' }).click();
    await expect(page.getByRole('columnheader', { name: /Stanford University/ })).toHaveCount(0);
    await expect(table.getByRole('columnheader', { name: /Harvard University/ })).toBeVisible();
  });

  test('compare holds at most five schools', async ({ page }) => {
    await page.goto(
      '/compare?schools=stanford-university-ca,harvard-university-ma,long-beach-city-college-ca,auburn-university-al,alabama-a-and-m-university-al,the-university-of-alabama-al',
    );
    await expect(page.getByText('Compare shows up to five schools, so only the first five are here.')).toBeVisible();
    await expect(page.getByRole('table').getByRole('link', { name: /^Remove / })).toHaveCount(5);
  });

  test('methodology reports live coverage, including what is missing', async ({ page }) => {
    await page.goto('/data-methodology');
    await expect(page.getByRole('table', { name: 'Active programs by division' })).toBeVisible();
    await expect(page.getByText(/GPA: 0\./)).toBeVisible();
  });
});

test.describe('administrator', () => {
  test.describe.configure({ mode: 'serial' });

  test('non-admins cannot open the data screens', async ({ page }) => {
    const athlete = await createAccount({ role: 'athlete', name: 'Not An Admin', dateOfBirth: yearsAgo(19) });
    await logIn(page, athlete.email);
    await page.goto('/admin/data');
    await expect(page).not.toHaveURL(/\/admin\/data/);
  });

  test('stage the bundled snapshot, review it and publish it again', async ({ page }) => {
    await logIn(page, ADMIN);
    await page.goto('/admin/data');
    await expect(page.getByRole('heading', { level: 1, name: 'School data' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: /^Stage registry-\d{4}-\d{2}\.json for review$/ }).click();
    await page.waitForURL(/\/admin\/data\/jobs\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(page.getByRole('link', { name: /^Unchanged: 1,670$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Changed: 0$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^No longer reported: 0$/ })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Publish to the public registry' }).click();
    await expect(page.getByText('Confirm that you reviewed the changes.')).toBeVisible();
    await page.getByLabel('I reviewed the new, changed and missing records above.').check();
    await page.getByRole('button', { name: 'Publish to the public registry' }).click();
    await expectPublished(page, /Published [A-Z][a-z]{2} \d{1,2}, \d{4}: 0 records applied, 0 marked not reported, 0 skipped\./);
  });

  test('correct a program against an official page, then republish without losing it', async ({ page }) => {
    await logIn(page, ADMIN);
    await page.goto('/admin/schools?queue=other');
    await expect(page.getByText('Reported as: NCAA DIII w/FB; M/W LAX DI')).toBeVisible();
    await page.getByRole('link', { name: 'Johns Hopkins University, MD' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Johns Hopkins University' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    const form = page.getByRole('form', { name: 'Correct the baseball program' });
    await form.getByLabel('Division').selectOption({ label: 'NCAA Division III' });
    await form.getByLabel('How you confirmed this').selectOption('official_athletics_site');
    await form.getByLabel('What you checked').fill('Short');
    await form.getByRole('button', { name: 'Save program' }).click();
    await expect(form.getByText(/Cite the official page you checked/)).toBeVisible();

    await form.getByLabel('Official page you checked').fill('https://hopkinssports.com/sports/baseball');
    await form.getByLabel('Conference').fill('Centennial Conference');
    await form.getByLabel('Team page').fill('https://hopkinssports.com/sports/baseball');
    await form.getByLabel('What you checked').fill('Team page lists the Centennial Conference schedule (NCAA Division III).');
    await form.getByRole('button', { name: 'Save program' }).click();
    await expect(form.getByText('Program updated. The change and your note are in the revision log.')).toBeVisible();

    await page.goto('/schools/johns-hopkins-university-md');
    const baseball = page.getByRole('region', { name: 'Baseball program' });
    await expect(baseball.getByText('NCAA Division III', { exact: true })).toBeVisible();
    await expect(baseball.getByText('Centennial Conference')).toBeVisible();
    await expect(baseball.getByText('Official athletics site checked')).toBeVisible();
    await expect(baseball.getByRole('link', { name: /hopkinssports\.com/ })).toBeVisible();

    // Republish the federal snapshot: the reviewed division stands.
    await page.goto('/admin/data');
    await page.getByRole('button', { name: /^Stage registry-\d{4}-\d{2}\.json for review$/ }).click();
    await page.waitForURL(/\/admin\/data\/jobs\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(page.getByRole('link', { name: /^Unchanged: 1,670$/ })).toBeVisible();
    await page.getByLabel('I reviewed the new, changed and missing records above.').check();
    await page.getByRole('button', { name: 'Publish to the public registry' }).click();
    await expectPublished(page, /Published [A-Z][a-z]{2} \d{1,2}, \d{4}: 0 records applied/);
    await page.goto('/schools/johns-hopkins-university-md');
    await expect(page.getByRole('region', { name: 'Baseball program' }).getByText('NCAA Division III', { exact: true })).toBeVisible();
  });

  test('hide a school from public pages and list it again', async ({ page, browser }) => {
    await logIn(page, ADMIN);
    await page.goto('/admin/schools?q=Blue+Mountain');
    await page.getByRole('link', { name: 'Blue Mountain Community College, OR' }).click();
    const hide = page.getByRole('form', { name: 'Hide from public pages' });
    await hide.getByLabel('Reason').fill('Checking a duplicate record');
    await hide.getByRole('button', { name: 'Hide from public pages' }).click();
    await expect(page.getByText('Hidden from public pages.')).toBeVisible();

    const visitor = await (await browser.newContext()).newPage();
    const response = await visitor.goto('/schools/blue-mountain-community-college-or');
    expect(response?.status()).toBe(404);
    await visitor.goto('/schools?q=Blue+Mountain+Community');
    await expect(visitor.getByRole('article', { name: 'Blue Mountain Community College' })).toHaveCount(0);

    await page.reload();
    const list = page.getByRole('form', { name: 'List on public pages' });
    await list.getByLabel('Reason').fill('Not a duplicate');
    await list.getByRole('button', { name: 'List on public pages again' }).click();
    await expect(page.getByText('Listed again on public pages.')).toBeVisible();
    await visitor.goto('/schools/blue-mountain-community-college-or');
    await expect(visitor.getByRole('heading', { level: 1, name: 'Blue Mountain Community College' })).toBeVisible();
  });
});
