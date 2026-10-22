# Stage 1 Engineering Report — Foundation (in progress)

Date: 2026-10-21 · Exit gate: **not yet met** (authentication flows, routes and UI are not built)

## Summary

The database foundation for Stage 1 is complete, has been through two independent security reviews, and is fixed and
re-tested: roles, profiles,
the neutral-age rules, coach verification, parent/guardian links, consent, the audit log and the free-access
capability guards, all behind row-level security. The framework-free access-policy logic the web app will use is
written and tested. The Next.js application could not be started: the build environment's network policy blocked the
npm registry, so no framework packages could be installed.

## Features built

| Area | What exists | Evidence |
| --- | --- | --- |
| Roles and profiles | Signup trigger provisions profile, settings and the self-selected role; admin can never be self-selected; anonymous sessions get no role; one-time onboarding that cannot undo an admin's role removal; admin grant/revoke (serialized) with last-admin protection; one-time admin bootstrap | `001` — 57 assertions |
| Age rules | Accounts 13+ only; an under-13 answer stores nothing but a block on retrying; unknown age is a minor and never an adult; Feb 29 handled identically in SQL and TypeScript; date of birth readable only by owner/admin, recorded through a narrow server-only path | `001`, `tests/unit/age-policy.test.ts` |
| Coach verification | Nine-status state machine with an explicit transition table; `.edu` email alone grants nothing; adults only; admin review with required notes; remediation and appeal paths; verification bound to the reviewed email and a 365-day window; a suspension lifts only to the prior status; access ends on expiry, suspension, revocation, role removal or email change | `002` — 56 assertions |
| Parent/guardian links | Athlete-generated one-time codes (hashed, 7-day expiry, max 5 open); only adult parent/guardian accounts can redeem; the athlete sees the redeemer's name and email before approving; rate-limited redemption; scope-limited visibility; re-consent at 18; ending a link (or removing the parent role) ends what depended on it | `003` — 42 assertions |
| Consent | Eight scopes in a policy table; versioned wording; age step required first; idempotent grants; for minors, coach-facing scopes need a linked **parent or legal guardian** (not other family) and stay effective only while that link is — decided at read time from current rules and age; discovery switch hides everything at once; one-named-coach document access capped at a year; grantees see only active grants; co-guardians cannot see or control each other's grants | `004` — 54 assertions; `009` |
| Audit log | Append-only (no update, delete or truncate for any role; retention only via owner + explicit switch); row-level audit triggers on profiles, roles, coaches, family links and consent capture every insert, update and delete by any path, including direct database access | `005` — 14 assertions; `007` |
| Free access | Capability catalog (16 core, 12 premium); database refuses to re-tier, re-scope, rename, delete or sell core capabilities, and refuses to promote a premium capability to core while a plan sells it; core answers never read billing; premium not sellable before Stage 6 | `006` — 31 assertions; unit free-access suite |
| Structural guardrails | RLS on every table; anonymous visitors read only the capability catalog; neither users nor the service role insert, delete or update directly; no API role touches sequences; exact allow-lists of callable functions for signed-in users and the service role; pinned `search_path` on every privileged function | `007` — 15 assertions |
| Concurrency | Limits and invariants hold when two sessions race (link limit, invite limit, last admin, one-time onboarding, duplicate grants, approval vs. link ending, catalog re-labelling vs. plan changes) | `scripts/db/race-test.sh` — 9 scenarios |
| Access-policy logic (TypeScript) | Route access (sign-in, onboarding, role, coach verification — payment not expressible), safe post-login redirects, role homes, coach status descriptions, entitlement decisions, plan configuration with hypothesis prices, consent scope copy, database error messages | 52 unit tests, 5 contract tests |

## Independent security review

A separate reviewer attacked the first draft of the migrations and reproduced seven classes of problems. All are fixed
and each original reproduction is now a regression test (`008_security_review_regressions.test.sql`, 19 assertions).

| # | Finding (first draft) | Severity | Fix |
| --- | --- | --- | --- |
| 1 | A minor could create a second "parent" account, link it, approve their own coach visibility, then unlink | Critical | Family members must have a recorded adult age; only parent/legal-guardian links can approve; approvals die with the approving link; athletes see who redeemed their code |
| 2 | A user could re-run onboarding to restore a role an admin removed (and a stale coach verification) | High | Role selection is one-time and locked; removing "coach" revokes verification; removing "parent" ends family links |
| 3 | Suspend → email change → reinstate produced a verified coach on an unreviewed email | High | Verification bound to the reviewed email; leaving verified clears the window; reinstatement returns only to the prior status |
| 4 | Count-then-insert races (link limit, last admin, onboarding) | Medium | Row locks / advisory lock; concurrency suite added and mutation-checked (removing the locks makes it fail) |
| 5 | Service role and sequences over-privileged; unaudited direct changes | Medium | Revoked; row-level audit triggers on security tables |
| 6 | A premium capability could be re-labelled core while plans still sold it | Medium | Blocked by the catalog guard |
| 7 | Low: grantee saw pending grants and bookkeeping columns, co-guardian overreach, under-13 retry, anonymous roles, row-existence checks | Low | All addressed with tests |

A second, time-boxed reviewer then attacked the fixes and found ten further issues, mostly edge cases created by the
fixes themselves. All are fixed and covered by `009_second_review_regressions.test.sql` (21 assertions) and new
concurrency scenarios:

| # | Finding (after first fixes) | Severity | Fix |
| --- | --- | --- | --- |
| N1 | Deleting the approving parent's account (or correcting an age, or tightening a rule) left a minor's approved sharing in force | High | Whether a grant works is now decided at read time from the current rules and age; an approval counts only through an active parent/legal-guardian link; cascades are audited |
| N2 | Admin-granted roles could be replaced through onboarding; removing the athlete role left sharing in place | Medium | Any role completes the one-time role step; removing the athlete role revokes sharing and ends family links |
| N3 | An approval could race a link ending, and an old approval could revive on re-linking | Medium | Athlete-level locking in both paths; approvals require that specific link to be active |
| N4 | Soft-deleting a coach could fail on hosted Supabase | Medium | Email-change handling skips deleted accounts and non-email values |
| N5 | Some changes (owner edits, deletes, a few columns) were not audited | Low | Row audit covers updates and deletes, with personal values recorded only as "changed" |
| N6 | Ended family links still showed the other side's current details | Low | Details hidden once a link ends |
| N7 | A request's time-zone setting could shift ages by a day | Low | Ages computed from the UTC date |
| N8 | Accounts blocked at the age screen could still add profile details | Low | Blocked accounts cannot update anything |
| N9 | Owner-only race between re-labelling a capability and adding it to a plan | Low | Capability row locked in both paths |
| N10 | A minor's document sharing with their own parent could never be approved | Fails closed | Sharing with one's own parent/legal guardian needs no extra approval |

The fixes to the second review's findings have not had a third independent pass.

## Residual risk (cannot be closed in code)

Ages and family relationships are self-attested, as on comparable consumer platforms:

- A teen who lies about their age and relationship on a separate account could still pose as a parent. Mitigations: the
  athlete approves the link after seeing the account's name and email, only parent/legal-guardian links can approve,
  approvals end with the link, and every step is audited. Stronger parent verification is open decision F9.
- A minor can claim to be an adult at the age screen, and someone refused at the age screen can return with a new
  email. The app layer will add the standard neutral-age-screen safeguards (no hints, a block on immediate retries);
  counsel should confirm the approach (L1).

One consequence for the app: a grant's stored status can read `active` while it is not in effect (for example, waiting
for a guardian's re-approval after an age correction). Screens must show the effective state from the database helpers,
never the raw status.

## Migrations

| File | Contents |
| --- | --- |
| `20261021000100_foundation.sql` | `private` schema, enums, append-only audit log, row-level audit trigger, shared triggers, error-code convention |
| `20261021000200_identity_and_roles.sql` | profiles, user_roles, user_settings, athletes, role/age helpers, RLS |
| `20261021000300_coach_verification.sql` | coaches, transitions, verification events, `submit_coach_affiliation`, `admin_review_coach`, expiry job |
| `20261021000400_family_links_and_consent.sql` | family invites and links, consent rules and grants, access helpers, family and consent functions, maintenance jobs |
| `20261021000500_auth_hooks_and_onboarding.sql` | auth.users triggers, onboarding, birthdate recording, admin role management, bootstrap, maintenance entry point |
| `20261021000600_capabilities_free_access.sql` | capability catalog, plan contents, free-access triggers, `has_capability` |

These migrations have not been applied to any shared environment, so the review fixes were made in place.

## Tests run (all executed in this session, from a clean start)

| Command | Result |
| --- | --- |
| `scripts/db/test.sh` (PostgreSQL 16.15, Supabase roles/auth emulated) | 9 files, **309 assertions, all passed** |
| `scripts/db/race-test.sh` | **9 of 9 scenarios passed**; removing the locks makes the lock-dependent scenarios fail (mutation checks) |
| Unit tests (`tests/unit`, 5 files) | **52 passed, 0 failed** |
| Contract tests (`tests/contract`) against the migrated database | **5 passed, 0 failed** |
| TypeScript 6.0.3 typecheck, strict + `noUncheckedIndexedAccess` (15 files) | **0 errors** |
| Harness self-checks: deliberately failing SQL and unit assertions | Correctly reported as failures (exit code 1) |
| Type-level check: adding a core capability to a paid plan | Rejected by the compiler, as intended |

Notes: Vitest could not be installed, so unit and contract tests (written against the Vitest API) ran on Node's built-in
test runner through a temporary bridge kept outside the repository; they run unchanged under Vitest once dependencies
are installed. Hosted Supabase runs PostgreSQL 17 with the real Auth schema; the suite should be re-run there
(`DATABASE_URL=… scripts/db/test.sh`) before Stage 2.

## Integrations actually functional

None external yet. No Supabase project is connected, no Auth server has run against this schema, and no data source is
integrated. The GitHub Actions workflow (`.github/workflows/ci.yml`) is included but has not run on GitHub.

## Records imported / data coverage

None — school and program data are Stage 2. No school, program or admissions record of any kind exists in the codebase.

## Not done (Stage 1 remainder)

- Next.js App Router project, Tailwind design system with the brand palette, shadcn/ui-style components
- Public routes and trust pages (privacy, terms, data methodology, accessibility — labelled as drafts pending counsel)
- Supabase Auth integration: neutral age screen → signup → email confirmation → onboarding; login, logout, session
  refresh; role-gated layouts using `src/lib/auth/route-access.ts`; account deletion after an under-13 answer
- Minimal role dashboards: athlete privacy and family invites, parent link redemption, coach verification, admin review
  queue
- Vitest, Playwright end-to-end, and automated accessibility (axe, WCAG 2.2 AA) tests at desktop and mobile widths

## Unresolved dependencies

| Dependency | Needed for | Owner |
| --- | --- | --- |
| npm registry access in the build environment | Everything in "Not done" | Founder (claude.ai Settings → Capabilities) |
| A Supabase project dedicated to Base Recruits, and permission to apply migrations | Real Auth, end-to-end tests, running this suite on PostgreSQL 17 | Founder |
| Network access from the build environment to that Supabase project | End-to-end tests | Founder |
| Open decisions F1–F9 and legal review L1–L8 | See `docs/decisions.md` | Founder + counsel |

## Next exact step

Install the framework packages (Next.js, React, TypeScript, Tailwind, `@supabase/ssr`, `@supabase/supabase-js`, Zod,
Lucide, Vitest, Playwright, axe) at their current versions, point Vitest at the existing `tests/unit` and
`tests/contract`, and build the app shell and Supabase Auth flows against the tested database contract.
