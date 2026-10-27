import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { PASSWORD, createAccount, logIn, publicClient, sql, yearsAgo, type TestAccount } from './support';

/**
 * 9-Zone Hitting inside Assessment, end to end against the real local stack:
 * the zone map, the workbook's drill library and download, building a session
 * with a declared assignment, logging pitches on a phone-sized screen with
 * undo, reviewing with counts and corrections, stage decisions, the generated
 * history, and who can see what. Every account and value is synthetic.
 */

const enabled = process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true';
test.skip(!enabled, 'Assessment is switched off for this build (set NEXT_PUBLIC_ASSESSMENT_ENABLED=true).');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NOT_FOUND = 'We couldn’t find that page';

async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = results.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
  expect(found, `${label} meets WCAG 2.2 AA automated checks`).toEqual([]);
}

/** The tracker's choices are radio buttons styled as large buttons: tap the visible button, as a person would. */
async function tap(scope: Page | Locator, name: string | RegExp): Promise<void> {
  await scope.getByRole('radio', { name, exact: typeof name === 'string' }).locator('xpath=..').click();
}

async function signedIn(account: TestAccount) {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return client;
}

test('an athlete builds, logs and reviews a 9-Zone session', async ({ page }) => {
  test.setTimeout(240_000);
  const athlete = await createAccount({ role: 'athlete', name: 'Harper Synthetic', dateOfBirth: yearsAgo(19) });
  await logIn(page, athlete.email);

  // From Hitting into the zone map.
  await page.goto('/assessment/hitting');
  await page.getByTestId('open-zone-hitting').click();
  await expect(page.getByRole('heading', { level: 1, name: '9-Zone Hitting' })).toBeVisible();
  await expect(page.getByTestId('zone-map').getByText('Not assessed').first()).toBeVisible();
  await expect(page.getByText('Catcher’s view (looking out at the pitcher) · Right-handed hitter', { exact: false })).toBeVisible();
  await expectAccessible(page, 'Zone map');

  // The drill library and the unchanged workbook download.
  await page.getByRole('link', { name: 'Drill Library' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Drills (39)' })).toBeVisible();
  await page.getByLabel('Zone', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText('Z4-01 ·')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Live-BP constraints (49)' })).toBeVisible();
  await expectAccessible(page, 'Drill library');
  const workbook = await page.request.get('/assessment/hitting/zones/workbook');
  expect(workbook.status()).toBe(200);
  expect(workbook.headers()['content-type']).toContain('spreadsheetml');
  expect((await workbook.body()).length).toBe(53335);

  // Session builder: zones first, then the round with a declared assignment.
  await page.goto('/assessment/hitting/zones/sessions/new');
  await page.getByTestId('pick-zones').getByRole('checkbox', { name: /Zone 4/ }).check();
  await page.getByRole('button', { name: 'Use these zones' }).click();
  await expect(page.getByTestId('focus-zones').getByRole('checkbox', { name: /Zone 4/ })).toBeChecked();
  await page.getByLabel('Delivery', { exact: true }).selectOption('toss');
  const assignment = page.getByTestId('session-assignment');
  await assignment.getByRole('radio', { name: /Selective/ }).check();
  await assignment.getByRole('checkbox', { name: /Zone 4/ }).check();
  await assignment.getByRole('checkbox', { name: /Zone 5/ }).check();
  await assignment.getByRole('checkbox', { name: /calls ball or strike/ }).check();
  await page.getByLabel('What counts as hard targeted contact').fill('Hard line drive into the target lane');
  await expectAccessible(page, 'Session builder');
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.waitForURL(/\/assessment\/hitting\/zones\/sessions\/[0-9a-f-]{36}$/);
  const sessionPath = new URL(page.url()).pathname;
  const sessionId = sessionPath.split('/').pop() ?? '';
  await expect(page.getByTestId('current-assignment')).toHaveText(/Selective: swing at Zones 4 and 5/);

  // Live Tracker on a phone-sized screen.
  await page.setViewportSize({ width: 390, height: 844 });
  const status = page.getByTestId('save-status');
  await page.getByTestId('log-entry').click();
  await expect(page.getByTestId('zone-tracker').getByRole('alert')).toHaveText(/where the pitch arrived/);
  await tap(page, /^Zone 4/);
  await tap(page, 'Swing');
  await tap(page, 'Fair ball');
  await page.getByText('More observations (optional)').click();
  await tap(page.getByRole('group', { name: 'Contact at the agreed depth' }), 'Yes');
  await tap(page, 'Called strike');
  await page.getByTestId('log-entry').click();
  await expect(status).toHaveText(/Saved Pitch 1 · Zone 4 · swing · fair ball/);
  await tap(page, 'Ball away');
  await tap(page, 'Take');
  await page.getByTestId('log-entry').click();
  await expect(status).toHaveText(/Saved Pitch 2/);
  // A swing at a strike outside the assigned zones: an assignment error, not a chase.
  await tap(page, /^Zone 2/);
  await tap(page, 'Swing');
  await tap(page, 'Miss');
  await page.getByTestId('log-entry').click();
  await expect(status).toHaveText(/Saved Pitch 3/);
  await expect(page.getByTestId('round-counts')).toHaveText(/3 pitches · 2 swings/);
  const tracker = page.getByTestId('zone-tracker');
  await expect(tracker.getByText('2 of 3 (66.7%)')).toBeVisible();
  await expect(tracker.getByText('0 of 1 (0%)')).toBeVisible();
  await expectAccessible(page, 'Live Tracker (phone)');
  await page.getByTestId('undo-entry').click();
  await expect(status).toHaveText(/Removed Pitch 3/);
  await expect(page.getByTestId('round-counts')).toHaveText(/2 pitches · 1 swing /);
  expect(sql(`select count(*) from public.zone_events where session_id = '${sessionId}'`)).toBe('2');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Review: counts, missing observations, a correction.
  await page.getByTestId('open-review').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Session Review' })).toBeVisible();
  await expect(page.getByTestId('session-counts')).toHaveText(/2 pitches · 1 swing · 1 strike · 1 ball/);
  await expect(page.getByTestId('metric-decision').first()).toHaveText('2 of 2 (100%)');
  await expect(page.getByTestId('metric-recognition')).toHaveText('1 of 1 (100%)');
  await expect(page.getByText('1 not recorded').first()).toBeVisible();
  await page.getByRole('button', { name: /^Correct Pitch 2/ }).click();
  const editor = page.locator('li', { has: page.getByRole('button', { name: /^Close Pitch 2/ }) });
  await editor.getByText('More observations (optional)').click();
  await tap(editor, 'Called ball');
  await editor.getByRole('button', { name: /Save correction/ }).click();
  await expect(page.getByTestId('metric-recognition')).toHaveText('2 of 2 (100%)');

  // Round review, evaluation and a stage decision.
  const round = page.getByTestId('round-review-1');
  await round.getByLabel('What the hitter said').fill('Late on the inside pitch');
  await round.getByLabel('Next step').selectOption('hold');
  await round.getByRole('button', { name: 'Save round review' }).click();
  await expect(round.getByRole('status')).toHaveText('Round review saved.');
  const evaluation = page.getByTestId('session-evaluation');
  await evaluation.getByLabel('Hitter’s self-assessment').fill('Better depth inside');
  await evaluation.getByLabel('Decision', { exact: true }).selectOption('hold');
  await evaluation.getByRole('checkbox', { name: /Zone 4/ }).check();
  await evaluation.getByLabel('Next cue').fill('Catch it out front');
  await evaluation.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(evaluation.getByRole('status')).toHaveText('Session review saved.');
  await page.reload();
  await expect(page.getByText('Next plan not coach-approved')).toBeVisible();
  const stage = page.getByTestId('stage-form-4');
  await stage.getByLabel('Reason').fill('Tee map shows depth holds at stage 1');
  await stage.getByRole('button', { name: 'Save stage decision' }).click();
  await expect(stage.getByText('Now at stage 1')).toBeVisible();
  await expectAccessible(page, 'Session review');

  const csv = await page.request.get(`${sessionPath}/export`);
  expect(csv.status()).toBe(200);
  const csvText = await csv.text();
  expect(csvText).toContain('session_date,round,entry,kind');
  expect(csvText.trim().split('\r\n')).toHaveLength(3);

  // Development path: stage, the generated daily log, compatible comparison.
  await page.goto('/assessment/hitting/zones/path');
  await expect(page.getByTestId('path-stage-4')).toHaveText('1. Static tee map');
  await expect(page.getByRole('region', { name: 'Daily log' }).getByRole('row')).toHaveCount(2);
  await expect(page.getByTestId('compare-group').first()).toContainText('stage 1 · front or side toss · selective');
  await expectAccessible(page, 'Development path');

  // The map now shows counts for Zone 4, never painted from one swing.
  await page.goto('/assessment/hitting/zones?zone=4');
  await expect(page.getByTestId('zone-map').getByText('1 of 1')).toBeVisible();
  await expect(page.getByTestId('zone-map').getByText(/Too few to judge/)).toBeVisible();
  await expect(page.getByTestId('start-zone-round')).toHaveText('Start a focused round on Zone 4');
});

test('9-Zone sessions stay private, and only the development coach approves the next plan', async ({ browser }) => {
  test.setTimeout(180_000);
  const athlete = await createAccount({ role: 'athlete', name: 'Indigo Synthetic', dateOfBirth: yearsAgo(20) });
  const other = await createAccount({ role: 'athlete', name: 'Jules Synthetic', dateOfBirth: yearsAgo(20) });
  const coach = await createAccount({ role: 'development_coach', name: 'Coach Zone', dateOfBirth: yearsAgo(38) });

  // A reviewed session made through the same database functions the site uses.
  const athleteClient = await signedIn(athlete);
  const today = new Date().toISOString().slice(0, 10);
  const { data: sessionId, error: createError } = await athleteClient.rpc('create_zone_session', {
    p_athlete_id: athlete.id,
    p_session: { session_date: today, focus_zones: [6], batting_side: 'left', stage: 3, delivery_source: 'coach', assignment: { kind: 'free' } },
  });
  if (createError || typeof sessionId !== 'string') throw new Error(`create_zone_session failed: ${createError?.message ?? 'no id'}`);
  const roundId = sql(`select id from public.zone_rounds where session_id = '${sessionId}'`);
  const { error: logError } = await athleteClient.rpc('log_zone_event', { p_round_id: roundId, p_event: { location: 'z6', response: 'swing', contact: 'foul' } });
  if (logError) throw new Error(`log_zone_event failed: ${logError.message}`);
  const { error: reviewError } = await athleteClient.rpc('review_zone_session', { p_session_id: sessionId, p_review: { decision: 'hold', next_zones: [6] } });
  if (reviewError) throw new Error(`review_zone_session failed: ${reviewError.message}`);
  const { data: invite, error: inviteError } = await athleteClient.rpc('create_development_coach_invite');
  if (inviteError) throw new Error(`create_development_coach_invite failed: ${inviteError.message}`);
  const code = (Array.isArray(invite) ? invite[0] : invite)?.code as string;

  // Another athlete and an unconnected coach cannot open it.
  const otherPage = await (await browser.newContext()).newPage();
  await logIn(otherPage, other.email);
  const otherResponse = await otherPage.goto(`/assessment/hitting/zones/sessions/${sessionId}`);
  expect(otherResponse?.status()).toBe(404);
  await expect(otherPage.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
  expect((await otherPage.request.get(`/assessment/hitting/zones/sessions/${sessionId}/export`)).status()).toBe(404);

  const coachPage = await (await browser.newContext()).newPage();
  await logIn(coachPage, coach.email);
  expect((await coachPage.goto(`/assessment/hitting/zones/sessions/${sessionId}/review`))?.status()).toBe(404);

  // Connected, the coach reviews and approves; the athlete's side cannot.
  const coachClient = await signedIn(coach);
  const { data: redeemed, error: redeemError } = await coachClient.rpc('redeem_development_coach_invite', { p_code: code });
  if (redeemError) throw new Error(`redeem failed: ${redeemError.message}`);
  const linkId = (Array.isArray(redeemed) ? redeemed[0] : redeemed)?.link_id as string;
  const { error: approveError } = await athleteClient.rpc('approve_development_coach_link', { p_link_id: linkId });
  if (approveError) throw new Error(`approve link failed: ${approveError.message}`);

  const athletePage = await (await browser.newContext()).newPage();
  await logIn(athletePage, athlete.email);
  await athletePage.goto(`/assessment/hitting/zones/sessions/${sessionId}/review`);
  await expect(athletePage.getByText('Only the athlete’s development coach can approve the next-session plan.', { exact: false })).toBeVisible();
  await expect(athletePage.getByLabel('Coach’s assessment')).toHaveCount(0);

  await coachPage.goto(`/assessment/hitting/zones/sessions/${sessionId}/review?athlete=${athlete.id}`);
  await expect(coachPage.getByRole('heading', { level: 1, name: 'Session Review' })).toBeVisible();
  const evaluation = coachPage.getByTestId('session-evaluation');
  await evaluation.getByLabel('Coach’s assessment').fill('Foul on a strike swing: contact without the lane yet.');
  await evaluation.getByRole('button', { name: 'Save evaluation' }).click();
  await expect(evaluation.getByRole('status')).toHaveText('Session review saved.');
  await coachPage.getByTestId('approve-next-plan').getByRole('button', { name: 'Approve the next-session plan' }).click();
  await expect(coachPage.getByText('Next plan approved by the coach')).toBeVisible();
  await expectAccessible(coachPage, 'Session review (coach)');

  // The coach logs a pitch; the athlete's side sees it as the coach's entry.
  await coachPage.goto(`/assessment/hitting/zones/sessions/${sessionId}?athlete=${athlete.id}`);
  await tap(coachPage, /^Zone 6/);
  await tap(coachPage, 'Take');
  await coachPage.getByTestId('log-entry').click();
  await expect(coachPage.getByTestId('save-status')).toHaveText(/Saved Pitch 2/);
  await athletePage.reload();
  await expect(athletePage.getByText('Logged by the coach')).toBeVisible();
  await expect(athletePage.getByText('Next plan approved by the coach')).toBeVisible();
});
