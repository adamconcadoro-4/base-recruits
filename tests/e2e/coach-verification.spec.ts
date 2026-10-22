import { expect, test } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

// Acceptance cases 14 and 15: a .edu email alone grants nothing; a verified
// coach reaches coach tools with no payment.
test('a coach gets coach tools only after an admin verifies their staff listing', async ({ browser }) => {
  const coach = await createAccount({ role: 'coach', name: 'Casey Synthetic', dateOfBirth: yearsAgo(36) });

  const coachPage = await (await browser.newContext()).newPage();
  await logIn(coachPage, coach.email);
  await expect(coachPage).toHaveURL('/coach');
  await expect(coachPage.getByText('Email confirmed', { exact: true })).toBeVisible();

  await coachPage.goto('/coach/athletes');
  await expect(coachPage).toHaveURL('/coach/verification');

  await coachPage.getByLabel('School', { exact: true }).fill('Synthetic State University');
  await coachPage.getByLabel('Your coaching title').fill('Assistant Baseball Coach');
  await coachPage.getByLabel('Official staff directory page').fill('https://athletics.example.edu/sports/baseball/coaches');
  await coachPage.getByRole('button', { name: 'Send for review' }).click();
  await expect(coachPage.getByText('Under review', { exact: true })).toBeVisible();

  await coachPage.goto('/coach/athletes');
  await expect(coachPage).toHaveURL('/coach/verification');

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.test');
  await adminPage.goto('/admin');
  const review = adminPage.getByRole('form', { name: `Review ${coach.email}` });
  await expect(review).toBeVisible();
  await review.getByLabel('Decision').selectOption('approve');
  await review.getByRole('button', { name: 'Save decision' }).click();
  await expect(adminPage.getByRole('form', { name: `Review ${coach.email}` })).toHaveCount(0);

  await coachPage.goto('/coach/athletes');
  await expect(coachPage).toHaveURL('/coach/athletes');
  await expect(coachPage.getByRole('heading', { level: 1, name: 'Athlete search' })).toBeVisible();
});

test('rejecting without a note is refused', async ({ browser }) => {
  const coach = await createAccount({ role: 'coach', name: 'Note Required', dateOfBirth: yearsAgo(40) });
  const coachPage = await (await browser.newContext()).newPage();
  await logIn(coachPage, coach.email);
  await coachPage.goto('/coach/verification');
  await coachPage.getByLabel('School', { exact: true }).fill('Synthetic Community College');
  await coachPage.getByLabel('Your coaching title').fill('Head Baseball Coach');
  await coachPage.getByLabel('Official staff directory page').fill('https://athletics.example.edu/baseball/staff');
  await coachPage.getByRole('button', { name: 'Send for review' }).click();
  await expect(coachPage.getByText('Under review', { exact: true })).toBeVisible();

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.test');
  await adminPage.goto('/admin');
  const review = adminPage.getByRole('form', { name: `Review ${coach.email}` });
  await review.getByLabel('Decision').selectOption('reject');
  await review.getByRole('button', { name: 'Save decision' }).click();
  await expect(review.getByText('A note is required for this decision.')).toBeVisible();
});
