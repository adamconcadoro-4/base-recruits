import { expect, test } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

// Decision F4: a minor's coach visibility needs a linked parent's approval.
test('a minor’s coach visibility waits for a linked parent, then takes effect', async ({ browser }) => {
  const minor = await createAccount({ role: 'athlete', name: 'Riley Synthetic', dateOfBirth: yearsAgo(15) });
  const parent = await createAccount({ role: 'parent', name: 'Morgan Synthetic', dateOfBirth: yearsAgo(46) });

  const athletePage = await (await browser.newContext()).newPage();
  await logIn(athletePage, minor.email);
  await expect(athletePage).toHaveURL('/athlete');
  await athletePage.getByRole('button', { name: 'Turn on coach visibility' }).click();
  await expect(athletePage.getByText('Waiting for parent or guardian approval')).toBeVisible();

  await athletePage.getByRole('button', { name: 'Create a family code' }).click();
  const code = (await athletePage.getByTestId('family-code').innerText()).trim();
  // Shown in groups of four for readability; the database ignores the dashes.
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const parentPage = await (await browser.newContext()).newPage();
  await logIn(parentPage, parent.email);
  await expect(parentPage).toHaveURL('/parent');
  await parentPage.getByLabel('Family code').fill(code);
  await parentPage.getByLabel('Your relationship to the athlete').selectOption('parent');
  await parentPage.getByRole('button', { name: 'Connect to athlete' }).click();
  await expect(parentPage.getByText(/Code accepted/)).toBeVisible();

  await athletePage.reload();
  await expect(athletePage.getByText('Morgan Synthetic')).toBeVisible();
  await athletePage.getByRole('button', { name: 'Approve link' }).click();
  await expect(athletePage.getByText('Linked', { exact: true })).toBeVisible();

  await parentPage.reload();
  await expect(parentPage.getByText(/Riley Synthetic: Visible to verified coaches/)).toBeVisible();
  await parentPage.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(parentPage.getByText('Nothing is waiting for you.')).toBeVisible();

  await athletePage.reload();
  await expect(athletePage.getByText('On: visible to verified coaches')).toBeVisible();

  // Ending the parent link ends what depended on it.
  await athletePage.getByRole('button', { name: 'Remove access' }).click();
  await expect(athletePage.getByText('No family members are linked yet.')).toBeVisible();
  await athletePage.reload();
  await expect(athletePage.getByText('Off', { exact: true })).toBeVisible();
  await expect(athletePage.getByText('On: visible to verified coaches')).toHaveCount(0);
});

test('an adult athlete’s coach visibility takes effect immediately and turns off at once', async ({ page }) => {
  const adult = await createAccount({ role: 'athlete', name: 'Avery Synthetic', dateOfBirth: yearsAgo(19) });
  await logIn(page, adult.email);
  await page.getByRole('button', { name: 'Turn on coach visibility' }).click();
  await expect(page.getByText('On: visible to verified coaches')).toBeVisible();
  await page.getByRole('button', { name: 'Turn off coach visibility' }).click();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
});
