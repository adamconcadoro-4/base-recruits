-- Regressions for the app-layer review: untrusted sign-up metadata, disguised
-- staff-page links, and the guardian approval list.

-- ---------------------------------------------------------------- sign-up metadata
-- Someone creates an unconfirmed account for another person's email and
-- attaches a role and a name.
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'victim.coach@state.edu',
        '{"account_type": "parent", "display_name": "Chosen By Someone Else"}',
        '{"provider":"email","providers":["email"]}', null, now(), now());
insert into tests.fixtures (name, id) values ('preregistered', '11111111-1111-4111-8111-111111111111');

select tests.ok(
  not exists (select 1 from public.user_roles where user_id = tests.id('preregistered'))
  and (select primary_role is null and role_selected_at is null and display_name is null
         from public.profiles where id = tests.id('preregistered')),
  'an unconfirmed sign-up gets no role and no name from its metadata');

-- The real owner confirms the email and chooses their own role.
update auth.users set email_confirmed_at = now() where id = tests.id('preregistered');
select tests.ok(
  not exists (select 1 from public.user_roles where user_id = tests.id('preregistered')),
  'confirming the email does not apply the earlier metadata either');
select tests.authenticate_as('preregistered');
select tests.lives('select public.complete_onboarding(''coach'', ''Real Owner'')',
  'the verified owner chooses the role');
select tests.clear_authentication();
select tests.ok(
  (select c.verification_status = 'email_verified' from public.coaches c where c.user_id = tests.id('preregistered'))
  and (select display_name = 'Real Owner' from public.profiles where id = tests.id('preregistered')),
  'a coach role chosen after confirmation starts at email_verified, with the owner''s name');

-- Metadata is ignored even on an account created already confirmed.
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
values ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'confirmed.signup@example.test',
        '{"account_type": "coach", "display_name": "User Supplied"}',
        '{"provider":"email","providers":["email"],"account_type":"coach"}', now(), now(), now());
select tests.ok(
  not exists (select 1 from public.user_roles where user_id = '22222222-2222-4222-8222-222222222222')
  and (select primary_role is null and display_name is null from public.profiles
        where id = '22222222-2222-4222-8222-222222222222'),
  'sign-up metadata never grants a role or sets a name, confirmed or not');

-- ---------------------------------------------------------------- staff-page links
select tests.create_user('coach', 'coach', 'real.coach@state.edu', p_date_of_birth => date '1980-01-01');
select tests.authenticate_as('coach');
select tests.throws(
  'select public.submit_coach_affiliation(''State University'', ''Assistant Coach'', ''https://gostate.edu@evil.example/baseball/staff'')',
  '23514', 'a staff-page link with a user name in it is rejected');
select tests.lives(
  'select public.submit_coach_affiliation(''State University'', ''Assistant Coach'', ''https://gostate.edu/sports/baseball/coaches?view=2#staff'')',
  'an ordinary staff-page link is accepted');

-- ---------------------------------------------------------------- guardian approvals
select tests.create_user('minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date,
                         p_display_name => 'Minor Athlete');
select tests.create_user('parent', 'parent', p_date_of_birth => date '1975-05-05');
select tests.create_user('aunt', 'parent', p_date_of_birth => date '1972-02-02');
select tests.create_user('stranger', 'parent', p_date_of_birth => date '1970-01-01');

create temporary table codes (name text primary key, code text);
grant select, insert on codes to authenticated;
select tests.authenticate_as('minor');
insert into codes select 'parent', code from public.create_family_invite();
insert into codes select 'aunt', code from public.create_family_invite();
select tests.authenticate_as('parent');
select public.redeem_family_invite((select code from codes where name = 'parent'), 'parent');
select tests.authenticate_as('aunt');
select public.redeem_family_invite((select code from codes where name = 'aunt'), 'other_family');
select tests.authenticate_as('minor');
select public.approve_family_link(link_id) from public.list_family_links();
select public.grant_consent('coach_discovery', 'coach-discovery-v1');

select tests.authenticate_as('parent');
select tests.ok(
  (select count(*) = 1 and bool_and(athlete_name = 'Minor Athlete' and scope = 'coach_discovery')
     from public.guardian_consent_requests()),
  'a linked parent sees the request with the athlete''s name');
select tests.authenticate_as('aunt');
select tests.ok((select count(*) = 0 from public.guardian_consent_requests()),
  'other family members cannot approve, so they see nothing');
select tests.authenticate_as('stranger');
select tests.ok((select count(*) = 0 from public.guardian_consent_requests()),
  'unlinked accounts see nothing');
select tests.authenticate_as('minor');
select tests.ok((select count(*) = 0 from public.guardian_consent_requests()),
  'the athlete cannot approve their own request');

select tests.authenticate_as('parent');
select public.approve_consent_as_guardian(grant_id) from public.guardian_consent_requests();
select tests.ok((select count(*) = 0 from public.guardian_consent_requests()),
  'approved requests leave the list');

-- An approved grant that loses its approval (the approving link is replaced by
-- a new one) shows up again for re-approval.
select tests.clear_authentication();
update public.consent_grants set guardian_link_id = null
 where athlete_id = tests.id('minor') and scope = 'coach_discovery';
select tests.authenticate_as('parent');
select tests.ok((select count(*) = 1 from public.guardian_consent_requests()),
  'an active grant that needs re-approval is listed');

select tests.authenticate_as_anon();
select tests.throws('select * from public.guardian_consent_requests()', '42501', 'anonymous visitors cannot call it');

-- ---------------------------------------------------------------- stale sign-ups
select tests.clear_authentication();
select tests.create_user('stale_signup', null, p_email_confirmed => false);
select tests.create_user('fresh_signup', null, p_email_confirmed => false);
update auth.users set created_at = now() - interval '2 days' where id = tests.id('stale_signup');
select tests.ok(
  (select (private.run_scheduled_maintenance() ->> 'unconfirmed_accounts_deleted')::int >= 1),
  'the daily job removes unconfirmed sign-ups older than a day');
select tests.ok(
  not exists (select 1 from auth.users where id = tests.id('stale_signup'))
  and not exists (select 1 from public.profiles where id = tests.id('stale_signup')),
  'the stale sign-up and its empty profile are gone');
select tests.ok(
  exists (select 1 from auth.users where id = tests.id('fresh_signup'))
  and exists (select 1 from auth.users where id = tests.id('minor')),
  'recent sign-ups and confirmed accounts are kept');
