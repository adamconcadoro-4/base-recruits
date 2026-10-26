-- =============================================================================
-- Base Recruits Assessment / Migration 2: switches, development coaches, access
--
-- * Two switches, both OFF until an administrator turns them on:
--   enabled (every assessment write) and video_enabled (clip uploads).
-- * Development coach: a new self-selectable account type for adults, offered
--   only while Assessment is switched on. College-coach accounts can never act
--   as development coaches (recruiting-contact rules, decision L5).
-- * Access is consent, reusing the existing machinery:
--     development_coach_access  the athlete approves a coach who redeemed the
--                               athlete's code; for a minor a linked parent or
--                               legal guardian must also approve (decision F4)
--     family_assessments        a linked parent/guardian, chosen by the athlete
--     coach_assessment_reports  one named verified college coach, published
--                               reports only, never video; guardian approval
--                               for minors; at most 365 days
--   Access is decided at read time from current roles, ages and grants.
-- * Parents see who a sharing request is for before approving it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Switches
-- -----------------------------------------------------------------------------
create table private.assessment_settings (
  id boolean primary key default true
    constraint assessment_settings_singleton check (id),
  enabled boolean not null default false,
  video_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint assessment_settings_video_needs_enabled check (enabled or not video_enabled)
);
comment on table private.assessment_settings is
  'Assessment on/off switches. Both start off; only administrators change them (admin_set_assessment_switches).';
insert into private.assessment_settings (id) values (true);
revoke all on table private.assessment_settings from public, anon, authenticated, service_role;

create function private.assessment_enabled() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from private.assessment_settings s where s.id), false)
$$;

create function private.assessment_video_enabled() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled and s.video_enabled from private.assessment_settings s where s.id), false)
$$;

create function private.require_assessment_enabled() returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.assessment_enabled() then
    raise exception 'Base Recruits Assessment is not switched on yet' using errcode = 'BR004';
  end if;
end;
$$;

revoke all on function private.assessment_enabled() from public;
revoke all on function private.assessment_video_enabled() from public;
revoke all on function private.require_assessment_enabled() from public;

create function public.assessment_switches()
returns table (enabled boolean, video_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.assessment_enabled(), private.assessment_video_enabled()
$$;
comment on function public.assessment_switches() is 'Whether Assessment and its video uploads are switched on.';

create function public.admin_set_assessment_switches(p_enabled boolean, p_video_enabled boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
begin
  if p_enabled is null or p_video_enabled is null then
    raise exception 'both switches need a value' using errcode = 'BR003';
  end if;
  if p_video_enabled and not p_enabled then
    raise exception 'video uploads can only be on while Assessment is on' using errcode = 'BR003';
  end if;
  update private.assessment_settings s
     set enabled = p_enabled, video_enabled = p_video_enabled, updated_at = now(), updated_by = v_uid
   where s.id;
  perform private.log_audit('assessment.switches_changed', 'assessment_settings', null, null,
                            jsonb_build_object('enabled', p_enabled, 'video_enabled', p_video_enabled), v_uid);
end;
$$;

revoke all on function public.assessment_switches() from public, anon, authenticated, service_role;
revoke all on function public.admin_set_assessment_switches(boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.assessment_switches() to authenticated;
grant execute on function public.admin_set_assessment_switches(boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Onboarding: development coach accounts (adults only, Assessment on)
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
  if p_account_type is null or p_account_type not in ('athlete', 'parent', 'coach', 'development_coach') then
    raise exception 'choose athlete, parent/guardian, college coach or development coach' using errcode = 'BR003';
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
  if p_account_type in ('parent', 'coach', 'development_coach') and not private.is_adult(v_uid) then
    raise exception 'parent, guardian and coach accounts are for adults; record your date of birth first'
      using errcode = 'BR004';
  end if;
  if p_account_type = 'development_coach' and not private.assessment_enabled() then
    raise exception 'development coach accounts are not open yet' using errcode = 'BR004';
  end if;

  update public.profiles p
     set primary_role = p_account_type,
         role_selected_at = now(),
         display_name = coalesce(v_name, p.display_name)
   where p.id = v_uid;

  perform private.provision_role(v_uid, p_account_type, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Consent rules for Assessment
-- -----------------------------------------------------------------------------
alter table public.consent_scope_rules drop constraint consent_scope_rules_grantee_kind;
alter table public.consent_scope_rules
  add constraint consent_scope_rules_grantee_kind
  check (grantee_kind in ('verified_coach', 'linked_guardian', 'verified_coach_or_linked_guardian', 'development_coach'));

insert into public.consent_scope_rules
  (scope, audience, grantee_kind, requires_guardian_approval_for_minor, max_duration, description)
values
  ('development_coach_access', 'specific_user', 'development_coach', true, null,
   'Let one named development coach see, add to and review your assessments, video and training plans.'),
  ('family_assessments', 'specific_user', 'linked_guardian', false, null,
   'Let a linked parent/guardian see and add to your assessments, video and training plans.'),
  ('coach_assessment_reports', 'specific_user', 'verified_coach', true, interval '365 days',
   'Let one named verified college coach see your published assessment reports. Video is never shared.');

alter table public.consent_grants drop constraint consent_grants_revocation_reason_code;
alter table public.consent_grants
  add constraint consent_grants_revocation_reason_code
  check (revocation_reason is null or revocation_reason in (
    'withdrawn_by_athlete', 'withdrawn_by_guardian', 'family_link_ended', 'approving_guardian_link_ended',
    'athlete_reached_majority', 'guardian_role_removed', 'athlete_role_removed', 'withdrawn_by_grantee'));

-- -----------------------------------------------------------------------------
-- Development coach invites and links
-- -----------------------------------------------------------------------------
create table public.development_coach_invites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index development_coach_invites_athlete_idx on public.development_coach_invites (athlete_id, created_at desc);
comment on table public.development_coach_invites is
  'One-time codes an athlete gives a development coach. Only a SHA-256 hash of the code is stored.';

create table public.development_coach_links (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending_athlete_approval'
    constraint development_coach_links_status check (status in ('pending_athlete_approval', 'approved', 'declined', 'ended')),
  grant_id uuid references public.consent_grants (id) on delete set null,
  approved_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_coach_links_not_self check (athlete_id <> coach_id)
);
comment on table public.development_coach_links is
  'A development coach who redeemed an athlete''s code. Access itself is the development_coach_access consent grant (grant_id).';
create unique index development_coach_links_one_open_per_pair
  on public.development_coach_links (athlete_id, coach_id)
  where status in ('pending_athlete_approval', 'approved');
create index development_coach_links_coach_idx on public.development_coach_links (coach_id, status);

create trigger development_coach_links_set_updated_at
  before update on public.development_coach_links
  for each row execute function private.set_updated_at();
create trigger development_coach_links_audit
  after insert or update of status or delete on public.development_coach_links
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'coach_id');

alter table public.development_coach_invites enable row level security;
alter table public.development_coach_links enable row level security;
revoke all on table public.development_coach_invites, public.development_coach_links from anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Access helpers (read time; nothing relies on stored status alone)
-- -----------------------------------------------------------------------------
create function private.is_eligible_development_coach(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and private.has_role(p_user_id, 'development_coach')
     and not private.has_role(p_user_id, 'coach')
     and private.is_adult(p_user_id)
     and not private.is_age_blocked(p_user_id)
$$;

create function private.is_development_coach_for(p_coach_id uuid, p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_eligible_development_coach(p_coach_id)
     and private.has_role(p_athlete_id, 'athlete')
     and private.has_active_grant(p_athlete_id, 'development_coach_access', 'specific_user', p_coach_id)
$$;

-- 'athlete' | 'development_coach' | 'guardian' | null
create function private.assessment_relation(p_viewer_id uuid, p_athlete_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer_id is null or p_athlete_id is null or private.is_age_blocked(p_viewer_id) then null
    when p_viewer_id = p_athlete_id and private.has_role(p_viewer_id, 'athlete') then 'athlete'
    when private.is_development_coach_for(p_viewer_id, p_athlete_id) then 'development_coach'
    when private.guardian_can_view(p_viewer_id, p_athlete_id, 'family_assessments') then 'guardian'
  end
$$;

create function private.can_work_on_assessments(p_viewer_id uuid, p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.assessment_relation(p_viewer_id, p_athlete_id) is not null
$$;

revoke all on function private.is_eligible_development_coach(uuid) from public;
revoke all on function private.is_development_coach_for(uuid, uuid) from public;
revoke all on function private.assessment_relation(uuid, uuid) from public;
revoke all on function private.can_work_on_assessments(uuid, uuid) from public;
-- Row-level security policies call this one directly, so signed-in users need EXECUTE.
grant execute on function private.can_work_on_assessments(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- grant_consent: unchanged except that a development coach is eligible only
-- after redeeming this athlete's code (an open link exists).
-- -----------------------------------------------------------------------------
create or replace function public.grant_consent(
  p_scope public.consent_scope,
  p_consent_text_version text,
  p_grantee_id uuid default null,
  p_expires_at timestamptz default null
) returns table (grant_id uuid, status public.consent_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rule public.consent_scope_rules%rowtype;
  v_needs_guardian boolean;
  v_expires timestamptz := p_expires_at;
  v_existing public.consent_grants%rowtype;
  v_status public.consent_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'athlete') then
    raise exception 'only athletes can grant consent for their own data' using errcode = 'BR002';
  end if;
  if not private.has_recorded_birthdate(v_uid) then
    raise exception 'complete the age step first' using errcode = 'BR004';
  end if;

  select * into v_rule from public.consent_scope_rules r where r.scope = p_scope;
  if not found then
    raise exception 'unknown consent scope' using errcode = 'BR003';
  end if;
  if p_consent_text_version is null or p_consent_text_version !~ '^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$' then
    raise exception 'consent wording version is required' using errcode = 'BR003';
  end if;

  if v_rule.audience = 'specific_user' then
    if p_grantee_id is null or p_grantee_id = v_uid then
      raise exception 'this permission must name another person' using errcode = 'BR003';
    end if;
    if not (
      (v_rule.grantee_kind in ('verified_coach', 'verified_coach_or_linked_guardian') and private.is_verified_coach(p_grantee_id))
      or (v_rule.grantee_kind in ('linked_guardian', 'verified_coach_or_linked_guardian') and private.is_active_guardian(p_grantee_id, v_uid))
      or (v_rule.grantee_kind = 'development_coach'
          and private.is_eligible_development_coach(p_grantee_id)
          and exists (select 1 from public.development_coach_links l
                       where l.athlete_id = v_uid and l.coach_id = p_grantee_id
                         and l.status in ('pending_athlete_approval', 'approved')))
    ) then
      raise exception 'that person is not eligible to receive this permission' using errcode = 'BR002';
    end if;
  elsif p_grantee_id is not null then
    raise exception 'this permission applies to all verified coaches and cannot name a person' using errcode = 'BR003';
  end if;

  if v_expires is not null and v_expires <= now() then
    raise exception 'expiry must be in the future' using errcode = 'BR003';
  end if;
  if v_rule.max_duration is not null then
    v_expires := least(coalesce(v_expires, now() + v_rule.max_duration), now() + v_rule.max_duration);
  end if;

  -- Serialize consent changes per athlete.
  perform 1 from public.athletes a where a.user_id = v_uid for update;

  v_needs_guardian := private.grant_needs_guardian_approval(v_uid, p_scope, p_grantee_id);

  select * into v_existing from public.consent_grants g
   where g.athlete_id = v_uid and g.scope = p_scope and g.audience = v_rule.audience
     and g.grantee_id is not distinct from p_grantee_id
     and g.status in ('pending_guardian', 'active')
   for update;

  if found then
    -- Idempotent. An athlete who has since turned 18 can confirm a pending grant themselves.
    if v_existing.status = 'pending_guardian' and not v_needs_guardian then
      update public.consent_grants g
         set status = 'active', activated_at = now(), consent_text_version = p_consent_text_version
       where g.id = v_existing.id;
      perform private.log_audit('consent.activated', 'consent_grant', v_existing.id::text, v_uid,
                                jsonb_build_object('scope', p_scope, 'by', 'athlete'), v_uid);
      grant_id := v_existing.id;
      status := 'active';
    else
      grant_id := v_existing.id;
      status := v_existing.status;
    end if;
    return next;
    return;
  end if;

  v_status := case when v_needs_guardian then 'pending_guardian' else 'active' end;

  insert into public.consent_grants
    (athlete_id, scope, audience, grantee_id, status, granted_by, consent_text_version,
     activated_at, expires_at)
  values
    (v_uid, p_scope, v_rule.audience, p_grantee_id, v_status, v_uid, p_consent_text_version,
     case when v_status = 'active' then now() end, v_expires)
  returning id into v_id;

  perform private.log_audit(
    case when v_status = 'active' then 'consent.granted' else 'consent.awaiting_guardian' end,
    'consent_grant', v_id::text, v_uid,
    jsonb_build_object('scope', p_scope, 'audience', v_rule.audience,
                       'grantee_id', p_grantee_id, 'text_version', p_consent_text_version),
    v_uid);

  grant_id := v_id;
  status := v_status;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Development coach RPCs
-- -----------------------------------------------------------------------------
create function public.create_development_coach_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  -- 32 symbols (no I/O/0/1), so each random byte maps uniformly via mod 32.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_raw text := '';
  v_expires timestamptz := now() + interval '7 days';
  i integer;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.has_role(v_uid, 'athlete') or private.is_age_blocked(v_uid) then
    raise exception 'only athletes can invite a development coach' using errcode = 'BR002';
  end if;
  if not private.has_recorded_birthdate(v_uid) then
    raise exception 'complete the age step first' using errcode = 'BR004';
  end if;

  perform 1 from public.athletes a where a.user_id = v_uid for update;
  if (select count(*) from public.development_coach_invites i
       where i.athlete_id = v_uid and i.redeemed_at is null and i.cancelled_at is null and i.expires_at > now()) >= 5 then
    raise exception 'too many open codes; cancel one first' using errcode = 'BR005';
  end if;

  v_bytes := sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()));
  for i in 0..11 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.development_coach_invites (athlete_id, code_hash, expires_at)
  values (v_uid, private.family_code_hash(v_raw), v_expires);

  perform private.log_audit('assessment.coach_invite_created', 'development_coach_invite', null, v_uid, '{}'::jsonb, v_uid);

  code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  expires_at := v_expires;
  return next;
end;
$$;

create function public.cancel_development_coach_invite(p_invite_id uuid) returns void
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
  update public.development_coach_invites i
     set cancelled_at = now()
   where i.id = p_invite_id and i.athlete_id = v_uid and i.redeemed_at is null and i.cancelled_at is null;
  if not found then
    raise exception 'code not found or no longer open' using errcode = 'BR003';
  end if;
  perform private.log_audit('assessment.coach_invite_cancelled', 'development_coach_invite', p_invite_id::text, v_uid, '{}'::jsonb, v_uid);
end;
$$;

create function public.my_development_coach_invites()
returns table (invite_id uuid, expires_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.expires_at, i.created_at
    from public.development_coach_invites i
   where i.athlete_id = (select auth.uid()) and i.redeemed_at is null and i.cancelled_at is null and i.expires_at > now()
   order by i.created_at desc
$$;

-- Returns an outcome instead of raising for bad codes, so failed attempts are
-- recorded (an exception would roll back the audit row) and rate-limited.
create function public.redeem_development_coach_invite(p_code text)
returns table (outcome text, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.development_coach_invites%rowtype;
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.has_role(v_uid, 'development_coach') or private.has_role(v_uid, 'coach') then
    raise exception 'only development coach accounts can use this code' using errcode = 'BR002';
  end if;
  if not private.is_eligible_development_coach(v_uid) then
    raise exception 'development coach accounts must belong to an adult; complete the age step first' using errcode = 'BR004';
  end if;

  if (select count(*) from public.audit_events e
       where e.actor_id = v_uid and e.action = 'assessment.coach_invite_redeem_failed'
         and e.occurred_at > now() - interval '1 hour') >= 10 then
    outcome := 'too_many_attempts';
    link_id := null;
    return next;
    return;
  end if;

  select * into v_invite
    from public.development_coach_invites i
   where i.code_hash = private.family_code_hash(p_code)
     and i.redeemed_at is null and i.cancelled_at is null and i.expires_at > now()
   for update;

  if not found or v_invite.athlete_id = v_uid then
    perform private.log_audit('assessment.coach_invite_redeem_failed', 'development_coach_invite', null, null, '{}'::jsonb, v_uid);
    outcome := 'invalid_or_expired';
    link_id := null;
    return next;
    return;
  end if;

  perform 1 from public.athletes a where a.user_id = v_invite.athlete_id for update;

  select l.id into v_link from public.development_coach_links l
   where l.athlete_id = v_invite.athlete_id and l.coach_id = v_uid
     and l.status in ('pending_athlete_approval', 'approved');

  if v_link is null then
    if (select count(*) from public.development_coach_links l
         where l.athlete_id = v_invite.athlete_id and l.status in ('pending_athlete_approval', 'approved')) >= 5 then
      outcome := 'athlete_link_limit_reached';
      link_id := null;
      return next;
      return;
    end if;
    insert into public.development_coach_links (athlete_id, coach_id)
    values (v_invite.athlete_id, v_uid)
    returning id into v_link;
  end if;

  update public.development_coach_invites i
     set redeemed_at = now(), redeemed_by = v_uid
   where i.id = v_invite.id;

  perform private.log_audit('assessment.coach_invite_redeemed', 'development_coach_link', v_link::text,
                            v_invite.athlete_id, '{}'::jsonb, v_uid);
  outcome := 'pending_athlete_approval';
  link_id := v_link;
  return next;
end;
$$;

-- Effective access of a link: pending_athlete_approval | awaiting_guardian | active | declined | ended
create function private.development_coach_link_access(p_link public.development_coach_links) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_link.status in ('pending_athlete_approval', 'declined', 'ended') then p_link.status
    when not private.is_eligible_development_coach(p_link.coach_id) then 'ended'
    when private.has_active_grant(p_link.athlete_id, 'development_coach_access', 'specific_user', p_link.coach_id) then 'active'
    when exists (select 1 from public.consent_grants g
                  where g.id = p_link.grant_id
                    and (g.status = 'pending_guardian'
                         or (g.status = 'active'
                             and private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
                             and not private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)))) then 'awaiting_guardian'
    else 'ended'
  end
$$;
revoke all on function private.development_coach_link_access(public.development_coach_links) from public;

-- Who is on each side. Athletes and their parents/legal guardians see the
-- coach's account email before approving; coaches see the athlete's name only.
create function public.list_development_coach_links()
returns table (
  link_id uuid,
  my_side text,
  athlete_id uuid,
  athlete_name text,
  coach_id uuid,
  coach_name text,
  coach_email text,
  access text,
  grant_id uuid,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         case when l.athlete_id = (select auth.uid()) then 'athlete'
              when l.coach_id = (select auth.uid()) then 'coach'
              else 'guardian' end,
         l.athlete_id,
         pa.display_name,
         l.coach_id,
         pc.display_name,
         case when l.coach_id <> (select auth.uid()) then u.email::text end,
         private.development_coach_link_access(l),
         l.grant_id,
         l.created_at,
         l.approved_at
    from public.development_coach_links l
    join public.profiles pa on pa.id = l.athlete_id
    join public.profiles pc on pc.id = l.coach_id
    join auth.users u on u.id = l.coach_id
   where (select auth.uid()) in (l.athlete_id, l.coach_id)
      or private.can_act_as_guardian((select auth.uid()), l.athlete_id)
   order by l.created_at desc
$$;

create function public.approve_development_coach_link(p_link_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.development_coach_links%rowtype;
  v_grant uuid;
  v_status public.consent_status;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  perform 1 from public.athletes a where a.user_id = v_uid for update;
  select * into v_link from public.development_coach_links l
   where l.id = p_link_id and l.athlete_id = v_uid and l.status = 'pending_athlete_approval'
   for update;
  if not found then
    raise exception 'request not found or not waiting for you' using errcode = 'BR003';
  end if;
  if not private.is_eligible_development_coach(v_link.coach_id) then
    raise exception 'this account can no longer act as a development coach' using errcode = 'BR004';
  end if;

  select g.grant_id, g.status into v_grant, v_status
    from public.grant_consent('development_coach_access', 'development-coach-access-v1', v_link.coach_id) g;

  update public.development_coach_links l
     set status = 'approved', approved_at = now(), grant_id = v_grant
   where l.id = p_link_id;

  perform private.log_audit('assessment.coach_link_approved', 'development_coach_link', p_link_id::text, v_uid,
                            jsonb_build_object('grant_status', v_status), v_uid);
  return case when v_status = 'active' then 'active' else 'awaiting_guardian' end;
end;
$$;

create function public.decline_development_coach_link(p_link_id uuid) returns void
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
  update public.development_coach_links l
     set status = 'declined', ended_at = now(), ended_by = v_uid
   where l.id = p_link_id and l.athlete_id = v_uid and l.status = 'pending_athlete_approval';
  if not found then
    raise exception 'request not found or not waiting for you' using errcode = 'BR003';
  end if;
  perform private.log_audit('assessment.coach_link_declined', 'development_coach_link', p_link_id::text, v_uid, '{}'::jsonb, v_uid);
end;
$$;

-- The athlete, the coach, or a parent/legal guardian of a minor athlete can end a link.
create function public.end_development_coach_link(p_link_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.development_coach_links%rowtype;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform 1 from public.athletes a
   where a.user_id = (select l.athlete_id from public.development_coach_links l where l.id = p_link_id)
     for update;
  select * into v_link from public.development_coach_links l where l.id = p_link_id for update;
  if not found or v_link.status in ('ended', 'declined') then
    raise exception 'link not found' using errcode = 'BR003';
  end if;
  if v_uid = v_link.athlete_id then
    v_reason := 'withdrawn_by_athlete';
  elsif v_uid = v_link.coach_id then
    v_reason := 'withdrawn_by_grantee';
  elsif private.can_act_as_guardian(v_uid, v_link.athlete_id) then
    v_reason := 'withdrawn_by_guardian';
  else
    raise exception 'link not found' using errcode = 'BR003';
  end if;

  update public.development_coach_links l
     set status = 'ended', ended_at = now(), ended_by = v_uid
   where l.id = p_link_id;

  update public.consent_grants g
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid, revocation_reason = v_reason
   where g.athlete_id = v_link.athlete_id and g.scope = 'development_coach_access'
     and g.grantee_id = v_link.coach_id and g.status in ('pending_guardian', 'active');

  perform private.log_audit('assessment.coach_link_ended', 'development_coach_link', p_link_id::text, v_link.athlete_id,
                            jsonb_build_object('reason', v_reason), v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- Family and college-coach sharing
-- -----------------------------------------------------------------------------
create function public.assessment_family_access()
returns table (
  link_id uuid,
  guardian_name text,
  relationship public.family_relationship,
  grant_id uuid,
  in_effect boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, p.display_name, l.relationship, g.id,
         coalesce(private.has_active_grant(l.athlete_id, 'family_assessments', 'specific_user', l.guardian_id), false)
    from public.family_links l
    join public.profiles p on p.id = l.guardian_id
    left join public.consent_grants g
      on g.athlete_id = l.athlete_id and g.scope = 'family_assessments' and g.grantee_id = l.guardian_id
     and g.status in ('pending_guardian', 'active')
   where l.athlete_id = (select auth.uid()) and l.status = 'active'
   order by l.created_at
$$;

create function public.share_assessments_with_family(p_link_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_guardian uuid;
  v_grant uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select l.guardian_id into v_guardian from public.family_links l
   where l.id = p_link_id and l.athlete_id = v_uid and l.status = 'active';
  if v_guardian is null then
    raise exception 'family link not found' using errcode = 'BR003';
  end if;
  select g.grant_id into v_grant
    from public.grant_consent('family_assessments', 'family-assessments-v1', v_guardian) g;
  return v_grant;
end;
$$;

-- Share published reports with one verified college coach, found by the work
-- email their verification was approved with. Failed lookups are counted so
-- the function cannot be used to test many addresses.
create function public.share_assessment_reports_with_coach(p_email text)
returns table (outcome text, grant_id uuid, coach_name text, status public.consent_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_coach uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.has_role(v_uid, 'athlete') then
    raise exception 'only athletes can share their reports' using errcode = 'BR002';
  end if;
  if (select count(*) from public.audit_events e
       where e.actor_id = v_uid and e.action = 'assessment.report_share_lookup_failed'
         and e.occurred_at > now() - interval '1 hour') >= 10 then
    outcome := 'too_many_attempts';
    return next;
    return;
  end if;

  select c.user_id, p.display_name into v_coach, v_name
    from public.coaches c join public.profiles p on p.id = c.user_id
   where c.verified_email is not null
     and lower(c.verified_email) = lower(btrim(coalesce(p_email, '')))
     and private.is_verified_coach(c.user_id)
   limit 1;
  if v_coach is null then
    perform private.log_audit('assessment.report_share_lookup_failed', 'consent_grant', null, v_uid, '{}'::jsonb, v_uid);
    outcome := 'not_found';
    return next;
    return;
  end if;

  select g.grant_id, g.status into grant_id, status
    from public.grant_consent('coach_assessment_reports', 'coach-assessment-reports-v1', v_coach) g;
  outcome := 'shared';
  coach_name := v_name;
  return next;
end;
$$;

create function public.my_assessment_report_shares()
returns table (grant_id uuid, coach_name text, status public.consent_status, in_effect boolean, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, p.display_name, g.status,
         private.has_active_grant(g.athlete_id, g.scope, 'specific_user', g.grantee_id)
           and private.is_verified_coach(g.grantee_id),
         g.created_at, g.expires_at
    from public.consent_grants g
    join public.profiles p on p.id = g.grantee_id
   where g.athlete_id = (select auth.uid()) and g.scope = 'coach_assessment_reports'
     and g.status in ('pending_guardian', 'active')
   order by g.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- Parents see who a request is for (name and account email of the person who
-- would receive access) before approving it.
-- -----------------------------------------------------------------------------
drop function public.guardian_consent_requests();
create function public.guardian_consent_requests()
returns table (
  grant_id uuid,
  athlete_id uuid,
  athlete_name text,
  scope public.consent_scope,
  created_at timestamptz,
  grantee_name text,
  grantee_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.athlete_id, p.display_name, g.scope, g.created_at, gp.display_name, gu.email::text
    from public.consent_grants g
    join public.profiles p on p.id = g.athlete_id
    left join public.profiles gp on gp.id = g.grantee_id
    left join auth.users gu on gu.id = g.grantee_id
   where private.guardian_oversees((select auth.uid()), g.athlete_id, g.scope, g.grantee_id)
     and (g.expires_at is null or g.expires_at > now())
     and (g.status = 'pending_guardian'
          or (g.status = 'active'
              and private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
              and not private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)))
   order by g.created_at
$$;
comment on function public.guardian_consent_requests() is
  'Permissions a signed-in parent or legal guardian can approve now for the minors they are linked to, with who would receive them.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.create_development_coach_invite() from public, anon, authenticated, service_role;
revoke all on function public.cancel_development_coach_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.my_development_coach_invites() from public, anon, authenticated, service_role;
revoke all on function public.redeem_development_coach_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.list_development_coach_links() from public, anon, authenticated, service_role;
revoke all on function public.approve_development_coach_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.decline_development_coach_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.end_development_coach_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assessment_family_access() from public, anon, authenticated, service_role;
revoke all on function public.share_assessments_with_family(uuid) from public, anon, authenticated, service_role;
revoke all on function public.share_assessment_reports_with_coach(text) from public, anon, authenticated, service_role;
revoke all on function public.my_assessment_report_shares() from public, anon, authenticated, service_role;
revoke all on function public.guardian_consent_requests() from public, anon, authenticated, service_role;

grant execute on function public.create_development_coach_invite() to authenticated;
grant execute on function public.cancel_development_coach_invite(uuid) to authenticated;
grant execute on function public.my_development_coach_invites() to authenticated;
grant execute on function public.redeem_development_coach_invite(text) to authenticated;
grant execute on function public.list_development_coach_links() to authenticated;
grant execute on function public.approve_development_coach_link(uuid) to authenticated;
grant execute on function public.decline_development_coach_link(uuid) to authenticated;
grant execute on function public.end_development_coach_link(uuid) to authenticated;
grant execute on function public.assessment_family_access() to authenticated;
grant execute on function public.share_assessments_with_family(uuid) to authenticated;
grant execute on function public.share_assessment_reports_with_coach(text) to authenticated;
grant execute on function public.my_assessment_report_shares() to authenticated;
grant execute on function public.guardian_consent_requests() to authenticated;
