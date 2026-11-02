import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { PASSWORD, createAccount, logIn, publicClient, sql, yearsAgo, type TestAccount } from './support';

/**
 * Base Recruits Assessment, end to end against the real local stack: a hitting
 * self-assessment from start to published report, private clip upload, Film
 * Room markers and timing, training plan and log, reassessment, development
 * coach access (with the guardian gate for minors), and who cannot see what.
 * Every account and value here is synthetic test data.
 */

const enabled = process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true';
test.skip(!enabled, 'Assessment is switched off for this build (set NEXT_PUBLIC_ASSESSMENT_ENABLED=true).');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CLIP = path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-pattern.webm');

async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = results.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
  expect(found, `${label} meets WCAG 2.2 AA automated checks`).toEqual([]);
}

/** Starts a draft through the same database function the site uses, signed in as the athlete. */
async function draftFor(account: TestAccount): Promise<string> {
  const client = publicClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email: account.email, password: PASSWORD });
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);
  const { data, error } = await client.rpc('create_assessment', {
    p_athlete_id: account.id,
    p_protocol_key: 'hitting-video',
    p_protocol_version: 1,
    p_assessment_date: new Date().toISOString().slice(0, 10),
    p_context: { rep_goal: 10 },
  });
  await client.auth.signOut();
  if (error || typeof data !== 'string') throw new Error(`create_assessment failed: ${error?.message ?? 'no id'}`);
  return data;
}

async function rate(page: Page, metricKey: string, choice: number | 'unable', reason?: string): Promise<void> {
  const form = page.getByTestId(`rating-${metricKey}`);
  if (choice === 'unable') {
    await form.getByRole('radio', { name: /^Unable to assess/ }).check();
    await form.getByLabel(/Why it couldn/).fill(reason ?? 'Not visible from this angle');
  } else {
    await form.getByRole('radio', { name: new RegExp(`^${choice} — `) }).check();
  }
  await form.getByRole('button', { name: 'Save rating' }).click();
  await expect(form.getByRole('status')).toHaveText(/Saved/);
}

test('public pages explain Assessment and show a clearly fictional sample', async ({ page }) => {
  await page.goto('/player-assessment');
  await expect(page.getByRole('heading', { level: 1, name: 'Base Recruits Assessment' })).toBeVisible();
  await expect(page.getByText('Understand your game, see the evidence, and know what to work on next.').first()).toBeVisible();
  await expect(page.getByText(/does not predict recruiting/)).toBeVisible();
  await expectAccessible(page, '/player-assessment');

  await page.goto('/player-assessment/sample');
  await expect(page.getByRole('note')).toContainText('Fictional sample');
  await expect(page.getByText('Rubric score = 25 × (rating − 1)', { exact: false }).first()).toBeVisible();
  await expectAccessible(page, '/player-assessment/sample');

  // Signed-out visitors to the app area get the explanation, not a login wall.
  await page.goto('/assessment');
  await expect(page).toHaveURL('/player-assessment');
});

test('an athlete records, publishes and acts on a hitting self-assessment', async ({ page }) => {
  test.setTimeout(240_000);
  const athlete = await createAccount({ role: 'athlete', name: 'Jordan Synthetic', dateOfBirth: yearsAgo(19) });
  await logIn(page, athlete.email);

  // Overview and a new assessment with measured ball data.
  await page.goto('/assessment');
  await expect(page.getByRole('heading', { level: 1, name: 'Assessment' })).toBeVisible();
  await expectAccessible(page, 'Assessment overview');
  await page.getByRole('link', { name: 'New hitting assessment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New hitting assessment' })).toBeVisible();
  await page.getByRole('radio', { name: /video plus measured ball data/ }).check();
  await page.getByLabel(/Goal: valid swings/).fill('6');
  await page.getByLabel('Drill', { exact: true }).selectOption('front_toss');
  await page.getByRole('checkbox', { name: /camera facing the athlete’s chest/ }).check();
  await expectAccessible(page, 'New assessment');
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.waitForURL(/\/assessment\/[0-9a-f-]{36}\?step=clips$/);
  const assessmentUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1, name: 'Hitting assessment' })).toBeVisible();

  // Details save themselves.
  await page.goto(`${assessmentUrl}?step=details`);
  await page.getByLabel('Surface or setting').fill('Cage turf');
  await expect(page.getByText('All changes saved.')).toBeVisible();

  // A private clip upload with progress, then confirmation.
  await page.goto(`${assessmentUrl}?step=clips`);
  await page.getByLabel('Video file').setInputFiles(CLIP);
  await page.getByLabel('Name (optional)').fill('Side view, front toss');
  await page.getByRole('button', { name: 'Upload clip' }).click();
  await expect(page.getByText('Uploaded test-pattern.webm.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Open in Film Room' })).toBeVisible();

  // Swings: add seven, exclude one with a reason.
  await page.goto(`${assessmentUrl}?step=reps`);
  await page.getByLabel('How many').fill('7');
  await page.getByRole('button', { name: 'Add swings' }).click();
  await expect(page.getByText('Added 7 repetitions.')).toBeVisible();
  await page.reload();
  const seventh = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '7', exact: true }) });
  await seventh.getByLabel('Reason').fill('Camera bumped');
  await seventh.getByRole('button', { name: 'Exclude' }).click();
  await expect(seventh.getByText('Camera bumped')).toBeVisible();

  // Measured exit velocity (with its device) and charted solid contact.
  await page.locator('summary', { hasText: 'Exit velocity' }).click();
  const velocity = page.getByTestId('entry-hit_exit_velocity_mph');
  await velocity.getByLabel('Device', { exact: true }).selectOption('other:radar');
  await velocity.getByLabel('Name or model', { exact: true }).fill('Test radar');
  for (const [index, value] of ['78', '81.5', '80', '79', '83', '77'].entries()) {
    await velocity.getByLabel(`#${index + 1}`, { exact: true }).fill(value);
  }
  await velocity.getByRole('button', { name: 'Save exit velocity' }).click();
  await expect(velocity.getByRole('status')).toHaveText('Saved 6 values.');

  await page.locator('summary', { hasText: 'Solid-contact rate' }).click();
  const contact = page.getByTestId('entry-hit_solid_contact');
  for (const [index, value] of ['yes', 'yes', 'no', 'yes', 'yes', 'no'].entries()) {
    await contact.getByLabel(`#${index + 1}`, { exact: true }).selectOption(value);
  }
  await contact.getByRole('button', { name: 'Save solid-contact rate' }).click();
  await expect(contact.getByRole('status')).toHaveText('Saved 6 values.');
  await expectAccessible(page, 'Swings and measurements');

  // Film Room: two markers on swing 1 become a timing estimate; a drawing on the frame.
  await page.goto(`${assessmentUrl}?step=clips`);
  await page.getByRole('link', { name: 'Open in Film Room' }).click();
  await expect(page.getByTestId('film-room')).toBeVisible();
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1);
  await page.getByLabel('Repetition').selectOption({ label: '#1' });
  await page.getByLabel('Event', { exact: true }).selectOption({ label: 'Front foot lands' });
  await page.getByRole('button', { name: /^Mark at/ }).click();
  await expect(page.getByText('Marked at 0.000 s.')).toBeVisible();
  for (let frame = 0; frame < 9; frame += 1) await page.getByRole('button', { name: 'Forward one frame' }).click();
  await expect(page.getByTestId('current-time')).toHaveText('0.300 s');
  await page.getByLabel('Event', { exact: true }).selectOption({ label: 'Ball contact' });
  await page.getByRole('button', { name: /^Mark at/ }).click();
  await expect(page.getByText('Marked at 0.300 s.')).toBeVisible();
  await page.getByLabel('Measure').selectOption({ label: 'Foot landing to contact' });
  await page.getByRole('button', { name: 'Save timing' }).click();
  await expect(page.getByText('Timing saved as a video estimate.')).toBeVisible();
  await page.getByRole('button', { name: 'Turn drawing on' }).click();
  // The button sits below the video; bring the frame back into view before drawing on it.
  await page.locator('video').scrollIntoViewIfNeeded();
  const box = await page.locator('video').boundingBox();
  if (!box) throw new Error('video not laid out');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Drawing added.')).toBeVisible();
  await expectAccessible(page, 'Film Room');

  // Ratings against written anchors, including one honest "unable to assess".
  await page.goto(`${assessmentUrl}?step=ratings`);
  await rate(page, 'hit_load_repeatability', 2);
  await rate(page, 'hit_drill_preparation', 'unable', 'Front side hidden by the net');
  await rate(page, 'hit_contact_location_consistency', 4);
  await rate(page, 'hit_barrel_delivery_consistency', 3);
  await rate(page, 'hit_stride_direction_repeatability', 3);
  await rate(page, 'hit_balance_through_swing', 3);
  await rate(page, 'hit_lower_body_consistency', 3);
  await expectAccessible(page, 'Ratings');

  // The live preview: complete pillars score, missing evidence is not a zero.
  await page.goto(`${assessmentUrl}?step=results`);
  await expect(page.getByText('This is a live preview')).toBeVisible();
  await expect(page.getByText('Still needed: Ready on time for the drill.')).toBeVisible();
  await expect(page.getByText('62.5', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Rubric score = 25 × (4 − 1) = 75').first()).toBeVisible();
  await expect(page.getByText('Reference benchmarks are not available for this metric and protocol.').first()).toBeVisible();
  await expectAccessible(page, 'Results preview');

  // Publish: a frozen, self-assessed report.
  await page.goto(`${assessmentUrl}?step=publish`);
  await page.getByLabel('Note on the report (optional)').fill('First block of the fall.');
  await page.getByRole('button', { name: 'Publish report' }).click();
  await page.waitForURL(`${assessmentUrl}/report`);
  await expect(page.getByRole('heading', { level: 1, name: 'Assessment report' })).toBeVisible();
  await expect(page.getByText('Self-assessment report').first()).toBeVisible();
  await expect(page.getByText(/This is a self-assessment/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
  await expectAccessible(page, 'Published report');

  // A training plan from the report's findings, and a logged session.
  await page.goto(assessmentUrl);
  await page.getByRole('link', { name: 'Build a training plan from this report' }).click();
  await expect(page.getByRole('heading', { name: 'Build a plan' })).toBeVisible();
  await expect(page.getByText(/Load repeatability was rated 2 of 5 in your self-assessment/).first()).toBeVisible();
  await expectAccessible(page, 'Plan builder');
  await page.getByRole('button', { name: 'Create the plan' }).click();
  await page.waitForURL(/\/assessment\/training/);
  const plan = page.locator('article', { has: page.getByRole('heading', { name: /^Hitting block from/ }) });
  await expect(plan).toBeVisible();
  await expect(plan.getByText('Self-directed')).toBeVisible();
  await plan.locator('summary', { hasText: 'Log a session' }).first().click();
  await plan.getByRole('button', { name: 'Log it' }).first().click();
  await expect(plan.getByText('Logged.').first()).toBeVisible();

  // A plan from one of the workbook's sessions, with practice counts on a log.
  await page.goto('/assessment/training');
  await page.getByRole('link', { name: 'Build a plan from this report' }).first().click();
  await page.getByLabel(/A ready-made session: S2/).check();
  await page.getByRole('button', { name: 'Update suggestions' }).click();
  await expect(page.getByRole('heading', { name: /S2 · Bailout \/ Landing Technical/ })).toBeVisible();
  await expectAccessible(page, 'Plan builder from a session');
  await page.getByRole('button', { name: 'Create the plan' }).click();
  await page.waitForURL(/\/assessment\/training/);
  const session = page.locator('article', { has: page.getByRole('heading', { name: /^Bailout \/ Landing Technical sessions from/ }) });
  await expect(session.getByText(/Session: S2/)).toBeVisible();
  await session.locator('summary', { hasText: 'Log a session' }).first().click();
  await session.getByLabel('Swings', { exact: true }).first().fill('10');
  await session.getByLabel('Solid contacts', { exact: true }).first().fill('7');
  await session.getByRole('button', { name: 'Log it' }).first().click();
  await expect(session.getByText('Logged.').first()).toBeVisible();
  await expect(session.getByText(/7 of 10 swings \(70%\) reported by the athlete or family/)).toBeVisible();
  await expectAccessible(page, 'Training plan from a session');

  await page.goto('/assessment/home-practice');
  await expect(page.getByRole('heading', { name: 'Home safety checklist' })).toBeVisible();
  await expect(page.getByText(/Bailout \/ Landing Technical sessions from/)).toBeVisible();
  await expectAccessible(page, 'Home practice');

  // Reassessment copies the protocol and starts a new draft.
  await page.goto(assessmentUrl);
  await page.getByRole('button', { name: 'Start the reassessment' }).click();
  await page.waitForURL(/\/assessment\/[0-9a-f-]{36}\?step=clips$/);
  expect(new URL(page.url()).pathname).not.toBe(assessmentUrl);
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.goto('/assessment/progress');
  await expect(page.getByText('Publish a second hitting assessment to compare.')).toBeVisible();
  await expectAccessible(page, 'Progress');
});

test('removing a clip deletes its file, and deleting a draft leaves no video behind', async ({ page }) => {
  test.setTimeout(120_000);
  const athlete = await createAccount({ role: 'athlete', name: 'Harper Synthetic', dateOfBirth: yearsAgo(17) });
  const id = await draftFor(athlete);
  const stored = (assessmentId: string) =>
    sql(`select count(*) from storage.objects o join public.assessment_media m on m.storage_path = o.name
          where o.bucket_id = 'assessment-media' and m.assessment_id = '${assessmentId}'`);
  page.on('dialog', (dialog) => void dialog.accept());
  await logIn(page, athlete.email);

  await page.goto(`/assessment/${id}?step=clips`);
  await page.getByLabel('Video file').setInputFiles(CLIP);
  await page.getByRole('button', { name: 'Upload clip' }).click();
  await expect(page.getByText('Uploaded test-pattern.webm.')).toBeVisible({ timeout: 30_000 });
  expect(stored(id)).toBe('1');
  await page.locator('summary', { hasText: 'Edit or remove' }).click();
  await page.getByRole('button', { name: 'Remove clip and delete file' }).click();
  await expect.poll(() => stored(id), { timeout: 15_000 }).toBe('0');
  await expect(page.getByText('No clips yet.')).toBeVisible();

  // A second clip, then delete the whole draft.
  await page.getByLabel('Video file').setInputFiles(CLIP);
  await page.getByRole('button', { name: 'Upload clip' }).click();
  await expect(page.getByText('Uploaded test-pattern.webm.')).toBeVisible({ timeout: 30_000 });
  expect(stored(id)).toBe('1');
  const path = sql(`select storage_path from public.assessment_media where assessment_id = '${id}' and status = 'uploaded'`);
  await page.goto(`/assessment/${id}?step=publish`);
  await page.getByRole('button', { name: 'Delete draft and its clips' }).click();
  await page.waitForURL('/assessment');
  expect(sql(`select count(*) from public.assessments where id = '${id}'`)).toBe('0');
  expect(sql(`select count(*) from storage.objects where bucket_id = 'assessment-media' and name = '${path}'`)).toBe('0');
});

test('one athlete cannot open another athlete’s assessment', async ({ page }) => {
  const owner = await createAccount({ role: 'athlete', name: 'Casey Synthetic', dateOfBirth: yearsAgo(18) });
  const other = await createAccount({ role: 'athlete', name: 'Drew Synthetic', dateOfBirth: yearsAgo(18) });
  const id = await draftFor(owner);
  await logIn(page, other.email);
  const response = await page.goto(`/assessment/${id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeVisible();
  await page.goto(`/assessment/${id}/report`);
  await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeVisible();
});

test('a development coach works on an athlete’s assessments only while connected', async ({ browser }) => {
  test.setTimeout(150_000);
  const athlete = await createAccount({ role: 'athlete', name: 'Emerson Synthetic', dateOfBirth: yearsAgo(20) });
  const coach = await createAccount({ role: 'development_coach', name: 'Coach Synthetic', dateOfBirth: yearsAgo(35) });
  const id = await draftFor(athlete);

  const athletePage = await (await browser.newContext()).newPage();
  await logIn(athletePage, athlete.email);
  await athletePage.goto('/assessment/coaches');
  await athletePage.getByRole('button', { name: 'Create a coach code' }).click();
  const code = (await athletePage.getByTestId('coach-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const coachPage = await (await browser.newContext()).newPage();
  await logIn(coachPage, coach.email);
  await coachPage.goto(`/assessment/${id}`);
  await expect(coachPage.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeVisible();
  await coachPage.goto('/assessment/coaches');
  await coachPage.getByLabel('Athlete’s coach code').fill(code);
  await coachPage.getByRole('button', { name: 'Connect' }).click();
  await expect(coachPage.getByText(/Code accepted/)).toBeVisible();

  await athletePage.reload();
  await expect(athletePage.getByText('Coach Synthetic')).toBeVisible();
  await athletePage.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(athletePage.getByText('Connected', { exact: true })).toBeVisible();
  await expectAccessible(athletePage, 'Connections');

  await coachPage.goto('/assessment');
  await expect(coachPage.getByText('Emerson Synthetic (you’re their development coach)')).toBeVisible();
  await coachPage.goto(`/assessment/${id}?step=ratings`);
  await expect(coachPage.getByRole('heading', { level: 1, name: 'Hitting assessment' })).toBeVisible();
  await expect(coachPage.getByText('Your ratings are recorded as coach observations.')).toBeVisible();
  await rate(coachPage, 'hit_load_repeatability', 4);

  // Ending the connection removes access at once.
  await athletePage.reload();
  athletePage.once('dialog', (dialog) => void dialog.accept());
  await athletePage.getByRole('button', { name: 'End connection' }).click();
  await expect(athletePage.getByText('Ended', { exact: true })).toBeVisible();
  const response = await coachPage.goto(`/assessment/${id}`);
  expect(response?.status()).toBe(404);
});

test('a minor’s development coach waits for a parent or guardian', async ({ browser }) => {
  const minor = await createAccount({ role: 'athlete', name: 'Finley Synthetic', dateOfBirth: yearsAgo(15) });
  const coach = await createAccount({ role: 'development_coach', name: 'Coach Waiting', dateOfBirth: yearsAgo(40) });

  const athletePage = await (await browser.newContext()).newPage();
  await logIn(athletePage, minor.email);
  await athletePage.goto('/assessment/coaches');
  await athletePage.getByRole('button', { name: 'Create a coach code' }).click();
  const code = (await athletePage.getByTestId('coach-code').innerText()).trim();

  const coachPage = await (await browser.newContext()).newPage();
  await logIn(coachPage, coach.email);
  await coachPage.goto('/assessment/coaches');
  await coachPage.getByLabel('Athlete’s coach code').fill(code);
  await coachPage.getByRole('button', { name: 'Connect' }).click();
  await expect(coachPage.getByText(/Code accepted/)).toBeVisible();

  await athletePage.reload();
  await athletePage.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(athletePage.getByText('Waiting for a parent or guardian to approve')).toBeVisible();

  await coachPage.reload();
  await expect(coachPage.getByText('Waiting for a parent or guardian to approve')).toBeVisible();
  await coachPage.goto('/assessment');
  await expect(coachPage.getByText('No athletes yet')).toBeVisible();
});
