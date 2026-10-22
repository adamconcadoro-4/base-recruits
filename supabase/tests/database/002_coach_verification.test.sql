-- Coach verification: a coach account is not a verified coach; verification is
-- reviewed, time-limited, bound to the reviewed email, revocable — and never
-- purchased.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('coach_edu', 'coach', 'pat.coach@state.edu', p_date_of_birth => date '1981-01-01');
select tests.create_user('coach_unconfirmed', 'coach', 'new.coach@college.edu', p_email_confirmed => false,
                         p_date_of_birth => date '1982-02-02');
select tests.create_user('coach_no_age', 'coach', 'no.age@college.edu');
select tests.create_user('athlete_open', 'athlete', p_date_of_birth => date '2005-05-05');
select tests.create_user('athlete_private', 'athlete', p_date_of_birth => date '2005-06-06');

-- athlete_open (an adult) chooses to be discoverable by verified coaches.
select tests.authenticate_as('athlete_open');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.clear_authentication();

-- ---------------------------------------------------------------- .edu alone is not enough
select tests.ok(not private.is_verified_coach(tests.id('coach_edu')),
  'a confirmed .edu email alone does not make a verified coach');
select tests.ok(not private.has_capability(tests.id('coach_edu'), 'coach_athlete_search'),
  'an unverified coach does not get coach search');
select tests.authenticate_as('coach_edu');
select tests.ok(tests.visible_count('select * from public.athletes') = 0,
  'an unverified coach cannot see even discoverable athletes');

-- ---------------------------------------------------------------- coach submissions
select tests.throws(
  'select public.submit_coach_affiliation(''Example State'', ''Assistant Coach'', ''http://insecure.example.test/staff'')',
  'BR003', 'staff directory evidence must be an https link');
select tests.throws(
  'select public.submit_coach_affiliation(''X'', ''Assistant Coach'', ''https://athletics.example.test/staff'')',
  'BR003', 'institution name is validated');
select tests.ok(
  public.submit_coach_affiliation('Example State University', 'Assistant Coach',
                                  'https://athletics.example.test/staff/pat') = 'affiliation_under_review',
  'a coach with a confirmed email can submit affiliation evidence');
select tests.throws(
  'select public.submit_coach_affiliation(''Example State University'', ''Assistant Coach'', ''https://athletics.example.test/staff/pat'')',
  'BR004', 'a coach cannot resubmit while already under review');
select tests.throws(
  format('update public.coaches set verification_status = %L where user_id = %L', 'verified', tests.id('coach_edu')),
  '42501', 'a coach cannot set their own verification status');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('coach_edu'), 'approve'),
  'BR002', 'a coach cannot approve their own verification');
select tests.throws(
  'insert into public.coach_status_transitions values (''unverified'', ''verified'', ''coach'')',
  '42501', 'coaches cannot add verification shortcuts');

select tests.authenticate_as('coach_unconfirmed');
select tests.throws(
  'select public.submit_coach_affiliation(''College'', ''Head Coach'', ''https://college.example.test/staff'')',
  'BR004', 'a coach must confirm their institutional email before submitting');
select tests.authenticate_as('coach_no_age');
select tests.throws(
  'select public.submit_coach_affiliation(''College'', ''Head Coach'', ''https://college.example.test/staff'')',
  'BR004', 'a coach must complete the age step (adults only) before submitting');

select tests.authenticate_as('athlete_open');
select tests.throws(
  'select public.submit_coach_affiliation(''College'', ''Head Coach'', ''https://college.example.test/staff'')',
  'BR002', 'non-coach accounts cannot submit a coach affiliation');

-- ---------------------------------------------------------------- admin review
select tests.authenticate_as('admin');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('coach_edu'), 'request_info'),
  'BR003', 'asking for more information requires a note for the coach');
select tests.ok(
  public.admin_review_coach(tests.id('coach_edu'), 'request_info',
    'Your name is not on the linked page. Please send the official staff directory URL.') = 'more_info_requested',
  'an admin can request more information');

select tests.authenticate_as('coach_edu');
select tests.ok(
  exists (select 1 from public.coach_verification_events
           where to_status = 'more_info_requested' and note like 'Your name is not on the linked page%'),
  'the coach can read the remediation note');
select tests.ok(
  public.submit_coach_affiliation('Example State University', 'Assistant Coach',
                                  'https://athletics.example.test/staff/coaches') = 'affiliation_under_review',
  'the coach can resubmit after a request for information');

select tests.authenticate_as('admin');
select tests.throws(
  format('select public.admin_review_coach(%L, %L, null, 10)', tests.id('coach_edu'), 'approve'),
  'BR003', 'verification windows shorter than 30 days are refused');
select tests.ok(
  public.admin_review_coach(tests.id('coach_edu'), 'approve', 'Confirmed on staff directory.') = 'verified',
  'an admin can approve a coach under review');
select tests.clear_authentication();
select tests.ok(
  (select verified_until between now() + interval '364 days' and now() + interval '366 days'
          and verified_email = 'pat.coach@state.edu'
     from public.coaches where user_id = tests.id('coach_edu')),
  'approval sets a one-year window bound to the reviewed email');
select tests.ok(private.is_verified_coach(tests.id('coach_edu')), 'the approved coach is verified');
select tests.ok(private.has_capability(tests.id('coach_edu'), 'coach_athlete_search'),
  'a verified coach gets coach search with no subscription');

select tests.authenticate_as('coach_edu');
select tests.ok(tests.visible_count('select * from public.athletes') = 1,
  'a verified coach sees only athletes who chose discovery');
select tests.ok(
  tests.visible_count(format('select * from public.athletes where user_id = %L', tests.id('athlete_private'))) = 0,
  'a verified coach cannot see athletes who did not opt in');
select tests.ok(tests.visible_count('select * from public.profiles') = 1,
  'a verified coach still cannot read other people''s private profiles');

-- ---------------------------------------------------------------- invalid transitions
select tests.clear_authentication();
select tests.create_user('coach_new', 'coach', 'sam@juco.edu', p_date_of_birth => date '1979-09-09');
select tests.authenticate_as('admin');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('coach_new'), 'approve'),
  'BR004', 'a coach who never submitted evidence cannot be approved');
select tests.throws(
  format('select public.admin_review_coach(%L, %L, %L)', tests.id('coach_new'), 'launch', 'x'),
  'BR003', 'unknown decisions are rejected');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('coach_new'), 'reinstate'),
  'BR004', 'only a suspended coach can be reinstated');

-- ---------------------------------------------------------------- expiry
select tests.clear_authentication();
update public.coaches
   set verified_at = now() - interval '400 days', verified_until = now() - interval '1 minute'
 where user_id = tests.id('coach_edu');
select tests.ok(not private.is_verified_coach(tests.id('coach_edu')),
  'access ends the moment verification expires, before any scheduled job runs');
select tests.authenticate_as('coach_edu');
select tests.ok(tests.visible_count('select * from public.athletes') = 0,
  'an expired coach can no longer see discoverable athletes');
select tests.clear_authentication();
select tests.ok(private.expire_coach_verifications() = 1, 'the scheduled job marks expired verifications');
select tests.ok(
  (select verification_status = 'reverification_required' and verified_until is null and verified_email is null
     from public.coaches where user_id = tests.id('coach_edu')),
  'expired coaches are asked to re-verify and their old window is cleared');

select tests.authenticate_as('coach_edu');
select public.submit_coach_affiliation('Example State University', 'Assistant Coach',
                                       'https://athletics.example.test/staff/coaches');
select tests.authenticate_as('admin');
select public.admin_review_coach(tests.id('coach_edu'), 'approve', 'Re-verified.');
select tests.clear_authentication();
select tests.ok(private.is_verified_coach(tests.id('coach_edu')), 're-verification restores access');

-- ---------------------------------------------------------------- suspension and revocation
select tests.authenticate_as('admin');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('coach_edu'), 'suspend'),
  'BR003', 'suspension requires a note');
select public.admin_review_coach(tests.id('coach_edu'), 'suspend', 'Reported conduct under review.');
select tests.ok(not private.is_verified_coach(tests.id('coach_edu')), 'a suspended coach loses access immediately');
select tests.ok(
  public.admin_review_coach(tests.id('coach_edu'), 'reinstate', 'Review closed.') = 'verified',
  'an admin can lift a suspension within the verification window, for the same email');
select tests.ok(public.admin_review_coach(tests.id('coach_edu'), 'revoke', 'No longer on staff.') = 'revoked',
  'an admin can revoke verification');
select tests.ok(not private.is_verified_coach(tests.id('coach_edu')), 'a revoked coach has no access');
select tests.ok(public.admin_review_coach(tests.id('coach_edu'), 'reopen', 'Appeal accepted; please resubmit.') = 'email_verified',
  'an admin can reopen a revoked coach for appeal and resubmission');

-- After an appeal, a suspension cannot be used as a shortcut back to verified.
select tests.authenticate_as('coach_edu');
select public.submit_coach_affiliation('Example State University', 'Assistant Coach',
                                       'https://athletics.example.test/staff/coaches');
select tests.authenticate_as('admin');
select public.admin_review_coach(tests.id('coach_edu'), 'suspend', 'Second complaint.');
select tests.ok(
  public.admin_review_coach(tests.id('coach_edu'), 'reinstate', 'Closed.') = 'affiliation_under_review',
  'lifting a suspension returns the coach to the status held before it (here: under review)');
select tests.ok(not private.is_verified_coach(tests.id('coach_edu')), 'and grants no access without a fresh approval');

-- ---------------------------------------------------------------- email binding
select tests.clear_authentication();
select tests.verify_coach('coach_new', 'admin');
select tests.ok(private.is_verified_coach(tests.id('coach_new')), 'second coach verified through the full flow');
update auth.users set email = 'sam.personal@gmail.test' where id = tests.id('coach_new');
select tests.ok(
  (select verification_status = 'reverification_required' and work_email = 'sam.personal@gmail.test'
          and verified_email is null
     from public.coaches where user_id = tests.id('coach_new')),
  'changing the work email requires re-verification');
select tests.ok(not private.is_verified_coach(tests.id('coach_new')), 'an email change removes coach access');
select tests.authenticate_as('admin');
select public.admin_review_coach(tests.id('coach_new'), 'suspend', 'Investigating.');
select tests.ok(
  public.admin_review_coach(tests.id('coach_new'), 'reinstate', 'Closed.') = 'reverification_required',
  'a coach suspended while awaiting re-verification cannot be reinstated to verified');

select tests.clear_authentication();
select tests.create_user('coach_suspended_email', 'coach', 'quinn@state.edu', p_date_of_birth => date '1983-03-03');
select tests.verify_coach('coach_suspended_email', 'admin');
select tests.authenticate_as('admin');
select public.admin_review_coach(tests.id('coach_suspended_email'), 'suspend', 'Investigating.');
select tests.clear_authentication();
update auth.users set email = 'anyone@gmail.test' where id = tests.id('coach_suspended_email');
select tests.authenticate_as('admin');
select tests.ok(
  public.admin_review_coach(tests.id('coach_suspended_email'), 'reinstate', 'Closed.') = 'reverification_required',
  'an email change during a suspension forces re-verification on reinstatement');
select tests.clear_authentication();
select tests.ok(not private.is_verified_coach(tests.id('coach_suspended_email')),
  'nobody is verified on an email that was never reviewed');

-- ---------------------------------------------------------------- role removal
select tests.create_user('coach_three', 'coach', 'lee@college.edu', p_date_of_birth => date '1978-08-08');
select tests.verify_coach('coach_three', 'admin');
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('coach_three'), 'coach');
select tests.clear_authentication();
select tests.ok(
  (select verification_status = 'revoked' and verified_until is null from public.coaches where user_id = tests.id('coach_three')),
  'removing the coach role revokes the verification');
select tests.ok(not private.is_verified_coach(tests.id('coach_three')), 'removing the coach role removes coach access');
select tests.authenticate_as('admin');
select public.admin_grant_role(tests.id('coach_three'), 'coach');
select tests.clear_authentication();
select tests.ok(not private.is_verified_coach(tests.id('coach_three')),
  'granting the role again does not restore a revoked verification');

select tests.authenticate_as('admin');
select public.admin_grant_role(tests.id('admin'), 'coach');
select tests.throws(
  format('select public.admin_review_coach(%L, %L)', tests.id('admin'), 'approve'),
  'BR002', 'an admin cannot review their own coach verification');

-- ---------------------------------------------------------------- history visibility
select tests.clear_authentication();
insert into public.coach_verification_events (coach_id, from_status, to_status, actor_kind, note, visible_to_coach)
values (tests.id('coach_edu'), 'email_verified', 'email_verified', 'admin', 'Internal reviewer note', false);
select tests.authenticate_as('coach_edu');
select tests.ok(
  tests.visible_count('select * from public.coach_verification_events where note = ''Internal reviewer note''') = 0,
  'internal reviewer notes are hidden from the coach');
select tests.ok(
  tests.visible_count(format('select * from public.coach_verification_events where coach_id <> %L', tests.id('coach_edu'))) = 0,
  'coaches cannot see other coaches'' verification history');
select tests.authenticate_as('admin');
select tests.ok(
  tests.visible_count('select * from public.coach_verification_events where note = ''Internal reviewer note''') = 1,
  'admins see internal reviewer notes');
select tests.clear_authentication();
select tests.ok(
  (select count(*) from public.audit_events where action = 'coach_verification.status_changed'
     and subject_user_id = tests.id('coach_edu')) >= 8,
  'every verification status change is audited');
select tests.ok(
  (select count(*) from public.audit_events where action = 'row.coaches.update'
     and subject_user_id = tests.id('coach_edu')) >= 8,
  'the row-level audit trigger records the same changes independently');
