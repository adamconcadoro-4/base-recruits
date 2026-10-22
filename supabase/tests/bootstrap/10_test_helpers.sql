-- =============================================================================
-- Test helpers for Base Recruits database security tests.
--
-- scripts/db/test.sh loads this file INSIDE each test's transaction and rolls
-- the transaction back afterwards, so nothing here persists — including on a
-- real Supabase database. Test files are plain SQL (no psql meta-commands), so
-- they can also be pasted into the Supabase SQL editor wrapped in
-- `begin; <this file> <test file> rollback;`.
-- =============================================================================

create schema tests;
grant usage on schema tests to public;

-- Named fixtures: tests refer to users as tests.id('athlete_adult') etc.
create table tests.fixtures (
  name text primary key,
  id uuid not null
);
grant select on tests.fixtures to public;

create table tests.results (
  seq integer generated always as identity,
  description text not null
);
grant select, insert on tests.results to public;
grant usage on all sequences in schema tests to public;

-- Create an auth user (which fires the real signup trigger) and remember it.
create function tests.create_user(
  p_name text,
  p_account_type text default null,
  p_email text default null,
  p_email_confirmed boolean default true,
  p_date_of_birth date default null,
  p_display_name text default null,
  p_is_anonymous boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_meta jsonb := '{}'::jsonb;
begin
  if p_account_type is not null then
    v_meta := v_meta || jsonb_build_object('account_type', p_account_type);
  end if;
  if p_display_name is not null then
    v_meta := v_meta || jsonb_build_object('display_name', p_display_name);
  end if;

  -- Fixtures are created the way an administrator creates accounts: role and
  -- name in app metadata, which only the server can set.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                          email_confirmed_at, is_anonymous, created_at, updated_at)
  values (v_id, 'authenticated', 'authenticated',
          case when p_is_anonymous then null else coalesce(p_email, p_name || '@example.test') end, '{}'::jsonb,
          '{"provider":"email","providers":["email"]}'::jsonb || v_meta,
          case when p_email_confirmed and not p_is_anonymous then now() end, p_is_anonymous, now(), now());

  if p_date_of_birth is not null then
    update public.profiles
       set date_of_birth = p_date_of_birth, birthdate_recorded_at = now()
     where id = v_id;
  end if;

  insert into tests.fixtures (name, id) values (p_name, v_id);
  return v_id;
end;
$$;

-- Grant the admin role to a fixture directly (works whether or not the target
-- database already has administrators).
create function tests.make_admin(p_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  select f.id, 'admin' from tests.fixtures f where f.name = p_name
  on conflict do nothing;
end;
$$;

create function tests.id(p_name text) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from tests.fixtures f where f.name = p_name
$$;

-- Act as a signed-in user, exactly as PostgREST does for a verified JWT.
create function tests.authenticate_as(p_name text) returns void
language plpgsql
as $$
declare
  v_id uuid := tests.id(p_name);
begin
  if v_id is null then
    raise exception 'unknown test fixture %', p_name;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
end;
$$;

create function tests.authenticate_as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

create function tests.authenticate_as_service_role() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end;
$$;

-- Return to the migration owner (postgres) for arranging fixtures.
create function tests.clear_authentication() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Walk a coach through the real verification flow: the coach submits evidence,
-- then an admin approves it. Leaves the session as the migration owner.
create function tests.verify_coach(p_coach text, p_admin text) returns void
language plpgsql
as $$
begin
  perform tests.authenticate_as(p_coach);
  perform public.submit_coach_affiliation('Example State University', 'Assistant Coach',
                                          'https://athletics.example.test/staff/coach');
  perform tests.authenticate_as(p_admin);
  perform public.admin_review_coach(tests.id(p_coach), 'approve', 'Listed on official staff directory.');
  perform tests.clear_authentication();
end;
$$;

create function tests.ok(p_condition boolean, p_description text) returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAIL: %', p_description using errcode = 'BRT01';
  end if;
  insert into tests.results (description) values (p_description);
  raise notice 'PASS: %', p_description;
end;
$$;

-- Assert that running p_sql (as the current role) raises an error.
-- p_errcode: expected SQLSTATE, or null to accept any error.
create function tests.throws(p_sql text, p_errcode text, p_description text) returns void
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    if p_errcode is null or v_state = p_errcode then
      insert into tests.results (description) values (p_description);
      raise notice 'PASS: % [raised % — %]', p_description, v_state, v_message;
      return;
    end if;
    raise exception 'FAIL: % — expected SQLSTATE %, got % (%)', p_description, p_errcode, v_state, v_message
      using errcode = 'BRT01';
  end;
  raise exception 'FAIL: % — expected an error, but the statement succeeded', p_description
    using errcode = 'BRT01';
end;
$$;

-- Assert that running p_sql does not raise.
create function tests.lives(p_sql text, p_description text) returns void
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    raise exception 'FAIL: % — unexpected error % (%)', p_description, v_state, v_message
      using errcode = 'BRT01';
  end;
  insert into tests.results (description) values (p_description);
  raise notice 'PASS: %', p_description;
end;
$$;

-- Count rows the current role can see for a query (RLS applies).
create function tests.visible_count(p_sql text) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from (%s) as visible', p_sql) into v_count;
  return v_count;
end;
$$;

-- Rows affected by an UPDATE/DELETE/INSERT run as the current role.
create function tests.affected_rows(p_sql text) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function tests.finish() returns text
language sql
as $$
  select format('%s assertions passed', count(*)) from tests.results
$$;
