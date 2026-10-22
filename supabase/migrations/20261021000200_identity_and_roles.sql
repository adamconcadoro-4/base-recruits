-- =============================================================================
-- Base Recruits — Stage 1 / Migration 2: identity, roles, athletes
--
-- profiles      one row per auth user (created by the signup trigger)
-- user_roles    role memberships; never written directly by clients
-- user_settings per-user communication preferences
-- athletes      athlete record (Stage 4 extends it into the recruiting profile)
--
-- Date of birth lives only in profiles, which is readable by the owner and
-- admins. It drives the neutral age screen (no accounts under 13) and the
-- minor/adult rules for consent and family access.
--
-- The service role (server secret) gets no direct access to these tables:
-- server code acts as the signed-in user, or through a reviewed function.
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80),
  primary_role public.app_role,
  role_selected_at timestamptz,
  date_of_birth date
    constraint profiles_date_of_birth_plausible check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  birthdate_recorded_at timestamptz,
  age_screen_blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_blocked_has_no_birthdate check (age_screen_blocked_at is null or date_of_birth is null)
);
comment on table public.profiles is
  'One row per account. primary_role is null until a self-selectable role is chosen (role_selected_at, once).';
comment on column public.profiles.date_of_birth is
  'Owner and admins only. Used for the under-13 block and minor/adult rules; never copied into JWTs, logs or analytics.';
comment on column public.profiles.age_screen_blocked_at is
  'Set when an under-13 date of birth was entered. No date is stored and the age step cannot be retried.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profiles_audit
  after update of primary_role, role_selected_at, date_of_birth, age_screen_blocked_at on public.profiles
  for each row execute function private.audit_row_change(
    'id', 'id', 'primary_role', 'role_selected_at', '~date_of_birth', 'age_screen_blocked_at');

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);
comment on table public.user_roles is
  'Role memberships. Written only by the signup trigger and admin functions; clients can read their own.';
comment on column public.user_roles.granted_by is 'null = granted at self-signup or by the system.';

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function private.audit_row_change('user_id', 'user_id', 'role', 'granted_by');

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  product_email_opt_in boolean not null default true,
  marketing_email_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function private.set_updated_at();

create table public.athletes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  applicant_type public.applicant_type not null default 'first_year',
  graduation_year smallint
    constraint athletes_graduation_year_range check (graduation_year is null or graduation_year between 2000 and 2100),
  current_school_name text
    constraint athletes_current_school_name_length check (current_school_name is null or char_length(current_school_name) between 2 and 160),
  home_state text
    constraint athletes_home_state_format check (home_state is null or home_state ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.athletes is
  'Athlete record. Coach and guardian visibility is governed by consent_grants and family_links (see the consent migration).';

create trigger athletes_set_updated_at
  before update on public.athletes
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- -----------------------------------------------------------------------------
create function private.has_role(p_user_id uuid, p_role public.app_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.user_roles r where r.user_id = p_user_id and r.role = p_role
  )
$$;

create function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role((select auth.uid()), 'admin'::public.app_role)
$$;

create function private.age_in_years(p_date_of_birth date, p_on date default private.today_utc()) returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age(p_on::timestamp, p_date_of_birth::timestamp))::integer
$$;

-- Unknown age is treated as a minor: the protective default.
create function private.is_minor(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.age_in_years(p.date_of_birth) < 18
       from public.profiles p
      where p.id = p_user_id and p.date_of_birth is not null),
    true)
$$;

-- Adult = a recorded date of birth showing 18 or older. Unknown age is not adult.
create function private.is_adult(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.age_in_years(p.date_of_birth) >= 18
       from public.profiles p
      where p.id = p_user_id and p.date_of_birth is not null),
    false)
$$;

-- Accounts that answered the age screen with an under-13 date (pending deletion).
create function private.is_age_blocked(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.age_screen_blocked_at is not null)
$$;

create function private.has_recorded_birthdate(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.date_of_birth is not null)
$$;

revoke all on function private.has_role(uuid, public.app_role) from public;
revoke all on function private.is_admin() from public;
revoke all on function private.age_in_years(date, date) from public;
revoke all on function private.is_minor(uuid) from public;
revoke all on function private.is_adult(uuid) from public;
revoke all on function private.has_recorded_birthdate(uuid) from public;
revoke all on function private.is_age_blocked(uuid) from public;
grant execute on function private.is_age_blocked(uuid) to authenticated, service_role;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.age_in_years(date, date) to authenticated, service_role;
grant execute on function private.is_minor(uuid) to authenticated, service_role;
grant execute on function private.is_adult(uuid) to authenticated, service_role;
grant execute on function private.has_recorded_birthdate(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_settings enable row level security;
alter table public.athletes enable row level security;

revoke all on table public.profiles, public.user_roles, public.user_settings, public.athletes
  from anon, authenticated, service_role;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.user_roles to authenticated;

grant select on table public.user_settings to authenticated;
grant update (product_email_opt_in, marketing_email_opt_in) on table public.user_settings to authenticated;

grant select on table public.athletes to authenticated;
grant update (applicant_type, graduation_year, current_school_name, home_state)
  on table public.athletes to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not private.is_age_blocked((select auth.uid())))
  with check (id = (select auth.uid()));

create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_age_blocked((select auth.uid())))
  with check (user_id = (select auth.uid()));

create policy athletes_select_own_or_admin on public.athletes
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy athletes_update_own on public.athletes
  for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_age_blocked((select auth.uid())))
  with check (user_id = (select auth.uid()));

-- Audit log visibility (table created in the foundation migration).
create policy audit_events_select_own_or_admin on public.audit_events
  for select to authenticated
  using (subject_user_id = (select auth.uid())
         or actor_id = (select auth.uid())
         or private.is_admin());
