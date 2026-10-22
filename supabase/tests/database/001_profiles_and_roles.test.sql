-- Profiles, roles, onboarding and age rules.

select tests.create_user('athlete_adult', 'athlete', p_date_of_birth => date '2000-03-15', p_display_name => 'Adult Athlete');
select tests.create_user('athlete_minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date);
select tests.create_user('parent', 'parent', p_date_of_birth => date '1980-06-01');
select tests.create_user('coach_edu', 'coach', 'pat.coach@state.edu', p_date_of_birth => date '1982-02-02');
select tests.create_user('coach_unconfirmed', 'coach', 'new.coach@state.edu', p_email_confirmed => false);
select tests.create_user('wants_admin', 'admin');
select tests.create_user('no_type', null);
select tests.create_user('anonymous_visitor', 'coach', p_is_anonymous => true);
select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
-- Isolate the bootstrap test from any administrators already in the target
-- database (relevant when run against a shared dev project; rolled back).
delete from public.user_roles where role = 'admin';
select private.bootstrap_first_admin('admin@baserecruits.test');

-- ---------------------------------------------------------------- signup trigger
select tests.ok(
  (select primary_role = 'athlete' and role_selected_at is not null from public.profiles where id = tests.id('athlete_adult')),
  'an account has a profile with its once-chosen role');
select tests.ok(
  exists (select 1 from public.user_roles where user_id = tests.id('athlete_adult') and role = 'athlete')
  and exists (select 1 from public.athletes where user_id = tests.id('athlete_adult'))
  and exists (select 1 from public.user_settings where user_id = tests.id('athlete_adult')),
  'choosing athlete provisions the role, athlete record and settings');
select tests.ok(
  (select display_name = 'Adult Athlete' from public.profiles where id = tests.id('athlete_adult')),
  'the chosen display name is stored');
select tests.ok(
  not exists (select 1 from public.user_roles where user_id = tests.id('wants_admin'))
  and (select primary_role is null from public.profiles where id = tests.id('wants_admin')),
  'admin can never be self-selected');
select tests.ok(
  not exists (select 1 from public.user_roles where user_id = tests.id('anonymous_visitor')),
  'anonymous sessions never receive a role');
select tests.ok(
  (select verification_status = 'email_verified' and work_email = 'pat.coach@state.edu'
     from public.coaches where user_id = tests.id('coach_edu')),
  'coach signup with a confirmed email starts at email_verified');
select tests.ok(
  (select verification_status = 'unverified' from public.coaches where user_id = tests.id('coach_unconfirmed')),
  'coach signup without email confirmation starts unverified');
select tests.ok(
  not exists (select 1 from public.user_roles where user_id = tests.id('no_type')),
  'missing account type leaves the account without a role until onboarding');

-- ---------------------------------------------------------------- profile RLS
select tests.authenticate_as('athlete_adult');
select tests.ok(tests.visible_count('select * from public.profiles') = 1,
  'an athlete sees only their own profile');
select tests.ok(tests.visible_count('select * from public.user_roles') = 1,
  'an athlete sees only their own roles');
select tests.lives(
  format('update public.profiles set display_name = %L where id = %L', 'Renamed', tests.id('athlete_adult')),
  'an athlete can change their own display name');
select tests.throws(
  format('update public.profiles set primary_role = %L where id = %L', 'admin', tests.id('athlete_adult')),
  '42501', 'an athlete cannot change their own primary role');
select tests.throws(
  format('update public.profiles set date_of_birth = %L where id = %L', '2001-01-01', tests.id('athlete_adult')),
  '42501', 'an athlete cannot rewrite their date of birth directly');
select tests.ok(
  tests.affected_rows(format('update public.profiles set display_name = %L where id = %L',
                             'Hijacked', tests.id('parent'))) = 0,
  'an athlete cannot update someone else''s profile');
select tests.throws(
  format('insert into public.user_roles (user_id, role) values (%L, %L)', tests.id('athlete_adult'), 'admin'),
  '42501', 'an athlete cannot grant themselves a role');
select tests.throws(
  format('delete from public.user_roles where user_id = %L', tests.id('athlete_adult')),
  '42501', 'an athlete cannot delete role rows');
select tests.lives(
  format('update public.athletes set graduation_year = 2027, home_state = %L where user_id = %L', 'NY', tests.id('athlete_adult')),
  'an athlete can update their own athlete record');
select tests.throws(
  format('update public.athletes set home_state = %L where user_id = %L', 'ny', tests.id('athlete_adult')),
  '23514', 'state codes must be two uppercase letters');
select tests.throws('select public.admin_grant_role(gen_random_uuid(), ''admin'')', 'BR002',
  'a non-admin cannot call admin_grant_role');

select tests.authenticate_as_anon();
select tests.throws('select * from public.profiles', '42501', 'anonymous visitors cannot read profiles');
select tests.throws('select * from public.athletes', '42501', 'anonymous visitors cannot read athlete records');
select tests.throws('select * from public.user_roles', '42501', 'anonymous visitors cannot read roles');

select tests.authenticate_as_service_role();
select tests.throws('select * from public.profiles', '42501', 'the service role cannot read profiles directly');
select tests.throws(
  format('insert into public.user_roles (user_id, role) values (%L, %L)', tests.id('athlete_adult'), 'admin'),
  '42501', 'the service role cannot grant roles directly');

-- ---------------------------------------------------------------- onboarding
select tests.authenticate_as('anonymous_visitor');
select tests.throws('select public.complete_onboarding(''coach'')', 'BR002',
  'an anonymous session cannot pick a role');

select tests.authenticate_as('no_type');
select tests.throws('select public.complete_onboarding(''admin'')', 'BR003',
  'onboarding cannot select the admin role');
select tests.lives('select public.complete_onboarding(''athlete'', ''Jordan Athlete'')',
  'onboarding can select a self-selectable role');
select tests.ok(
  (select primary_role = 'athlete' and role_selected_at is not null from public.profiles where id = tests.id('no_type')),
  'onboarding sets the primary role once');
select tests.throws('select public.complete_onboarding(''coach'')', 'BR004',
  'onboarding cannot be repeated to add roles');

-- ---------------------------------------------------------------- age rules
select tests.throws(
  format('select public.record_birthdate(%L)', private.today_utc() + 1),
  'BR003', 'a future date of birth is refused');
select tests.ok(
  public.record_birthdate((private.today_utc() - interval '16 years')::date) = 'minor',
  'recording a 16-year-old date of birth reports a minor');
select tests.throws(
  format('select public.record_birthdate(%L)', date '1990-01-01'),
  'BR004', 'a recorded date of birth cannot be changed self-service');
select tests.throws(
  format('select public.admin_record_birthdate(%L, %L)', tests.id('no_type'), date '1990-01-01'),
  '42501', 'signed-in users cannot call the server-only birthdate function');

select tests.clear_authentication();
select tests.create_user('young_visitor', 'athlete');
select tests.authenticate_as('young_visitor');
select tests.ok(
  public.record_birthdate((private.today_utc() - interval '12 years')::date) = 'under_minimum_age',
  'an under-13 date of birth is refused');
select tests.ok(
  (select count(*) from public.profiles where id = tests.id('young_visitor')
      and date_of_birth is null and age_screen_blocked_at is not null) = 1,
  'nothing about the under-13 answer is stored except the block');
select tests.throws(
  format('select public.record_birthdate(%L)', date '2000-01-01'),
  'BR013', 'after an under-13 answer the age step cannot be retried with another date');

select tests.clear_authentication();
select tests.create_user('fresh_signup', 'athlete');
select tests.authenticate_as_service_role();
select tests.ok(
  public.admin_record_birthdate(tests.id('fresh_signup'), date '2004-07-04') = 'adult',
  'the server records the age-screen date of birth for a brand-new account');
select tests.throws(
  format('select public.admin_record_birthdate(%L, %L)', tests.id('fresh_signup'), date '2004-07-04'),
  'BR004', 'the server cannot overwrite a recorded date of birth');
select tests.clear_authentication();
update public.profiles set created_at = now() - interval '2 hours', date_of_birth = null
 where id = tests.id('fresh_signup');
select tests.authenticate_as_service_role();
select tests.throws(
  format('select public.admin_record_birthdate(%L, %L)', tests.id('fresh_signup'), date '2004-07-04'),
  'BR004', 'the server-only path only works for accounts created in the last hour');
select tests.clear_authentication();

select tests.ok(private.age_in_years(date '2008-02-29', date '2026-02-28') = 17,
  'a February 29 birthday is not 18 on February 28 of a non-leap year');
select tests.ok(private.age_in_years(date '2008-02-29', date '2026-03-01') = 18,
  'a February 29 birthday turns 18 on March 1 of a non-leap year');
select tests.ok(private.is_minor(tests.id('athlete_minor')), 'a 15-year-old is a minor');
select tests.ok(not private.is_minor(tests.id('athlete_adult')), 'an athlete born in 2000 is an adult');
select tests.ok(private.is_minor(tests.id('wants_admin')), 'unknown age is treated as a minor');
select tests.ok(not private.is_adult(tests.id('wants_admin')), 'unknown age is never treated as an adult');

-- ---------------------------------------------------------------- admin
select tests.throws('select private.bootstrap_first_admin(''athlete_adult@example.test'')', 'BR004',
  'admin bootstrap only works while no admin exists');
select tests.authenticate_as('admin');
select tests.ok(tests.visible_count('select * from public.profiles') >= 9, 'an admin can see all profiles');
select tests.lives(format('select public.admin_grant_role(%L, %L)', tests.id('parent'), 'coach'),
  'an admin can grant the coach role');
select tests.ok(
  (select verification_status = 'email_verified' from public.coaches where user_id = tests.id('parent')),
  'granting the coach role does not verify the coach');
select tests.throws(format('select public.admin_revoke_role(%L, %L)', tests.id('admin'), 'admin'),
  'BR004', 'the last admin cannot be removed');
select tests.lives(format('select public.admin_revoke_role(%L, %L)', tests.id('athlete_minor'), 'athlete'),
  'an admin can remove a role');
select tests.authenticate_as('athlete_minor');
select tests.throws('select public.complete_onboarding(''coach'')', 'BR004',
  'a user cannot use onboarding to undo an admin''s role removal');

-- ---------------------------------------------------------------- audit
select tests.clear_authentication();
select tests.ok(
  exists (select 1 from public.audit_events
           where action = 'account.created' and subject_user_id = tests.id('athlete_adult')),
  'account creation is audited');
select tests.ok(
  exists (select 1 from public.audit_events
           where action = 'row.user_roles.delete' and subject_user_id = tests.id('athlete_minor')),
  'every role change is captured by the row-level audit trigger');
select tests.authenticate_as('athlete_adult');
select tests.ok(
  tests.visible_count('select * from public.audit_events where subject_user_id is distinct from auth.uid() and actor_id is distinct from auth.uid()') = 0,
  'users only see audit events about themselves or by themselves');

-- ---------------------------------------------------------------- account deletion
select tests.clear_authentication();
delete from auth.users where id = tests.id('athlete_adult');
select tests.ok(
  not exists (select 1 from public.profiles where id = tests.id('athlete_adult'))
  and not exists (select 1 from public.athletes where user_id = tests.id('athlete_adult'))
  and not exists (select 1 from public.user_roles where user_id = tests.id('athlete_adult')),
  'deleting an account removes its profile, roles and athlete record');
select tests.ok(
  exists (select 1 from public.audit_events where subject_user_id = tests.id('athlete_adult')),
  'the audit trail survives account deletion (identifiers only)');
