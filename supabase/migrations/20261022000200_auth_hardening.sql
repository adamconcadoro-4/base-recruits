-- =============================================================================
-- Base Recruits — Stage 1 / Migration 8: sign-up and review hardening
--
-- From the independent review of the app layer:
--
-- 1. Sign-up metadata is no longer used at all. Anyone can create an
--    unconfirmed account for someone else's email through the public Auth API
--    and attach a role or name to it. Roles and names now come only from the
--    verified owner (complete_onboarding, after the email code) or from an
--    administrator (admin_grant_role).
-- 2. Staff-directory links may not carry a user name or password. In
--    https://school.edu@other.example/ the real site is other.example, which
--    could mislead a reviewer into verifying a fake coach.
-- 3. public.guardian_consent_requests(): what a parent or legal guardian can
--    approve right now, including active grants that need re-approval, with
--    the same rules as approve_consent_as_guardian().
-- =============================================================================

create or replace function private.handle_new_auth_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every account starts with no role and no name; the verified owner chooses
  -- them once (complete_onboarding). Metadata sent with the sign-up is ignored.
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);

  perform private.log_audit('account.created', 'profile', new.id::text, new.id,
                            jsonb_build_object('confirmed_at_creation', new.email_confirmed_at is not null,
                                               'anonymous', coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false)),
                            new.id);
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public;

alter table public.coaches
  add constraint coaches_staff_directory_url_no_credentials
  check (staff_directory_url is null or staff_directory_url !~* '^https://[^/?#]*@');

create function public.guardian_consent_requests()
returns table (
  grant_id uuid,
  athlete_id uuid,
  athlete_name text,
  scope public.consent_scope,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.athlete_id, p.display_name, g.scope, g.created_at
    from public.consent_grants g
    join public.profiles p on p.id = g.athlete_id
   where private.guardian_oversees((select auth.uid()), g.athlete_id, g.scope, g.grantee_id)
     and (g.expires_at is null or g.expires_at > now())
     and (g.status = 'pending_guardian'
          or (g.status = 'active'
              and private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
              and not private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)))
   order by g.created_at
$$;
comment on function public.guardian_consent_requests() is
  'Permissions a signed-in parent or legal guardian can approve now for the minors they are linked to.';

revoke all on function public.guardian_consent_requests() from public, anon, authenticated, service_role;
grant execute on function public.guardian_consent_requests() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Unconfirmed sign-ups expire after 24 hours, so an account someone created
--    for another person's email does not linger. They hold no data: nothing is
--    recorded about an account until its owner confirms the email.
-- -----------------------------------------------------------------------------
create function private.delete_stale_unconfirmed_accounts() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from auth.users u
   where u.email_confirmed_at is null
     and (to_jsonb(u) ->> 'phone_confirmed_at') is null
     and not coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)
     and u.created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.delete_stale_unconfirmed_accounts() from public;

create or replace function private.run_scheduled_maintenance() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'coach_verifications_expired', private.expire_coach_verifications(),
    'consent_grants_expired', private.expire_consent_grants(),
    'family_links_needing_reconsent', private.process_majority_transitions(),
    'unconfirmed_accounts_deleted', private.delete_stale_unconfirmed_accounts(),
    'ran_at', now());
end;
$$;
revoke all on function private.run_scheduled_maintenance() from public;
grant execute on function private.run_scheduled_maintenance() to service_role;

-- -----------------------------------------------------------------------------
-- 5. (Second review) Nothing set before an email is confirmed survives the
--    confirmation, whichever Supabase path confirms it (code, a link in any
--    email template, an administrator). Anyone can pre-register someone else's
--    email with a password; at confirmation that password and any sign-up
--    metadata are wiped, so the verified owner sets the only password (the app
--    does so immediately after the code is checked; a failed attempt leaves the
--    account with no password, and the owner can reset it by code).
-- -----------------------------------------------------------------------------
create function private.reset_credentials_on_confirmation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    new.encrypted_password := '';
    new.raw_user_meta_data := '{}'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_credentials_on_confirmation() from public;

create trigger before_auth_user_confirmed
  before update on auth.users
  for each row execute function private.reset_credentials_on_confirmation();

-- -----------------------------------------------------------------------------
-- 6. (Second review) Email changes are not offered yet, and a confirmation sent
--    to someone else's address could hand the requester that address (for
--    example a coach's). Requests to change the email are refused until the app
--    supports them with re-verification. Administrators (service role) can
--    still correct an email directly.
-- -----------------------------------------------------------------------------
create function private.refuse_email_change_requests() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change then
    raise exception 'changing your email is not available yet' using errcode = 'BR004';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_email_change_requests() from public;

create trigger before_auth_user_email_change_request
  before update of email_change on auth.users
  for each row execute function private.refuse_email_change_requests();

-- -----------------------------------------------------------------------------
-- 7. (Second review) Parent, guardian and coach roles need a recorded adult
--    date of birth, enforced here and not only in the app.
-- -----------------------------------------------------------------------------
create or replace function public.complete_onboarding(p_account_type public.app_role, p_display_name text default null)
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
  if p_account_type in ('parent', 'coach') and not private.is_adult(v_uid) then
    raise exception 'parent, guardian and coach accounts are for adults; record your date of birth first'
      using errcode = 'BR004';
  end if;

  update public.profiles p
     set primary_role = p_account_type,
         role_selected_at = now(),
         display_name = coalesce(v_name, p.display_name)
   where p.id = v_uid;

  perform private.provision_role(v_uid, p_account_type, null);
end;
$$;
