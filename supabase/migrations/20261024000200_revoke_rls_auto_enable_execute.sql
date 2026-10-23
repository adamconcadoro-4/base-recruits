-- Security advisor 0028/0029: public.rls_auto_enable() is Supabase's
-- "enable RLS automatically" event-trigger function (created by the dashboard,
-- not by these migrations). It is SECURITY DEFINER in the exposed schema and
-- was executable through the API by anon and authenticated.
--
-- Event triggers fire without an EXECUTE check, so revoking it keeps the
-- safety net working: verified locally by creating a table as a non-superuser
-- after the revoke (row-level security was still switched on).
--
-- A no-op where the function does not exist (local and CI databases).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
