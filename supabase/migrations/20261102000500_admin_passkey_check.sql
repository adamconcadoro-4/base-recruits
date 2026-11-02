-- =============================================================================
-- Administrator access needs a recent passkey check (founder decision,
-- 2026-11-02: "Passkeys, no password, admin check"). Decision F57.
--
-- An approved administrator (F55) only counts as an administrator while their
-- current session confirmed it's them with a passkey (Face ID, Touch ID,
-- fingerprint or device PIN) within the last 12 hours. Supabase Auth records
-- each way a session proved who it is in the access token's `amr` claim; a
-- passkey sign-in is recorded as { "method": "passkey", "timestamp": <unix> }.
--
-- The check lives in private.has_role, so every administrator function and
-- row-level policy (they all call has_role or is_admin) applies it, whether the
-- request comes from the site or straight to the API with a stolen token.
-- It applies only to the caller's own administrator role: asking whether some
-- other account is an administrator (for example the "last administrator"
-- rule) is unchanged, and so are the service role and the database owner.
-- The site shows a "Confirm it's you" step on /admin when the check is due
-- (src/lib/auth/sign-in-methods.ts uses the same 12 hours).
-- =============================================================================

create function private.admin_session_verified() returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select bool_or(
             (entry ->> 'timestamp')::numeric between extract(epoch from now()) - 12 * 60 * 60
                                                 and extract(epoch from now()) + 60
           )
      from jsonb_array_elements(
             case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
           ) as entry
     where jsonb_typeof(entry) = 'object'
       and entry ->> 'method' = 'passkey'
       and jsonb_typeof(entry -> 'timestamp') = 'number'
  ), false)
$$;
revoke all on function private.admin_session_verified() from public, anon, authenticated, service_role;

create or replace function private.has_role(p_user_id uuid, p_role public.app_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = p_role)
     and (
       p_role <> 'admin'
       or (
         private.admin_email_allowed(p_user_id)
         and (p_user_id is distinct from (select auth.uid()) or private.admin_session_verified())
       )
     )
$$;
