import { expect, test } from '@playwright/test';

import { createAccount, logIn, yearsAgo } from './support';

test('an athlete cannot open parent, coach or admin areas', async ({ page }) => {
  const athlete = await createAccount({ role: 'athlete', name: 'Role Athlete', dateOfBirth: yearsAgo(19) });
  await logIn(page, athlete.email);
  await expect(page).toHaveURL('/athlete');
  for (const path of ['/parent', '/coach', '/coach/athletes', '/admin']) {
    await page.goto(path);
    await expect(page).toHaveURL('/athlete');
  }
});

test('a parent cannot open athlete, coach or admin areas', async ({ page }) => {
  const parent = await createAccount({ role: 'parent', name: 'Role Parent', dateOfBirth: yearsAgo(45) });
  await logIn(page, parent.email);
  await expect(page).toHaveURL('/parent');
  for (const path of ['/athlete', '/coach', '/admin']) {
    await page.goto(path);
    await expect(page).toHaveURL('/parent');
  }
});

test('a coach cannot open the admin console', async ({ page }) => {
  const coach = await createAccount({ role: 'coach', name: 'Role Coach', dateOfBirth: yearsAgo(38) });
  await logIn(page, coach.email);
  await expect(page).toHaveURL('/coach');
  await page.goto('/admin');
  await expect(page).toHaveURL('/coach');
});

test('signed-in people can still use every public page', async ({ page }) => {
  const athlete = await createAccount({ role: 'athlete', name: 'Public Pages', dateOfBirth: yearsAgo(19) });
  await logIn(page, athlete.email);
  for (const path of ['/', '/schools', '/match', '/pricing']) {
    await page.goto(path);
    expect(new URL(page.url()).pathname).toBe(path);
  }
});

test('an account without a role is asked to finish setting up', async ({ page }) => {
  const account = await createAccount({ role: null, name: 'No Role Yet', dateOfBirth: yearsAgo(30) });
  await logIn(page, account.email);
  await expect(page).toHaveURL('/onboarding');
  await page.goto('/athlete');
  await expect(page).toHaveURL('/onboarding');
  await page.getByRole('radio', { name: 'Parent or guardian' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/parent');
});
