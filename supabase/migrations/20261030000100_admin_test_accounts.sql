-- =============================================================================
-- Test accounts: administrators try the site as a player or a parent
-- =============================================================================
-- Founder's request (2026-10-30): an administrator can upload videos as if they
-- were a player or a parent, to test every part of the site.
--
-- An administrator never signs in as a real person. Instead the site creates
-- separate test accounts that belong to no one:
--   * the server creates the Auth account with the service role, on an address
--     at a domain no one receives mail for, and stamps its app metadata
--     (writable only by the service role) with the administrator's id;
--   * admin_setup_test_family(), called as that administrator, accepts only
--     brand-new accounts carrying that stamp, gives them a role and a date of
--     birth, and records them in test_accounts. A player 18 or older can
--     exercise video uploads and SeamState; a player under 18 shows the minor
--     protections. A linked parent can be added with assessments shared, so the
--     parent's side can be tested too;
--   * admin_test_account_email() lets an administrator switch the browser to a
--     recorded test account (the server signs in with a one-time link it never
--     sends). Real accounts are never in test_accounts, so they cannot be used.
--
-- Test accounts go through the same rules as everyone else (age, consent, the
-- 18+ upload rule, SeamState limits per person). Their SeamState requests are
-- real paid requests, so they count toward the site-wide monthly limit. They
-- never appear to college coaches through search or audience-wide sharing.
-- =============================================================================

create table public.test_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kind public.app_role not null
    constraint test_accounts_kind check (kind in ('athlete', 'parent')),
  family_number integer not null
    constraint test_accounts_family_number check (family_number between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.test_accounts is
  'Accounts administrators created to test the site as a player or parent. No real person owns them.';

create unique index test_accounts_one_kind_per_family on public.test_accounts (family_number, kind);

create trigger test_accounts_audit
  after insert or delete on public.test_accounts
  for each row execute function private.audit_row_change('user_id', 'user_id', 'kind', 'family_number', 'created_by');

alter table public.test_accounts enable row level security;
revoke all on table public.test_accounts from anon, authenticated, service_role;
grant select on table public.test_accounts to authenticated;

create policy test_accounts_select_own_or_admin on public.test_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create function private.is_test_account(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.test_accounts t where t.user_id = p_user_id)
$$;
revoke all on function private.is_test_account(uuid) from public;

-- -----------------------------------------------------------------------------
-- Set up a test player (and optionally a linked parent) the server just created
-- -----------------------------------------------------------------------------
create function public.admin_setup_test_family(
  p_athlete_id uuid,
  p_parent_id uuid default null,
  p_athlete_under_18 boolean default false
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_number integer;
  v_account uuid;
  v_kind public.app_role;
  v_link uuid;
  v_grant uuid;
  v_today date := private.today_utc();
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  if p_athlete_id is null or p_athlete_id = p_parent_id then
    raise exception 'a test family needs a player account' using errcode = 'BR003';
  end if;

  -- One at a time, so family numbers and the limit stay consistent.
  perform pg_advisory_xact_lock(hashtextextended('base_recruits.test_accounts', 0));
  if (select count(*) from public.test_accounts t where t.kind = 'athlete') >= 20 then
    raise exception 'there are already 20 test players; reuse one of them' using errcode = 'BR004';
  end if;
  select coalesce(max(t.family_number), 0) + 1 into v_number from public.test_accounts t;

  foreach v_account in array array_remove(array[p_athlete_id, p_parent_id], null)
  loop
    -- Only accounts the server created for this administrator moments ago, with
    -- nothing on them yet. The stamp is app metadata, which only the service
    -- role can write, so a real person's account can never qualify.
    if not exists (
      select 1 from auth.users u join public.profiles p on p.id = u.id
       where u.id = v_account
         and u.raw_app_meta_data ->> 'br_test_account_requested_by' = v_uid::text
         and p.created_at > now() - interval '15 minutes'
         and p.role_selected_at is null
         and p.date_of_birth is null
         and p.age_screen_blocked_at is null
         and not exists (select 1 from public.user_roles r where r.user_id = v_account)
         and not exists (select 1 from public.test_accounts t where t.user_id = v_account)
    ) then
      raise exception 'that account was not created as a test account by you' using errcode = 'BR002';
    end if;

    v_kind := case when v_account = p_athlete_id then 'athlete' else 'parent' end;
    perform private.apply_birthdate(
      v_account,
      case
        when v_kind = 'parent' then (v_today - interval '45 years')::date
        when p_athlete_under_18 then (v_today - interval '16 years')::date
        else (v_today - interval '19 years')::date
      end,
      'test_account');
    update public.profiles p
       set display_name = case
             when v_kind = 'parent' then format('Test parent %s', v_number)
             when p_athlete_under_18 then format('Test player %s (under 18)', v_number)
             else format('Test player %s (18+)', v_number)
           end,
           primary_role = v_kind
     where p.id = v_account;
    perform private.provision_role(v_account, v_kind, v_uid);
    insert into public.test_accounts (user_id, kind, family_number, created_by)
    values (v_account, v_kind, v_number, v_uid);
  end loop;

  if p_parent_id is not null then
    -- What the real flow ends in (the player's code, the parent redeems it, the
    -- player approves, then shares assessments), recorded in one step.
    insert into public.family_links (athlete_id, guardian_id, relationship, status, established_while_minor, approved_at)
    values (p_athlete_id, p_parent_id, 'parent', 'active', private.is_minor(p_athlete_id), now())
    returning id into v_link;
    insert into public.consent_grants
      (athlete_id, scope, audience, grantee_id, status, granted_by, consent_text_version, activated_at)
    values
      (p_athlete_id, 'family_assessments', 'specific_user', p_parent_id, 'active', p_athlete_id,
       'family-assessments-v1', now())
    returning id into v_grant;
  end if;

  perform private.log_audit('test_account.family_created', 'test_account', v_number::text, p_athlete_id,
                            jsonb_build_object('family_number', v_number, 'with_parent', p_parent_id is not null,
                                               'athlete_under_18', p_athlete_under_18, 'family_link_id', v_link,
                                               'grant_id', v_grant),
                            v_uid);
  return v_number;
end;
$$;

-- -----------------------------------------------------------------------------
-- The email the server signs in with when an administrator switches to a test
-- account. Refuses every account that is not in test_accounts.
-- -----------------------------------------------------------------------------
create function public.admin_test_account_email(p_user_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  select u.email into v_email
    from public.test_accounts t join auth.users u on u.id = t.user_id
   where t.user_id = p_user_id;
  if v_email is null then
    raise exception 'test account not found' using errcode = 'BR003';
  end if;
  perform private.log_audit('test_account.opened', 'test_account', p_user_id::text, p_user_id, '{}'::jsonb, v_uid);
  return v_email;
end;
$$;

revoke all on function public.admin_setup_test_family(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_test_account_email(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_setup_test_family(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_test_account_email(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- College coaches never find a test player through search or audience-wide
-- sharing. A report shared with one named coach still works, so that flow can
-- be tested with a coach the administrator chooses.
-- -----------------------------------------------------------------------------
create or replace function private.coach_can_view(p_coach_id uuid, p_athlete_id uuid, p_scope public.consent_scope) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_verified_coach(p_coach_id)
     and private.has_role(p_athlete_id, 'athlete')
     and (
       (p_scope <> 'document_access'
        and not private.is_test_account(p_athlete_id)
        and private.has_active_grant(p_athlete_id, p_scope, 'verified_coaches')
        and private.has_active_grant(p_athlete_id, 'coach_discovery', 'verified_coaches'))
       or private.has_active_grant(p_athlete_id, p_scope, 'specific_user', p_coach_id)
     )
$$;
