# Stage 1 Engineering Report — Project, design system, security baseline

Date: 2026-10-22 · Spec exit gate: **"real authentication and routes work, authorization tests pass, and UI is usable on
desktop/mobile"** — **met in CI against a real local Supabase stack** (details and limits below). Not yet run against a
hosted Supabase project (decision F1).

## Summary

Stage 1 is built and tested end to end. It has five parts:

- **Database foundation.** Roles, the age rules, coach verification, parent/guardian links, consent, the audit log and the free-access guards, all behind row-level security.
- **The Next.js web app.** The design system, public pages, sign-up and sign-in, and role-gated dashboards for athletes, parents, coaches and admins.
- **Automated testing.** Every push runs on GitHub: the database suite on PostgreSQL 16, PostgreSQL 17 and the real Supabase stack, type checking, unit tests, and end-to-end and accessibility tests against a production build.

Four independent security reviews were run: two on the database, one on the app, and one focused on the fix for the app review's main finding. The app review found a serious sign-up flaw. The focused review found the first fix incomplete. Both are now fixed at the database level and covered by tests against real Supabase Auth.

## Exit gate evidence

| Gate item | Evidence (GitHub Actions run 39747948768 on commit `17268d1`, unless noted) |
| --- | --- |
| Real authentication works | Supabase Auth from the Supabase CLI 2.121.0 stack, not a stand-in. End-to-end tests pass for: sign-up with an emailed 6-digit code, log in, log out, password reset by code, a wrong code refused, an unconfirmed email unable to log in, the neutral age screen (under-13 creates nothing and blocks retrying), minors limited to athlete accounts, the pre-registration attack below, a password set before confirmation being wiped by confirmation, and email changes being refused |
| Routes work | All 17 public routes open for anonymous visitors on desktop and phone. The 8 protected prefixes redirect to log in. Each role is kept out of the other roles' areas. Accounts without a role are sent to onboarding. Unverified coaches are redirected away from coach tools until an admin approves them. Unknown school pages return an honest 404 |
| Authorization tests pass | Database: 341 assertions in 11 files pass on PostgreSQL 16, on PostgreSQL 17, and on the real Supabase stack (real Auth schema and default privileges). Concurrency: 9 of 9 scenarios. Contract: 5 of 5. Unit: 58 of 58. End-to-end: role gates, coach verification by an admin, and the minor-consent flow with a linked parent's approval |
| UI usable on desktop and mobile | Automated axe checks for WCAG 2.2 AA (tags wcag2a/aa, 21a/aa, 22aa) report zero violations at desktop and phone (Pixel 7) sizes. They cover 11 public pages, the sign-up account step and the athlete home. Also tested: keyboard skip link, and the phone menu opening and closing by keyboard |

Totals for that run: **105 end-to-end and accessibility tests passed, 0 failed, 0 flaky, 1 skipped**. The skipped test is the phone-menu check, which runs only at phone size.

Limits of this evidence:

- Accessibility is automated only. No manual screen-reader or usability session has been run.
- The Supabase stack is the CLI's local stack inside CI. The hosted project and its settings (README, "Required Supabase Auth settings") still need to be created and checked.

## Features built

| Area | What exists |
| --- | --- |
| Design system | Tailwind 4 tokens for the spec palette, with every text colour checked for contrast. Archivo type, condensed for display headings. An original home-plate "BR" mark. Primitives in shadcn style (button, fields, notices, status chips, submit buttons with pending state). The four-step journey drawn as the base path. Reduced-motion and visible-focus defaults |
| Public site | Home page (spec structure: hero, Quick Match panel, base path, school-result anatomy, division browse, coaches, free vs planned plans, trust, FAQ). Also /schools, /match, /compare, /how-it-works, /athletes, /transfers, /coaches, /pricing and /resources. Draft trust pages: /privacy, /terms, /data-methodology and /accessibility. Stage 2 and 3 features show an honest "not published yet" state, and no school records exist anywhere |
| Sign-up and sign-in | 1. Neutral age screen. 2. Role, name and email. 3. A 6-digit code is emailed. 4. The code and a new password are entered on the site. 5. Other sessions are signed out. 6. The owner's choices are applied. Also: log in, log out, password reset by code, onboarding fallback (date of birth first, then a role filtered by age), and safe post-login redirects |
| Athlete home | Coach visibility always shows the database's effective state (off, on, waiting for a parent, not in effect, couldn't load). One-time family codes, approving or declining family members, and cancelling codes |
| Parent home | Redeem a family code. Approve coach-facing sharing for linked minors, including re-approvals. Remove a link |
| Coach area | Verification status and history. Staff-page submission (https only, no hidden credentials). Athlete search page reachable only once verified (search itself is Stage 4) |
| Admin | Coach verification queue. It shows the real site a staff link opens and flags look-alike or mismatched domains. Decisions: approve, ask for more information, or reject (a note is required) |
| Security | Content Security Policy (`frame-ancestors 'none'`, `connect-src 'self'`, `form-action 'self'`), nosniff, DENY framing, referrer policy, COOP, no `x-powered-by`. httpOnly session cookies, and Secure on https. The proxy applies Supabase's no-store headers when a session refreshes. Every protected page checks access itself, and every server action ends in a database check |
| Database additions | `my_consent_grants()` (effective consent state) and `guardian_consent_requests()`. Sign-up metadata is ignored. Disguised staff links are rejected. Unconfirmed sign-ups are deleted after 24 hours |
| Automated testing (CI) | `.github/workflows/ci.yml`: database (PostgreSQL 16 and 17), database on the real Supabase stack, type checking and unit tests, and end-to-end and accessibility tests. Every step publishes its test counts as a GitHub notice, and test runs fail if a test is skipped or nothing runs |

## Independent security reviews

Database (two passes, earlier this stage): 7 then 10 findings, all fixed, with regression tests in files `008` and `009`.

App layer (first pass, this session):

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | Pre-registration takeover. Someone could register another person's email with their own password. Once the owner clicked the confirmation link, the attacker held a working password on a confirmed account, which could become a fake verified coach. The same route let an attacker pre-set a minor's role or age | High | Code-based confirmation typed on the site. The owner sets the password after the code, and other sessions are signed out. Sign-up metadata is never trusted. Stale unconfirmed sign-ups are deleted. The e2e test "pre-registered" reproduces the attack and passes |
| 2 | `safeNextPath` let dot segments collapse to `//host` | Medium (latent) | Normalized path re-checked, with unit tests |
| 3 | Admin saw the raw staff URL (a user name before `@`, look-alike hosts) | Medium | Credentials rejected in the app and the database; the real host is shown, with look-alike and mismatch flags |
| 4 | Consent screens could disagree with the effective state (load failure, expiry, turned 18, parent re-approvals) | Low | Explicit states; `guardian_consent_requests()` |
| 5 | Proxy dropped Supabase's cache headers on session refresh | Low | Headers applied to responses and redirects |
| 6 | Session cookies readable by scripts; `connect-src` wider than needed | Low | httpOnly (and Secure on https); `connect-src 'self'` |
| 7 | Age-screen retry block skipped onboarding | Low | Checked there too |
| 8 | Settings reported success when nothing was saved; onboarding offered adult roles to accounts of unknown age | Info | Fixed |

Focused second pass on the fix for finding 1, checked against the Supabase Auth source:

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| S1 | The password-reset email was still a link. Clicking it on a pre-registered account confirmed the account with the other person's password | High | All Auth email templates are code-only. **Database safeguard:** when an email is confirmed by any path, any earlier password and user metadata are wiped (`private.reset_credentials_on_confirmation`). Tested against real Auth |
| S2 | An email-change link sent to a coach's address could hand that address to the requester | High | Email-change requests refused by the database until the app supports them (decision F10). Template code-only. Tested against real Auth |
| S3 | If setting the owner's password failed (for example the 72-byte limit), the earlier password survived | High | Covered by the S1 safeguard. Passwords are also checked against the byte limit first |
| S4 | A brief window between confirmation and the owner's password let an earlier password log in and pick the role or date of birth | Medium | Closed by the S1 safeguard: the earlier password no longer exists at confirmation |
| S5 | The staff-link credentials check was case-sensitive in the database | Low | Case-insensitive, with a test |
| S6 | The reset form can reveal whether an account exists through Supabase's rate limits | Low | Documented. Supabase's public API reveals this anyway |
| S7 | Browser-held sign-up details weren't re-checked at verification | Low | Re-checked. The database now requires a recorded adult date of birth for parent and coach roles |
| S8 | Leftover "link" wording; pre-registration metadata stayed in user metadata | Low | Fixed; metadata wiped at confirmation |

The fixes for the second pass have not had a third independent review; each is covered by database tests and, where
it depends on Supabase Auth behaviour, by end-to-end tests against the real Auth server.

## Migrations (Stage 1)

| File | Contents |
| --- | --- |
| `20261021000100` – `000600` | Foundation, identity and roles, coach verification, family links and consent, auth hooks and onboarding, capability catalog (see `docs/architecture.md`) |
| `20261022000100_consent_overview.sql` | `public.my_consent_grants()`, effective consent state for the athlete |
| `20261022000200_auth_hardening.sql` | Sign-up metadata ignored. Pre-confirmation passwords and metadata wiped at confirmation. Email-change requests refused. Adult date of birth required for parent and coach roles. Staff-link credential check. `guardian_consent_requests()`. Stale unconfirmed sign-ups deleted by the daily job |

None of these migrations have been applied to a shared or hosted environment.

## Test commands and results

| Command | Where | Result |
| --- | --- | --- |
| `scripts/db/test.sh` | Local (PG 16), CI (PG 16, PG 17) | 11 files, 341 assertions, all passed |
| `DATABASE_URL=… scripts/db/test.sh` against `supabase start` | CI | 11 files, 341 assertions, all passed |
| `scripts/db/race-test.sh` | Local, CI (PG 16, PG 17) | 9 of 9 scenarios |
| `npm run test:contract` | CI (PG 16, PG 17) | 5 passed, 0 skipped |
| `npm run typecheck` (TypeScript 6.0.3) | CI | 0 errors, 117 files |
| `npm run test:unit` (Vitest 5.0.5) | CI | 58 passed |
| `npm run build` (Next.js 16.4.2) | CI | Succeeded |
| `npx playwright test` (Playwright 1.64.1, axe 4.14.0) | CI | 105 passed, 0 failed, 1 skipped by design |
| `npm ci` from the committed `package-lock.json` (generated in CI; 181 packages, all from registry.npmjs.org with integrity hashes) | CI | Clean install |

## Integrations actually functional

- **GitHub repository and Actions:** private repository `adamconcadoro-4/base-recruits`, with checks on every pull request and every push to `main`.
- **Supabase Auth, Data API and Postgres:** working only as the Supabase CLI's local stack (Docker, in CI and on developer machines). Emails go to the local mail catcher.
- **Not connected:** hosted Supabase, email delivery (SMTP), Stripe and data sources.

## Records imported

None. School and program data are Stage 2. No school, program or admissions record exists in the codebase or the database.

## Known gaps and residual risk

- **Hosted Supabase settings are a security dependency.** Code-only templates for every Auth email, confirmations on and minimum password length are set in `supabase/config.toml` for local use. They must be applied to each hosted project (`supabase config push`) and checked (README). The database safeguards hold even if a template is missed.
- **Rate limiting.** All Auth calls come from the app server, so Supabase's per-IP limits apply to the server, not to each person. That is both an availability risk and an attack lever. Before launch (Stage 5): forward client IPs to Supabase Auth, or raise its limits deliberately, and add per-person and per-IP throttling for sign-up, log-in and code requests.
- **Email changes are switched off** (decision F10) until the app offers them with re-verification.
- **Content Security Policy** still allows inline scripts, which Next.js needs for bootstrapping. A per-request nonce is the next step.
- **Ages and family relationships are self-attested** (decision F9). An attacker who registered someone's email in advance gains nothing, but a person lying about their own age or relationship remains the documented residual risk.
- **Not yet built:** admin multi-factor authentication (spec §19, optional MFA for admins and coaches); data export and account-deletion requests (shown as "before launch"); ESLint; TypeScript 7 (latest), deliberately deferred.
- **Accessibility** is verified by automated checks only.

## Unresolved dependencies

| Dependency | Needed for | Owner |
| --- | --- | --- |
| A hosted Supabase project (F1: paid plan chosen; creation not yet confirmed) | Hosted development environment, staging and production | Founder |
| Production email sender (SMTP) and a support address (F7) | Real sign-up emails, appeals and privacy requests | Founder / Jonathan Caceres |
| Coach-verification backup reviewer and turnaround (F2: Adam Concadoro reviews) | Stage 4 coach onboarding | Founder |
| Legal review L1–L8 | Production launch | Counsel |

## Next exact step

Stage 2 (Pillar A, nationwide program registry). First the institution and baseball-program schema with provenance. Then a College Scorecard adapter, and an admin CSV/JSON import with review. The founder has an api.data.gov key; it must be stored as the GitHub Actions secret `COLLEGE_SCORECARD_API_KEY` (never in the repository). Before any data is published, F1 should be completed and the hosted Auth settings applied.
