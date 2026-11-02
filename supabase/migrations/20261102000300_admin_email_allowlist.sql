-- =============================================================================
-- Administrator accounts are limited to two email addresses (founder request,
-- 2026-11-02: "it should only be someone with the email adamconcadoro@gmail.com
-- and jcaceres120@gmail.com"). Decision F55.
--
-- Three layers, so no path can make anyone else an administrator:
--   1. private.admin_allowed_emails holds the approved addresses. It can only
--      be changed by a migration (no API role can read or write it).
--   2. A trigger on public.user_roles refuses an admin role for any account
--      whose confirmed email is not on the list, whoever adds it (Admin page,
--      the first-admin bootstrap, or the database owner).
--   3. private.has_role(…, 'admin') also checks the list, so an admin row
--      only counts while the account's confirmed email is approved.
-- Accounts cannot change their email (decision F10), so the address an
-- administrator signed up with stays the one checked here.
-- =============================================================================

create table private.admin_allowed_emails (
  email text primary key
    constraint admin_allowed_emails_normalised check (email = lower(btrim(email)) and email like '%_@_%'),
  note text not null,
  added_at timestamptz not null default now()
);
revoke all on table private.admin_allowed_emails from public, anon, authenticated, service_role;

insert into private.admin_allowed_emails (email, note) values
  ('adamconcadoro@gmail.com', 'Founder'),
  ('jcaceres120@gmail.com', 'Jonathan Caceres, co-owner');

create function private.admin_email_allowed(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
      from auth.users u
      join private.admin_allowed_emails a on a.email = lower(btrim(u.email))
     where u.id = p_user_id
       and u.email_confirmed_at is not null
       and not coalesce(u.is_anonymous, false)
  )
$$;
revoke all on function private.admin_email_allowed(uuid) from public, anon, authenticated, service_role;

create or replace function private.has_role(p_user_id uuid, p_role public.app_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = p_role)
     and (p_role <> 'admin' or private.admin_email_allowed(p_user_id))
$$;

create function private.user_roles_admin_allowlist() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin' and not private.admin_email_allowed(new.user_id) then
    raise exception 'administrator access is limited to approved email addresses'
      using errcode = 'BR002';
  end if;
  return new;
end;
$$;
revoke all on function private.user_roles_admin_allowlist() from public, anon, authenticated, service_role;

create trigger user_roles_admin_allowlist
  before insert or update on public.user_roles
  for each row execute function private.user_roles_admin_allowlist();

-- Remove any administrator role held by an account that is not approved
-- (the deletion is audited by the existing user_roles audit trigger).
delete from public.user_roles r
 where r.role = 'admin'
   and not private.admin_email_allowed(r.user_id);
