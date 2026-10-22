-- =============================================================================
-- Base Recruits — Stage 1 / Migration 5: auth hooks, onboarding, role admin
--
-- Signup metadata accepted from the client: account_type (athlete | parent |
-- coach) and display_name. Anything else — including an attempt to sign up as
-- admin — is ignored, and anonymous Supabase sessions never receive a role.
-- Date of birth is NOT sent as signup metadata (metadata is copied into JWTs);
-- the app records it through admin_record_birthdate() immediately after
-- signUp, or record_birthdate() during onboarding.
--
-- Role selection happens once (profiles.role_selected_at). Removing a role is
-- an admin decision the user cannot undo: removing "coach" revokes the coach's
-- verification; removing "parent" ends every family link that account holds.
-- =============================================================================

create function private.provision_role(
  p_user_id uuid,
  p_role public.app_role,
  p_granted_by uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmed boolean;
begin
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, p_role, p_granted_by)
  on conflict (user_id, role) do nothing;

  -- Any role, self-selected or admin-granted, completes the one-time role step,
  -- so onboarding can never be used later to add or restore a role.
  update public.profiles p
     set role_selected_at = coalesce(p.role_selected_at, now())
   where p.id = p_user_id;

  if p_role = 'athlete' then
    insert into public.athletes (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  elsif p_role = 'coach' then
    select u.email, u.email_confirmed_at is not null into v_email, v_confirmed
      from auth.users u where u.id = p_user_id;
    if v_email is null then
      raise exception 'coach accounts need an institutional email address' using errcode = 'BR003';
    end if;
    -- An existing coach record keeps its status (a re-granted role never
    -- restores a verification that was revoked when the role was removed).
    insert into public.coaches (user_id, work_email)
    values (p_user_id, v_email)
    on conflict (user_id) do nothing;
    if found then
      insert into public.coach_verification_events (coach_id, from_status, to_status, actor_kind, note)
      values (p_user_id, null, 'unverified', 'system', 'Coach account created.');
      if v_confirmed then
        perform private.transition_coach_status(p_user_id, 'email_verified', 'system', null,
          'Institutional email confirmed. Next: submit your official staff directory listing.', true);
      end if;
    end if;
  end if;

  perform private.log_audit('role.granted', 'user_role', p_role::text, p_user_id,
                            jsonb_build_object('role', p_role, 'self_selected', p_granted_by is null),
                            coalesce(p_granted_by, p_user_id));
end;
$$;
revoke all on function private.provision_role(uuid, public.app_role, uuid) from public;

-- -----------------------------------------------------------------------------
-- After a Supabase Auth user is created
-- -----------------------------------------------------------------------------
create function private.handle_new_auth_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'account_type', '')), '');
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  -- Read via jsonb so the trigger also works on Auth versions without the column.
  v_anonymous boolean := coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
  v_role public.app_role;
begin
  if v_type in ('athlete', 'parent', 'coach') and not v_anonymous then
    v_role := v_type::public.app_role;
  end if;
  if v_name is not null then
    v_name := left(v_name, 80);
  end if;

  insert into public.profiles (id, display_name, primary_role, role_selected_at)
  values (new.id, v_name, v_role, case when v_role is not null then now() end);

  insert into public.user_settings (user_id) values (new.id);

  perform private.log_audit('account.created', 'profile', new.id::text, new.id,
                            jsonb_build_object('account_type', v_role, 'anonymous', v_anonymous), new.id);

  if v_role is not null then
    perform private.provision_role(new.id, v_role, null);
  end if;

  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- After email confirmation or an email change
-- -----------------------------------------------------------------------------
create function private.handle_auth_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach public.coaches%rowtype;
  v_confirmed boolean := new.email_confirmed_at is not null;
begin
  select * into v_coach from public.coaches c where c.user_id = new.id for update;
  if not found then
    return new;
  end if;
  -- Soft-deleted users (Supabase may replace the email with an opaque value)
  -- and malformed addresses are left alone: is_verified_coach() compares the
  -- account email with the reviewed email, so access is already gone.
  if (to_jsonb(new) ->> 'deleted_at') is not null
     or (new.email is not null and new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return new;
  end if;

  if new.email is distinct from old.email and new.email is not null then
    update public.coaches c set work_email = new.email where c.user_id = new.id;

    if v_coach.verification_status = 'verified' then
      perform private.transition_coach_status(new.id, 'reverification_required', 'system', null,
        'Your work email changed. Submit your current staff listing to restore coach access.', true);
    elsif v_coach.verification_status = 'suspended' then
      -- The reviewed email no longer applies, so the suspension can only be
      -- lifted to re-verification, never straight back to verified.
      update public.coaches c
         set status_before_suspension = case when c.status_before_suspension in ('verified', 'reverification_required')
                                             then 'reverification_required'::public.coach_verification_status
                                             else 'more_info_requested'::public.coach_verification_status end,
             verified_until = null, verified_email = null
       where c.user_id = new.id;
      insert into public.coach_verification_events (coach_id, from_status, to_status, actor_kind, note)
      values (new.id, 'suspended', 'suspended', 'system',
              'Work email changed while suspended. New evidence will be required.');
    elsif v_coach.verification_status in ('affiliation_under_review', 'more_info_requested') then
      perform private.transition_coach_status(new.id, 'email_verified', 'system', null,
        'Your work email changed, so your pending application was reset. Please resubmit.', true);
      if not v_confirmed then
        perform private.transition_coach_status(new.id, 'unverified', 'system', null,
          'Confirm your new work email to continue.', true);
      end if;
    elsif v_coach.verification_status = 'email_verified' and not v_confirmed then
      perform private.transition_coach_status(new.id, 'unverified', 'system', null,
        'Confirm your new work email to continue.', true);
    elsif v_coach.verification_status = 'unverified' and v_confirmed then
      perform private.transition_coach_status(new.id, 'email_verified', 'system', null,
        'Institutional email confirmed. Next: submit your official staff directory listing.', true);
    else
      insert into public.coach_verification_events (coach_id, from_status, to_status, actor_kind, note, visible_to_coach)
      values (new.id, v_coach.verification_status, v_coach.verification_status, 'system',
              'Work email changed.', false);
    end if;
  elsif old.email_confirmed_at is null and v_confirmed and v_coach.verification_status = 'unverified' then
    perform private.transition_coach_status(new.id, 'email_verified', 'system', null,
      'Institutional email confirmed. Next: submit your official staff directory listing.', true);
  end if;

  return new;
end;
$$;
revoke all on function private.handle_auth_user_email_change() from public;

create trigger on_auth_user_email_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_email_change();

-- -----------------------------------------------------------------------------
-- Onboarding RPCs
-- -----------------------------------------------------------------------------

-- One-time role choice for accounts created without a valid account_type
-- (e.g. by an admin invite). Cannot be used to restore a removed role.
create function public.complete_onboarding(p_account_type public.app_role, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := nullif(btrim(p_display_name), '');
  v_selected_at timestamptz;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if p_account_type is null or p_account_type not in ('athlete', 'parent', 'coach') then
    raise exception 'choose athlete, parent/guardian or coach' using errcode = 'BR003';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'name is too long (80 characters max)' using errcode = 'BR003';
  end if;
  if exists (select 1 from auth.users u
              where u.id = v_uid and coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)) then
    raise exception 'create an account to choose a role' using errcode = 'BR002';
  end if;

  -- Lock the profile so concurrent calls cannot both succeed.
  select p.role_selected_at into v_selected_at from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = 'BR003';
  end if;
  if v_selected_at is not null or exists (select 1 from public.user_roles r where r.user_id = v_uid) then
    raise exception 'onboarding is already complete' using errcode = 'BR004';
  end if;

  update public.profiles p
     set primary_role = p_account_type,
         role_selected_at = now(),
         display_name = coalesce(v_name, p.display_name)
   where p.id = v_uid;

  perform private.provision_role(v_uid, p_account_type, null);
end;
$$;

-- 'invalid' | 'under_minimum_age' | 'minor' | 'adult'
create function private.birthdate_band(p_date_of_birth date) returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_date_of_birth is null or p_date_of_birth > private.today_utc()
         or p_date_of_birth < private.today_utc() - interval '120 years' then 'invalid'
    when private.age_in_years(p_date_of_birth) < 13 then 'under_minimum_age'
    when private.age_in_years(p_date_of_birth) < 18 then 'minor'
    else 'adult'
  end
$$;
revoke all on function private.birthdate_band(date) from public;

-- Shared by both recording paths. An under-13 answer stores no date, blocks any
-- retry on this account and returns 'under_minimum_age'; the app then signs the
-- person out and deletes the account.
create function private.apply_birthdate(p_user_id uuid, p_date_of_birth date, p_source text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_band text := private.birthdate_band(p_date_of_birth);
begin
  select * into v_profile from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'no account awaiting a date of birth' using errcode = 'BR004';
  end if;
  if v_profile.age_screen_blocked_at is not null then
    raise exception 'Base Recruits accounts are for people 13 and older' using errcode = 'BR013';
  end if;
  if v_profile.date_of_birth is not null then
    raise exception 'date of birth is already recorded; contact support to correct it' using errcode = 'BR004';
  end if;
  if v_band = 'invalid' then
    raise exception 'enter a valid date of birth' using errcode = 'BR003';
  end if;

  if v_band = 'under_minimum_age' then
    update public.profiles p set age_screen_blocked_at = now() where p.id = p_user_id;
    perform private.log_audit('profile.age_screen_blocked', 'profile', p_user_id::text, p_user_id,
                              jsonb_build_object('source', p_source), p_user_id);
    return v_band;
  end if;

  update public.profiles p
     set date_of_birth = p_date_of_birth, birthdate_recorded_at = now()
   where p.id = p_user_id;
  perform private.log_audit('profile.birthdate_recorded', 'profile', p_user_id::text, p_user_id,
                            jsonb_build_object('age_band', v_band, 'source', p_source), p_user_id);
  return v_band;
end;
$$;
revoke all on function private.apply_birthdate(uuid, date, text) from public;

-- Self-service, once. Returns 'minor', 'adult' or 'under_minimum_age'.
create function public.record_birthdate(p_date_of_birth date) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  return private.apply_birthdate(v_uid, p_date_of_birth, 'onboarding');
end;
$$;

-- Server-only (service role), called right after signUp with the date of birth
-- from the neutral age screen. Only works for a brand-new account.
create function public.admin_record_birthdate(p_user_id uuid, p_date_of_birth date) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = p_user_id and p.created_at > now() - interval '1 hour') then
    raise exception 'no new account awaiting a date of birth' using errcode = 'BR004';
  end if;
  return private.apply_birthdate(p_user_id, p_date_of_birth, 'signup');
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin role management (serialized so concurrent changes cannot remove the
-- last admin or race each other)
-- -----------------------------------------------------------------------------
create function public.admin_grant_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('base_recruits.role_administration', 0));
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'account not found' using errcode = 'BR003';
  end if;
  perform private.provision_role(p_user_id, p_role, v_uid);
end;
$$;

create function public.admin_revoke_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.coach_verification_status;
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('base_recruits.role_administration', 0));
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  if p_role = 'admin'
     and private.has_role(p_user_id, 'admin')
     and (select count(*) from public.user_roles r where r.role = 'admin') <= 1 then
    raise exception 'cannot remove the last admin' using errcode = 'BR004';
  end if;

  delete from public.user_roles r where r.user_id = p_user_id and r.role = p_role;
  if not found then
    raise exception 'the account does not have that role' using errcode = 'BR003';
  end if;

  if p_role = 'coach' then
    select c.verification_status into v_status from public.coaches c where c.user_id = p_user_id;
    if found and v_status not in ('rejected', 'revoked') then
      perform private.transition_coach_status(p_user_id, 'revoked', 'admin', v_uid,
        'Coach role removed by an administrator.', true);
    end if;
  elsif p_role = 'parent' then
    for v_link in
      select l.id from public.family_links l where l.guardian_id = p_user_id and l.status <> 'ended'
    loop
      perform private.end_family_link_internal(v_link, v_uid, 'guardian_role_removed');
    end loop;
  elsif p_role = 'athlete' then
    -- Sharing stops and family links end; a later re-grant starts from nothing.
    perform 1 from public.athletes a where a.user_id = p_user_id for update;
    update public.consent_grants g
       set status = 'revoked', revoked_at = now(), revoked_by = v_uid, revocation_reason = 'athlete_role_removed'
     where g.athlete_id = p_user_id and g.status in ('pending_guardian', 'active');
    for v_link in
      select l.id from public.family_links l where l.athlete_id = p_user_id and l.status <> 'ended'
    loop
      perform private.end_family_link_internal(v_link, v_uid, 'athlete_role_removed');
    end loop;
  end if;

  perform private.log_audit('role.revoked', 'user_role', p_role::text, p_user_id,
                            jsonb_build_object('role', p_role), v_uid);
end;
$$;

-- One-time bootstrap, run by the database owner (SQL editor / psql) when no
-- admin exists yet:  select private.bootstrap_first_admin('you@yourdomain.com');
create function private.bootstrap_first_admin(p_email text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('base_recruits.role_administration', 0));
  if exists (select 1 from public.user_roles r where r.role = 'admin') then
    raise exception 'an admin already exists; use admin_grant_role()' using errcode = 'BR004';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no account with that email' using errcode = 'BR003';
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'admin');
  perform private.log_audit('role.granted', 'user_role', 'admin', v_user,
                            jsonb_build_object('role', 'admin', 'bootstrap', true), null);
  return v_user;
end;
$$;
revoke all on function private.bootstrap_first_admin(text) from public;

-- -----------------------------------------------------------------------------
-- Scheduled maintenance entry point (schedule daily with pg_cron; see README)
-- -----------------------------------------------------------------------------
create function private.run_scheduled_maintenance() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'coach_verifications_expired', private.expire_coach_verifications(),
    'consent_grants_expired', private.expire_consent_grants(),
    'family_links_needing_reconsent', private.process_majority_transitions(),
    'ran_at', now());
end;
$$;
revoke all on function private.run_scheduled_maintenance() from public;
grant execute on function private.run_scheduled_maintenance() to service_role;

-- -----------------------------------------------------------------------------
-- RPC privileges: authenticated only (admin_record_birthdate: service role only)
-- -----------------------------------------------------------------------------
revoke all on function public.complete_onboarding(public.app_role, text) from public, anon, authenticated, service_role;
revoke all on function public.record_birthdate(date) from public, anon, authenticated, service_role;
revoke all on function public.admin_record_birthdate(uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.admin_grant_role(uuid, public.app_role) from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_role(uuid, public.app_role) from public, anon, authenticated, service_role;

grant execute on function public.complete_onboarding(public.app_role, text) to authenticated;
grant execute on function public.record_birthdate(date) to authenticated;
grant execute on function public.admin_record_birthdate(uuid, date) to service_role;
grant execute on function public.admin_grant_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_revoke_role(uuid, public.app_role) to authenticated;
