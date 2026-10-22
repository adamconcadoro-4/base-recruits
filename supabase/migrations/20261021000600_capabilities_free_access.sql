-- =============================================================================
-- Base Recruits — Stage 1 / Migration 6: capability catalog and free-access guards
--
-- Permanent product rule: discovery, basic academic matching, comparison,
-- shortlists, basic athlete profiles, consent-based coach discoverability and
-- verified-coach core tools are free forever. Premium plans may only sell
-- workflow and convenience.
--
-- Enforcement here (database layer):
--   * every capability is classified core_free or premium;
--   * a core_free capability cannot be re-classified, re-scoped, renamed or
--     deleted, and cannot be attached to any paid plan (raises BR020);
--   * private.has_capability() answers core_free capabilities without ever
--     consulting subscriptions.
-- The same catalog is mirrored in src/lib/entitlements/capabilities.ts and a
-- contract test fails if the two drift apart.
-- =============================================================================

create table public.capabilities (
  key text primary key
    constraint capabilities_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  tier text not null
    constraint capabilities_tier check (tier in ('core_free', 'premium')),
  audience text not null
    constraint capabilities_audience check (audience in ('anyone', 'registered', 'athlete', 'parent', 'verified_coach', 'admin')),
  description text not null,
  invariant_ref smallint
    constraint capabilities_invariant_ref check (invariant_ref is null or invariant_ref between 1 and 10),
  created_at timestamptz not null default now(),
  constraint capabilities_core_cites_invariant check (tier <> 'core_free' or invariant_ref is not null)
);
comment on table public.capabilities is
  'What the product can do and whether it is free forever (core_free) or an optional paid workflow (premium). See product invariants 1–10.';

create table public.plan_capabilities (
  plan_key text not null
    constraint plan_capabilities_plan_key check (plan_key ~ '^[a-z][a-z0-9_]{2,63}$' and plan_key <> 'base_free'),
  capability_key text not null references public.capabilities (key) on delete restrict,
  primary key (plan_key, capability_key)
);
comment on table public.plan_capabilities is
  'Premium capabilities included in each optional paid plan. Core capabilities are universal and can never appear here.';

create function private.guard_core_capability() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'free-access invariant: the capability catalog cannot be truncated' using errcode = 'BR020';
  end if;
  if tg_op = 'DELETE' then
    if old.tier = 'core_free' then
      raise exception 'free-access invariant: core capability "%" cannot be deleted', old.key using errcode = 'BR020';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.tier = 'core_free' and (
       new.tier is distinct from old.tier
       or new.audience is distinct from old.audience
       or new.key is distinct from old.key) then
    raise exception 'free-access invariant: core capability "%" must stay free and keep its audience', old.key
      using errcode = 'BR020';
  end if;
  -- Promoting a premium capability to core is welcome, but only once no paid
  -- plan sells it (otherwise a core capability would sit inside a plan).
  if old.tier = 'premium' and new.tier = 'core_free'
     and exists (select 1 from public.plan_capabilities pc where pc.capability_key = old.key) then
    raise exception 'free-access invariant: remove "%" from every paid plan before making it core', old.key
      using errcode = 'BR020';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_core_capability() from public;

create trigger capabilities_guard_core
  before update or delete on public.capabilities
  for each row execute function private.guard_core_capability();

create trigger capabilities_guard_truncate
  before truncate on public.capabilities
  for each statement execute function private.guard_core_capability();

create function private.guard_plan_capability() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tier text;
begin
  -- Lock the capability row (whatever its tier) so a concurrent re-tier of the
  -- same capability waits for this insert, or this insert waits for it.
  select c.tier into v_tier from public.capabilities c where c.key = new.capability_key for share;
  if v_tier = 'core_free' then
    raise exception 'free-access invariant: core capability "%" is free for everyone and cannot be part of a paid plan',
      new.capability_key using errcode = 'BR020';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_plan_capability() from public;

create trigger plan_capabilities_guard
  before insert or update on public.plan_capabilities
  for each row execute function private.guard_plan_capability();

-- Core answers never read subscription data. Premium answers are false until
-- Stage 6 adds billing; no paid plan is sellable before then.
create function private.has_capability(p_user_id uuid, p_capability text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier text;
  v_audience text;
begin
  select c.tier, c.audience into v_tier, v_audience
    from public.capabilities c where c.key = p_capability;
  if not found then
    return false;
  end if;

  if v_tier = 'core_free' then
    return case v_audience
      when 'anyone' then true
      when 'registered' then p_user_id is not null
      when 'athlete' then private.has_role(p_user_id, 'athlete')
      when 'parent' then private.has_role(p_user_id, 'parent')
      when 'verified_coach' then private.is_verified_coach(p_user_id)
      when 'admin' then private.has_role(p_user_id, 'admin')
      else false
    end;
  end if;

  return false;
end;
$$;
revoke all on function private.has_capability(uuid, text) from public;
grant execute on function private.has_capability(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Catalog
-- -----------------------------------------------------------------------------
insert into public.capabilities (key, tier, audience, invariant_ref, description) values
  ('school_search',               'core_free', 'anyone',         2, 'Search the national college baseball program registry.'),
  ('school_profile_view',         'core_free', 'anyone',         2, 'View institution and baseball program profiles with sources.'),
  ('academic_match_basic',        'core_free', 'anyone',         1, 'Run unlimited preliminary academic matches with explanations.'),
  ('school_compare_basic',        'core_free', 'anyone',         3, 'Compare up to five schools side by side.'),
  ('guest_shortlist',             'core_free', 'anyone',         3, 'Build a temporary on-device shortlist without an account.'),
  ('official_recruiting_links',   'core_free', 'anyone',         2, 'Open official athletics pages and recruiting questionnaires.'),
  ('shortlist_unlimited',         'core_free', 'registered',     4, 'Save unlimited schools and named shortlists to an account.'),
  ('basic_recruiting_checklist',  'core_free', 'registered',     4, 'Use the basic recruiting checklist.'),
  ('privacy_controls',            'core_free', 'registered',    10, 'Manage consent, sharing, data export and deletion.'),
  ('family_link_basic',           'core_free', 'registered',    10, 'Connect an athlete and a parent/guardian with the athlete''s approval.'),
  ('athlete_profile_basic',       'core_free', 'athlete',        5, 'Create and maintain a basic recruiting profile.'),
  ('coach_discoverability',       'core_free', 'athlete',        5, 'Choose to be discoverable by verified college coaches.'),
  ('coach_athlete_search',        'core_free', 'verified_coach', 6, 'Search athletes who chose to be discoverable.'),
  ('coach_athlete_evaluation',    'core_free', 'verified_coach', 6, 'Review shared academic and athletic information with provenance.'),
  ('coach_recruiting_boards',     'core_free', 'verified_coach', 6, 'Save athletes to private recruiting boards with notes.'),
  ('coach_messaging',             'core_free', 'verified_coach', 6, 'Message athletes who allow coach messaging.'),
  ('recruiting_pipeline_crm',      'premium', 'registered', null, 'Recruiting pipeline with custom stages and contact log.'),
  ('scheduled_reminders',          'premium', 'registered', null, 'Scheduled reminders and follow-up calendar.'),
  ('outreach_templates',           'premium', 'registered', null, 'Outreach templates and saved workflows.'),
  ('document_task_checklists',     'premium', 'registered', null, 'Document and task checklists per school.'),
  ('academic_improvement_planner', 'premium', 'registered', null, 'Deeper academic improvement planning.'),
  ('athletic_trend_visualization', 'premium', 'athlete',    null, 'Athletic metric trends over time.'),
  ('personalized_recommendations', 'premium', 'registered', null, 'Personalized multi-factor recruiting recommendations.'),
  ('advanced_transfer_organization','premium', 'athlete',   null, 'Advanced organization for transfer searches.'),
  ('engagement_analytics',         'premium', 'athlete',    null, 'Privacy-safe engagement analytics.'),
  ('historical_scattergrams',      'premium', 'registered', null, 'Historical admissions scattergrams where permissioned data exist (data-gated).'),
  ('family_multi_athlete_workspace','premium', 'parent',    null, 'Multi-athlete family workspace and household reporting.'),
  ('family_shared_calendar',       'premium', 'parent',     null, 'Synchronized family timelines and calendars.');

-- Plan contents are hypotheses for testing (see src/config/plans.ts); prices
-- live only in application config and Stripe, never in permission logic.
insert into public.plan_capabilities (plan_key, capability_key)
select p.plan_key, c.key
  from (values ('base_recruit'), ('base_elite'), ('base_family')) as p(plan_key)
  join public.capabilities c on c.key in (
    'recruiting_pipeline_crm', 'scheduled_reminders', 'outreach_templates', 'document_task_checklists')
union all
select p.plan_key, c.key
  from (values ('base_elite'), ('base_family')) as p(plan_key)
  join public.capabilities c on c.key in (
    'academic_improvement_planner', 'athletic_trend_visualization', 'personalized_recommendations',
    'advanced_transfer_organization', 'engagement_analytics', 'historical_scattergrams')
union all
select 'base_family', c.key
  from public.capabilities c
 where c.key in ('family_multi_athlete_workspace', 'family_shared_calendar');

-- -----------------------------------------------------------------------------
-- Privileges and row-level security: the catalog is public, read-only
-- -----------------------------------------------------------------------------
alter table public.capabilities enable row level security;
alter table public.plan_capabilities enable row level security;

revoke all on table public.capabilities, public.plan_capabilities from anon, authenticated, service_role;
grant select on table public.capabilities, public.plan_capabilities to anon, authenticated, service_role;

create policy capabilities_readable on public.capabilities
  for select to anon, authenticated
  using (true);

create policy plan_capabilities_readable on public.plan_capabilities
  for select to anon, authenticated
  using (true);
