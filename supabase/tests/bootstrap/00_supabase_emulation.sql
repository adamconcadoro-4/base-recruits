-- =============================================================================
-- LOCAL TEST DATABASES ONLY — never apply this file to a hosted Supabase project.
--
-- Emulates the parts of the Supabase platform that Base Recruits migrations
-- depend on, so migrations and row-level-security tests can run against a plain
-- PostgreSQL server (no Docker, no Supabase CLI):
--   * the API roles (anon, authenticated, service_role, authenticator)
--   * the auth schema: a minimal auth.users table and Supabase's exact
--     auth.uid() / auth.role() / auth.jwt() / auth.email() definitions
--   * Supabase's default privileges on the public schema (every new table and
--     function is granted to anon/authenticated/service_role), which is why
--     every Base Recruits table enables RLS and revokes what it does not need.
--
-- scripts/db/test.sh skips this file automatically when it detects a real
-- Supabase database (auth.users already exists), e.g. a `supabase start` stack.
-- =============================================================================

set client_min_messages to warning;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists extensions;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;

-- Minimal auth.users with the columns Base Recruits reads. Column names and
-- types match Supabase Auth's table so the same migrations run unchanged.
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_anonymous boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Supabase's definitions (supabase/postgres, auth schema).
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt()
  to anon, authenticated, service_role;

-- Supabase default privileges for objects that `postgres` creates in public.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Migration bookkeeping table in the same shape the Supabase CLI uses.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);
