-- The audit log is append-only and private to the people it concerns.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2006-01-01');
select tests.create_user('other', 'athlete', p_date_of_birth => date '2006-02-02');

select tests.authenticate_as('athlete');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');

-- ---------------------------------------------------------------- visibility
select tests.ok(tests.visible_count('select * from public.audit_events') >= 2,
  'a user sees audit events about their own account');
select tests.ok(
  tests.visible_count(format('select * from public.audit_events where subject_user_id = %L', tests.id('other'))) = 0,
  'a user cannot see audit events about other people');
select tests.authenticate_as('admin');
select tests.ok(
  tests.visible_count(format('select * from public.audit_events where subject_user_id = %L', tests.id('other'))) >= 1,
  'admins can see all audit events');

-- ---------------------------------------------------------------- append-only
select tests.authenticate_as('athlete');
select tests.throws(
  'insert into public.audit_events (action, entity_type) values (''consent.granted'', ''forged'')',
  '42501', 'users cannot write audit events directly');
select tests.throws('update public.audit_events set action = ''x.y''', '42501', 'users cannot edit audit events');
select tests.throws('delete from public.audit_events', '42501', 'users cannot delete audit events');

select tests.authenticate_as_service_role();
select tests.ok(tests.visible_count('select * from public.audit_events') >= 1, 'the server (service role) can read the audit log');
select tests.throws(
  'insert into public.audit_events (action, entity_type) values (''consent.granted'', ''forged'')',
  '42501', 'the service role cannot forge audit events');
select tests.throws('delete from public.audit_events', '42501', 'the service role cannot delete audit events');

select tests.clear_authentication();
select tests.throws('update public.audit_events set action = ''x.y''', 'BR002',
  'even the database owner cannot edit audit events');
select tests.throws('delete from public.audit_events', 'BR002',
  'the database owner cannot delete audit events without the retention switch');
select tests.throws('truncate public.audit_events', 'BR002', 'the audit log cannot be truncated');

set local base_recruits.allow_audit_retention = 'on';
select tests.ok(
  tests.affected_rows(format('delete from public.audit_events where subject_user_id = %L', tests.id('other'))) >= 1,
  'the reviewed retention job (owner + explicit switch) can delete expired rows');
set local base_recruits.allow_audit_retention = 'off';

select tests.throws(
  'insert into public.audit_events (action, entity_type) values (''Not A Valid Action'', ''x'')',
  '23514', 'audit actions follow the dotted naming convention');
