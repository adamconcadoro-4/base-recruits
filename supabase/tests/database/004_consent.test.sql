-- Consent: explicit, scoped, revocable; minors need a parent/legal guardian's
-- approval for coach-facing permissions; opt-out takes effect immediately.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete_adult', 'athlete', p_date_of_birth => date '2004-04-04');
select tests.create_user('athlete_minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date);
select tests.create_user('athlete_unlinked_minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '14 years')::date);
select tests.create_user('athlete_no_age', 'athlete');
select tests.create_user('parent', 'parent', p_date_of_birth => date '1975-05-05');
select tests.create_user('co_parent', 'parent', p_date_of_birth => date '1974-04-04');
select tests.create_user('aunt', 'parent', p_date_of_birth => date '1972-02-02');
select tests.create_user('other_parent', 'parent', p_date_of_birth => date '1976-06-06');
select tests.create_user('coach_a', 'coach', 'a.coach@state.edu', p_date_of_birth => date '1980-01-01');
select tests.create_user('coach_b', 'coach', 'b.coach@college.edu', p_date_of_birth => date '1981-01-01');
select tests.create_user('coach_unverified', 'coach', 'c.coach@univ.edu', p_date_of_birth => date '1982-01-01');
select tests.verify_coach('coach_a', 'admin');
select tests.verify_coach('coach_b', 'admin');

-- Family links: parent and co_parent (parents) and aunt (other family) for the
-- minor; parent for the adult (approved as an adult).
create temporary table codes (name text primary key, code text);
grant select, insert on codes to authenticated;
select tests.authenticate_as('athlete_minor');
insert into codes select 'minor_parent', code from public.create_family_invite();
insert into codes select 'minor_co_parent', code from public.create_family_invite();
insert into codes select 'minor_aunt', code from public.create_family_invite();
select tests.authenticate_as('athlete_adult');
insert into codes select 'adult', code from public.create_family_invite();
select tests.authenticate_as('parent');
select public.redeem_family_invite((select code from codes where name = 'minor_parent'), 'parent');
select public.redeem_family_invite((select code from codes where name = 'adult'), 'parent');
select tests.authenticate_as('co_parent');
select public.redeem_family_invite((select code from codes where name = 'minor_co_parent'), 'legal_guardian');
select tests.authenticate_as('aunt');
select public.redeem_family_invite((select code from codes where name = 'minor_aunt'), 'other_family');
select tests.authenticate_as('athlete_minor');
select public.approve_family_link(link_id) from public.list_family_links();
select tests.authenticate_as('athlete_adult');
select public.approve_family_link(link_id) from public.list_family_links();

-- ---------------------------------------------------------------- age step first
select tests.authenticate_as('athlete_no_age');
select tests.throws('select * from public.grant_consent(''coach_discovery'', ''coach-discovery-v1'')', 'BR004',
  'an athlete who skipped the age step cannot share anything');

-- ---------------------------------------------------------------- adult athlete
select tests.authenticate_as('athlete_adult');
select tests.throws('select * from public.grant_consent(''coach_discovery'', ''bad version'')', 'BR003',
  'grants record a valid consent-wording version');
select tests.ok(
  (select status = 'active' from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'an adult athlete can turn on coach discovery');
select tests.clear_authentication();
insert into tests.fixtures (name, id)
select 'adult_discovery', g.id from public.consent_grants g
 where g.athlete_id = tests.id('athlete_adult') and g.scope = 'coach_discovery';
select tests.authenticate_as('athlete_adult');
select tests.ok(
  (select grant_id = tests.id('adult_discovery') from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'granting the same permission again is idempotent');
select tests.throws(
  format('select * from public.grant_consent(%L, %L, %L)', 'coach_discovery', 'coach-discovery-v1', tests.id('coach_a')),
  'BR003', 'audience-wide permissions cannot name a person');

select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_adult'))) = 1,
  'a verified coach sees an athlete who turned on discovery');
select tests.authenticate_as('coach_unverified');
select tests.ok(tests.visible_count('select * from public.athletes') = 0,
  'an unverified coach sees no athletes');

select tests.authenticate_as('athlete_adult');
select public.grant_consent('coach_academic_summary', 'coach-academic-summary-v1');
select tests.ok(private.coach_can_view(tests.id('coach_a'), tests.id('athlete_adult'), 'coach_academic_summary'),
  'verified coaches can view the academic summary the athlete shared');
select tests.ok(not private.coach_can_view(tests.id('coach_a'), tests.id('athlete_adult'), 'coach_contact_info'),
  'scopes the athlete did not share stay private');

select tests.lives(format('select public.revoke_consent(%L)', tests.id('adult_discovery')),
  'the athlete can turn discovery off');
select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_adult'))) = 0,
  'turning discovery off hides the athlete immediately');
select tests.ok(not private.coach_can_view(tests.id('coach_a'), tests.id('athlete_adult'), 'coach_academic_summary'),
  'turning discovery off also hides every audience-wide coach permission');

select tests.authenticate_as('athlete_adult');
select tests.throws(format('select public.revoke_consent(%L)', tests.id('adult_discovery')), 'BR004',
  'an already-revoked permission cannot be revoked again');
select tests.ok(
  (select status = 'active' from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'discovery can be turned back on with a fresh grant');

-- ---------------------------------------------------------------- documents (one named coach)
select tests.throws(
  format('select * from public.grant_consent(%L, %L, %L)', 'document_access', 'document-access-v1', tests.id('coach_unverified')),
  'BR002', 'documents cannot be shared with an unverified coach');
select tests.throws('select * from public.grant_consent(''document_access'', ''document-access-v1'')', 'BR003',
  'document sharing must name a person');
select tests.ok(
  (select status = 'active'
     from public.grant_consent('document_access', 'document-access-v1', tests.id('coach_a'))),
  'documents can be shared with one named verified coach');
select tests.clear_authentication();
select tests.ok(
  (select expires_at between now() + interval '364 days' and now() + interval '366 days'
     from public.consent_grants where athlete_id = tests.id('athlete_adult') and scope = 'document_access'),
  'document access expires after at most a year');
select tests.ok(private.coach_can_view(tests.id('coach_a'), tests.id('athlete_adult'), 'document_access'),
  'the named coach may view documents');
select tests.ok(not private.coach_can_view(tests.id('coach_b'), tests.id('athlete_adult'), 'document_access'),
  'other verified coaches may not view documents');

-- ---------------------------------------------------------------- what each party can see
select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count('select id from public.consent_grants') = 1,
  'a coach sees only active permissions granted to them by name');
select tests.throws('select granted_by from public.consent_grants', '42501',
  'grant bookkeeping columns (who granted, approved or revoked) are not readable through the API');
select tests.authenticate_as('parent');
select tests.ok(
  tests.visible_count(format('select id from public.consent_grants where athlete_id = %L', tests.id('athlete_adult'))) = 0,
  'a parent cannot see an adult athlete''s coach-sharing choices');
select tests.ok(not private.guardian_can_view(tests.id('parent'), tests.id('athlete_adult'), 'family_academic'),
  'a linked parent cannot see an adult athlete''s academics without permission');

-- ---------------------------------------------------------------- minors
select tests.authenticate_as('athlete_minor');
select tests.ok(
  (select status = 'pending_guardian' from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'a minor''s coach discovery waits for guardian approval');
select public.grant_consent('document_access', 'document-access-v1', tests.id('coach_b'));
select tests.clear_authentication();
insert into tests.fixtures (name, id)
select 'minor_discovery', g.id from public.consent_grants g
 where g.athlete_id = tests.id('athlete_minor') and g.scope = 'coach_discovery';
insert into tests.fixtures (name, id)
select 'minor_documents', g.id from public.consent_grants g
 where g.athlete_id = tests.id('athlete_minor') and g.scope = 'document_access';

select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 0,
  'a pending grant is not effective');
select tests.authenticate_as('coach_b');
select tests.ok(tests.visible_count('select id from public.consent_grants where status = ''pending_guardian''') = 0,
  'a named coach cannot see a minor''s request until a guardian approves it');

select tests.authenticate_as('other_parent');
select tests.throws(format('select public.approve_consent_as_guardian(%L)', tests.id('minor_discovery')), 'BR003',
  'an unlinked parent cannot approve');
select tests.authenticate_as('aunt');
select tests.throws(format('select public.approve_consent_as_guardian(%L)', tests.id('minor_discovery')), 'BR003',
  'a linked family member who is not a parent or legal guardian cannot approve');
select tests.ok(tests.visible_count('select id from public.consent_grants') = 0,
  'a linked family member who is not a parent or legal guardian does not see the minor''s coach permissions');
select tests.authenticate_as('athlete_minor');
select tests.throws(format('select public.approve_consent_as_guardian(%L)', tests.id('minor_discovery')), 'BR003',
  'a minor cannot approve their own request');

select tests.authenticate_as('parent');
select tests.ok(tests.visible_count(format('select id from public.consent_grants where id = %L', tests.id('minor_discovery'))) = 1,
  'the linked parent can see the minor''s pending request');
select tests.lives(format('select public.approve_consent_as_guardian(%L)', tests.id('minor_discovery')),
  'the linked parent approves');
select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 1,
  'after guardian approval, verified coaches can discover the minor');

select tests.authenticate_as('co_parent');
select tests.lives(format('select public.revoke_consent(%L)', tests.id('minor_discovery')),
  'a legal guardian can withdraw a minor''s coach permission');
select tests.throws(format('select public.revoke_consent(%L)', tests.id('adult_discovery')), 'BR003',
  'a guardian cannot withdraw an adult athlete''s permission');
select tests.authenticate_as('coach_a');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 0,
  'a guardian withdrawal hides the minor immediately');

-- Approval only lasts while the approving link does.
select tests.authenticate_as('athlete_minor');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.clear_authentication();
delete from tests.fixtures where name = 'minor_discovery';
insert into tests.fixtures (name, id)
select 'minor_discovery', g.id from public.consent_grants g
 where g.athlete_id = tests.id('athlete_minor') and g.scope = 'coach_discovery' and g.status = 'pending_guardian';
select tests.authenticate_as('parent');
select public.approve_consent_as_guardian(tests.id('minor_discovery'));
select tests.ok(private.coach_can_view(tests.id('coach_a'), tests.id('athlete_minor'), 'coach_discovery'),
  'a re-requested permission is effective after a fresh approval');
select tests.authenticate_as('athlete_minor');
select public.end_family_link((select link_id from public.list_family_links() l
                                 join public.family_links f on f.id = l.link_id
                                where f.guardian_id = tests.id('parent')));
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('coach_a'), tests.id('athlete_minor'), 'coach_discovery'),
  'ending the approving parent''s link ends the minor''s coach visibility');
select tests.ok(
  (select status = 'revoked' and revocation_reason = 'approving_guardian_link_ended'
     from public.consent_grants where id = tests.id('minor_discovery')),
  'and records why');

-- Co-guardians do not see or control what is shared with each other.
select tests.authenticate_as('athlete_minor');
select public.grant_consent('family_academic', 'family-academic-v1', tests.id('aunt'));
select tests.clear_authentication();
insert into tests.fixtures (name, id)
select 'aunt_academic', g.id from public.consent_grants g
 where g.athlete_id = tests.id('athlete_minor') and g.scope = 'family_academic' and g.grantee_id = tests.id('aunt');
select tests.authenticate_as('co_parent');
select tests.ok(tests.visible_count(format('select id from public.consent_grants where id = %L', tests.id('aunt_academic'))) = 0,
  'a guardian cannot see what the athlete shares with another family member');
select tests.throws(format('select public.revoke_consent(%L)', tests.id('aunt_academic')), 'BR003',
  'a guardian cannot withdraw what the athlete shares with another family member');

select tests.authenticate_as('athlete_unlinked_minor');
select tests.ok(
  (select status = 'pending_guardian' from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'a minor with no linked guardian stays pending');
select tests.clear_authentication();
update public.profiles set date_of_birth = (private.today_utc() - interval '18 years')::date
 where id = tests.id('athlete_unlinked_minor');
select tests.authenticate_as('athlete_unlinked_minor');
select tests.ok(
  (select status = 'active' from public.grant_consent('coach_discovery', 'coach-discovery-v1')),
  'after turning 18, the athlete can confirm their own pending request');

select tests.clear_authentication();
update public.profiles set date_of_birth = (private.today_utc() - interval '18 years')::date
 where id = tests.id('athlete_minor');
select tests.authenticate_as('co_parent');
select tests.throws(format('select public.approve_consent_as_guardian(%L)', tests.id('minor_documents')), 'BR003',
  'once the athlete is 18, guardian requests fail without revealing anything');

-- ---------------------------------------------------------------- who may grant
select tests.authenticate_as('parent');
select tests.throws('select * from public.grant_consent(''coach_discovery'', ''coach-discovery-v1'')', 'BR002',
  'a parent cannot grant consent on an athlete''s behalf');
select tests.authenticate_as('athlete_adult');
select tests.throws(
  format('insert into public.consent_grants (athlete_id, scope, audience, status, granted_by, consent_text_version, activated_at) values (%L, %L, %L, %L, %L, %L, now())',
         tests.id('athlete_adult'), 'coach_contact_info', 'verified_coaches', 'active', tests.id('athlete_adult'), 'x-v1'),
  '42501', 'consent rows cannot be inserted directly');
select tests.throws(
  format('update public.consent_grants set status = %L where athlete_id = %L', 'active', tests.id('athlete_adult')),
  '42501', 'consent rows cannot be edited directly');
select tests.authenticate_as_anon();
select tests.throws('select * from public.grant_consent(''coach_discovery'', ''coach-discovery-v1'')', '42501',
  'anonymous visitors cannot call consent functions');

-- ---------------------------------------------------------------- expiry
select tests.clear_authentication();
update public.consent_grants set expires_at = now() - interval '1 minute'
 where athlete_id = tests.id('athlete_adult') and scope = 'document_access';
select tests.ok(not private.coach_can_view(tests.id('coach_a'), tests.id('athlete_adult'), 'document_access'),
  'an expired permission stops working immediately');
select tests.ok(private.expire_consent_grants() = 1, 'the scheduled job marks expired permissions');

-- ---------------------------------------------------------------- audit
select tests.ok(
  (select count(*) from public.audit_events
    where action in ('consent.granted', 'consent.revoked', 'consent.guardian_approved', 'consent.awaiting_guardian', 'consent.activated')) >= 9,
  'consent decisions are audited');
select tests.ok(
  (select count(*) from public.audit_events where action = 'row.consent_grants.update'
     and metadata -> 'fields' -> 'status' ->> 'new' = 'expired') = 1,
  'expiry is captured by the row-level audit trigger');
select tests.ok(
  not exists (select 1 from public.audit_events e
                join public.profiles p on p.date_of_birth is not null
               where e.metadata::text like '%' || p.date_of_birth::text || '%'),
  'audit metadata never contains a date of birth');
