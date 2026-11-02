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

  -- The sign-up trigger ignores metadata (anyone can attach it), so fixtures
  -- receive their role the way an owner does after verifying: once, below.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                          email_confirmed_at, is_anonymous, created_at, updated_at)
  values (v_id, 'authenticated', 'authenticated',
          case when p_is_anonymous then null else coalesce(p_email, p_name || '@example.test') end, v_meta,
          '{"provider":"email","providers":["email"]}'::jsonb,
          case when p_email_confirmed and not p_is_anonymous then now() end, p_is_anonymous, now(), now());

  -- Equivalent to the owner's one-time role choice (complete_onboarding):
  -- only self-selectable roles, never for anonymous sessions.
  if p_account_type in ('athlete', 'parent', 'coach', 'development_coach') and not p_is_anonymous then
    update public.profiles
       set primary_role = p_account_type::public.app_role, role_selected_at = now(),
           display_name = left(p_display_name, 80)
     where id = v_id;
    perform private.provision_role(v_id, p_account_type::public.app_role, null);
  elsif p_display_name is not null then
    update public.profiles set display_name = left(p_display_name, 80) where id = v_id;
  end if;

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
-- Approve a fixture's email for administrator access (decision F55). Rolled
-- back with the rest of the test, like every fixture.
create function tests.allow_admin_email(p_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.admin_allowed_emails (email, note)
  select lower(btrim(u.email)), 'test fixture'
    from tests.fixtures f join auth.users u on u.id = f.id
   where f.name = p_name
  on conflict do nothing;
end;
$$;

create function tests.make_admin(p_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.allow_admin_email(p_name);
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

-- Assessment: switch it on (and optionally video), as an administrator would.
create function tests.enable_assessment(p_video boolean default true) returns void
language sql
security definer
set search_path = ''
as $$
  update private.assessment_settings s set enabled = true, video_enabled = p_video where s.id
$$;

-- The real development-coach flow: the athlete creates a code, the coach
-- redeems it, the athlete approves. For a minor, p_guardian (a linked parent)
-- approves too. Leaves the session as the migration owner.
create function tests.link_development_coach(p_athlete text, p_coach text, p_guardian text default null) returns uuid
language plpgsql
as $$
declare
  v_code text;
  v_link uuid;
  v_grant uuid;
begin
  perform tests.authenticate_as(p_athlete);
  select code into v_code from public.create_development_coach_invite();
  perform tests.authenticate_as(p_coach);
  select link_id into v_link from public.redeem_development_coach_invite(v_code);
  perform tests.authenticate_as(p_athlete);
  perform public.approve_development_coach_link(v_link);
  if p_guardian is not null then
    perform tests.clear_authentication();
    select grant_id into v_grant from public.development_coach_links where id = v_link;
    perform tests.authenticate_as(p_guardian);
    perform public.approve_consent_as_guardian(v_grant);
  end if;
  perform tests.clear_authentication();
  return v_link;
end;
$$;

-- An approved parent link (the athlete's code, the parent redeems, the athlete approves).
create function tests.link_family(p_athlete text, p_parent text) returns uuid
language plpgsql
as $$
declare
  v_code text;
  v_link uuid;
begin
  perform tests.authenticate_as(p_athlete);
  select code into v_code from public.create_family_invite();
  perform tests.authenticate_as(p_parent);
  select link_id into v_link from public.redeem_family_invite(v_code, 'parent');
  perform tests.authenticate_as(p_athlete);
  perform public.approve_family_link(v_link);
  perform tests.clear_authentication();
  return v_link;
end;
$$;

-- Places a file in emulated (or real) storage as the database owner. Returns
-- false when this database has no storage schema or does not allow it.
create function tests.store_object(p_path text, p_size bigint default 1000, p_mime text default 'video/mp4') returns boolean
language plpgsql
as $$
begin
  if to_regclass('storage.objects') is null then
    return false;
  end if;
  execute 'insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)'
    using 'assessment-media', p_path, jsonb_build_object('size', p_size, 'mimetype', p_mime);
  return true;
exception when others then
  return false;
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
