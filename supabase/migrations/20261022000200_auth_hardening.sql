-- =============================================================================
-- Base Recruits — Stage 1 / Migration 8: sign-up and review hardening
--
-- From the independent review of the app layer:
--
-- 1. Sign-up metadata on an UNCONFIRMED account is no longer trusted. Anyone can
--    create an unconfirmed account for someone else's email through the public
--    Auth API and attach a role or name to it. Roles and names now come only
--    from the verified owner (complete_onboarding, after the email code), or from
--    accounts created already confirmed (administrator-created accounts).
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
declare
  -- Metadata is trusted only when the account is created already confirmed
  -- (for example by an administrator). Self-service sign-ups are unconfirmed
  -- at this point, and anyone can create one for any email address.
  v_trusted boolean := new.email_confirmed_at is not null
                       and not coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
  v_type text := case when v_trusted
                      then nullif(btrim(coalesce(new.raw_user_meta_data ->> 'account_type', '')), '') end;
  v_name text := case when v_trusted
                      then nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '') end;
  v_role public.app_role;
begin
  if v_type in ('athlete', 'parent', 'coach') then
    v_role := v_type::public.app_role;
  end if;
  if v_name is not null then
    v_name := left(v_name, 80);
  end if;

  insert into public.profiles (id, display_name, primary_role, role_selected_at)
  values (new.id, v_name, v_role, case when v_role is not null then now() end);

  insert into public.user_settings (user_id) values (new.id);

  perform private.log_audit('account.created', 'profile', new.id::text, new.id,
                            jsonb_build_object('account_type', v_role,
                                               'confirmed_at_creation', new.email_confirmed_at is not null,
                                               'anonymous', coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false)),
                            new.id);

  if v_role is not null then
    perform private.provision_role(new.id, v_role, null);
  end if;

  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public;

alter table public.coaches
  add constraint coaches_staff_directory_url_no_credentials
  check (staff_directory_url is null or staff_directory_url !~ '^https://[^/?#]*@');

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
