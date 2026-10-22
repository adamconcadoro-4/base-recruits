-- Structural guardrails that catch mistakes in future migrations.

-- ---------------------------------------------------------------- RLS everywhere
select tests.ok(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'every table in the public schema has row-level security enabled');

-- ---------------------------------------------------------------- table privileges
select tests.ok(
  (select array_agg(t.tablename::text order by t.tablename) from pg_tables t
    where t.schemaname = 'public' and has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT'))
  = array['admissions_statistics', 'athletic_associations', 'athletic_divisions', 'baseball_programs', 'capabilities',
          'data_sources', 'institution_aliases', 'institution_costs', 'institutions', 'plan_capabilities'],
  'anonymous visitors can read only the capability catalog and the public school registry');
select tests.ok(
  not exists (
    select 1 from pg_tables t
     where t.schemaname = 'public'
       and (has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
            or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
            or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'DELETE'))),
  'anonymous visitors cannot write to any table');
select tests.ok(
  not exists (
    select 1 from pg_tables t, unnest(array['anon', 'authenticated', 'service_role']) as r(role_name)
     where t.schemaname = 'public'
       and (has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE')
            or has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), 'REFERENCES')
            or has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), 'TRIGGER'))),
  'no API role can truncate, reference or add triggers to any table');
select tests.ok(
  not exists (
    select 1 from pg_tables t, unnest(array['authenticated', 'service_role']) as r(role_name)
     where t.schemaname = 'public'
       and (has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), 'INSERT')
            or has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), 'DELETE'))),
  'neither signed-in users nor the service role can insert or delete rows directly (all writes go through checked functions)');
select tests.ok(
  not exists (
    select 1 from pg_tables t
     where t.schemaname = 'public'
       and has_table_privilege('service_role', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')),
  'the service role cannot update any table directly');
select tests.ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace,
                  unnest(array['anon', 'authenticated', 'service_role']) as r(role_name)
     where n.nspname = 'public' and c.relkind = 'S'
       and (has_sequence_privilege(r.role_name, c.oid, 'USAGE')
            or has_sequence_privilege(r.role_name, c.oid, 'SELECT')
            or has_sequence_privilege(r.role_name, c.oid, 'UPDATE'))),
  'no API role can read or reset any sequence');
select tests.ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anonymous visitors cannot use the private schema');

-- ---------------------------------------------------------------- functions
select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every SECURITY DEFINER function pins its search_path');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'EXECUTE'))
  = array['compare_schools', 'get_school', 'registry_coverage', 'search_schools'],
  'anonymous visitors can execute only the free school-registry reads');
select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'EXECUTE') and p.prosecdef),
  'every function anonymous visitors can run is SECURITY INVOKER (row-level security still applies)');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  = array['admin_create_import_job', 'admin_discard_import_job', 'admin_finalize_import_job', 'admin_grant_role',
          'admin_publish_import_job', 'admin_restage_import_job', 'admin_review_coach', 'admin_revoke_role',
          'admin_set_import_decision', 'admin_set_institution_listing', 'admin_stage_import_rows',
          'admin_update_baseball_program', 'approve_consent_as_guardian',
          'approve_family_link', 'cancel_family_invite', 'compare_schools', 'complete_onboarding', 'create_family_invite',
          'end_family_link', 'get_school', 'grant_consent', 'guardian_consent_requests', 'list_family_links',
          'my_consent_grants', 'record_birthdate', 'redeem_family_invite', 'registry_coverage', 'revoke_consent',
          'search_schools', 'submit_coach_affiliation'],
  'signed-in users can call exactly the reviewed list of API functions');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'EXECUTE'))
  = array['admin_record_birthdate'],
  'the service role can call exactly one API function (recording the age-screen date of birth)');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  = array['age_in_years', 'can_act_as_guardian', 'coach_can_view', 'grant_needs_guardian_approval',
          'guardian_can_view', 'guardian_oversees', 'has_active_grant', 'has_capability', 'has_recorded_birthdate',
          'has_role', 'has_valid_guardian_approval', 'is_active_guardian', 'is_admin', 'is_adult',
          'is_age_blocked', 'is_minor', 'is_verified_coach', 'today_utc'],
  'only read-only policy helpers in the private schema are callable by signed-in users');
select tests.ok(
  not has_function_privilege('authenticated', 'private.bootstrap_first_admin(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.bootstrap_first_admin(text)', 'EXECUTE'),
  'admin bootstrap is only runnable by the database owner');
select tests.ok(
  not has_function_privilege('authenticated', 'private.transition_coach_status(uuid, public.coach_verification_status, text, uuid, text, boolean, timestamptz)', 'EXECUTE'),
  'the raw verification state machine is not callable by users');

-- ---------------------------------------------------------------- triggers present
select tests.ok(
  (select count(*) from pg_trigger where not tgisinternal and tgname in
    ('on_auth_user_created', 'on_auth_user_email_updated', 'audit_events_append_only', 'audit_events_no_truncate',
     'capabilities_guard_core', 'capabilities_guard_truncate', 'plan_capabilities_guard',
     'user_roles_audit', 'coaches_audit', 'family_links_audit', 'consent_grants_audit', 'profiles_audit')) = 12,
  'signup, email, append-only audit, row-level audit and free-access guard triggers are installed');
