# Discovery remediation: register and release readiness

Scope: findings BR-01 to BR-13 from the external audit of https://base-recruits.vercel.app/ (October 2026).
Branch `discovery-remediation`. The audit's own finding titles were not kept in this repository; the titles below
describe what was reproduced and fixed. Check them against the audit document.

Status labels (from the remediation brief): **Implemented but untested** · **Tested locally** (automated tests ran
against a local database or a local build, including CI) · **Validated in staging** · **Blocked by external
dependency** · **Production verified**. Nothing here is "Production verified" until the pull request is merged and
the checks in "After merge" pass on the live site.

## Summary

| ID | Finding | Reproduced | Status |
| --- | --- | --- | --- |
| BR-01 | Academic matching was promised everywhere but `/match` was a placeholder | Confirmed | Tested locally (unit, e2e, axe) |
| BR-02 | No real shortlist: "saving" was the five-school compare list, lost between visits and never in an account | Confirmed | Tested locally (database, e2e) |
| BR-03 | Baseball division shown from the school-wide federal classification (37 "Other", Johns Hopkins as "Other") | Partly: model was already separate; data uncorrected | Code tested locally. Data: **production verified** for the approved corrections (2026-10-23); 24 remain under "Other" |
| BR-04 | A past class's IPEDS test policy was presented as the school's current rule | Confirmed | **Production verified** (Johns Hopkins page, 2026-10-23) |
| BR-05 | Home-page division links (`division=ncaa-d1`) were silently ignored, so they showed every school | Confirmed | Tested locally (unit, e2e) |
| BR-06 | The comparison was lost when moving between pages by header, footer or profile links | Confirmed | Tested locally (unit, e2e) |
| BR-07 | Pages described unbuilt features (profiles, coach tools, majors, transfer tools) as available | Confirmed | Tested locally (unit, e2e) |
| BR-08 | Coverage figures did not show how much is checked versus taken from federal reports | Partly: counts were computed from live data | Tested locally (database, e2e) |
| BR-09 | School pages lacked save/compare/report actions; no way to report a correction; cost basis unclear | Confirmed | Tested locally (database, e2e) |
| BR-10 | On phones the filter panel pushed results far down the page | Confirmed | Tested locally (e2e, Pixel 7) |
| BR-11 | Accessibility statement over-claimed; error handling on new forms needed focus management | Partly: mobile menu was already correct | Tested locally (axe desktop and Pixel 7, focus tests) |
| BR-12 | Privacy page did not match what the product actually collects; no support route | Confirmed | Copy corrected; **blocked by external dependency** (legal review, support address) |
| BR-13 | No robots.txt, sitemap, canonical URLs or descriptions; pre-launch pages indexable | Confirmed | **Production verified** (robots.txt, noindex, canonical, 2026-10-23) |

"Tested locally" here includes GitHub Actions runs against a local Supabase stack and a production build. There is
no staging environment (Vercel previews have no database keys), so nothing is "Validated in staging".

## Findings

### BR-01 Conservative academic comparison
- **Reproduction:** the home page, navigation and audience pages offered "Find my college matches"; `/match` said
  matching would open later.
- **Root cause:** marketing copy was written ahead of the feature.
- **Fix:** `/match` ("Compare your scores") runs a fixed, versioned rulebook (`src/lib/matching/rules.ts`,
  `RULES_VERSION 2026-10-23.1`) in the browser. Only school filters reach the server; scores and GPA are never sent,
  stored or put in URLs.
  - A testing requirement counts only from a checked current policy for the exact applicant type and entry year;
    otherwise it is **Unknown**.
  - Past-class score ranges are benchmarks (above / within / below), never requirements. Below-range results say the
    range is not a minimum.
  - Test-optional schools never count a missing score against you; test-blind schools never compare scores.
  - Transfer applicants are never compared with first-year figures. GPA is never compared and no GPA minimum is
    invented, because the federal data has none.
  - Every result has reason codes with plain-language text, the source term, a link to the checked policy and the
    rules version.
  - There are no Strong / Competitive / Reach / safety labels. Results are grouped by score position only, as the
    brief requires until an approved rulebook exists.
- **Files:** `src/lib/matching/*`, `src/components/matching/match-tool.tsx`, `src/app/(site)/match/*`.
- **Tests:** `tests/unit/matching-rules.test.ts` (22 cases); `tests/e2e/discovery.spec.ts` (Hopkins: past
  test-optional, current required → Unknown / Not met / Met; below range is a benchmark; transfer; scores never in a
  request); axe and focus-after-error checks in `tests/e2e/accessibility.spec.ts`.
- **Remaining:** a fit-label rulebook is a founder decision (`docs/decisions.md` F15).

### BR-02 Saved schools
- **Reproduction:** the only list was the comparison (five schools), held in the URL.
- **Fix:**
  - "Save school" is separate from "Add to compare" everywhere. Saving has no limit.
  - Guests save in this browser (`localStorage`, slugs and timestamps only); accounts save to `saved_schools`
    (row-level security, own rows only). Schools saved before sign-in merge into the account once, idempotently; the
    browser copy is cleared only for schools the server confirmed.
  - `/saved` lists either. Saving never depends on a plan.
- **Files:** migration `20261024000100_discovery_pilot.sql` (§2), `src/lib/shortlist/guest-store.ts`,
  `src/components/shortlist/*`, `src/app/(site)/saved/*`, `src/app/(app)/layout.tsx`.
- **Tests:** database `013_discovery_pilot` (anonymous refused, more than five, idempotent, newest first, request
  size cap, unsave, cross-account isolation, no plan dependency); e2e guest saves past five survive a refresh and
  comparing never changes them; guest saves move into a synthetic account once.

### BR-03 Baseball division versus school classification
- **Reproduction:** the schema already stored the program's division separately from the reported classification,
  corrections required an official page, and imports never overwrite a checked division. The data was the problem:
  37 programs are "Other", including Johns Hopkins (NCAA Division III baseball).
- **Fix:** school pages show "Baseball division" with whether it was checked, and keep "Classification the school
  reported (all sports)" exactly as reported. Search cards say "Division as reported by the school, not yet checked".
- **Data:** research on all 37 is in `docs/remediation/proposed-data-corrections.md`: 20 division corrections with
  official evidence, 8 Puerto Rico league programs, 9 unresolved (one has ended athletics). **None applied**; they
  need the founder's authorization (production data mutation).

### BR-04 Current policy versus historical statistics
- **Reproduction:** Johns Hopkins showed "Test optional" (its Fall 2024 IPEDS policy) although its admissions page now
  requires scores from first-year applicants.
- **Fix:**
  - New `admissions_policies` table: one current row per school, applicant type and entry year, with an https source,
    checked date and history. It is written only through `admin_set_admissions_policy`, which needs an administrator,
    keeps the previous row as history and writes an audit entry.
  - School pages, search cards, the comparison table and `/match` show "Current testing policy" (checked, with its
    source) separately from "The Fall 2024 entering class (historical)". With no checked policy they say "Not yet
    checked".
- **Tests:** database (auth, https only, year window, supersede history, revision log, first-year and transfer kept
  separate, historical figures untouched, unknown when none, reviewer identity not public); e2e admin records a
  policy and the public page separates the two.

### BR-05 Division links
- **Fix:** one division definition (`src/lib/registry/divisions.ts`). Legacy spellings (`ncaa-d1`, `d1`, `juco`, …)
  map to canonical codes. Unrecognised filters are listed on the page ("Some filters in this link weren't
  recognised…") instead of silently widening the search. The two-year shortcut covers NJCAA, CCCAA and NWAC.
- **Tests:** unit (normalisation, every home-page shortcut equals the hand-picked filter, ignored values reported);
  e2e (home link equals manual filter count, legacy link, unknown filter notice).

### BR-06 Comparison continuity
- **Fix:** the selection lives in one first-party cookie (`br_compare`, 30 days, httpOnly, school identifiers only).
  - It changes **only through form posts**: Add to compare, Remove, Clear compare and "Make this my comparison". They
    are on search results, school pages, saved schools and `/compare`, and all work without JavaScript.
  - Every page reads the cookie, so header, footer and bookmark links show the same comparison.
  - `/compare?schools=…` is a shared, read-only view. Opening it never changes the visitor's own comparison until they
    choose "Make this my comparison". `/compare` offers a link to share the visitor's list.
  - A sixth school is refused with a way to make room.
- **Found in CI, fixed:** the first design stored or restored the selection on ordinary page loads. Background link
  prefetches and out-of-order requests could then rewrite the comparison without a click, intermittently. Page loads
  now never change it.
- **Tests:** unit (`sharedCompareList`, limits, tampered values, search links never carry the comparison); e2e (search
  → profile → footer link, remove both and reopen, shared link is read-only until adopted, five-school refusal,
  current vs past policy rows).

### BR-07 Feature availability
- **Fix:** `src/config/availability.ts` is the one place that says what works today (available / pilot / planned /
  unavailable). The home page, navigation, audience pages, pricing and how-it-works read it. Calls to action point to
  search and the score comparison only.
- **Tests:** unit; e2e (home page has no "Find my matches").

### BR-08 Coverage and evidence
- **Fix:** `registry_coverage()` adds checked current policies and programs still under "Other". The methodology page
  labels the federal test policy as history and explains the comparison's rules and the correction route.

### BR-09 School actions, corrections and cost basis
- **Fix:**
  - School pages have Save, Add to compare and "Report a correction".
  - Reports need a free account. They are limited to 20 a day per person; reporters see only their own reports,
    administrators see all, and visitor-supplied links are shown as text, not opened.
  - Administrators close reports from `/admin/corrections`. A report never changes public data by itself.
  - The cost section states that prices are published figures for one year and do not specify residency or housing.
- **Tests:** database (validation, visibility, resolve, rate limit); e2e (signed-out prompt, synthetic athlete reports,
  administrator dismisses).

### BR-10 Phones
- **Fix:** the name search and "Show schools" are always visible; other filters sit in a disclosure that starts closed
  below 1024 px, with "Apply filters" and "Back to results".
- **Tests:** e2e on the Pixel 7 project.

### BR-11 Accessibility
- **Fix:**
  - The statement now says what is tested (axe on listed pages at desktop and phone sizes, keyboard tests), not
    conformance.
  - `/match` moves focus to an error summary that links to each field, and to the results heading after a comparison.
  - Save buttons announce changes politely and include the school name; the visible label is kept in the accessible
    name.
- **Tests:** axe on `/saved`, `/support`, `/athletes`, `/transfers`, the correction page, comparison results and the
  error state.

### BR-12 Privacy and support
- **Fix:**
  - The privacy page is rewritten from what the code collects today (none for guests; account, saves, reports and
    family links for members), who sees it, under-18 rules and what is never done.
  - `/support` explains the correction route. No support email is invented: decision F7 is still open.
- **Remaining:** legal review (L1–L8) before launch.

### BR-13 Search engines
- **Fix:** indexing is off unless `NEXT_PUBLIC_APP_ENV=production` and `ALLOW_INDEXING=true`. Until then every page
  sends `noindex` and `robots.txt` disallows all. When on, `robots.txt` excludes signed-in areas and the sitemap lists
  public pages and every listed school.
  - Canonical URLs and descriptions on public pages.
  - `noindex` on filtered searches, compare, saved, correction, code and reset pages and the signed-in area.
  - Unknown schools still return a real 404.
- **Tests:** unit (switch); e2e (`robots.txt`, empty sitemap, meta robots, canonical).

## Database migration and rollback

`supabase/migrations/20261024000100_discovery_pilot.sql` is additive:
- New tables `admissions_policies`, `saved_schools` and `correction_reports`, and types `correction_topic` and
  `correction_status`.
- New functions, plus a replaced `registry_coverage()`.
- `registry_revisions` (append-only) accepts `admissions_policy` entries.

It changes no existing rows. Merging the pull request applies it to production through the Supabase GitHub
integration.

To roll back, add a new migration that runs the following and merge it. The rollback deletes recorded policies, saved
schools and reports, so export them first if any exist.

```sql
drop function if exists public.current_admissions_policies(text[]);
drop function if exists public.schools_by_slugs(text[]);
drop function if exists public.admin_resolve_correction_report(uuid, public.correction_status, text);
drop function if exists public.submit_correction_report(text, public.correction_topic, text, text);
drop table if exists public.correction_reports;
drop type if exists public.correction_status;
drop type if exists public.correction_topic;
drop function if exists public.my_saved_schools();
drop function if exists public.unsave_school(text);
drop function if exists public.save_schools(text[]);
drop table if exists public.saved_schools;
drop function if exists public.admin_retire_admissions_policy(uuid, text);
drop function if exists public.admin_set_admissions_policy(uuid, public.applicant_type, integer, public.test_policy, text, text, text, text);
drop table if exists public.admissions_policies;
-- Then paste the registry_coverage() definition and its revoke/grant lines from
-- 20261023000300_registry_public_reads.sql, changing "create function" to "create or replace function".
```

This script was dry-run (inside a transaction, then rolled back) against a local database with every migration
applied: it completes, and the old coverage function works afterwards.

Leave `registry_revisions` alone: it is append-only (a trigger refuses deletes), so any `admissions_policy` history
stays, and the wider check constraint that allows it is harmless.

Reverting the application code is a normal revert of the pull request. The app reads the new coverage fields as
optional, so an older database does not break the new pages.

## Tests run

| Suite | Where | Result |
| --- | --- | --- |
| Database security tests (13 files, including `013_discovery_pilot`) | Local PostgreSQL 16 | 469 assertions passed |
| Concurrency tests | Local PostgreSQL 16 | 12 scenarios passed |
| Unit tests (10 of 11 files, including the new `matching-rules` and `discovery-urls`) and the catalog contract test against a database with every migration | Local Node 22 test runner with a Vitest-compatible shim; the workspace cannot install packages. `registry-snapshot` was not run locally (it needs zod 4; its code is unchanged) | 116 passed |
| Rollback script | Local PostgreSQL 16, inside a transaction | Completes; old coverage function works |
| Typecheck | GitHub Actions | 0 errors (172 files) |
| Unit tests (Vitest, all 11 files) | GitHub Actions | 113 passed |
| Contract tests | GitHub Actions, PostgreSQL 16 and 17 | 7 passed |
| Database security and concurrency tests | GitHub Actions, PostgreSQL 16, 17 and the real Supabase stack | 469 assertions and 12 scenarios passed on each |
| End-to-end and axe (desktop and Pixel 7, production build, local Supabase stack, synthetic accounts) | GitHub Actions | 161 passed, 2 skipped (phone-only tests on the desktop project) |

CI also caught two real defects that are now fixed: a type error on the pricing page, and the prefetch problem
described under BR-06.

## Release readiness

**Not ready for a public launch.** The remediation itself is ready to merge: every CI check passes. Merging only applies the additive
migration, keeps search engines out and publishes the honest copy; it adds no public data changes. Public launch is
blocked by:

1. Legal review of the privacy policy, terms and the open legal questions (L1–L8). **Blocked by external dependency.**
2. A support address and sending domain (F7), and custom SMTP. Today only the founder's address receives sign-in
   codes.
3. Vercel Pro (the Hobby plan does not allow commercial use).
4. Turning on indexing (`ALLOW_INDEXING=true`) after items 1–3.

Done since: the founder approved and an administrator applied the data corrections listed in
`proposed-data-corrections.md` (2026-10-23). Leaked-password protection is on, and the `rls_auto_enable` API access
is revoked (PR #6).

### Production checks done on 2026-10-23

- Supabase shows migrations `20261024000100_discovery_pilot` and `20261024000200_revoke_rls_auto_enable_execute`.
  The three new tables have row-level security on.
- `robots.txt` shows `Disallow: /`. School pages send `noindex, nofollow` and a canonical URL.
- Johns Hopkins page: NCAA Division III (checked), and "Current testing policy: First-year applicants, entering fall
  2027: SAT/ACT required", shown separately from "The Fall 2024 entering class (historical)".
- `/match` against Vermont schools compared 4 of 4, moved focus to the results, and showed the rules version.
- Supabase security advisor: only the expected warning remains (signed-in users can call the app's write functions,
  each of which checks the caller).

### After merge (to reach "Production verified")

- Supabase → Database → Migrations shows `20261024000100_discovery_pilot`.
- `https://base-recruits.vercel.app/robots.txt` shows `Disallow: /`. A school page shows "Current testing policy: Not
  yet checked" and the past class separately.
- On a phone: search results appear above the closed Filters disclosure.
- Saving a school as a guest, then signing in as the founder, moves it into the account (check `/saved`).
- `/match` with no scores returns results; the browser's network panel shows no score values in any request.
