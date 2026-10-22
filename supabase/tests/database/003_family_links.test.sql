-- Parent/guardian links: athlete-initiated, athlete-approved, scope-limited,
-- and re-consented when the athlete turns 18.

select tests.create_user('athlete_minor', 'athlete', p_date_of_birth => (private.today_utc() - interval '16 years')::date);
select tests.create_user('athlete_adult', 'athlete', p_date_of_birth => date '2003-09-09');
select tests.create_user('parent', 'parent', 'pat.parent@example.test', p_date_of_birth => date '1978-02-02',
                         p_display_name => 'Pat Parent');
select tests.create_user('parent_two', 'parent', p_date_of_birth => date '1979-03-03');
select tests.create_user('stranger', 'parent', p_date_of_birth => date '1970-04-04');
select tests.create_user('teen_parent_account', 'parent', p_date_of_birth => (private.today_utc() - interval '14 years')::date);
select tests.create_user('parent_no_age', 'parent');

-- Helper table for codes generated during this test (rolled back afterwards).
create temporary table invite_codes (name text primary key, code text not null);
grant select, insert on invite_codes to authenticated;

-- ---------------------------------------------------------------- invites
select tests.authenticate_as('athlete_minor');
insert into invite_codes select 'minor_1', code from public.create_family_invite();
select tests.ok((select code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' from invite_codes where name = 'minor_1'),
  'invite codes are 12 unambiguous characters in three groups');
select tests.throws('select code_hash from public.family_invites', '42501',
  'athletes cannot read stored invite hashes');
select tests.ok(tests.visible_count('select id, expires_at from public.family_invites') = 1,
  'athletes can see their own open invites');

select tests.authenticate_as('athlete_adult');
select tests.throws('select * from public.redeem_family_invite(''AAAA-BBBB-CCCC'', ''parent'')', 'BR002',
  'only parent/guardian accounts can redeem invites');

select tests.authenticate_as('stranger');
select tests.ok(
  (select outcome = 'invalid_or_expired' from public.redeem_family_invite('ZZZZ-ZZZZ-ZZZZ', 'parent')),
  'a wrong code is rejected without revealing anything');

select tests.authenticate_as('parent');
select tests.ok(
  (select outcome = 'pending_athlete_approval'
     from public.redeem_family_invite(lower(replace((select code from invite_codes where name = 'minor_1'), '-', '')), 'parent')),
  'a parent can redeem a valid code (case and dashes ignored)');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 0,
  'a pending link grants no access');
select tests.ok(
  (select count(*) from public.list_family_links()
    where my_side = 'guardian' and other_party_email is null and status = 'pending_athlete_approval') = 1,
  'a guardian sees the pending link but never the athlete''s email address');

select tests.authenticate_as('athlete_minor');
select tests.ok(
  (select other_party_name = 'Pat Parent' and other_party_email = 'pat.parent@example.test' and my_side = 'athlete'
     from public.list_family_links() limit 1),
  'before approving, the athlete sees who redeemed the code (name and account email)');

-- ---------------------------------------------------------------- who can join a family
select tests.authenticate_as('athlete_minor');
insert into invite_codes select 'minor_2', code from public.create_family_invite();
select tests.authenticate_as('teen_parent_account');
select tests.throws(
  format('select * from public.redeem_family_invite(%L, %L)', (select code from invite_codes where name = 'minor_2'), 'parent'),
  'BR004', 'a parent/guardian account belonging to a minor cannot join a family');
select tests.authenticate_as('parent_no_age');
select tests.throws(
  format('select * from public.redeem_family_invite(%L, %L)', (select code from invite_codes where name = 'minor_2'), 'parent'),
  'BR004', 'a parent/guardian account without a recorded adult age cannot join a family');

select tests.authenticate_as('parent_two');
select tests.ok(
  (select outcome = 'invalid_or_expired'
     from public.redeem_family_invite((select code from invite_codes where name = 'minor_1'), 'parent')),
  'an invite code works only once');

-- ---------------------------------------------------------------- approval
select tests.clear_authentication();
insert into tests.fixtures (name, id)
select 'link_parent_minor', l.id from public.family_links l where l.guardian_id = tests.id('parent');
select tests.authenticate_as('athlete_adult');
select tests.throws(
  format('select public.approve_family_link(%L)', tests.id('link_parent_minor')),
  'BR003', 'another athlete cannot approve someone else''s family link');
select tests.authenticate_as('parent');
select tests.throws(
  format('select public.approve_family_link(%L)', tests.id('link_parent_minor')),
  'BR003', 'a guardian cannot approve their own link');

select tests.authenticate_as('athlete_minor');
select tests.lives(
  format('select public.approve_family_link(%L)',
         (select id from public.family_links where guardian_id = tests.id('parent'))),
  'the athlete approves the parent link');
select tests.clear_authentication();
select tests.ok(
  (select status = 'active' and established_while_minor from public.family_links where guardian_id = tests.id('parent')),
  'the link is active and marked as approved while the athlete is a minor');

select tests.authenticate_as('parent');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 1,
  'an approved guardian sees the basic athlete record');
select tests.ok(tests.visible_count(format('select * from public.profiles where id = %L', tests.id('athlete_minor'))) = 0,
  'a guardian cannot read the athlete''s private profile (date of birth)');
select tests.ok(not private.guardian_can_view(tests.id('parent'), tests.id('athlete_minor'), 'family_academic'),
  'academic data needs a separate permission from the athlete');

select tests.authenticate_as('stranger');
select tests.ok(tests.visible_count('select * from public.family_links') = 0, 'outsiders cannot see family links');
select tests.ok(tests.visible_count('select * from public.athletes') = 0, 'outsiders cannot see athlete records');

-- ---------------------------------------------------------------- scoped permission
select tests.authenticate_as('athlete_minor');
select tests.ok(
  (select status = 'active' from public.grant_consent('family_academic', 'family-academic-v1', tests.id('parent'))),
  'a minor can share academics with a linked guardian without extra approval');
select tests.ok(private.guardian_can_view(tests.id('parent'), tests.id('athlete_minor'), 'family_academic'),
  'the guardian can now view the academic profile');
select tests.throws(
  format('select * from public.grant_consent(%L, %L, %L)', 'family_academic', 'family-academic-v1', tests.id('stranger')),
  'BR002', 'academic sharing is refused for a parent who is not linked');

-- ---------------------------------------------------------------- turning 18
select tests.clear_authentication();
update public.profiles set date_of_birth = (private.today_utc() - interval '18 years 1 day')::date
 where id = tests.id('athlete_minor');
select tests.ok(not private.guardian_can_view(tests.id('parent'), tests.id('athlete_minor')),
  'at 18, a link approved while a minor stops working immediately');
select tests.ok(private.process_majority_transitions() = 1, 'the scheduled job flags the link for re-consent');
select tests.ok(
  (select status = 'reconsent_required' from public.family_links where guardian_id = tests.id('parent')),
  'the link now requires the adult athlete''s approval');
select tests.ok(
  (select status = 'revoked' and revocation_reason = 'athlete_reached_majority'
     from public.consent_grants where grantee_id = tests.id('parent') and scope = 'family_academic'),
  'permissions given to the guardian while the athlete was a minor end at 18');

select tests.authenticate_as('athlete_minor');
select public.approve_family_link((select id from public.family_links where guardian_id = tests.id('parent')));
select tests.clear_authentication();
select tests.ok(
  (select status = 'active' and not established_while_minor from public.family_links where guardian_id = tests.id('parent')),
  'the adult athlete can re-approve the link');
select tests.ok(private.guardian_can_view(tests.id('parent'), tests.id('athlete_minor')),
  're-approval restores basic access');
select tests.ok(not private.guardian_can_view(tests.id('parent'), tests.id('athlete_minor'), 'family_academic'),
  'academic access stays off until the adult athlete grants it again');
select tests.ok(private.process_majority_transitions() = 0, 'adult-approved links are not flagged again');

-- ---------------------------------------------------------------- adult athletes
select tests.authenticate_as('parent_two');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_adult'))) = 0,
  'a parent cannot see an adult athlete who has not linked them');

-- ---------------------------------------------------------------- ending links
select tests.authenticate_as('athlete_minor');
select public.grant_consent('family_recruiting', 'family-recruiting-v1', tests.id('parent'));
select tests.lives(
  format('select public.end_family_link(%L)', (select id from public.family_links where guardian_id = tests.id('parent'))),
  'the athlete can end a family link');
select tests.authenticate_as('parent');
select tests.ok(tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_minor'))) = 0,
  'an ended link removes access');
select tests.clear_authentication();
select tests.ok(
  (select status = 'revoked' and revocation_reason = 'family_link_ended'
     from public.consent_grants where grantee_id = tests.id('parent') and scope = 'family_recruiting'),
  'ending a link revokes the guardian''s permissions');

-- ---------------------------------------------------------------- expiry, cancellation, limits
select tests.authenticate_as('athlete_adult');
insert into invite_codes select 'adult_expired', code from public.create_family_invite();
insert into invite_codes select 'adult_cancelled', code from public.create_family_invite();
select tests.clear_authentication();
update public.family_invites set expires_at = now() - interval '1 minute'
 where code_hash = private.family_code_hash((select code from invite_codes where name = 'adult_expired'));
select tests.authenticate_as('athlete_adult');
select public.cancel_family_invite(
  (select id from public.family_invites
    where cancelled_at is null and redeemed_at is null and expires_at > now()
    order by created_at desc limit 1));

select tests.authenticate_as('parent_two');
select tests.ok(
  (select outcome = 'invalid_or_expired'
     from public.redeem_family_invite((select code from invite_codes where name = 'adult_expired'), 'parent')),
  'an expired invite cannot be redeemed');
select tests.ok(
  (select outcome = 'invalid_or_expired'
     from public.redeem_family_invite((select code from invite_codes where name = 'adult_cancelled'), 'parent')),
  'a cancelled invite cannot be redeemed');

select tests.authenticate_as('athlete_adult');
select public.create_family_invite() from generate_series(1, 5);
select tests.throws('select * from public.create_family_invite()', 'BR005',
  'an athlete can have at most five open invites');

select tests.authenticate_as('stranger');
select public.redeem_family_invite('WRONG-CODE-' || g, 'parent') from generate_series(1, 9) as g;
select tests.ok(
  (select outcome = 'too_many_attempts' from public.redeem_family_invite('ANOTHER-WRONG', 'parent')),
  'repeated wrong codes are rate-limited');
select tests.clear_authentication();
select tests.ok(
  (select count(*) from public.audit_events where action = 'family.invite_redeem_failed'
     and actor_id = tests.id('stranger')) = 10,
  'failed redemption attempts are audited (not rolled back)');

-- ---------------------------------------------------------------- an account cannot link to itself
select tests.create_user('athlete_parent', 'athlete', p_date_of_birth => date '1990-01-01');
select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.authenticate_as('admin');
select public.admin_grant_role(tests.id('athlete_parent'), 'parent');
select tests.authenticate_as('athlete_parent');
insert into invite_codes select 'self', code from public.create_family_invite();
select tests.ok(
  (select outcome = 'invalid_or_expired'
     from public.redeem_family_invite((select code from invite_codes where name = 'self'), 'parent')),
  'an account cannot become its own guardian');
