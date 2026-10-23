# Stage 2 Engineering Report — National college baseball registry (Pillar A)

Date: 2026-10-22 · Spec exit gate: **"authorized real institutions and confirmed baseball programs are searchable;
source-backed fields display correctly; missing data handled honestly; admin can reconcile and republish records"** —
**met in CI against a real local Supabase stack** (evidence and limits below). Not yet run against a hosted Supabase
project (decision F1), so nothing is publicly live.

## Summary

The registry lists 1,670 real colleges whose men's baseball team appears in the U.S. Department of Education's
2024-25 Equity in Athletics (EADA) report, with admissions, published prices and enrollment from College Scorecard.
Every figure carries its source and the term or academic year it describes; anything a source doesn't report reads
"Not reported".

- **Pipeline.** `data/pipeline` runs on GitHub's runners and produces a reviewed snapshot (`data/snapshots/registry-2024-25.json`) with file and record checksums. No hand-entered records.
- **Database.** Institutions and programs are separate entities. Imports are staged, validated, reviewed field by field and published by an administrator; any earlier import can be restaged to roll back. Every change is logged with who and why.
- **Public site.** Free search with filters, school pages, compare up to five, and live coverage on the data methodology page. No account needed.
- **Admin.** Stage, review, publish or discard imports; correct a program against an official page; hide a record.

An independent security review found 7 issues (3 data-integrity, 1 validation group, 3 low). All are fixed and covered
by tests. One further defect (a WHERE-less update rejected only by hosted-style Supabase) was caught by the end-to-end
run and is now guarded by a database test.

## Exit gate evidence

| Gate item | Evidence (GitHub Actions run 39860962993 on pull request #3, commit `2eb5d5e`) |
| --- | --- |
| Authorized real institutions and confirmed programs are searchable | E2E: a visitor without an account searches "Stanford", filters by division (CCCAA: 88 programs, paged), state and admission rate, and compares schools. Search covers names, source aliases and misspellings (database test 012). Only programs the latest federal report lists are searchable |
| Source-backed fields display correctly | E2E: Stanford's page shows NCAA Division I with "Federal report" verification, 3.6% admission rate and SAT Math 770–800 labelled Fall 2024, $92,892 cost of attendance labelled 2025–26, and EADA_2024-2025.zip with its retrieval date. Values match the snapshot exactly (database test 012 checks the stored values) |
| Missing data handled honestly | E2E: Long Beach City College shows "Not reported" admissions and no percentages; GPA reads "Not reported in federal data" everywhere; filters on a figure say which schools they leave out. Database: missing sections are null, never zero; coverage reports GPA 0 |
| Admin can reconcile and republish | E2E: an administrator stages the bundled snapshot, reviews it (1,670 unchanged), publishes; corrects Johns Hopkins from EADA's "Other" to NCAA Division III citing the athletics site; republishes and the correction stands; hides and relists a school. Database: changed/missing/invalid classification, skip decisions, rollback by restaging, stale reviews refused |

Totals for that run: **127 end-to-end and accessibility tests passed, 0 failed, 0 flaky, 1 skipped** (the phone-menu check, which runs only at phone size). The new automated WCAG 2.2 AA checks cover search results, two school pages, compare and data methodology at desktop and phone sizes, and the three admin registry screens at desktop size: zero violations.

Limits of this evidence:

- The Supabase stack is the CLI's local stack inside CI. The hosted project still needs to be created (F1) and the registry published there once (README, "School registry data").
- Accessibility is automated (axe, WCAG 2.2 AA) at desktop and phone sizes; no manual screen-reader session yet.
- Divisions for 1,670 programs come from the school's athletics classification in EADA. Only programs an administrator has checked show a verified division or conference (decision F12).

## What the data covers

| | Count (of 1,670) |
| --- | --- |
| NCAA Division I / II / III | 300 / 254 / 371 |
| NAIA | 185 |
| NJCAA Division I / II / III | 169 / 126 / 70 |
| CCCAA / NWAC (two-year) | 88 / 25 |
| USCAA / NCCAA / Independent | 28 / 16 / 1 |
| Reported as "Other" (needs a manual check) | 37 |
| With an admission rate (Fall 2024) | 1,103 |
| With SAT / ACT ranges | 739 / 723 |
| With published cost of attendance (2025-26) | 1,667 |
| Institution facts from EADA only (no College Scorecard record) | 3 |
| Test policy reported: required / test-optional / test-blind | 59 / 781 / 263 |

Year labels were confirmed before use, not assumed: the fall 2024 IPEDS Admissions survey package (term, the three
test-policy answers, and that score percentiles describe enrolled first-time students whose scores were used), and
the API's year keys checked against known institutional figures (admissions key 2024 = fall 2024; price key 2025 =
2025-26; enrollment key 2023 = fall 2023). Average net price is not imported because its reference year could not be
confirmed; each school's own net price calculator is linked instead.

## Features built

| Area | What exists |
| --- | --- |
| Pipeline (`data/pipeline`, `data-refresh` workflow) | EADA file list and download, per-sport workbook parsing, explicit code maps (classification, sector, ownership, level, locale, test policy); College Scorecard in batches of 100 with the newest well-covered year per field group; issues instead of guesses; one record per line; SHA-256 of the EADA file and of the records (checked again by the app). 15 unit tests run on raw rows captured from the sources |
| Registry schema | `data_sources` (publisher, access method, terms note, attribution), associations and divisions, `institutions` (IPEDS unit id, slug, facts with provenance, listing flag), `institution_aliases`, `baseball_programs` (status with season and source, association/division, reported classification, participants, conference and official links, verification level and evidence), `admissions_statistics` (per fall term), `institution_costs` (per academic year), `registry_revisions` (append-only, written by triggers) |
| Import workflow | Create job → stage rows in chunks → validate every value and compute field-level changes (new / changed / unchanged / missing / invalid) → skip rows → publish, or discard. Restage any fully reviewed import to roll back. One import staged at a time; reviews and publishes take turns, and a publish requires the registry version its review saw |
| Reconcile | Correct status, association/division, conference and official links citing the page checked; the change, note and administrator are logged. Imports never overwrite an administrator-verified division or a status confirmed for the same or a later season. Hide or relist a record with a reason |
| Public pages | `/schools` (search, state, division, school type, two/four-year, setting, enrollment, admission rate, test policy, cost, sort, pages, add to compare — all in the URL, works without JavaScript), `/schools/[slug]`, `/compare` (table on wide screens, cards on phones), `/data-methodology` (live coverage) |
| Admin pages | `/admin/data` (coverage, bundled snapshots, imports, source registry), `/admin/data/jobs/[id]` (review by change type, field diffs, notes, decisions, publish/discard/restage), `/admin/schools` (search and review queues: "Other", federal-report only, not reported, hidden), `/admin/schools/[slug]` (correction form, listing, change history) |
| Free access | Search, school pages, compare and coverage are open to signed-out visitors and are SECURITY INVOKER functions under row-level security; the exposure test pins exactly which tables and functions anonymous visitors can use |

## Independent security review

One reviewer, given the code and the product rules but not my conclusions, probed the database directly. Access
control held: no API role can write; unlisted schools are invisible to non-admins on every read path; admin tables are
admin-only. Findings, all fixed:

| # | Severity | Finding | Fix and test |
| --- | --- | --- | --- |
| 1 | Medium | A review computed while another import was publishing could later publish a stale diff | Reviews and publishes share a lock; publishes require the registry version recorded at review. Race scenario "a review prepared during a publish is computed after it"; test 012 |
| 2 | Medium | Rolling back to an older season could let a later re-import overwrite an administrator's confirmed status | The decision stores its season (`status_season`). Test 012 "a confirmed status survives rolling back… and forward again" |
| 3 | Medium | A job discarded half-staged could be restaged as complete, hiding programs | Only fully reviewed imports with all rows can be restaged; the button is hidden otherwise. Test 012 |
| 4 | Medium | Some malformed records passed validation and then aborted publish (fractions, text, huge numbers, missing years or ids, slug truncation) | Every value is type- and range-checked without casting first; casts go through numeric. Test 012 publishes a batch with 6 such records flagged invalid |
| 5 | Low | Changing a row decision could race publish | The decision locks the job row |
| 6 | Low | Visitors could read the reviewing admin's id, internal notes and import ids | Column grants; exposure test 007 |
| 7 | Low | The pipeline could drop a whole school when one score was out of range | Range check before pairing; pipeline test |

Not changed, recorded as risks: the data-refresh workflow gives the API key to code on any pushed `data/*` branch
(only collaborators can push; moving the secret to a protected GitHub Environment is recommended); `pip install` is
version-pinned but not hash-pinned.

## Migrations (Stage 2)

| File | Content |
| --- | --- |
| `20261023000100_registry_schema.sql` | Extensions (pg_trgm, unaccent), enums, sources, associations/divisions, import jobs and rows, institutions, aliases, programs, admissions, costs, revision log and triggers, search text, row-level security, column grants |
| `20261023000200_registry_imports.sql` | Validation, change computation, create/stage/finalize/decide/publish/discard/restage, program correction and listing functions |
| `20261023000300_registry_public_reads.sql` | `search_schools`, `get_school`, `compare_schools`, `registry_coverage` |

## Test commands and results

| Command | Result (CI run 39860962993, commit `2eb5d5e`) |
| --- | --- |
| `scripts/db/test.sh` (PostgreSQL 16, 17 and the real Supabase stack) | 426 assertions in 12 files, all passed, on each of the three (Stage 1: 341) |
| `scripts/db/race-test.sh` | 12 of 12 scenarios (3 new: concurrent staging, concurrent publishes, a review prepared during a publish) |
| `npm run test:contract` | 6 of 6 (new: registry divisions and value lists match the TypeScript catalogs) |
| `python3 -m unittest discover -s data/pipeline/tests -t .` | 15 of 15 |
| `npm run typecheck` / `npm run test:unit` | 0 errors in 142 files / 74 of 74 (16 new: explorer URL state, labels, canonical JSON, snapshot integrity) |
| `npx playwright test` (production build, desktop and Pixel 7) | 127 passed, 0 failed, 1 skipped by design |

Local full-snapshot timing (PostgreSQL 16): staging 1,670 rows 60 ms, review 0.35 s, first publish 3–4 s, restage 1.2 s,
filtered search 4–25 ms.

## Integrations actually functional

- EADA public download (GitHub runner): works; file list, release zip (12 MB) and per-sport workbook.
- College Scorecard API with the founder's key (GitHub secret): works; 17 requests per refresh, well under the 1,000/hour limit.
- Supabase: local CLI stack in CI only.

## Records imported

1,670 institutions with men's baseball programs (EADA 2024-25), published into each CI run's local database by the
real admin functions. Zero records in any hosted database (none exists). Nothing synthetic: the database tests use 13
real records copied from the snapshot; test-only edits to copies are rolled back.

## Known gaps and residual risk

- **Division accuracy.** 37 programs are "Other" and some NCCAA/USCAA members may compete in baseball under another association. Shown honestly as the federal classification until checked (F12).
- **Not imported yet:** conferences, official baseball pages and questionnaires (admin-entered only), GPA, majors, net price, transfer requirements. Majors are needed for Stage 3 matching.
- **Hosted timing.** Hosted Supabase limits signed-in API statements to about 8 seconds by default. The first full publish took 3–4 s here; measure it on the hosted project before relying on it.
- **Correction channel.** The methodology page promises a way to report corrections before launch (F7).
- Carried over from Stage 1: client-IP forwarding and rate limits, CSP nonce, admin MFA, ESLint, a manual accessibility review.

## Unresolved dependencies

- F1: hosted Supabase project (not created). F7: support and sender address. F11–F13: import approver, association directories, refresh cadence (defaults in place). L6: counsel review of the data sources in use.

## Next exact step

Stage 3 (free academic matching and guest funnel): import majors (College Scorecard field of study) through the same
pipeline and review flow, then build the GPA/test form, rule-based matching with explanations, and the guest shortlist
that migrates on sign-up.
