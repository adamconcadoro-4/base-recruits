# Base Recruits

**Where Academics Meet Opportunity.** Free college baseball discovery and academic matching for student-athletes and
families, with a free, verified-coach recruiting portal. Optional paid plans sell workflow and convenience — never
visibility, admission or opportunity.

## Status

Stage 1 of 7 (foundation) — **in progress**. See `docs/reports/stage-1.md`.

| Stage 1 item | Status |
| --- | --- |
| Database: roles, profiles, athletes, coach verification, family links, consent, audit log, capability catalog | Done — 6 migrations |
| Row-level security and free-access guards, through two independent security reviews | Done — 309 database assertions and 9 concurrency scenarios passing, locally and on GitHub Actions (PostgreSQL 16 and 17) |
| Access-policy domain logic (age rules, route access, coach verification, entitlements) | Done — 52 unit tests + 5 contract tests passing |
| Architecture and dependency plan, conventions, open decisions | Done — `docs/` |
| Next.js app: design system, public pages, Supabase Auth flows, role dashboards, end-to-end and accessibility tests | Not started — the build environment could not reach the npm registry |

## Requirements

- PostgreSQL 15+ server binaries (`initdb`, `pg_ctl`, `psql`) for the database test suite
  - macOS: `brew install postgresql@16` · Ubuntu: `apt install postgresql`
- Node.js 22.12+ and npm
- Supabase CLI and Docker, for the local Supabase stack (`supabase start`) the app and end-to-end tests use

## Run the app locally

```bash
npm install
supabase start                                   # local Auth, Data API and PostgreSQL 17, with every migration
scripts/ci/supabase-env.sh > .env.local          # point the app at the local stack
npm run dev                                      # http://localhost:3000
```

Confirmation emails go to the local mail catcher at http://127.0.0.1:54324, never to a real inbox. To make your own
account the first administrator, sign up, confirm, then run once:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select private.bootstrap_first_admin('you@example.com')"`.

End-to-end and accessibility tests (Playwright, axe) run against a production build and the local stack:

```bash
npx playwright install chromium   # first time only
set -a; . ./.env.local; set +a
npm run build && npm run test:e2e
```

Before a run, `.env.local` must point `NEXT_PUBLIC_SITE_URL` at `http://127.0.0.1:3000`, which the script above does.

## Run the database security tests

```bash
npm run test:db          # or: scripts/db/test.sh
```

The script starts a throwaway PostgreSQL in `.local/`, emulates the Supabase roles and `auth` functions, applies every
migration and runs `supabase/tests/database/*.test.sql` — each in a transaction that is rolled back.

Concurrency checks (two sessions racing on the same rows): `npm run test:race`.

Useful commands: `npm run db:reset` (fresh migrated test database), `npm run db:psql`, `npm run db:stop`.

To run the same tests against a real Supabase database where the migrations are applied (for example a local
`supabase start` stack):

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/db/test.sh
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request. It runs the database security suite,
the concurrency scenarios and the catalog contract test on PostgreSQL 16 and 17 (the version hosted Supabase runs),
plus the database suite against the real Supabase stack (`supabase start`), the TypeScript typecheck, the unit tests
under Vitest, and the end-to-end and accessibility tests against a production build. Each step publishes its test
counts as a notice on the run.

## Apply the migrations to a Supabase project

Use a project dedicated to Base Recruits.

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then, once, in the SQL editor:

```sql
-- After signing up with your own account, make it the first administrator:
select private.bootstrap_first_admin('you@yourdomain.com');

-- Daily maintenance (enable the pg_cron integration first):
select cron.schedule('base-recruits-maintenance', '17 7 * * *',
                     $$select private.run_scheduled_maintenance()$$);
```

Supabase Auth settings to use: email confirmations on, anonymous sign-ins off, a custom SMTP sender for production,
and the site and redirect URLs of each environment.

## Documentation

- `docs/architecture.md` — system shape, modules, stage dependencies, security model, how free access is enforced
- `docs/decisions.md` — open founder and legal decisions, with current defaults
- `docs/reports/` — engineering report for each stage
- `CONTRIBUTING.md` — repository conventions and review checklists

## Product rules the code enforces

Discovery, academic matching, comparison, unlimited saved schools, basic athlete profiles, consent-based visibility
to coaches and verified-coach tools are free forever. Missing data stays missing; nothing is invented. Student data is
private by default, shared only by explicit, revocable consent, with extra protection for minors.
