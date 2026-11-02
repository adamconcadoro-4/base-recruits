-- Assessment access: the on/off switches, development-coach accounts and links
-- (with a parent's approval for minors), family sharing, sharing reports with
-- one verified college coach, isolation between athletes, and who may touch
-- each video file.

select tests.create_user('admin', 'parent', 'assess.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('adult', 'athlete', p_display_name => 'Avery Adult', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('minor', 'athlete', p_display_name => 'Riley Minor', p_date_of_birth => (current_date - interval '15 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '17 years')::date);
select tests.create_user('parent', 'parent', p_display_name => 'Morgan Parent', p_date_of_birth => (current_date - interval '44 years')::date);
select tests.create_user('dev', 'development_coach', 'dev.coach@example.test', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('dev2', 'development_coach', p_display_name => 'Second Coach', p_date_of_birth => (current_date - interval '30 years')::date);
select tests.create_user('teen_dev', 'development_coach', p_date_of_birth => (current_date - interval '16 years')::date);
select tests.create_user('college', 'coach', 'recruiter@example.edu', p_display_name => 'Casey College', p_date_of_birth => (current_date - interval '40 years')::date);
select tests.create_user('newbie', null, p_date_of_birth => (current_date - interval '28 years')::date);
select tests.create_user('newbie_minor', null, p_date_of_birth => (current_date - interval '16 years')::date);
select tests.verify_coach('college', 'admin');
select tests.link_family('minor', 'parent');

-- ================================================================ switches
select tests.authenticate_as('adult');
select tests.throws('select * from public.create_development_coach_invite()', 'BR004',
  'nothing in Assessment works until it is switched on');
select tests.ok((select not enabled and not video_enabled from public.assessment_switches()),
  'both switches start off');
select tests.throws('select public.admin_set_assessment_switches(true, true)', 'BR002', 'only administrators change the switches');
select tests.authenticate_as('newbie');
select tests.throws($$select public.complete_onboarding('development_coach', 'New Coach')$$, 'BR004',
  'development coach accounts cannot be created while Assessment is off');
select tests.authenticate_as_anon();
select tests.throws('select * from public.assessment_switches()', '42501', 'signed-out visitors cannot read the switches');

select tests.authenticate_as('admin');
select tests.throws('select public.admin_set_assessment_switches(false, true)', 'BR003', 'video cannot be on while Assessment is off');
select tests.lives('select public.admin_set_assessment_switches(true, false)', 'an administrator switches Assessment on');
select tests.ok((select enabled and not video_enabled from public.assessment_switches()), 'video stays off until switched on separately');
select tests.ok(exists (select 1 from public.audit_events where action = 'assessment.switches_changed'), 'switch changes are audited');

select tests.authenticate_as('newbie');
select tests.lives($$select public.complete_onboarding('development_coach', 'New Coach')$$, 'an adult can become a development coach once Assessment is on');
select tests.authenticate_as('newbie_minor');
select tests.throws($$select public.complete_onboarding('development_coach', 'Teen Coach')$$, 'BR004', 'development coach accounts are for adults');

-- ================================================================ development coach links (adult athlete)
create temporary table t_codes (name text primary key, code text) on commit drop;
grant all on t_codes to public;
select tests.authenticate_as('adult');
insert into t_codes select 'adult', code from public.create_development_coach_invite();
select tests.ok((select code from t_codes where name = 'adult') ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'the athlete gets a one-time code');
select tests.ok((select count(*) from public.my_development_coach_invites()) = 1, 'the athlete sees the open code');

select tests.authenticate_as('college');
select tests.throws(format('select * from public.redeem_development_coach_invite(%L)', (select code from t_codes where name = 'adult')),
  'BR002', 'a college coach can never use a development coach code');
select tests.authenticate_as('teen_dev');
select tests.throws(format('select * from public.redeem_development_coach_invite(%L)', (select code from t_codes where name = 'adult')),
  'BR004', 'a development coach account must belong to an adult');

select tests.authenticate_as('dev');
select tests.ok((select outcome from public.redeem_development_coach_invite('AAAA-BBBB-CCCC')) = 'invalid_or_expired',
  'a wrong code is refused');
select tests.ok((select outcome from public.redeem_development_coach_invite(lower((select code from t_codes where name = 'adult'))))
  = 'pending_athlete_approval', 'the right code (in any letter case) waits for the athlete');
select tests.ok((select outcome from public.redeem_development_coach_invite((select code from t_codes where name = 'adult'))) = 'invalid_or_expired',
  'a code works once');

select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev'), tests.id('adult')),
  'redeeming a code gives no access before the athlete approves');

select tests.authenticate_as('adult');
select tests.ok((select coach_email from public.list_development_coach_links() where coach_id = tests.id('dev')) = 'dev.coach@example.test',
  'the athlete sees the coach''s name and account email before approving');
select tests.ok((select public.approve_development_coach_link(link_id) from public.list_development_coach_links()
                  where coach_id = tests.id('dev')) = 'active', 'an adult athlete''s approval takes effect at once');
select tests.authenticate_as('dev');
select tests.ok((select access from public.list_development_coach_links() where athlete_id = tests.id('adult')) = 'active'
  and (select coach_email from public.list_development_coach_links() where athlete_id = tests.id('adult')) is null,
  'the coach sees the link as active and is not shown their own email again');
select tests.ok((select relation from public.assessment_athletes() where athlete_id = tests.id('adult')) = 'development_coach',
  'the coach can now work on the athlete''s assessments');
select tests.authenticate_as('other');
select tests.ok((select count(*) from public.list_development_coach_links()) = 0, 'other athletes see nobody''s coach links');

select tests.authenticate_as('adult');
select tests.throws(format($$select * from public.grant_consent('development_coach_access', 'development-coach-access-v1', %L)$$, tests.id('dev2')),
  'BR002', 'an athlete cannot grant coach access to someone who never redeemed their code');

-- ================================================================ development coach links (minor athlete, F4)
select tests.authenticate_as('minor');
insert into t_codes select 'minor', code from public.create_development_coach_invite();
select tests.authenticate_as('dev');
select tests.lives(format('select * from public.redeem_development_coach_invite(%L)', (select code from t_codes where name = 'minor')),
  'the coach redeems a minor''s code');
select tests.authenticate_as('minor');
select tests.ok((select public.approve_development_coach_link(link_id) from public.list_development_coach_links()
                  where coach_id = tests.id('dev')) = 'awaiting_guardian', 'a minor''s approval waits for a parent');
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev'), tests.id('minor')), 'no access until a parent approves');

select tests.authenticate_as('parent');
select tests.ok((select grantee_name || ' <' || grantee_email || '>' from public.guardian_consent_requests()
                  where scope = 'development_coach_access') = 'Dana Dev <dev.coach@example.test>',
  'the parent sees which coach is asking, with the account email, before approving');
select tests.ok((select access from public.list_development_coach_links() where athlete_id = tests.id('minor')) = 'awaiting_guardian',
  'the parent sees the link waiting for them');
select tests.lives((select format('select public.approve_consent_as_guardian(%L)', grant_id) from public.guardian_consent_requests()
                     where scope = 'development_coach_access'), 'the parent approves');
select tests.clear_authentication();
select tests.ok(private.can_work_on_assessments(tests.id('dev'), tests.id('minor')), 'the coach has access after the parent''s approval');

-- The parent can end the coach link for a minor; the coach can end their own link.
select tests.authenticate_as('parent');
select tests.lives((select format('select public.end_development_coach_link(%L)', link_id) from public.list_development_coach_links()
                     where athlete_id = tests.id('minor')), 'a parent can end a minor''s development coach link');
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev'), tests.id('minor')), 'ending the link ends access at once');
select tests.ok((select revocation_reason from public.consent_grants
                  where athlete_id = tests.id('minor') and scope = 'development_coach_access' order by created_at desc limit 1)
                = 'withdrawn_by_guardian', 'the withdrawal is recorded with who withdrew it');

-- A connection whose consent was revoked elsewhere can be re-established with a new code.
select tests.authenticate_as('adult');
select tests.remember_job('stale_link', (select link_id from public.list_development_coach_links()
                                            where coach_id = tests.id('dev') and access = 'active'));
select public.revoke_consent((select grant_id from public.list_development_coach_links() where link_id = tests.job('stale_link')));
select tests.ok((select access from public.list_development_coach_links() where link_id = tests.job('stale_link')) = 'ended',
  'revoking the coach''s consent ends the connection in effect');
insert into t_codes select 'adult_again', code from public.create_development_coach_invite();
select tests.authenticate_as('dev');
select tests.ok((select outcome from public.redeem_development_coach_invite((select code from t_codes where name = 'adult_again')))
                = 'pending_athlete_approval', 'the coach can ask again with a new code');
select tests.authenticate_as('adult');
select tests.ok((select count(*) from public.list_development_coach_links() where coach_id = tests.id('dev') and access = 'pending_athlete_approval') = 1
                and (select access from public.list_development_coach_links() where link_id = tests.job('stale_link')) = 'ended',
  'the athlete sees one new request to approve, and the old connection is closed');
select tests.ok((select public.approve_development_coach_link(link_id) from public.list_development_coach_links()
                  where coach_id = tests.id('dev') and access = 'pending_athlete_approval') = 'active', 'and approving it restores access');
insert into t_codes select 'adult_third', code from public.create_development_coach_invite();
select tests.authenticate_as('dev');
select tests.ok((select outcome from public.redeem_development_coach_invite((select code from t_codes where name = 'adult_third')))
                = 'already_connected', 'a coach who is already connected is told so');

-- Declining a request revokes any grant, however it was made.
select tests.authenticate_as('adult');
insert into t_codes select 'adult_dev2', code from public.create_development_coach_invite();
select tests.authenticate_as('dev2');
select public.redeem_development_coach_invite((select code from t_codes where name = 'adult_dev2'));
select tests.authenticate_as('adult');
select public.grant_consent('development_coach_access', 'development-coach-access-v1', tests.id('dev2'));
select public.decline_development_coach_link((select link_id from public.list_development_coach_links()
                                               where coach_id = tests.id('dev2') and access = 'pending_athlete_approval'));
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev2'), tests.id('adult')), 'a declined coach has no access');
select tests.ok(not exists (select 1 from public.consent_grants where athlete_id = tests.id('adult') and grantee_id = tests.id('dev2')
                             and scope = 'development_coach_access' and status in ('active', 'pending_guardian')),
  'declining revokes the grant');

-- Removing the development coach role removes access immediately.
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('dev'), 'development_coach');
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev'), tests.id('adult')),
  'a coach whose role is removed loses access at once, even with an active grant');
select tests.authenticate_as('admin');
select public.admin_grant_role(tests.id('dev'), 'development_coach');
select tests.clear_authentication();
select tests.ok(private.can_work_on_assessments(tests.id('dev'), tests.id('adult')), 'restoring the role restores the athlete''s grant');

select tests.authenticate_as('dev');
select tests.lives((select format('select public.end_development_coach_link(%L)', link_id) from public.list_development_coach_links()
                     where athlete_id = tests.id('adult') and access = 'active'), 'a coach can end their own link');
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('dev'), tests.id('adult'))
  and exists (select 1 from public.consent_grants
               where athlete_id = tests.id('adult') and scope = 'development_coach_access' and grantee_id = tests.id('dev')
                 and revocation_reason = 'withdrawn_by_grantee')
  and not exists (select 1 from public.consent_grants
                   where athlete_id = tests.id('adult') and scope = 'development_coach_access' and grantee_id = tests.id('dev')
                     and status in ('active', 'pending_guardian')),
  'the coach''s access ends and the grant records that the coach withdrew');

-- ================================================================ family sharing
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('parent'), tests.id('minor')),
  'a linked parent does not see assessments by default (decision F5)');
select tests.authenticate_as('minor');
select tests.lives((select format('select public.share_assessments_with_family(%L)', link_id) from public.assessment_family_access()),
  'the athlete shares assessments with a linked parent');
select tests.ok((select in_effect from public.assessment_family_access()), 'the sharing is in effect at once (no extra approval needed)');
select tests.authenticate_as('parent');
select tests.ok((select relation from public.assessment_athletes()) = 'guardian', 'the parent can now work on the athlete''s assessments');
select tests.authenticate_as('minor');
select tests.lives((select format('select public.revoke_consent(%L)', grant_id) from public.assessment_family_access()),
  'the athlete can stop sharing');
select tests.authenticate_as('parent');
select tests.ok((select count(*) from public.assessment_athletes()) = 0, 'access ends when sharing stops');

-- ================================================================ sharing reports with a college coach
select tests.authenticate_as('adult');
select tests.ok((select outcome from public.share_assessment_reports_with_coach('nobody@example.edu')) = 'not_found',
  'an email that belongs to no verified college coach is refused');
select tests.ok((select outcome || ':' || status from public.share_assessment_reports_with_coach('Recruiter@Example.edu')) = 'shared:active',
  'an adult athlete can share published reports with a verified college coach by work email');
select tests.ok((select expires_at <= now() + interval '366 days' from public.my_assessment_report_shares()),
  'report sharing expires within a year');
select tests.authenticate_as('minor');
select tests.ok((select status from public.share_assessment_reports_with_coach('recruiter@example.edu')) = 'pending_guardian',
  'a minor''s report sharing waits for a parent (decision F4)');
select tests.clear_authentication();
select tests.ok(not private.can_work_on_assessments(tests.id('college'), tests.id('adult')),
  'a college coach with shared reports still cannot see or edit the assessments themselves');

-- ================================================================ isolation between athletes
select tests.authenticate_as('adult');
select tests.remember_job('adult_assessment', public.create_assessment(tests.id('adult'), 'hitting-video', 1, current_date,
  '{"rep_goal": 10, "drill_type": "tee", "camera_views": ["side_facing"]}'::jsonb));
select tests.ok(tests.visible_count('select * from public.assessments') = 1, 'the athlete sees their assessment');

select tests.authenticate_as('other');
select tests.ok(tests.visible_count('select * from public.assessments') = 0, 'another athlete sees none of it');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_load_repeatability', null, 3, false, null, null, null, null, null, null)$$,
                           tests.job('adult_assessment')), 'BR003', 'another athlete cannot add values to it');
select tests.throws(format('select public.create_assessment(%L, %L, 1, current_date, %L)', tests.id('adult'), 'hitting-video', '{"rep_goal": 10}'),
  'BR003', 'nobody can start an assessment for an athlete they are not connected to');
select tests.authenticate_as('college');
select tests.ok(tests.visible_count('select * from public.assessments') = 0
  and tests.visible_count('select * from public.assessment_observations') = 0
  and tests.visible_count('select * from public.assessment_media') = 0,
  'a verified college coach sees no assessments, values or clips');
select tests.throws(format('select public.create_assessment(%L, %L, 1, current_date, %L)', tests.id('adult'), 'hitting-video', '{"rep_goal": 10}'),
  'BR003', 'a recruiter cannot create or edit an athlete''s assessments');
select tests.authenticate_as_anon();
select tests.throws('select * from public.assessments', '42501', 'signed-out visitors cannot read assessments');
select tests.throws('select * from public.assessment_metric_definitions', '42501', 'signed-out visitors cannot read the catalog tables');

-- ================================================================ video files
select tests.authenticate_as('admin');
select public.admin_set_assessment_switches(true, true);
select tests.authenticate_as('adult');
select tests.remember_job('clip', (select media_id from public.begin_assessment_upload(tests.job('adult_assessment'), 'swing.mp4', 'video/mp4', 5000000,
  'side_facing', 'real_time', null, 'Tee, side view')));
select tests.ok(public.assessment_video_open(tests.id('adult')), 'uploads are open for an athlete 18 or older');
select tests.authenticate_as('minor');
select tests.remember_job('minor_assessment', public.create_assessment(tests.id('minor'), 'hitting-video', 1, current_date, '{"rep_goal": 10}'));
select tests.ok(not public.assessment_video_open(tests.id('minor')), 'uploads are closed for an athlete under 18, and the page can say so');
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'swing.mov', 'video/quicktime', 5000000, null, 'real_time', null, null)$$,
                           tests.job('minor_assessment')), 'BR004', 'no clip can be started for an athlete under 18 (F40)');
select tests.authenticate_as('other');
select tests.throws(format('select public.assessment_video_open(%L)', tests.id('minor')), 'BR002', 'only people who can work on an athlete''s assessments can ask');
select tests.authenticate_as('adult');
select tests.ok((select storage_path from public.assessment_media where id = tests.job('clip'))
                = tests.id('adult') || '/' || tests.job('adult_assessment') || '/' || tests.job('clip') || '.mp4',
  'clips are stored under the athlete and assessment');
select tests.ok(private.assessment_object_access((select storage_path from public.assessment_media where id = tests.job('clip')), 'insert'),
  'the uploader may create the file for a pending clip');
select tests.ok(not private.assessment_object_access((select storage_path from public.assessment_media where id = tests.job('clip')) || 'x', 'insert'),
  'no file can be created at a path no clip row reserved');

select tests.authenticate_as('other');
select tests.ok(not private.assessment_object_access(tests.id('adult') || '/' || tests.job('adult_assessment') || '/' || tests.job('clip') || '.mp4', 'select'),
  'another athlete cannot read the file');
select tests.authenticate_as('college');
select tests.ok(not private.assessment_object_access(tests.id('adult') || '/' || tests.job('adult_assessment') || '/' || tests.job('clip') || '.mp4', 'select'),
  'a recruiter cannot read the file, even with shared reports');
select tests.authenticate_as('adult');
select tests.ok(private.assessment_object_access(tests.id('adult') || '/' || tests.job('adult_assessment') || '/' || tests.job('clip') || '.mp4', 'delete'),
  'a pending upload can be cleaned up by its owner');

select tests.authenticate_as('admin');
select public.admin_set_assessment_switches(true, false);
select tests.authenticate_as('adult');
select tests.ok(not private.assessment_object_access(tests.id('adult') || '/' || tests.job('adult_assessment') || '/' || tests.job('clip') || '.mp4', 'insert'),
  'turning video off stops new uploads immediately');
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'a.mp4', 'video/mp4', 100, null, 'real_time', null, null)$$,
                           tests.job('adult_assessment')), 'BR004', 'no upload can start while video is off');

select tests.clear_authentication();
select tests.ok(to_regclass('storage.objects') is null
  or (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('assessment_media_insert', 'assessment_media_select', 'assessment_media_delete')) = 3,
  'storage policies guard creating, reading and deleting assessment video');
select tests.ok(to_regclass('storage.buckets') is null
  or (select not public from storage.buckets where id = 'assessment-media'), 'the video bucket is private');
