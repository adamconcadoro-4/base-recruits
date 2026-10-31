-- Structural guardrails that catch mistakes in future migrations.

-- ---------------------------------------------------------------- RLS everywhere
select tests.ok(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'every table in the public schema has row-level security enabled');

-- ---------------------------------------------------------------- table privileges
select tests.ok(
  (select array_agg(t.tablename::text order by t.tablename) from pg_tables t
    where t.schemaname = 'public' and has_any_column_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT'))
  = array['admissions_policies', 'admissions_statistics', 'athletic_associations', 'athletic_divisions', 'baseball_programs',
          'capabilities', 'data_sources', 'institution_aliases', 'institution_costs', 'institutions', 'plan_capabilities',
          'program_areas'],
  'anonymous visitors can read only the capability catalog and the public school registry');
select tests.ok(
  not exists (
    select 1 from (values ('baseball_programs', 'verified_by'), ('baseball_programs', 'verification_note'),
                          ('baseball_programs', 'import_job_id'), ('institutions', 'import_job_id'),
                          ('admissions_statistics', 'import_job_id'), ('institution_costs', 'import_job_id')) c(t, col),
                  unnest(array['anon', 'authenticated']) as r(role_name)
     where has_column_privilege(r.role_name, format('public.%I', c.t), c.col, 'SELECT')),
  'who reviewed a program, their notes and import ids are not readable through the Data API');
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
  = array['compare_schools', 'current_admissions_policies', 'get_school', 'registry_coverage', 'schools_by_slugs',
          'search_schools'],
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
  = array['add_assessment_annotation', 'add_assessment_repetitions', 'add_training_assignment', 'add_zone_round',
          'admin_add_baseball_program', 'admin_add_benchmark_values', 'admin_create_benchmark_release',
          'admin_create_import_job', 'admin_discard_import_job', 'admin_finalize_import_job', 'admin_grant_role',
          'admin_publish_import_job', 'admin_resolve_correction_report', 'admin_restage_import_job',
          'admin_retire_admissions_policy', 'admin_review_coach', 'admin_revoke_role', 'admin_set_admissions_policy',
          'admin_set_assessment_switches', 'admin_set_benchmark_release_status',
          'admin_set_import_decision', 'admin_set_institution_listing', 'admin_set_seamstate_settings', 'admin_setup_test_family', 'admin_stage_import_rows',
          'admin_test_account_email', 'admin_update_baseball_program', 'approve_consent_as_guardian', 'approve_development_coach_link',
          'approve_family_link', 'approve_training_plan', 'approve_zone_next_plan', 'assessment_athletes', 'assessment_family_access',
          'assessment_switches', 'begin_assessment_deletion', 'begin_assessment_upload', 'cancel_development_coach_invite', 'cancel_family_invite',
          'compare_schools', 'complete_assessment_upload', 'complete_onboarding', 'complete_training_plan',
          'create_assessment', 'create_development_coach_invite', 'create_family_invite', 'create_reassessment',
          'create_training_plan', 'create_zone_session', 'current_admissions_policies', 'decline_development_coach_link', 'delete_assessment',
          'delete_assessment_annotation', 'delete_assessment_observation', 'delete_assessment_repetition',
          'delete_training_log', 'delete_zone_event', 'delete_zone_session', 'end_development_coach_link', 'end_family_link', 'get_school', 'grant_consent',
          'guardian_consent_requests', 'import_assessment_measurements', 'list_development_coach_links',
          'list_family_links', 'log_training', 'log_zone_event', 'my_assessment_report_shares', 'my_consent_grants',
          'my_development_coach_invites', 'my_saved_schools', 'preview_assessment_report', 'publish_assessment',
          'record_assessment_observation', 'record_birthdate', 'record_interval_from_markers',
          'redeem_development_coach_invite', 'redeem_family_invite', 'registry_coverage', 'remove_assessment_media',
          'remove_training_assignment', 'reopen_assessment', 'replace_training_assignment', 'retire_assessment_target', 'review_zone_round', 'review_zone_session',
          'revoke_consent', 'save_schools', 'schools_by_slugs', 'seamstate_cancel_analysis', 'seamstate_permission', 'seamstate_request_analysis',
          'seamstate_review_finding', 'seamstate_switches', 'search_schools', 'set_assessment_baseline',
          'set_assessment_repetition_status', 'set_assessment_status', 'set_assessment_target',
          'set_observation_quality', 'set_reassessment_date', 'set_training_plan_notes', 'set_zone_assignment', 'set_zone_stage',
          'share_assessment_reports_with_coach', 'share_assessments_with_family', 'shared_assessment_reports',
          'submit_coach_affiliation', 'submit_correction_report', 'unsave_school', 'update_assessment_context',
          'update_assessment_media', 'update_assessment_repetition', 'update_training_assignment', 'update_zone_event'],
  'signed-in users can call exactly the reviewed list of API functions');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'EXECUTE'))
  = array['admin_record_birthdate', 'seamstate_worker_artifact_path', 'seamstate_worker_begin_attempt', 'seamstate_worker_due_jobs',
          'seamstate_worker_record_inspection', 'seamstate_worker_report', 'seamstate_worker_save_analysis'],
  'the service role can call exactly the age-screen birthdate function and the six SeamState worker callbacks');
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  = array['age_in_years', 'assessment_object_access', 'can_act_as_guardian', 'can_see_seamstate_job', 'can_work_on_assessment',
          'can_work_on_assessments', 'can_work_on_plan', 'coach_can_view', 'grant_needs_guardian_approval',
          'guardian_can_view', 'guardian_oversees', 'has_active_grant', 'has_capability', 'has_recorded_birthdate',
          'has_role', 'has_valid_guardian_approval', 'is_active_guardian', 'is_admin', 'is_adult',
          'is_age_blocked', 'is_minor', 'is_verified_coach', 'seamstate_object_access', 'today_utc'],
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

-- Supabase rejects UPDATE and DELETE without a WHERE clause on Data API requests
-- (safeupdate), so no function may contain one. ("do update" is an upsert.)
select tests.ok(
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral regexp_matches(lower(p.prosrc),
        '((do\s+)?\m(?:update\s+[a-z_.]+(?:\s+(?:as\s+)?[a-z_]+)?\s+set\M|delete\s+from\s+[a-z_.]+)[^;]*;)', 'g') as m
     where n.nspname in ('public', 'private')
       and m[2] is null
       and m[1] !~ '\mwhere\M'),
  'no Base Recruits function runs an UPDATE or DELETE without a WHERE clause');
