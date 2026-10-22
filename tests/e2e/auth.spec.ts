import { expect, test } from '@playwright/test';

import {
  PASSWORD,
  createAccount,
  emailCode,
  fillBirthDate,
  logIn,
  publicClient,
  reachVerifyPage,
  signUpThroughSite,
  uniqueEmail,
  yearsAgo,
} from './support';

test('an athlete signs up with an emailed code and lands on their home', async ({ page }) => {
  const email = uniqueEmail('signup');
  await signUpThroughSite(page, { email, name: 'Jordan Synthetic', dateOfBirth: yearsAgo(19), role: /Student-athlete/ });
  await expect(page).toHaveURL('/athlete');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Jordan Synthetic' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await logIn(page, email);
  await expect(page).toHaveURL('/athlete');
});

// Review finding: someone registers another person's email first. The real
// owner must end up with their own password, role and name, and the other
// person's password must stop working.
test('an account someone else pre-registered for your email is taken over cleanly by you', async ({ page }) => {
  const email = uniqueEmail('prereg');
  const attackerPassword = 'someone-elses-password-1';
  const { error: preRegisterError } = await publicClient().auth.signUp({
    email,
    password: attackerPassword,
    options: { data: { account_type: 'parent', display_name: 'Not The Owner' } },
  });
  expect(preRegisterError).toBeNull();
  // Supabase will not email the same address twice within a moment; a real
  // pre-registration happens well before the owner signs up.
  await page.waitForTimeout(2500);

  await signUpThroughSite(page, { email, name: 'Real Owner', dateOfBirth: yearsAgo(17), role: /Student-athlete/ });
  await expect(page).toHaveURL('/athlete');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Real Owner' })).toBeVisible();

  const { error: attackerLogin } = await publicClient().auth.signInWithPassword({ email, password: attackerPassword });
  expect(attackerLogin).not.toBeNull();
  const { error: ownerLogin } = await publicClient().auth.signInWithPassword({ email, password: PASSWORD });
  expect(ownerLogin).toBeNull();
});

// Second review: whichever way an email gets confirmed, a password set before
// confirmation must not survive it (database safeguard, tested here against
// real Supabase Auth without the app's own password step).
test('confirming an email wipes a password someone set before confirmation', async () => {
  const email = uniqueEmail('wipe');
  const earlierPassword = 'set-before-confirmation-1';
  const { error: preRegisterError } = await publicClient().auth.signUp({ email, password: earlierPassword });
  expect(preRegisterError).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const owner = publicClient();
  const requestedAt = new Date(Date.now() - 2000);
  const { error: otpError } = await owner.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  expect(otpError).toBeNull();
  const { error: verifyError } = await owner.auth.verifyOtp({ email, token: await emailCode(email, requestedAt), type: 'email' });
  expect(verifyError).toBeNull();

  const { error: earlierLogin } = await publicClient().auth.signInWithPassword({ email, password: earlierPassword });
  expect(earlierLogin).not.toBeNull();
});

test('changing an account email is refused for now', async () => {
  const account = await createAccount({ role: 'athlete', name: 'Email Change', dateOfBirth: yearsAgo(20) });
  const client = publicClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email: account.email, password: PASSWORD });
  expect(signInError).toBeNull();
  const { error } = await client.auth.updateUser({ email: uniqueEmail('someone-else', 'example.edu') });
  expect(error).not.toBeNull();
});

test('a forgotten password is reset with an emailed code', async ({ page }) => {
  const account = await createAccount({ role: 'athlete', name: 'Reset Synthetic', dateOfBirth: yearsAgo(20) });
  const requestedAt = new Date(Date.now() - 2000);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await reachVerifyPage(page);
  await page.getByLabel('6-digit code').fill(await emailCode(account.email, requestedAt));
  await page.getByLabel('New password').fill('a-brand-new-password-7');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL('/athlete');

  const { error: oldPassword } = await publicClient().auth.signInWithPassword({ email: account.email, password: PASSWORD });
  expect(oldPassword).not.toBeNull();
});

test('a wrong code is refused', async ({ page }) => {
  await page.goto('/signup');
  await fillBirthDate(page, yearsAgo(22));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your name').fill('Wrong Code');
  await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('wrongcode'));
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await reachVerifyPage(page);
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByLabel('Create a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText(/That code is wrong or has expired/).first()).toBeVisible();
  await expect(page).toHaveURL('/verify');
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
