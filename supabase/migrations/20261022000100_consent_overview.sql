-- =============================================================================
-- Base Recruits — Stage 1 / Migration 7: effective consent state for the athlete
--
-- A grant's stored status can read 'active' while it is not in effect (for
-- example, a minor's coach-facing grant waiting for a parent's re-approval
-- after an age correction or a guardian link ending). Screens must show the
-- effective state, so the athlete's privacy page reads it from here — computed
-- with the same rules as private.has_active_grant().
-- =============================================================================

create function public.my_consent_grants()
returns table (
  grant_id uuid,
  scope public.consent_scope,
  audience public.consent_audience,
  grantee_id uuid,
  status public.consent_status,
  in_effect boolean,
  waiting_for_guardian boolean,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id,
         g.scope,
         g.audience,
         g.grantee_id,
         g.status,
         g.status = 'active'
           and (g.expires_at is null or g.expires_at > now())
           and (not private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
                or private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)),
         g.status = 'pending_guardian'
           or (g.status = 'active'
               and private.grant_needs_guardian_approval(g.athlete_id, g.scope, g.grantee_id)
               and not private.has_valid_guardian_approval(g.athlete_id, g.guardian_link_id)),
         g.created_at,
         g.expires_at
    from public.consent_grants g
   where g.athlete_id = (select auth.uid())
     and g.status in ('pending_guardian', 'active')
   order by g.created_at desc
$$;
comment on function public.my_consent_grants() is
  'The signed-in athlete''s open grants with their effective state (in_effect) and whether a parent/legal guardian''s approval is still needed.';

revoke all on function public.my_consent_grants() from public, anon, authenticated, service_role;
grant execute on function public.my_consent_grants() to authenticated;
