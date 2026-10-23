import { expect, test, type Page } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

/**
 * Discovery remediation (BR-01, 02, 04, 05, 06, 09). Data: the bundled real
 * registry snapshot published by global setup. Every account is synthetic,
 * and the one admissions policy recorded here cites a placeholder page on
 * example.edu, so no test claims to have checked a real school's website.
 */

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.test';
const HOPKINS = { slug: 'johns-hopkins-university-md', name: 'Johns Hopkins University' };
const FIXTURE_SOURCE = 'https://admissions.example.edu/testing-policy-fixture';
const ENTRY_YEAR = new Date().getUTCFullYear() + 1;

async function resultCount(page: Page): Promise<string> {
  const line = page.getByText(/^Showing 1–\d+ of [\d,]+ programs/);
  await expect(line).toBeVisible();
  return (await line.innerText()).trim();
}

test.describe('search links (BR-05)', () => {
  test('a home-page division link gives the same results as choosing that filter', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'NCAA Division II', exact: true }).click();
    await expect(page).toHaveURL(/\/schools\?division=ncaa_d2$/);
    const fromLink = await resultCount(page);

    await page.goto('/schools');
    await page.getByLabel('Division II', { exact: true }).check();
    await page.getByRole('button', { name: 'Show schools' }).click();
    expect(await resultCount(page)).toBe(fromLink);
  });

  test('the two-year link covers every two-year association', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Two-year colleges (NJCAA, CCCAA, NWAC)' }).click();
    await expect(page).toHaveURL(/division=njcaa_d1&division=njcaa_d2&division=njcaa_d3&division=cccaa&division=nwac$/);
    await expect(page.getByText('Filters (5 active)')).toBeVisible();
  });

  test('an old link still filters, and an unknown filter is reported instead of ignored silently', async ({ page }) => {
    await page.goto('/schools?division=ncaa_d1');
    const canonical = await resultCount(page);
    await page.goto('/schools?division=ncaa-d1');
    expect(await resultCount(page)).toBe(canonical);

    await page.goto('/schools?division=ncaa_d9');
    await expect(page.getByText("Some filters in this link weren't recognised, so they weren't applied")).toBeVisible();
    await expect(page.getByText(/Ignored: division “ncaa_d9”/)).toBeVisible();
  });
});

test.describe('comparison continuity (BR-06)', () => {
  test('the selection follows the visitor between search, a school page and the footer link', async ({ page }) => {
    await page.goto('/schools?q=Stanford');
    await page.getByRole('link', { name: 'Add to compare: Stanford University' }).click();
    await expect(page.getByText('1 of 5 schools picked to compare')).toBeVisible();

    await page.goto('/schools/harvard-university-ma');
    await page.getByRole('button', { name: 'Add to compare: Harvard University' }).click();
    await expect(page.getByRole('button', { name: 'Remove from compare: Harvard University' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'view comparison' })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: 'Compare schools' }).click();
    await expect(page).toHaveURL(/\/compare\?schools=stanford-university-ca(%2C|,)harvard-university-ma$/);
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: /Stanford University/ })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: /Harvard University/ })).toBeVisible();

    // Removing both clears the stored selection; a plain link then shows the empty state.
    await page.getByRole('link', { name: 'Remove Stanford University' }).click();
    await page.getByRole('link', { name: 'Remove Harvard University' }).click();
    await expect(page).toHaveURL(/\/compare\?schools=$/);
    await page.getByRole('contentinfo').getByRole('link', { name: 'Compare schools' }).click();
    await expect(page).toHaveURL(/\/compare$/);
    await expect(page.getByText('Pick schools to compare')).toBeVisible();
  });

  test('a school page refuses a sixth school and says how to make room', async ({ page }) => {
    await page.goto(
      '/compare?schools=stanford-university-ca,harvard-university-ma,long-beach-city-college-ca,auburn-university-al,alabama-a-and-m-university-al',
    );
    await page.goto('/schools/the-university-of-alabama-al');
    await expect(page.getByText('Compare holds five schools.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Remove one to add this school' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add to compare/ })).toHaveCount(0);
  });

  test('the comparison separates the checked current policy from the past class', async ({ page }) => {
    await page.goto('/compare?schools=stanford-university-ca');
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /^Current testing policy/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /^Test policy, past class/ })).toContainText('Fall 2024');
  });
});

test.describe('saved schools (BR-02)', () => {
  test('a guest saves more than five schools, keeps them after a refresh, and comparing never changes them', async ({ page }) => {
    await page.goto('/schools?division=cccaa');
    const unsaved = page.getByRole('button', { name: /^Save school: / });
    for (let i = 0; i < 6; i += 1) {
      await unsaved.first().click();
    }
    await expect(page.getByRole('button', { name: /^Remove from saved: / })).toHaveCount(6);

    await page.goto('/saved');
    await expect(page.getByText('6 saved schools in this browser')).toBeVisible();
    await page.reload();
    await expect(page.getByText('6 saved schools in this browser')).toBeVisible();

    // Add one to compare from the saved list, then remove it: still saved.
    const first = page.getByRole('article').first();
    const name = (await first.getByRole('heading').innerText()).trim();
    await first.getByRole('button', { name: `Add to compare: ${name}` }).click();
    await expect(page.getByRole('button', { name: `Remove from compare: ${name}` })).toBeVisible();
    await page.getByRole('button', { name: `Remove from compare: ${name}` }).click();
    await expect(page.getByRole('button', { name: `Add to compare: ${name}` })).toBeVisible();
    await expect(page.getByText('6 saved schools in this browser')).toBeVisible();
  });

  test('schools saved before signing in move into the account once', async ({ page }) => {
    const athlete = await createAccount({ role: 'athlete', name: 'Saver Athlete', dateOfBirth: yearsAgo(19) });
    await page.goto('/schools/stanford-university-ca');
    await page.getByRole('button', { name: 'Save school: Stanford University' }).click();
    await page.goto('/schools/harvard-university-ma');
    await page.getByRole('button', { name: 'Save school: Harvard University' }).click();

    await logIn(page, athlete.email);
    await expect(page.getByText('Moved 2 schools from this browser into your account')).toBeVisible();

    await page.goto('/saved');
    await expect(page.getByText('2 saved schools', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('2 saved schools', { exact: true })).toBeVisible();
    await expect(page.getByText(/Moved \d+ school/)).toHaveCount(0);

    await page.goto('/schools/stanford-university-ca');
    await page.getByRole('button', { name: 'Remove from saved: Stanford University' }).click();
    await expect(page.getByRole('button', { name: 'Save school: Stanford University' })).toBeVisible();
    await page.goto('/saved');
    await expect(page.getByText('1 saved school', { exact: true })).toBeVisible();
  });
});

test.describe('current policy and the score comparison (BR-01, BR-04)', () => {
  test.describe.configure({ mode: 'serial' });

  test('an administrator records a checked current policy without touching the past class', async ({ page }) => {
    await logIn(page, ADMIN);
    await page.goto(`/admin/schools/${HOPKINS.slug}`);
    const form = page.getByRole('form', { name: 'Record a checked admissions testing policy' });
    await form.getByLabel('Applicants').selectOption('first_year');
    await form.getByLabel('Entering in fall').selectOption(String(ENTRY_YEAR));
    await form.getByLabel('Testing policy').selectOption('required');
    await form.getByLabel('Official admissions page you checked').fill(FIXTURE_SOURCE);
    await form.getByLabel('What you checked').fill('Test fixture: placeholder source, not a real check of the school website.');
    await form.getByRole('button', { name: 'Record policy' }).click();
    await expect(form.getByText('Policy recorded.', { exact: false })).toBeVisible();

    await page.goto(`/schools/${HOPKINS.slug}`);
    const admissions = page.getByRole('region', { name: 'Admissions' });
    await expect(admissions.getByText(`First-year applicants, entering fall ${ENTRY_YEAR}`)).toBeVisible();
    await expect(admissions.getByText('SAT/ACT required to be considered for admission')).toBeVisible();
    await expect(admissions.getByRole('heading', { name: 'The Fall 2024 entering class (historical)' })).toBeVisible();
    await expect(admissions.getByText('Test policy for the Fall 2024 class')).toBeVisible();
    await expect(admissions.getByText(/considered if submitted|not required/i).first()).toBeVisible();
  });

  test('the comparison uses the checked policy, never the past test-optional class', async ({ page }) => {
    await page.goto(`/schools/${HOPKINS.slug}`);
    await page.getByRole('button', { name: `Save school: ${HOPKINS.name}` }).click();

    await page.goto('/match');
    await page.getByLabel('Entering college in fall').selectOption(String(ENTRY_YEAR));
    await page.getByLabel('My saved schools').check();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused();
    let card = page.getByRole('article', { name: HOPKINS.name });
    await expect(card.getByText('Unknown').first()).toBeVisible();
    await card.getByText('Why these results').click();
    await expect(card.getByText('The school requires a test score, and you haven’t entered one yet.')).toBeVisible();
    await expect(card.getByRole('link', { name: 'admissions.example.edu' })).toBeVisible();

    // Saying no to sending scores, at a school that requires them, is "Not met".
    await page.getByLabel('No', { exact: true }).check();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    card = page.getByRole('article', { name: HOPKINS.name });
    await expect(card.getByText('Not met', { exact: true })).toBeVisible();

    // A score below the past range is a benchmark, not a requirement.
    await page.getByLabel('Yes', { exact: true }).check();
    await page.getByLabel('SAT Math').fill('600');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    card = page.getByRole('article', { name: HOPKINS.name });
    await expect(card.getByText('Met', { exact: true })).toBeVisible();
    await expect(card.getByText('Below the reported range')).toBeVisible();
    await expect(card.getByText(/safety|reach|likely|chance/i)).toHaveCount(0);

    // Transfer applicants are never compared with first-year ranges.
    await page.getByLabel('A transfer student').check();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    card = page.getByRole('article', { name: HOPKINS.name });
    await expect(card.getByText('Not compared').first()).toBeVisible();
    await expect(card.getByText('Below the reported range')).toHaveCount(0);
  });

  test('scores never leave the browser', async ({ page }) => {
    const bodies: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') bodies.push(request.postData() ?? '');
    });
    await page.goto('/match');
    await page.getByLabel('SAT Reading and Writing').fill('730');
    await page.getByLabel('ACT composite').fill('31');
    await page.getByLabel('Your GPA').fill('3.87');
    await page.getByLabel('State', { exact: true }).selectOption('VT');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain('730');
      expect(body).not.toContain('3.87');
    }
    expect(page.url()).not.toMatch(/730|3\.87/);
  });
});

test.describe('correction reports (BR-09)', () => {
  test('a signed-out visitor is asked to log in', async ({ page }) => {
    await page.goto('/schools/stanford-university-ca/correction');
    await expect(page.getByText('Reports need a free account')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in to report a correction' })).toHaveAttribute(
      'href',
      '/login?next=%2Fschools%2Fstanford-university-ca%2Fcorrection',
    );
  });

  test('a signed-in visitor reports a problem and an administrator closes it', async ({ page, browser }) => {
    const athlete = await createAccount({ role: 'athlete', name: 'Reporting Athlete', dateOfBirth: yearsAgo(20) });
    const details = `Test report ${Date.now()}: the conference listed here looks out of date.`;
    await logIn(page, athlete.email);
    await page.goto('/schools/stanford-university-ca');
    await page.getByRole('link', { name: 'Report a correction' }).click();
    await page.getByLabel('What is wrong or missing?').selectOption('conference');
    await page.getByLabel('What should it say?').fill(details);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Report sent')).toBeVisible();
    await expect(page.getByText(/Nothing on the page changes until a reviewer checks an official source/)).toBeVisible();

    const adminPage = await (await browser.newContext()).newPage();
    await logIn(adminPage, ADMIN);
    await adminPage.goto('/admin/corrections');
    const report = adminPage.getByRole('listitem').filter({ hasText: details });
    await expect(report).toBeVisible();
    await report.getByLabel('What you did').fill('Test: nothing to change.');
    await report.getByRole('button', { name: 'Dismiss' }).click();
    // Closed reports leave the open queue.
    await expect(adminPage.getByRole('listitem').filter({ hasText: details })).toHaveCount(0);
  });
});
