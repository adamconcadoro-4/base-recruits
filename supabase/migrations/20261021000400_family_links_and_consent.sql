-- =============================================================================
-- Base Recruits — Stage 1 / Migration 4: family links and consent
--
-- Principles
--   * The athlete controls what is shared and with whom; every grant is
--     explicit, scoped, revocable, versioned (consent wording) and audited.
--     Athletes must complete the age step before granting anything.
--   * Minors (13–17): coach-facing scopes become effective only after an
--     actively linked parent or legal guardian approves, and stay effective
--     only while that approving link is active. Unknown age is treated as a
--     minor.
--   * Family links: only adults (recorded date of birth, 18+) with a
--     parent/guardian account can join a family, and only after the athlete
--     approves them by name. Links made while the athlete was a minor stop
--     working at 18 until the adult athlete re-approves.
--   * Nothing here checks payment: visibility to coaches is never sold.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Family invites: the athlete shares a one-time code with a parent/guardian.
-- Only a SHA-256 hash of the code is stored.
-- -----------------------------------------------------------------------------
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index family_invites_athlete_idx on public.family_invites (athlete_id, created_at desc);

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  relationship public.family_relationship not null,
  status public.family_link_status not null default 'pending_athlete_approval',
  established_while_minor boolean,
  approved_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_links_not_self check (athlete_id <> guardian_id)
);
comment on table public.family_links is
  'Parent/guardian connections approved by the athlete. Access requires status = active, an adult guardian, and — for links approved while the athlete was a minor — that the athlete is still a minor.';

create unique index family_links_one_open_per_pair
  on public.family_links (athlete_id, guardian_id)
  where status in ('pending_athlete_approval', 'active', 'reconsent_required');
create index family_links_guardian_idx on public.family_links (guardian_id, status);

create trigger family_links_set_updated_at
  before update on public.family_links
  for each row execute function private.set_updated_at();

create trigger family_links_audit
  after insert or update of status, relationship or delete on public.family_links
  for each row execute function private.audit_row_change(
    'athlete_id', 'id', 'status', 'relationship', 'guardian_id');

-- -----------------------------------------------------------------------------
-- Consent rules (policy table — product/legal can tune without code changes)
-- -----------------------------------------------------------------------------
create table public.consent_scope_rules (
  scope public.consent_scope primary key,
  audience public.consent_audience not null,
  grantee_kind text
    constraint consent_scope_rules_grantee_kind check (grantee_kind in ('verified_coach', 'linked_guardian', 'verified_coach_or_linked_guardian')),
  requires_guardian_approval_for_minor boolean not null,
  max_duration interval,
  description text not null,
  constraint consent_scope_rules_audience_matches_grantee check (
    (audience = 'verified_coaches' and grantee_kind is null)
    or (audience = 'specific_user' and grantee_kind is not null)
  )
);
comment on column public.consent_scope_rules.requires_guardian_approval_for_minor is
  'Founder/legal decision point: when true, a minor''s grant stays pending until a linked parent/guardian approves.';

insert into public.consent_scope_rules
  (scope, audience, grantee_kind, requires_guardian_approval_for_minor, max_duration, description)
values
  ('coach_discovery', 'verified_coaches', null, true, null,
   'Appear in verified college coach search with a basic recruiting profile.'),
  ('coach_academic_summary', 'verified_coaches', null, true, null,
   'Let verified coaches see your academic summary, labelled self-reported or verified.'),
  ('coach_athletic_metrics', 'verified_coaches', null, true, null,
   'Let verified coaches see your athletic metrics and recruiting video.'),
  ('coach_contact_info', 'verified_coaches', null, true, null,
   'Let verified coaches see your contact details.'),
  ('coach_messaging', 'verified_coaches', null, true, null,
   'Let verified coaches start a conversation with you on Base Recruits.'),
  ('document_access', 'specific_user', 'verified_coach_or_linked_guardian', true, interval '365 days',
   'Let one named verified coach or linked parent/guardian view your academic documents.'),
  ('family_recruiting', 'specific_user', 'linked_guardian', false, null,
   'Let a linked parent/guardian see your saved schools and recruiting activity.'),
  ('family_academic', 'specific_user', 'linked_guardian', false, null,
   'Let a linked parent/guardian see your academic profile.');

-- -----------------------------------------------------------------------------
-- Consent grants
-- revocation_reason holds system codes only (never free text).
-- -----------------------------------------------------------------------------
create table public.consent_grants (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  scope public.consent_scope not null references public.consent_scope_rules (scope),
  audience public.consent_audience not null,
  grantee_id uuid references public.profiles (id) on delete cascade,
  status public.consent_status not null,
  granted_by uuid not null references public.profiles (id) on delete cascade,
  guardian_approved_by uuid references public.profiles (id) on delete set null,
  guardian_approved_at timestamptz,
  guardian_link_id uuid references public.family_links (id) on delete set null,
  consent_text_version text not null
    constraint consent_grants_text_version_format check (consent_text_version ~ '^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$'),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revocation_reason text
    constraint consent_grants_revocation_reason_code check (revocation_reason is null or revocation_reason in (
      'withdrawn_by_athlete', 'withdrawn_by_guardian', 'family_link_ended', 'approving_guardian_link_ended',
      'athlete_reached_majority', 'guardian_role_removed', 'athlete_role_removed')),
  updated_at timestamptz not null default now(),
  constraint consent_grants_grantee_matches_audience check ((audience = 'specific_user') = (grantee_id is not null)),
  constraint consent_grants_active_has_activation check (status <> 'active' or activated_at is not null),
  constraint consent_grants_revoked_has_details check (status <> 'revoked' or (revoked_at is not null and revocation_reason is not null))
);
comment on table public.consent_grants is
  'Explicit, revocable sharing decisions made by the athlete (and, for minors, approved by a linked parent or legal guardian where the rules require it).';
comment on column public.consent_grants.guardian_link_id is
  'The family link through which a guardian approved this grant. While the athlete is a minor, the grant works only while that link is active.';

create unique index consent_grants_one_open_per_key
  on public.consent_grants (athlete_id, scope, audience, coalesce(grantee_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending_guardian', 'active');
create index consent_grants_active_lookup
  on public.consent_grants (athlete_id, scope)
  where status = 'active';
create index consent_grants_grantee_idx on public.consent_grants (grantee_id) where grantee_id is not null;
create index consent_grants_guardian_link_idx on public.consent_grants (guardian_link_id) where guardian_link_id is not null;

create trigger consent_grants_set_updated_at
  before update on public.consent_grants
  for each row execute function private.set_updated_at();

create trigger consent_grants_audit
  after insert or update of status, guardian_link_id, expires_at or delete on public.consent_grants
  for each row execute function private.audit_row_change(
    'athlete_id', 'id', 'scope', 'status', 'grantee_id', 'revocation_reason', 'guardian_link_id', 'expires_at');

-- -----------------------------------------------------------------------------
-- Access helpers used by RLS policies (SECURITY DEFINER, fixed search_path)
-- -----------------------------------------------------------------------------

-- Linked family member with access to the athlete's basic record and to the
-- family scopes the athlete granted them.
create function private.is_active_guardian(p_guardian_id uuid, p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_guardian_id is not null
     and private.has_role(p_guardian_id, 'parent')
     and private.is_adult(p_guardian_id)
     and exists (
       select 1 from public.family_links l
        where l.athlete_id = p_athlete_id
          and l.guardian_id = p_guardian_id
          and l.status = 'active'
          and not (coalesce(l.established_while_minor, true) and not private.is_minor(p_athlete_id))
     )
$$;

-- A linked parent or legal guardian of a minor: may approve, decline and
-- withdraw the minor's coach-facing permissions. Other family members may not.
create function private.can_act_as_guardian(p_guardian_id uuid, p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_minor(p_athlete_id)
     and private.is_active_guardian(p_guardian_id, p_athlete_id)
     and exists (
       select 1 from public.family_links l
        where l.athlete_id = p_athlete_id and l.guardian_id = p_guardian_id
          and l.status = 'active' and l.relationship in ('parent', 'legal_guardian')
     )
$$;

-- Does a grant of this scope, to this grantee, need a parent/legal guardian's
-- approval right now? Evaluated at read time from the current rules and the
-- athlete's current age — never from what is stored on the grant.
-- Sharing with the athlete's own parent/legal guardian needs no extra approval.
create function private.grant_needs_guardian_approval(
  p_athlete_id uuid,
  p_scope public.consent_scope,
  p_grantee_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_minor(p_athlete_id)
     and exists (select 1 from public.consent_scope_rules r
                  where r.scope = p_scope and r.requires_guardian_approval_for_minor)
     and not (p_grantee_id is not null and private.can_act_as_guardian(p_grantee_id, p_athlete_id))
$$;

-- Was this grant approved through a link that is still active, by someone who
-- can still act as the minor's parent or legal guardian?
create function private.has_valid_guardian_approval(p_athlete_id uuid, p_guardian_link_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_guardian_link_id is not null and exists (
    select 1 from public.family_links l
     where l.id = p_guardian_link_id
       and l.athlete_id = p_athlete_id
       and l.status = 'active'
       and l.relationship in ('parent', 'legal_guardian')
       and private.can_act_as_guardian(l.guardian_id, p_athlete_id)
  )
$$;

create function private.has_active_grant(
  p_athlete_id uuid,
  p_scope public.consent_scope,
  p_audience public.consent_audience,
  p_grantee_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consent_grants g
     where g.athlete_id = p_athlete_id
       and g.scope = p_scope
       and g.audience = p_audience
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
       and (p_audience = 'verified_coaches' or g.grantee_id = p_grantee_id)
       and (not private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
            or private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id))
  )
$$;

-- May this coach see this athlete's data for this scope?
-- Audience-wide coach scopes only work while coach_discovery is effective, so
-- turning discovery off hides everything at once.
create function private.coach_can_view(p_coach_id uuid, p_athlete_id uuid, p_scope public.consent_scope) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_verified_coach(p_coach_id)
     and private.has_role(p_athlete_id, 'athlete')
     and (
       (p_scope <> 'document_access'
        and private.has_active_grant(p_athlete_id, p_scope, 'verified_coaches')
        and private.has_active_grant(p_athlete_id, 'coach_discovery', 'verified_coaches'))
       or private.has_active_grant(p_athlete_id, p_scope, 'specific_user', p_coach_id)
     )
$$;

-- May this guardian see this athlete's data for this scope?
-- p_scope null = the basic linked-athlete record only.
create function private.guardian_can_view(p_guardian_id uuid, p_athlete_id uuid, p_scope public.consent_scope default null) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_guardian(p_guardian_id, p_athlete_id)
     and (p_scope is null or private.has_active_grant(p_athlete_id, p_scope, 'specific_user', p_guardian_id))
$$;

-- Does this guardian oversee (see, approve, withdraw) this grant of a minor?
-- Only grants the rules put under guardian approval, and never grants made to
-- another family member.
create function private.guardian_oversees(
  p_guardian_id uuid,
  p_athlete_id uuid,
  p_scope public.consent_scope,
  p_grantee_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_act_as_guardian(p_guardian_id, p_athlete_id)
     and exists (select 1 from public.consent_scope_rules r
                  where r.scope = p_scope and r.requires_guardian_approval_for_minor)
     and (p_grantee_id is null
          or not exists (select 1 from public.family_links l
                          where l.athlete_id = p_athlete_id and l.guardian_id = p_grantee_id))
$$;

revoke all on function private.is_active_guardian(uuid, uuid) from public;
revoke all on function private.can_act_as_guardian(uuid, uuid) from public;
revoke all on function private.grant_needs_guardian_approval(uuid, public.consent_scope, uuid) from public;
revoke all on function private.has_valid_guardian_approval(uuid, uuid) from public;
revoke all on function private.has_active_grant(uuid, public.consent_scope, public.consent_audience, uuid) from public;
revoke all on function private.coach_can_view(uuid, uuid, public.consent_scope) from public;
revoke all on function private.guardian_can_view(uuid, uuid, public.consent_scope) from public;
revoke all on function private.guardian_oversees(uuid, uuid, public.consent_scope, uuid) from public;
grant execute on function private.is_active_guardian(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_act_as_guardian(uuid, uuid) to authenticated, service_role;
grant execute on function private.grant_needs_guardian_approval(uuid, public.consent_scope, uuid) to authenticated, service_role;
grant execute on function private.has_valid_guardian_approval(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_active_grant(uuid, public.consent_scope, public.consent_audience, uuid) to authenticated, service_role;
grant execute on function private.coach_can_view(uuid, uuid, public.consent_scope) to authenticated, service_role;
grant execute on function private.guardian_can_view(uuid, uuid, public.consent_scope) to authenticated, service_role;
grant execute on function private.guardian_oversees(uuid, uuid, public.consent_scope, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Internal: end a family link and everything that depended on it
-- -----------------------------------------------------------------------------
create function private.end_family_link_internal(p_link_id uuid, p_actor_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.family_links%rowtype;
  v_athlete uuid;
begin
  -- Lock the athlete first (same order as every consent change) so an approval
  -- cannot slip in while the link is ending.
  select l.athlete_id into v_athlete from public.family_links l where l.id = p_link_id;
  if not found then
    return;
  end if;
  perform 1 from public.athletes a where a.user_id = v_athlete for update;

  select * into v_link from public.family_links l where l.id = p_link_id for update;
  if not found or v_link.status = 'ended' then
    return;
  end if;

  update public.family_links l
     set status = 'ended', ended_at = now(), ended_by = p_actor_id
   where l.id = p_link_id;

  -- Permissions granted to this family member end with the link.
  update public.consent_grants g
     set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revocation_reason = p_reason
   where g.athlete_id = v_link.athlete_id and g.grantee_id = v_link.guardian_id
     and g.status in ('pending_guardian', 'active');

  -- Approvals given through this link end too while the athlete is a minor.
  if private.is_minor(v_link.athlete_id) then
    update public.consent_grants g
       set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id,
           revocation_reason = 'approving_guardian_link_ended'
     where g.guardian_link_id = p_link_id and g.status in ('pending_guardian', 'active');
  end if;

  perform private.log_audit('family.link_ended', 'family_link', p_link_id::text, v_link.athlete_id,
                            jsonb_build_object('reason', p_reason), p_actor_id);
end;
$$;
revoke all on function private.end_family_link_internal(uuid, uuid, text) from public;

-- -----------------------------------------------------------------------------
-- Family RPCs
-- -----------------------------------------------------------------------------
create function private.family_code_hash(p_code text) returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8'))
$$;
revoke all on function private.family_code_hash(text) from public;

create function public.create_family_invite()
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
  if not private.has_role(v_uid, 'athlete') then
    raise exception 'only athletes can invite a parent or guardian' using errcode = 'BR002';
  end if;
  if not private.has_recorded_birthdate(v_uid) then
    raise exception 'complete the age step first' using errcode = 'BR004';
  end if;

  -- Serialize per athlete so concurrent requests cannot exceed the limit.
  perform 1 from public.athletes a where a.user_id = v_uid for update;
  if (select count(*) from public.family_invites fi
       where fi.athlete_id = v_uid and fi.redeemed_at is null and fi.cancelled_at is null
         and fi.expires_at > now()) >= 5 then
    raise exception 'too many open invites; cancel one first' using errcode = 'BR005';
  end if;

  -- gen_random_uuid() draws from the server's strong random source.
  v_bytes := sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()));
  for i in 0..11 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.family_invites (athlete_id, code_hash, expires_at)
  values (v_uid, private.family_code_hash(v_raw), v_expires);

  perform private.log_audit('family.invite_created', 'family_invite', null, v_uid, '{}'::jsonb, v_uid);

  code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  expires_at := v_expires;
  return next;
end;
$$;

create function public.cancel_family_invite(p_invite_id uuid) returns void
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
  update public.family_invites fi
     set cancelled_at = now()
   where fi.id = p_invite_id and fi.athlete_id = v_uid
     and fi.redeemed_at is null and fi.cancelled_at is null;
  if not found then
    raise exception 'invite not found or no longer open' using errcode = 'BR003';
  end if;
  perform private.log_audit('family.invite_cancelled', 'family_invite', p_invite_id::text, v_uid, '{}'::jsonb, v_uid);
end;
$$;

-- Returns an outcome instead of raising for bad codes, so failed attempts are
-- recorded (an exception would roll back the audit row) and rate-limited.
create function public.redeem_family_invite(p_code text, p_relationship public.family_relationship)
returns table (outcome text, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.family_invites%rowtype;
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'parent') then
    raise exception 'only parent/guardian accounts can redeem a family invite' using errcode = 'BR002';
  end if;
  if not private.is_adult(v_uid) then
    raise exception 'parent/guardian accounts must belong to an adult; complete the age step first' using errcode = 'BR004';
  end if;
  if p_relationship is null then
    raise exception 'relationship is required' using errcode = 'BR003';
  end if;

  if (select count(*) from public.audit_events e
       where e.actor_id = v_uid and e.action = 'family.invite_redeem_failed'
         and e.occurred_at > now() - interval '1 hour') >= 10 then
    outcome := 'too_many_attempts';
    link_id := null;
    return next;
    return;
  end if;

  select * into v_invite
    from public.family_invites fi
   where fi.code_hash = private.family_code_hash(p_code)
     and fi.redeemed_at is null and fi.cancelled_at is null and fi.expires_at > now()
   for update;

  if not found or v_invite.athlete_id = v_uid then
    perform private.log_audit('family.invite_redeem_failed', 'family_invite', null, null, '{}'::jsonb, v_uid);
    outcome := 'invalid_or_expired';
    link_id := null;
    return next;
    return;
  end if;

  -- Serialize per athlete so concurrent redemptions cannot exceed the limit.
  perform 1 from public.athletes a where a.user_id = v_invite.athlete_id for update;

  select l.id into v_link
    from public.family_links l
   where l.athlete_id = v_invite.athlete_id and l.guardian_id = v_uid
     and l.status in ('pending_athlete_approval', 'active', 'reconsent_required');

  if v_link is null then
    if (select count(*) from public.family_links l
         where l.athlete_id = v_invite.athlete_id
           and l.status in ('pending_athlete_approval', 'active', 'reconsent_required')) >= 4 then
      outcome := 'athlete_link_limit_reached';
      link_id := null;
      return next;
      return;
    end if;
    insert into public.family_links (athlete_id, guardian_id, relationship)
    values (v_invite.athlete_id, v_uid, p_relationship)
    returning id into v_link;
  end if;

  update public.family_invites fi
     set redeemed_at = now(), redeemed_by = v_uid
   where fi.id = v_invite.id;

  perform private.log_audit('family.invite_redeemed', 'family_link', v_link::text,
                            v_invite.athlete_id, jsonb_build_object('relationship', p_relationship), v_uid);

  outcome := 'pending_athlete_approval';
  link_id := v_link;
  return next;
end;
$$;

-- Lets each side see who is on the other end. The athlete sees the guardian's
-- name and account email before approving; guardians see the athlete's name.
-- Once a link has ended, neither side sees the other's current details.
create function public.list_family_links()
returns table (
  link_id uuid,
  my_side text,
  other_party_name text,
  other_party_email text,
  relationship public.family_relationship,
  status public.family_link_status,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         case when l.athlete_id = (select auth.uid()) then 'athlete' else 'guardian' end,
         case when l.status <> 'ended' then p.display_name end,
         case when l.athlete_id = (select auth.uid()) and l.status <> 'ended' then u.email::text end,
         l.relationship,
         l.status,
         l.created_at,
         l.approved_at
    from public.family_links l
    join public.profiles p
      on p.id = case when l.athlete_id = (select auth.uid()) then l.guardian_id else l.athlete_id end
    join auth.users u on u.id = p.id
   where (select auth.uid()) in (l.athlete_id, l.guardian_id)
   order by l.created_at desc
$$;

create function public.approve_family_link(p_link_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_minor boolean;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  v_minor := private.is_minor(v_uid);

  update public.family_links l
     set status = 'active',
         approved_at = now(),
         established_while_minor = v_minor
   where l.id = p_link_id and l.athlete_id = v_uid
     and l.status in ('pending_athlete_approval', 'reconsent_required');

  if not found then
    raise exception 'family link not found or not awaiting your approval' using errcode = 'BR003';
  end if;

  perform private.log_audit('family.link_approved', 'family_link', p_link_id::text, v_uid,
                            jsonb_build_object('athlete_is_minor', v_minor), v_uid);
end;
$$;

create function public.end_family_link(p_link_id uuid) returns void
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
  if not exists (select 1 from public.family_links l
                  where l.id = p_link_id and v_uid in (l.athlete_id, l.guardian_id) and l.status <> 'ended') then
    raise exception 'family link not found' using errcode = 'BR003';
  end if;
  perform private.end_family_link_internal(p_link_id, v_uid, 'family_link_ended');
end;
$$;

-- -----------------------------------------------------------------------------
-- Consent RPCs
-- -----------------------------------------------------------------------------
create function public.grant_consent(
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

create function public.approve_consent_as_guardian(p_grant_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_grant public.consent_grants%rowtype;
  v_athlete uuid;
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;

  -- Lock the athlete first (same order as ending a link), then the grant.
  select g.athlete_id into v_athlete from public.consent_grants g where g.id = p_grant_id;
  if found then
    perform 1 from public.athletes a where a.user_id = v_athlete for update;
  end if;
  select * into v_grant from public.consent_grants g where g.id = p_grant_id for update;
  if not found or not private.guardian_oversees(v_uid, v_grant.athlete_id, v_grant.scope, v_grant.grantee_id) then
    raise exception 'consent request not found' using errcode = 'BR003';
  end if;
  -- Pending requests, or active grants that need (re-)approval because the
  -- rules or the athlete's recorded age changed since they were made.
  if not (v_grant.status = 'pending_guardian'
          or (v_grant.status = 'active'
              and private.grant_needs_guardian_approval(v_grant.athlete_id, v_grant.scope, v_grant.grantee_id)
              and not private.has_valid_guardian_approval(v_grant.athlete_id, v_grant.guardian_link_id))) then
    raise exception 'this request is not awaiting guardian approval' using errcode = 'BR004';
  end if;

  select l.id into v_link from public.family_links l
   where l.athlete_id = v_grant.athlete_id and l.guardian_id = v_uid
     and l.status = 'active' and l.relationship in ('parent', 'legal_guardian')
   limit 1;

  update public.consent_grants g
     set status = 'active', activated_at = now(),
         guardian_approved_by = v_uid, guardian_approved_at = now(), guardian_link_id = v_link
   where g.id = p_grant_id;

  perform private.log_audit('consent.guardian_approved', 'consent_grant', p_grant_id::text,
                            v_grant.athlete_id, jsonb_build_object('scope', v_grant.scope), v_uid);
end;
$$;

-- The athlete can always withdraw. A linked parent or legal guardian can
-- withdraw (or decline) the coach-facing permissions of a minor athlete.
create function public.revoke_consent(p_grant_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_grant public.consent_grants%rowtype;
  v_by_athlete boolean;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;

  perform 1 from public.athletes a
   where a.user_id = (select g.athlete_id from public.consent_grants g where g.id = p_grant_id)
     for update;
  select * into v_grant from public.consent_grants g where g.id = p_grant_id for update;
  if not found then
    raise exception 'permission not found' using errcode = 'BR003';
  end if;
  v_by_athlete := v_grant.athlete_id = v_uid;
  if not v_by_athlete
     and not private.guardian_oversees(v_uid, v_grant.athlete_id, v_grant.scope, v_grant.grantee_id) then
    raise exception 'permission not found' using errcode = 'BR003';
  end if;
  if v_grant.status not in ('pending_guardian', 'active') then
    raise exception 'this permission is already inactive' using errcode = 'BR004';
  end if;

  update public.consent_grants g
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid,
         revocation_reason = case when v_by_athlete then 'withdrawn_by_athlete' else 'withdrawn_by_guardian' end
   where g.id = p_grant_id;

  perform private.log_audit('consent.revoked', 'consent_grant', p_grant_id::text, v_grant.athlete_id,
                            jsonb_build_object('scope', v_grant.scope,
                                               'by', case when v_by_athlete then 'athlete' else 'guardian' end),
                            v_uid);
end;
$$;

revoke all on function public.create_family_invite() from public, anon, authenticated, service_role;
revoke all on function public.cancel_family_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.redeem_family_invite(text, public.family_relationship) from public, anon, authenticated, service_role;
revoke all on function public.list_family_links() from public, anon, authenticated, service_role;
revoke all on function public.approve_family_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.end_family_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.grant_consent(public.consent_scope, text, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.approve_consent_as_guardian(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_consent(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_family_invite() to authenticated;
grant execute on function public.cancel_family_invite(uuid) to authenticated;
grant execute on function public.redeem_family_invite(text, public.family_relationship) to authenticated;
grant execute on function public.list_family_links() to authenticated;
grant execute on function public.approve_family_link(uuid) to authenticated;
grant execute on function public.end_family_link(uuid) to authenticated;
grant execute on function public.grant_consent(public.consent_scope, text, uuid, timestamptz) to authenticated;
grant execute on function public.approve_consent_as_guardian(uuid) to authenticated;
grant execute on function public.revoke_consent(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Scheduled maintenance
-- -----------------------------------------------------------------------------
create function private.expire_consent_grants() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.consent_grants g
       set status = 'expired'
     where g.status = 'active' and g.expires_at is not null and g.expires_at <= now()
    returning g.id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- When an athlete turns 18, links approved while they were a minor require the
-- adult athlete's re-approval, and permissions given to that guardian end.
create function private.process_majority_transitions() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link record;
  v_count integer := 0;
begin
  for v_link in
    select l.id, l.athlete_id, l.guardian_id
      from public.family_links l
     where l.status = 'active'
       and coalesce(l.established_while_minor, true)
       and not private.is_minor(l.athlete_id)
     for update
  loop
    update public.family_links l set status = 'reconsent_required' where l.id = v_link.id;

    update public.consent_grants g
       set status = 'revoked', revoked_at = now(), revocation_reason = 'athlete_reached_majority'
     where g.athlete_id = v_link.athlete_id and g.grantee_id = v_link.guardian_id
       and g.status in ('pending_guardian', 'active');

    perform private.log_audit('family.reconsent_required', 'family_link', v_link.id::text,
                              v_link.athlete_id, jsonb_build_object('reason', 'athlete_reached_majority'), null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_consent_grants() from public;
revoke all on function private.process_majority_transitions() from public;

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.family_invites enable row level security;
alter table public.family_links enable row level security;
alter table public.consent_scope_rules enable row level security;
alter table public.consent_grants enable row level security;

revoke all on table public.family_invites, public.family_links, public.consent_scope_rules, public.consent_grants
  from anon, authenticated, service_role;

grant select (id, athlete_id, expires_at, redeemed_at, redeemed_by, cancelled_at, created_at)
  on table public.family_invites to authenticated;
grant select on table public.family_links to authenticated;
grant select on table public.consent_scope_rules to authenticated;
grant select (id, athlete_id, scope, audience, grantee_id, status, consent_text_version, created_at,
              activated_at, guardian_approved_at, expires_at, revoked_at, revocation_reason, updated_at)
  on table public.consent_grants to authenticated;

create policy family_invites_select_own on public.family_invites
  for select to authenticated
  using (athlete_id = (select auth.uid()));

create policy family_links_select_participants on public.family_links
  for select to authenticated
  using (athlete_id = (select auth.uid()) or guardian_id = (select auth.uid()) or private.is_admin());

create policy consent_scope_rules_readable on public.consent_scope_rules
  for select to authenticated
  using (true);

-- Athletes see all of their grants; a named grantee sees only active grants
-- made to them; a parent/legal guardian of a minor sees the grants they oversee.
create policy consent_grants_select on public.consent_grants
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or (grantee_id = (select auth.uid()) and status = 'active')
    or private.guardian_oversees((select auth.uid()), athlete_id, scope, grantee_id)
    or private.is_admin()
  );

-- Athlete records: linked guardians see the basic record; verified coaches see
-- it only while the athlete's coach_discovery permission is effective.
create policy athletes_select_linked_guardian on public.athletes
  for select to authenticated
  using (private.guardian_can_view((select auth.uid()), user_id));

create policy athletes_select_discoverable_for_verified_coaches on public.athletes
  for select to authenticated
  using (private.coach_can_view((select auth.uid()), user_id, 'coach_discovery'));
