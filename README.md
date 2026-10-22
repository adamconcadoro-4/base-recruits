# Base Recruits

**Where Academics Meet Opportunity.** Free college baseball discovery and academic matching for student-athletes and
families, with a free, verified-coach recruiting portal. Optional paid plans sell workflow and convenience — never
visibility, admission or opportunity.

## Status

Stage 1 of 7 (project, design system, security baseline): **built and passing in CI** against a real local Supabase
stack. See `docs/reports/stage-1.md`.

| Stage 1 item | Status |
| --- | --- |
| Database: roles, profiles, athletes, coach verification, family links, consent, audit log, capability catalog | Done, 8 migrations |
| Row-level security and free-access guards (three independent security reviews across database and app) | 334 database assertions and 9 concurrency scenarios pass on PostgreSQL 16, 17 and the real Supabase stack |
| Next.js app: design system, public pages, sign-up by emailed code, log in/out, password reset, role dashboards | Done |
| End-to-end and accessibility (axe, WCAG 2.2 AA) tests at desktop and phone sizes | 103 pass in CI |
| Hosted Supabase project | Not created yet (decision F1) |

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

Required Supabase Auth settings for every hosted project (security depends on them):

- **Email confirmations on**, anonymous sign-ins off, minimum password length 10.
- **Every Auth email template (Confirm signup, Magic link, Reset password, Change email address, Invite user) must
  contain only the 6-digit code (`{{ .Token }}`) and no link**, as in `supabase/templates/email-code.html`. Sign-up and
  password reset are finished by typing the code on the site, where the person also sets their password. The database
  additionally wipes any password set before an email is confirmed and refuses email-change requests, so a link a
  stranger triggers cannot hand them an account. `supabase config push` applies `supabase/config.toml`'s auth settings
  and templates to a linked project; check them in the dashboard afterwards.
- Because every Auth call comes from the app server, Supabase sees one IP address for all users. Before launch,
  configure client-IP forwarding for Auth rate limits (or raise them deliberately) and add per-person limits in the app.
- A custom SMTP sender for production, and the site URL of each environment.
- The daily maintenance job above; it also deletes sign-ups left unconfirmed for more than a day.

## Documentation

- `docs/architecture.md` — system shape, modules, stage dependencies, security model, how free access is enforced
- `docs/decisions.md` — open founder and legal decisions, with current defaults
- `docs/reports/` — engineering report for each stage
- `CONTRIBUTING.md` — repository conventions and review checklists

## Product rules the code enforces

Discovery, academic matching, comparison, unlimited saved schools, basic athlete profiles, consent-based visibility
to coaches and verified-coach tools are free forever. Missing data stays missing; nothing is invented. Student data is
private by default, shared only by explicit, revocable consent, with extra protection for minors.
