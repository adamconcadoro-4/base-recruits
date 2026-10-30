-- Test accounts: only brand-new accounts the server stamped for this
-- administrator can become test players and parents; administrators can switch
-- only to recorded test accounts; test players get the normal age rules and
-- never appear to college coaches through audience-wide sharing.

select tests.create_user('admin', 'parent', 'testacct.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('admin2', 'parent', 'testacct.admin2@baserecruits.test', p_date_of_birth => (current_date - interval '50 years')::date);
select tests.make_admin('admin2');
select tests.create_user('real_athlete', 'athlete', p_date_of_birth => (current_date - interval '20 years')::date);
select tests.create_user('college', 'coach', 'recruiter@example.edu', p_date_of_birth => (current_date - interval '40 years')::date);
select tests.verify_coach('college', 'admin');

-- What the server does with the Auth admin API: a confirmed account with no
-- role, stamped in app metadata (which only the service role can write).
create function pg_temp.server_created(p_name text, p_admin text) returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  values (v_id, 'authenticated', 'authenticated', p_name || '@test.baserecruits.test', '{}'::jsonb,
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                             'br_test_account_requested_by', tests.id(p_admin)),
          now(), now(), now());
  insert into tests.fixtures (name, id) values (p_name, v_id);
  return v_id;
end;
$$;

select pg_temp.server_created('t_player', 'admin');
select pg_temp.server_created('t_parent', 'admin');
select pg_temp.server_created('t_minor', 'admin');
select pg_temp.server_created('t_other_admins', 'admin2');
-- A real sign-up that has not chosen a role yet (no stamp).
select tests.create_user('fresh_signup');

-- ================================================================ who can set up test accounts
select tests.authenticate_as('real_athlete');
select tests.throws(format('select public.admin_setup_test_family(%L, %L)', tests.id('t_player'), tests.id('t_parent')),
  'BR002', 'only administrators set up test accounts');
select tests.authenticate_as('admin');
select tests.throws(format('select public.admin_setup_test_family(%L)', tests.id('fresh_signup')),
  'BR002', 'a real account without the server''s stamp can never become a test account');
select tests.throws(format('select public.admin_setup_test_family(%L)', tests.id('real_athlete')),
  'BR002', 'an existing real athlete can never become a test account');
select tests.throws(format('select public.admin_setup_test_family(%L)', tests.id('t_other_admins')),
  'BR002', 'an account stamped for another administrator is refused');
select tests.throws(format('select public.admin_setup_test_family(%L, %L)', tests.id('t_player'), tests.id('t_player')),
  'BR003', 'the player and parent must be different accounts');

-- ================================================================ an 18+ player with a linked parent
select tests.ok(
  (select public.admin_setup_test_family(tests.id('t_player'), tests.id('t_parent'))) = 1,
  'the first test family is number 1');
select tests.clear_authentication();
select tests.ok(private.has_role(tests.id('t_player'), 'athlete') and private.is_adult(tests.id('t_player')),
  'the test player is an athlete aged 18 or older');
select tests.ok(private.has_role(tests.id('t_parent'), 'parent') and private.is_adult(tests.id('t_parent')),
  'the test parent is an adult parent account');
select tests.ok(
  (select display_name = 'Test player 1 (18+)' and primary_role = 'athlete' and birthdate_recorded_at is not null
     from public.profiles where id = tests.id('t_player')),
  'the test player is labelled as a test account and has finished onboarding');
select tests.ok(private.guardian_can_view(tests.id('t_parent'), tests.id('t_player'), 'family_assessments'),
  'the test parent is linked and the player''s assessments are shared with them');
select tests.ok(private.can_work_on_assessments(tests.id('t_parent'), tests.id('t_player')),
  'the test parent can work on the test player''s assessments, as a real linked parent can');
select tests.ok(exists (select 1 from public.audit_events where action = 'test_account.family_created' and actor_id = tests.id('admin')),
  'creating a test family is audited with the administrator');

select tests.authenticate_as('admin');
select tests.throws(format('select public.admin_setup_test_family(%L)', tests.id('t_player')),
  'BR002', 'an account cannot be set up twice');

-- ================================================================ an under-18 player, no parent
select tests.ok((select public.admin_setup_test_family(tests.id('t_minor'), null, true)) = 2,
  'the next family gets the next number');
select tests.clear_authentication();
select tests.ok(private.is_minor(tests.id('t_minor')) and private.has_role(tests.id('t_minor'), 'athlete'),
  'an under-18 test player follows the minor rules');
select tests.ok((select display_name from public.profiles where id = tests.id('t_minor')) = 'Test player 2 (under 18)',
  'the under-18 test player is labelled');

-- ================================================================ reading test accounts
select tests.authenticate_as('t_player');
select tests.ok(tests.visible_count('select * from public.test_accounts') = 1, 'a test account sees only its own row');
select tests.authenticate_as('real_athlete');
select tests.ok(tests.visible_count('select * from public.test_accounts') = 0, 'real accounts see no test accounts');
select tests.authenticate_as('admin2');
select tests.ok(tests.visible_count('select * from public.test_accounts') = 3, 'administrators see every test account');

-- ================================================================ switching to a test account
select tests.ok(public.admin_test_account_email(tests.id('t_player')) = 't_player@test.baserecruits.test',
  'an administrator gets a test account''s sign-in address');
select tests.ok(exists (select 1 from public.audit_events where action = 'test_account.opened'
                          and actor_id = tests.id('admin2') and subject_user_id = tests.id('t_player')),
  'opening a test account is audited');
select tests.throws(format('select public.admin_test_account_email(%L)', tests.id('real_athlete')),
  'BR003', 'an administrator can never switch to a real account');
select tests.throws(format('select public.admin_test_account_email(%L)', tests.id('t_other_admins')),
  'BR003', 'an account that was never set up as a test account cannot be opened');
select tests.authenticate_as('t_parent');
select tests.throws(format('select public.admin_test_account_email(%L)', tests.id('t_player')),
  'BR002', 'only administrators can switch to a test account');
select tests.authenticate_as_service_role();
select tests.throws(format('select public.admin_test_account_email(%L)', tests.id('t_player')),
  '42501', 'the service role cannot look up test accounts directly');

-- ================================================================ college coaches
select tests.authenticate_as('t_player');
select tests.lives($$select * from public.grant_consent('coach_discovery', 'coach-discovery-v1')$$,
  'a test player can still go through the sharing screens');
select tests.lives($$select * from public.grant_consent('coach_athletic_metrics', 'coach-athletic-metrics-v1')$$,
  'a test player shares metrics with all verified coaches');
select tests.authenticate_as('real_athlete');
select * from public.grant_consent('coach_discovery', 'coach-discovery-v1');
select * from public.grant_consent('coach_athletic_metrics', 'coach-athletic-metrics-v1');
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('college'), tests.id('t_player'), 'coach_discovery')
                and not private.coach_can_view(tests.id('college'), tests.id('t_player'), 'coach_athletic_metrics'),
  'college coaches never find a test player through search or audience-wide sharing');
select tests.ok(private.coach_can_view(tests.id('college'), tests.id('real_athlete'), 'coach_athletic_metrics'),
  'real athletes who share with all verified coaches are unaffected');
