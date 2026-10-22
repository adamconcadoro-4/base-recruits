-- my_consent_grants(): the athlete sees the effective state of each permission,
-- never the raw status alone.

select tests.create_user('adult', 'athlete', p_date_of_birth => date '2003-03-03');
select tests.create_user('minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date);
select tests.create_user('parent', 'parent', p_date_of_birth => date '1975-05-05');
select tests.create_user('coach', 'coach', 'coach@state.edu', p_date_of_birth => date '1980-01-01');

create temporary table codes (code text);
grant select, insert on codes to authenticated;
select tests.authenticate_as('minor');
insert into codes select code from public.create_family_invite();
select tests.authenticate_as('parent');
select public.redeem_family_invite((select code from codes), 'parent');
select tests.authenticate_as('minor');
select public.approve_family_link(link_id) from public.list_family_links();

-- ---------------------------------------------------------------- adult
select tests.authenticate_as('adult');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.ok(
  (select in_effect and not waiting_for_guardian and status = 'active'
     from public.my_consent_grants() where scope = 'coach_discovery'),
  'an adult''s coach discovery is in effect immediately');

-- ---------------------------------------------------------------- minor
select tests.authenticate_as('minor');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.ok(
  (select not in_effect and waiting_for_guardian and status = 'pending_guardian'
     from public.my_consent_grants() where scope = 'coach_discovery'),
  'a minor''s coach discovery waits for a parent and is not in effect');
select tests.ok(
  (select count(*) = 1 from public.my_consent_grants()),
  'the athlete sees only their own grants');

select tests.authenticate_as('parent');
select public.approve_consent_as_guardian(g.id)
  from public.consent_grants g where g.athlete_id = tests.id('minor') and g.status = 'pending_guardian';
select tests.authenticate_as('minor');
select tests.ok(
  (select in_effect and not waiting_for_guardian from public.my_consent_grants() where scope = 'coach_discovery'),
  'after the parent approves, the minor''s coach discovery is in effect');

-- Ending the approving link ends what depended on it.
select public.end_family_link(link_id) from public.list_family_links();
select tests.ok(
  not exists (select 1 from public.my_consent_grants() where scope = 'coach_discovery' and in_effect),
  'when the approving parent link ends, coach discovery is no longer in effect');

-- ---------------------------------------------------------------- others
select tests.authenticate_as('coach');
select tests.ok((select count(*) = 0 from public.my_consent_grants()),
  'other accounts never see an athlete''s grants through this function');

select tests.authenticate_as('adult');
select public.revoke_consent(grant_id) from public.my_consent_grants() where scope = 'coach_discovery';
select tests.ok(not exists (select 1 from public.my_consent_grants()),
  'revoked permissions drop off the list');

select tests.authenticate_as_anon();
select tests.throws('select * from public.my_consent_grants()', '42501',
  'anonymous visitors cannot call it');
