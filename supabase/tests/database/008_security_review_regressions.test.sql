-- Regression tests for the independent security review of 2026-10-21.
-- Each scenario reproduced a real hole in the first draft; each must now fail.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('coach', 'coach', 'lee@college.edu', p_date_of_birth => date '1980-01-01');
select tests.create_user('coach2', 'coach', 'pat@state.edu', p_date_of_birth => date '1981-01-01');
select tests.create_user('open', 'athlete', p_date_of_birth => date '2004-01-01');
select tests.create_user('kid', 'athlete', p_date_of_birth => (private.today_utc() - interval '14 years')::date);
select tests.create_user('kid_alt', 'parent', 'kid.alt@example.test', p_date_of_birth => (private.today_utc() - interval '14 years')::date);
select tests.create_user('kid_alt_adult_claim', 'parent', 'kid.alt2@example.test', p_date_of_birth => date '1990-01-01');
select tests.create_user('coach3', 'coach', 'morgan@univ.edu', p_date_of_birth => date '1984-04-04');
select tests.verify_coach('coach', 'admin');
select tests.verify_coach('coach2', 'admin');
select tests.verify_coach('coach3', 'admin');
create temporary table c (n text, code text);
grant select, insert on c to authenticated;
select tests.authenticate_as('open');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');

-- R1: re-onboarding must not restore a role an admin removed.
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('coach'), 'coach');
select tests.authenticate_as('coach');
select tests.throws('select public.complete_onboarding(''coach'')', 'BR004',
  'R1: a coach whose role an admin removed cannot re-onboard as a coach');
select tests.ok(tests.visible_count('select * from public.athletes') = 0,
  'R1: and cannot see discoverable athletes');

-- R2: a minor cannot satisfy guardian approval with a second account.
select tests.authenticate_as('kid');
select public.grant_consent('coach_contact_info', 'coach-contact-info-v1');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
insert into c select 'k', code from public.create_family_invite();
insert into c select 'k2', code from public.create_family_invite();
select tests.authenticate_as('kid_alt');
select tests.throws(format('select * from public.redeem_family_invite(%L, %L)', (select code from c where n = 'k'), 'other_family'),
  'BR004', 'R2: a parent account with a minor''s date of birth cannot join the family');
-- Even an account that claims to be an adult only gets "other family" powers
-- unless it says it is a parent or legal guardian, and the athlete sees its
-- name and email before approving.
select tests.authenticate_as('kid_alt_adult_claim');
select public.redeem_family_invite((select code from c where n = 'k2'), 'other_family');
select tests.authenticate_as('kid');
select tests.ok(
  (select other_party_email = 'kid.alt2@example.test' from public.list_family_links() limit 1),
  'R2: the athlete sees the redeeming account''s email before approving');
select public.approve_family_link((select link_id from public.list_family_links() limit 1));
select tests.authenticate_as('kid_alt_adult_claim');
select tests.throws(
  format('select public.approve_consent_as_guardian(%L)',
         (select g.id from public.consent_grants g where g.scope = 'coach_contact_info' limit 1)),
  'BR003', 'R2: an "other family" link cannot approve a minor''s coach permissions');
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('coach2'), tests.id('kid'), 'coach_contact_info'),
  'R2: the minor stays invisible to coaches');

-- R3: a suspension plus an email change cannot produce an unreviewed verification.
select tests.authenticate_as('admin');
select public.admin_review_coach(tests.id('coach2'), 'suspend', 'Investigating.');
select tests.clear_authentication();
update auth.users set email = 'anyone@gmail.test' where id = tests.id('coach2');
select tests.authenticate_as('admin');
select tests.ok(public.admin_review_coach(tests.id('coach2'), 'reinstate', 'Closed.') = 'reverification_required',
  'R3: reinstating after an email change requires re-verification');
select tests.clear_authentication();
select tests.ok(not private.is_verified_coach(tests.id('coach2')), 'R3: no verification on an unreviewed email');

-- R4: a premium capability still sold in plans cannot be re-labelled core.
select tests.throws('update public.capabilities set tier = ''core_free'', invariant_ref = 4 where key = ''outreach_templates''',
  'BR020', 'R4: no core capability can end up inside a paid plan');

-- R5: no API role can touch sequences or make unaudited security changes.
select tests.ok(not has_sequence_privilege('anon', 'public.audit_events_id_seq', 'UPDATE')
                and not has_sequence_privilege('service_role', 'public.audit_events_id_seq', 'UPDATE'),
  'R5: nobody but the owner can reset the audit sequence');
select tests.authenticate_as_service_role();
select tests.throws(format('insert into public.user_roles (user_id, role) values (%L, ''admin'')', tests.id('open')),
  '42501', 'R5: the service role cannot grant admin directly');
select tests.clear_authentication();
select tests.allow_admin_email('open');
insert into public.user_roles (user_id, role) values (tests.id('open'), 'admin');
select tests.ok(
  exists (select 1 from public.audit_events where action = 'row.user_roles.insert'
           and subject_user_id = tests.id('open') and metadata -> 'fields' ->> 'role' = 'admin'),
  'R5: even the database owner''s direct role changes are audited');

-- R6: removing the athlete role stops sharing and hides the athlete from coaches.
select tests.ok(private.coach_can_view(tests.id('coach3'), tests.id('open'), 'coach_discovery'),
  'R6: precondition — a verified coach can see the discoverable athlete');
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('open'), 'athlete');
select tests.authenticate_as('open');
select tests.throws('select * from public.grant_consent(''coach_contact_info'', ''coach-contact-info-v1'')', 'BR002',
  'R6: an account without the athlete role cannot grant consent');
select tests.throws('select * from public.create_family_invite()', 'BR002',
  'R6: an account without the athlete role cannot invite family');
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('coach3'), tests.id('open'), 'coach_discovery'),
  'R6: coaches no longer see an athlete whose role was removed');

-- R7: removing the parent role ends that account's family links and approvals.
select tests.create_user('kid_parent', 'parent', 'real.parent@example.test', p_date_of_birth => date '1978-07-07');
select tests.authenticate_as('kid');
insert into c select 'k3', code from public.create_family_invite();
select tests.authenticate_as('kid_parent');
select public.redeem_family_invite((select code from c where n = 'k3'), 'parent');
select tests.authenticate_as('kid');
select public.approve_family_link(l.link_id) from public.list_family_links() l where l.status = 'pending_athlete_approval';
select tests.authenticate_as('kid_parent');
select public.approve_consent_as_guardian(g.id) from public.consent_grants g where g.status = 'pending_guardian';
select tests.clear_authentication();
select tests.ok(private.coach_can_view(tests.id('coach3'), tests.id('kid'), 'coach_contact_info'),
  'R7: a real parent''s approval makes the minor visible');
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('kid_parent'), 'parent');
select tests.clear_authentication();
select tests.ok(
  not exists (select 1 from public.family_links where guardian_id = tests.id('kid_parent') and status <> 'ended'),
  'R7: removing the parent role ends every family link the account held');
select tests.ok(not private.coach_can_view(tests.id('coach3'), tests.id('kid'), 'coach_contact_info'),
  'R7: and withdraws the minor''s coach visibility that parent approved');
