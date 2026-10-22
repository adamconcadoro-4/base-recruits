import { expect, test } from '@playwright/test';

import { PASSWORD, confirmationLink, createAccount, fillBirthDate, logIn, uniqueEmail, yearsAgo } from './support';

test('an athlete signs up, confirms their email and lands on their home', async ({ page }) => {
  const email = uniqueEmail('signup');
  await page.goto('/signup');
  await fillBirthDate(page, yearsAgo(19));
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('radio', { name: /Student-athlete/ }).check();
  await page.getByLabel('Your name').fill('Jordan Synthetic');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await confirmationLink(email));
  await expect(page).toHaveURL('/athlete');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Jordan Synthetic' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await logIn(page, email);
  await expect(page).toHaveURL('/athlete');
});

test('an under-13 answer creates nothing and blocks retrying', async ({ page }) => {
  await page.goto('/signup');
  await fillBirthDate(page, yearsAgo(10));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Base Recruits accounts are for people 13 and older.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Base Recruits accounts are for people 13 and older.')).toBeVisible();
  await expect(page.getByLabel('Month', { exact: true })).toHaveCount(0);
});

test('minors can only create athlete accounts', async ({ page }) => {
  await page.goto('/signup');
  await fillBirthDate(page, yearsAgo(15));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('radio', { name: /Student-athlete/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Parent or guardian/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /College coach/ })).toHaveCount(0);
});

test('a wrong password gets a plain message', async ({ page }) => {
  const account = await createAccount({ role: 'athlete', name: 'Wrong Password', dateOfBirth: yearsAgo(20) });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password-1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('That email and password don’t match an account.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('an unconfirmed email cannot log in yet', async ({ page }) => {
  const account = await createAccount({
    role: 'athlete',
    name: 'Not Confirmed',
    dateOfBirth: yearsAgo(20),
    emailConfirmed: false,
  });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText(/Confirm your email first/)).toBeVisible();
});

test('a crafted next= link cannot send someone to another site after login', async ({ page }) => {
  const account = await createAccount({ role: 'athlete', name: 'Redirect Check', dateOfBirth: yearsAgo(20) });
  await page.goto('/login?next=https://evil.example/steal');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL('/athlete');
});
