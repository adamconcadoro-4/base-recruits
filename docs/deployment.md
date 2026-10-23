# Deployment

How Base Recruits reaches the internet, and what has to be set by hand. Values that are secrets (the Supabase secret
key, SMTP passwords) are never written here or committed anywhere.

## Production

| Piece | Where | How it updates |
| --- | --- | --- |
| Code | GitHub `adamconcadoro-4/base-recruits`, branch `main` | Pull requests merged into `main` |
| Database, Auth | Supabase project **Base Recruits** (ref `qdwnxdkygeptynkdvgez`, region us-east-2, Ohio) in the **Base Recruits** organization, Pro plan | Supabase GitHub integration applies new migrations when `main` changes |
| Web app | Vercel project for this repository, production branch `main` | Vercel builds and publishes every push to `main` |

An earlier, empty project in the same organization (`addbssupnaiiuawqxiod`, ca-central-1) is not used. The founder
deletes it from the dashboard.

## Database changes

The Supabase GitHub integration (Project Settings → Integrations) is connected with working directory `.`, production
branch `main` and **Deploy to production** on. Merging a pull request that adds a file to `supabase/migrations/`
applies it to the production database, in order, and records it in the migration history, exactly as
`supabase db push` would. Automatic preview branching is **off**: preview branches are billed outside the
organization's spend cap.

Only migrations (and any Edge Functions or Storage buckets declared in `supabase/config.toml`) deploy this way. The
Auth section of `supabase/config.toml` configures the local stack only; production Auth is set in the dashboard, below.
If a migration fails in production, the integration reports it on the commit; nothing after the failing file runs.

## Production Auth settings (dashboard)

These mirror `supabase/config.toml`. Security depends on them (see the README).

| Setting | Value |
| --- | --- |
| Site URL | The production web address |
| Redirect URLs | `<production address>/**` |
| Email provider | Enabled, **Confirm email on**, **Secure email change on** |
| Anonymous sign-ins | Off |
| Minimum password length | 10 |
| Email OTP length / expiry | 6 digits / 3600 seconds |
| Email templates: Confirm signup, Magic link, Reset password, Change email address, Invite user | Subject `Your Base Recruits code`; body `supabase/templates/email-code.html` (the 6-digit code only, no link) |
| SMTP | Custom sender on a Base Recruits domain (decision F7). Until then Supabase's built-in sender is used, which is heavily rate-limited and meant for testing by the project's own team, not real users |

## Web app environment variables (Vercel, Production)

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The production web address, no trailing slash |
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qdwnxdkygeptynkdvgez.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key (`sb_publishable_…`, Project Settings → API Keys) |
| `SUPABASE_SECRET_KEY` | A secret key (`sb_secret_…`, same page). Server-only. Entered in Vercel by the founder; never pasted into chats, issues or commits |
| `ALLOW_INDEXING` | Leave **unset** until launch sign-off (decision F14). Set to `true` only in Production to let search engines index the site; with it unset every page is `noindex` and `robots.txt` disallows crawling |

The Vercel team is on the Pro plan (active since 2026-10-22), which allows commercial use. A $200 spend alert is set on the team.

## One-time steps on a new production database

1. Sign up on the live site with the founder's account and confirm the emailed code.
2. In the Supabase SQL editor: `select private.bootstrap_first_admin('<founder email>');`
3. As administrator: **Admin → School data → Stage** the bundled snapshot, review it, **Publish**. Nothing is public
   until this has been done once.
4. Daily maintenance: enable the pg_cron integration, then schedule the job shown in the README. Access rules do not
   depend on it (every helper checks expiry at read time), but it removes sign-ups left unconfirmed and expires
   verifications and grants on schedule.

## Before inviting people other than the founder

- Custom SMTP sender (decision F7) and a domain.
- Client-IP forwarding for Auth rate limits, or deliberately raised limits (see the README).
- Decide on the proposed registry corrections (`docs/remediation/proposed-data-corrections.md`).
- Only after legal review and a support address: set `ALLOW_INDEXING=true` (decision F14).
