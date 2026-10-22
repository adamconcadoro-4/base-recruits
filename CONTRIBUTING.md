# Contributing to Base Recruits

These conventions keep the product's two promises enforceable: **the core is free forever** and **student data is
private by default**. Every change is reviewed against both.

## Repository layout

```
docs/                    architecture, open decisions, stage reports
scripts/db/              local test database and security test runner
src/config/              product configuration (plans; prices are hypotheses)
src/lib/                 framework-free domain logic (access policy, age rules, consent, entitlements)
src/app/                 Next.js routes (Stage 1, pending)
supabase/migrations/     ordered SQL migrations — the database contract
supabase/tests/          database security tests (plain SQL, run in rolled-back transactions)
tests/unit/              unit tests for src/lib (Vitest API)
tests/contract/          checks that TypeScript catalogs match the database
```

## Branches, commits and reviews

- `main` is always releasable. Work on `stage-<n>/<topic>` branches and merge by pull request.
- Commit messages use the imperative mood and name the area: `consent: expire document grants after 365 days`.
- A pull request lists the tests it adds and answers the free-access and privacy checklists below.

## Database rules

1. **Migrations are append-only.** Add `supabase/migrations/YYYYMMDDHHMMSS_snake_case_name.sql`; never edit a migration
   that has been applied anywhere.
2. **Every table** enables row-level security, revokes all privileges from `anon`, `authenticated` and `service_role`,
   then grants the minimum: usually `SELECT`, and `UPDATE` only on named harmless columns. Clients never `INSERT` or
   `DELETE` directly. Identity columns' sequences are revoked from all three roles too. Security-relevant tables get a
   `private.audit_row_change()` trigger so every change is recorded, whoever makes it.
3. **Writes go through functions.** API functions live in `public`, internal helpers in `private` (not exposed by the
   Data API). Every `SECURITY DEFINER` function sets `search_path = ''`, fully qualifies names, checks
   `auth.uid()` and roles explicitly, revokes `EXECUTE` from `public, anon, authenticated, service_role`, then grants
   it to exactly who needs it.
4. **Policies** call `(select auth.uid())` (evaluated once per statement) and `private.*` helpers.
5. **Check-then-write is locked.** Any function that counts rows before inserting (limits, "last admin", one-time
   steps) first locks the owning row (`select … for update`) or takes an advisory lock, and gets a scenario in
   `scripts/db/race-test.sh`.
6. **Errors** use the Base Recruits codes (`BR001`–`BR020`, see the foundation migration). Messages for `BR003`/`BR004`
   are shown to users, so write them in plain language.
7. **Audit** every security-relevant change with `private.log_audit()`. Never put dates of birth, grades, scores,
   document contents or message bodies in audit metadata.
8. **Allow-lists are deliberate.** `supabase/tests/database/007_privileges_and_exposure.test.sql` lists every function
   signed-in users may call. Adding an API function means updating that list in the same pull request.

## Free-access checklist (answer in every pull request)

- Does any discovery, matching, comparison, shortlist, basic profile, coach-visibility or verified-coach feature now
  depend on payment, a plan, a trial or a usage quota? (Must be "no".)
- Did you add a capability? Core capabilities need an invariant reference; premium ones must be workflow or convenience.
- Do `npm run test:db`, `npm run test:race`, `npm run test:unit` and `npm run test:contract` pass?

## Privacy checklist

- Is any new personal data visible to someone other than its owner? Which consent scope or role allows it, and where is
  the test?
- Is anything about a minor public, searchable or messageable without the consent rules in `consent_scope_rules`?
- Does new logging, analytics or error reporting include sensitive educational or personal fields? (Must be "no".)

## Data integrity

- Never add fabricated schools, programs, statistics or admissions outcomes. Test fixtures are synthetic, use
  `example.test` domains and live only in test files.
- Unknown institutional facts stay unknown and are displayed as unavailable.

## TypeScript

- `strict` with `noUncheckedIndexedAccess`; no `any`.
- Keep domain rules in `src/lib/` as framework-free functions with unit tests; UI and server code call them.
- Server-only modules start with `import 'server-only'`. The Supabase secret key is used only in server code.

## Running tests

```bash
npm run test:db        # database security suite on a throwaway local PostgreSQL
npm run test:race      # concurrency scenarios (two sessions racing on the same rows)
npm run test:unit      # domain logic
npm run test:contract  # TypeScript ↔ database catalog agreement
npm run typecheck
```
