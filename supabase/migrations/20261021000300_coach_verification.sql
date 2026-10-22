-- =============================================================================
-- Base Recruits — Stage 1 / Migration 3: coach accounts and verification
--
-- A coach account is NOT a verified coach. Protected coach features require
-- private.is_verified_coach(), which needs ALL of:
--   * the coach role,
--   * status 'verified', set only by an admin approving reviewed evidence,
--   * an unexpired verification window (re-verification is periodic),
--   * a confirmed account email equal to the email that was reviewed
--     (verified_email, captured at approval).
-- The email domain (.edu or otherwise) is evidence for the reviewer only — it
-- never grants access by itself. Leaving 'verified' for anything other than a
-- suspension clears the verification window, so access can only come back
-- through a new review; a suspension can only be lifted to the status the coach
-- held before it.
--
-- Verification is free. Nothing here (or anywhere) checks payment.
-- =============================================================================

create table public.coaches (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  work_email text not null
    constraint coaches_work_email_format check (work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_domain text generated always as (lower(split_part(work_email, '@', 2))) stored,
  institution_name_claimed text
    constraint coaches_institution_name_length check (institution_name_claimed is null or char_length(institution_name_claimed) between 2 and 200),
  institution_id uuid, -- linked to the institution registry in Stage 2
  coaching_title text
    constraint coaches_coaching_title_length check (coaching_title is null or char_length(coaching_title) between 2 and 120),
  staff_directory_url text
    constraint coaches_staff_directory_url_format check (staff_directory_url is null or (staff_directory_url ~* '^https://[^\s]+$' and char_length(staff_directory_url) <= 500)),
  verification_status public.coach_verification_status not null default 'unverified',
  status_before_suspension public.coach_verification_status,
  status_changed_at timestamptz not null default now(),
  affiliation_submitted_at timestamptz,
  verified_at timestamptz,
  verified_until timestamptz,
  verified_email text,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaches_verified_has_window check (
    verification_status <> 'verified'
    or (verified_at is not null and verified_until is not null and verified_email is not null and verified_until > verified_at)
  ),
  constraint coaches_suspension_remembers_prior_status check (
    (verification_status = 'suspended') = (status_before_suspension is not null)
  ),
  constraint coaches_window_only_when_verified check (
    verification_status in ('verified', 'suspended') or (verified_until is null and verified_email is null)
  )
);
comment on table public.coaches is
  'Coach accounts and their verification state. Changed only through submit_coach_affiliation(), admin_review_coach() and system triggers.';
comment on column public.coaches.verified_email is
  'The work email that the reviewer approved. Access requires the account email to still equal it.';

create index coaches_verification_status_idx on public.coaches (verification_status, status_changed_at);

create trigger coaches_set_updated_at
  before update on public.coaches
  for each row execute function private.set_updated_at();

create trigger coaches_audit
  after update of verification_status, verified_until, status_before_suspension, verified_email, work_email
  on public.coaches
  for each row execute function private.audit_row_change(
    'user_id', 'user_id', 'verification_status', 'verified_until', 'status_before_suspension',
    '~verified_email', '~work_email');

-- Allowed status changes, by who may make them. Every change goes through
-- private.transition_coach_status(), which rejects anything not listed here.
create table public.coach_status_transitions (
  from_status public.coach_verification_status not null,
  to_status public.coach_verification_status not null,
  actor_kind text not null constraint coach_status_transitions_actor check (actor_kind in ('system', 'coach', 'admin')),
  primary key (from_status, to_status, actor_kind)
);

insert into public.coach_status_transitions (from_status, to_status, actor_kind) values
  -- system: email confirmation, expiry, work-email changes
  ('unverified', 'email_verified', 'system'),
  ('verified', 'reverification_required', 'system'),
  ('affiliation_under_review', 'email_verified', 'system'),
  ('more_info_requested', 'email_verified', 'system'),
  ('email_verified', 'unverified', 'system'),
  -- coach: submit or resubmit affiliation evidence
  ('email_verified', 'affiliation_under_review', 'coach'),
  ('more_info_requested', 'affiliation_under_review', 'coach'),
  ('reverification_required', 'affiliation_under_review', 'coach'),
  -- admin: review decisions
  ('affiliation_under_review', 'verified', 'admin'),
  ('affiliation_under_review', 'more_info_requested', 'admin'),
  ('affiliation_under_review', 'rejected', 'admin'),
  -- admin: suspend, and lift a suspension back to the prior status only
  ('verified', 'suspended', 'admin'),
  ('reverification_required', 'suspended', 'admin'),
  ('affiliation_under_review', 'suspended', 'admin'),
  ('more_info_requested', 'suspended', 'admin'),
  ('suspended', 'verified', 'admin'),
  ('suspended', 'reverification_required', 'admin'),
  ('suspended', 'affiliation_under_review', 'admin'),
  ('suspended', 'more_info_requested', 'admin'),
  -- admin: revoke (also used when the coach role is removed)
  ('unverified', 'revoked', 'admin'),
  ('email_verified', 'revoked', 'admin'),
  ('affiliation_under_review', 'revoked', 'admin'),
  ('more_info_requested', 'revoked', 'admin'),
  ('verified', 'revoked', 'admin'),
  ('reverification_required', 'revoked', 'admin'),
  ('suspended', 'revoked', 'admin'),
  -- admin: reopen after an appeal; the coach must submit evidence again
  ('rejected', 'email_verified', 'admin'),
  ('revoked', 'email_verified', 'admin');

create table public.coach_verification_events (
  id bigint generated always as identity primary key,
  coach_id uuid not null references public.coaches (user_id) on delete cascade,
  from_status public.coach_verification_status,
  to_status public.coach_verification_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_kind text not null constraint coach_verification_events_actor check (actor_kind in ('system', 'coach', 'admin')),
  note text constraint coach_verification_events_note_length check (note is null or char_length(note) <= 2000),
  visible_to_coach boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.coach_verification_events is
  'Verification history. Notes marked visible_to_coach explain what the coach must do next (remediation).';

create index coach_verification_events_coach_idx on public.coach_verification_events (coach_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.is_verified_coach(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
      from public.coaches c
      join public.user_roles r on r.user_id = c.user_id and r.role = 'coach'
      join auth.users u on u.id = c.user_id
     where c.user_id = p_user_id
       and c.verification_status = 'verified'
       and c.verified_until > now()
       and u.email_confirmed_at is not null
       and lower(u.email) = lower(c.verified_email)
  )
$$;
revoke all on function private.is_verified_coach(uuid) from public;
grant execute on function private.is_verified_coach(uuid) to authenticated, service_role;

create function private.transition_coach_status(
  p_coach_id uuid,
  p_to public.coach_verification_status,
  p_actor_kind text,
  p_actor_id uuid,
  p_note text default null,
  p_visible_to_coach boolean default true,
  p_verified_until timestamptz default null
) returns public.coach_verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach public.coaches%rowtype;
  v_from public.coach_verification_status;
begin
  select * into v_coach from public.coaches c where c.user_id = p_coach_id for update;
  if not found then
    raise exception 'coach account not found' using errcode = 'BR003';
  end if;
  v_from := v_coach.verification_status;

  if not exists (
    select 1 from public.coach_status_transitions t
     where t.from_status = v_from and t.to_status = p_to and t.actor_kind = p_actor_kind
  ) then
    raise exception 'coach verification cannot change from % to % (%)', v_from, p_to, p_actor_kind
      using errcode = 'BR004';
  end if;

  if p_to = 'verified' and v_from = 'affiliation_under_review' then
    -- A new approval: capture the reviewed email and open a fresh window.
    if p_verified_until is null or p_verified_until <= now() then
      raise exception 'an approval needs a future verification end date' using errcode = 'BR003';
    end if;
    update public.coaches c
       set verification_status = 'verified', status_changed_at = now(), status_before_suspension = null,
           verified_at = now(), verified_until = p_verified_until, verified_email = c.work_email,
           verified_by = p_actor_id
     where c.user_id = p_coach_id;

  elsif p_to = 'verified' then
    -- Lifting a suspension: only back to a still-valid verification of the same email.
    if v_from <> 'suspended'
       or v_coach.status_before_suspension is distinct from 'verified'
       or v_coach.verified_until is null or v_coach.verified_until <= now()
       or not exists (select 1 from auth.users u
                       where u.id = p_coach_id and u.email_confirmed_at is not null
                         and lower(u.email) = lower(v_coach.verified_email)) then
      raise exception 'verification cannot be restored; the coach must be reviewed again' using errcode = 'BR004';
    end if;
    update public.coaches c
       set verification_status = 'verified', status_changed_at = now(), status_before_suspension = null
     where c.user_id = p_coach_id;

  elsif p_to = 'suspended' then
    update public.coaches c
       set verification_status = 'suspended', status_changed_at = now(), status_before_suspension = v_from
     where c.user_id = p_coach_id;

  else
    -- Any other status ends the verification window.
    update public.coaches c
       set verification_status = p_to, status_changed_at = now(), status_before_suspension = null,
           verified_until = null, verified_email = null
     where c.user_id = p_coach_id;
  end if;

  insert into public.coach_verification_events
    (coach_id, from_status, to_status, actor_id, actor_kind, note, visible_to_coach)
  values (p_coach_id, v_from, p_to, p_actor_id, p_actor_kind, p_note, p_visible_to_coach);

  perform private.log_audit(
    'coach_verification.status_changed', 'coach', p_coach_id::text, p_coach_id,
    jsonb_build_object('from', v_from, 'to', p_to, 'actor_kind', p_actor_kind),
    p_actor_id);

  return p_to;
end;
$$;
revoke all on function private.transition_coach_status(uuid, public.coach_verification_status, text, uuid, text, boolean, timestamptz) from public;

-- -----------------------------------------------------------------------------
-- Coach-facing RPC: submit (or resubmit) affiliation evidence
-- -----------------------------------------------------------------------------
create function public.submit_coach_affiliation(
  p_institution_name text,
  p_coaching_title text,
  p_staff_directory_url text,
  p_note text default null
) returns public.coach_verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.coach_verification_status;
  v_institution text := nullif(btrim(p_institution_name), '');
  v_title text := nullif(btrim(p_coaching_title), '');
  v_url text := nullif(btrim(p_staff_directory_url), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'coach') then
    raise exception 'only coach accounts can submit an affiliation' using errcode = 'BR002';
  end if;
  if not private.is_adult(v_uid) then
    raise exception 'complete the age step first; coach accounts must belong to adults' using errcode = 'BR004';
  end if;
  if v_institution is null or char_length(v_institution) not between 2 and 200 then
    raise exception 'institution name is required (2–200 characters)' using errcode = 'BR003';
  end if;
  if v_title is null or char_length(v_title) not between 2 and 120 then
    raise exception 'coaching title is required (2–120 characters)' using errcode = 'BR003';
  end if;
  if v_url is null or v_url !~* '^https://[^\s]+$' or char_length(v_url) > 500 then
    raise exception 'an https link to the official staff directory listing is required' using errcode = 'BR003';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'note is too long (2000 characters max)' using errcode = 'BR003';
  end if;

  select c.verification_status into v_status from public.coaches c where c.user_id = v_uid for update;
  if v_status = 'unverified' then
    raise exception 'confirm your institutional email address first' using errcode = 'BR004';
  elsif v_status = 'affiliation_under_review' then
    raise exception 'your staff listing is already under review' using errcode = 'BR004';
  elsif v_status = 'verified' then
    raise exception 'your coaching affiliation is already verified' using errcode = 'BR004';
  elsif v_status in ('suspended', 'rejected', 'revoked') then
    raise exception 'contact support to appeal before resubmitting' using errcode = 'BR004';
  end if;

  update public.coaches c
     set institution_name_claimed = v_institution,
         coaching_title = v_title,
         staff_directory_url = v_url,
         affiliation_submitted_at = now()
   where c.user_id = v_uid;

  return private.transition_coach_status(v_uid, 'affiliation_under_review', 'coach', v_uid, v_note, true);
end;
$$;
revoke all on function public.submit_coach_affiliation(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_coach_affiliation(text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin RPC: review decisions
--   approve | request_info | reject | suspend | reinstate | revoke | reopen
-- -----------------------------------------------------------------------------
create function public.admin_review_coach(
  p_coach_id uuid,
  p_decision text,
  p_note text default null,
  p_valid_days integer default 365
) returns public.coach_verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_coach public.coaches%rowtype;
  v_target public.coach_verification_status;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  if p_coach_id = v_uid then
    raise exception 'admins cannot review their own coach verification' using errcode = 'BR002';
  end if;
  if p_decision in ('request_info', 'reject', 'suspend', 'revoke') and v_note is null then
    raise exception 'a note explaining the decision is required' using errcode = 'BR003';
  end if;
  if p_valid_days is null or p_valid_days not between 30 and 730 then
    raise exception 'verification validity must be between 30 and 730 days' using errcode = 'BR003';
  end if;

  select * into v_coach from public.coaches c where c.user_id = p_coach_id for update;
  if not found then
    raise exception 'coach account not found' using errcode = 'BR003';
  end if;

  if p_decision = 'reinstate' then
    if v_coach.verification_status <> 'suspended' then
      raise exception 'only a suspended coach can be reinstated' using errcode = 'BR004';
    end if;
    -- Back to the prior status; a prior verification survives only if it is
    -- still valid for the same, confirmed email.
    v_target := v_coach.status_before_suspension;
    if v_target = 'verified' and not (
         v_coach.verified_until is not null and v_coach.verified_until > now()
         and exists (select 1 from auth.users u
                      where u.id = p_coach_id and u.email_confirmed_at is not null
                        and lower(u.email) = lower(v_coach.verified_email))) then
      v_target := 'reverification_required';
    end if;
  else
    v_target := case p_decision
      when 'approve' then 'verified'
      when 'request_info' then 'more_info_requested'
      when 'reject' then 'rejected'
      when 'suspend' then 'suspended'
      when 'revoke' then 'revoked'
      when 'reopen' then 'email_verified'
      else null
    end::public.coach_verification_status;
  end if;

  if v_target is null then
    raise exception 'unknown decision %', p_decision using errcode = 'BR003';
  end if;
  if p_decision = 'approve' and v_coach.verification_status <> 'affiliation_under_review' then
    raise exception 'only an application under review can be approved' using errcode = 'BR004';
  end if;

  return private.transition_coach_status(
    p_coach_id, v_target, 'admin', v_uid, v_note, true,
    case when p_decision = 'approve' then now() + make_interval(days => p_valid_days) end);
end;
$$;
revoke all on function public.admin_review_coach(uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_coach(uuid, text, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Scheduled: mark expired verifications. Access already stops at expiry because
-- private.is_verified_coach() checks verified_until; this keeps status honest.
-- -----------------------------------------------------------------------------
create function private.expire_coach_verifications() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
  v_count integer := 0;
begin
  for v_coach in
    select c.user_id from public.coaches c
     where c.verification_status = 'verified' and c.verified_until <= now()
  loop
    perform private.transition_coach_status(
      v_coach, 'reverification_required', 'system', null,
      'Your verification period ended. Submit your current staff listing to keep coach access.', true);
    v_count := v_count + 1;
  end loop;
  -- A suspended coach whose window lapses can no longer be reinstated to verified.
  update public.coaches c
     set status_before_suspension = 'reverification_required', verified_until = null, verified_email = null
   where c.verification_status = 'suspended' and c.status_before_suspension = 'verified'
     and c.verified_until <= now();
  return v_count;
end;
$$;
revoke all on function private.expire_coach_verifications() from public;

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.coaches enable row level security;
alter table public.coach_status_transitions enable row level security;
alter table public.coach_verification_events enable row level security;

revoke all on table public.coaches, public.coach_status_transitions, public.coach_verification_events
  from anon, authenticated, service_role;
revoke all on sequence public.coach_verification_events_id_seq from anon, authenticated, service_role;

grant select on table public.coaches to authenticated;
grant select on table public.coach_status_transitions to authenticated;
grant select on table public.coach_verification_events to authenticated;

create policy coaches_select_own_or_admin on public.coaches
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy coach_status_transitions_readable on public.coach_status_transitions
  for select to authenticated
  using (true);

create policy coach_verification_events_select on public.coach_verification_events
  for select to authenticated
  using ((coach_id = (select auth.uid()) and visible_to_coach) or private.is_admin());
