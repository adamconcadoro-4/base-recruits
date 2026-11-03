-- SeamState's own page (2026-11-03): one hidden clip holder per athlete, made
-- only for people who can work on the athlete and only while clips can be
-- uploaded for them (18+, F40); it never leaves draft, a real assessment never
-- turns into one, and requests and refusals say SeamState.

select tests.create_user('admin', 'parent', 'seamstate.page.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('adult', 'athlete', p_display_name => 'Alex Adult', p_date_of_birth => (current_date - interval '20 years')::date);
select tests.create_user('kid', 'athlete', p_display_name => 'Kai Kid', p_date_of_birth => (current_date - interval '15 years')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '22 years')::date);
select tests.enable_assessment(true);
select tests.link_development_coach('adult', 'dev');

-- ================================================================ creating the holder
select tests.enable_assessment(false);
select tests.authenticate_as('adult');
select tests.throws($$select public.seamstate_clip_home(auth.uid())$$, 'BR004', 'no holder while video uploads are off');
select tests.clear_authentication();
select tests.enable_assessment(true);

select tests.authenticate_as('kid');
select tests.throws($$select public.seamstate_clip_home(auth.uid())$$, 'BR004', 'no holder for an athlete under 18 (F40)');

select tests.authenticate_as('other');
select tests.throws(format($$select public.seamstate_clip_home(%L)$$, tests.id('adult')), 'BR003', 'a stranger cannot make or find another athlete''s holder');

select tests.authenticate_as('adult');
select tests.remember_job('home', public.seamstate_clip_home(auth.uid()));
select tests.ok(public.seamstate_clip_home(auth.uid()) = tests.job('home'), 'asking again returns the same holder');
select tests.ok((select purpose = 'seamstate_clips' and status = 'draft' and discipline = 'hitting' from public.assessments where id = tests.job('home')),
  'the holder is a hitting draft marked as SeamState clips');
select tests.authenticate_as('dev');
select tests.ok(public.seamstate_clip_home(tests.id('adult')) = tests.job('home'), 'the athlete''s development coach gets the same holder');
select tests.clear_authentication();
select tests.ok((select count(*) = 1 from public.assessments where athlete_id = tests.id('adult') and purpose = 'seamstate_clips'),
  'an athlete has exactly one holder');
select tests.throws(format($$insert into public.assessments (athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date,
                               age_band, rep_goal, purpose) values (%L, 'hitting', 'video_coach', 'hitting-video', 1, current_date, '19_22', 1, 'seamstate_clips')$$,
                            tests.id('adult')),
  '23505', 'a second holder is refused by the database');

-- ================================================================ the holder stays a holder
select tests.authenticate_as('adult');
select tests.throws(format($$select public.set_assessment_status(%L, 'ready_for_review')$$, tests.job('home')), 'BR004',
  'the holder cannot be sent for review');
select tests.remember_job('real', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10}'));
select tests.ok((select purpose = 'assessment' from public.assessments where id = tests.job('real')), 'a new assessment is a real assessment');
select tests.clear_authentication();
select tests.throws(format($$update public.assessments set purpose = 'seamstate_clips' where id = %L$$, tests.job('real')), 'BR004',
  'a real assessment never turns into a holder');
select tests.throws(format($$update public.assessments set status = 'published' where id = %L$$, tests.job('home')), 'BR004',
  'the holder is never published, even by the owner');

-- ================================================================ uploading and asking for SeamState
select tests.authenticate_as('adult');
select tests.remember_job('clip', (select media_id from public.begin_assessment_upload(tests.job('home'), 'tee.mp4', 'video/mp4', 4000000,
  'side_facing', 'real_time', null, 'Tee, side view')));
select tests.ok((select assessment_id = tests.job('home') from public.assessment_media where id = tests.job('clip')),
  'a SeamState clip is stored in the holder');
select tests.throws(format($$select * from public.seamstate_request_analysis(%L, '{}'::jsonb, 'key-page-0001')$$, tests.job('clip')),
  'BR004', 'SeamState is still off until an administrator turns it on');
select tests.ok((select position('SeamState' in coalesce(description, '')) > 0 from public.consent_scope_rules where scope = 'seamstate_analysis'),
  'the permission wording names SeamState again');

-- The 30-clip limit names SeamState clips for the holder.
select tests.clear_authentication();
insert into public.assessment_media (assessment_id, athlete_id, storage_path, mime_type, byte_size, timing_basis, status, created_by)
  select tests.job('home'), tests.id('adult'), tests.id('adult') || '/' || tests.job('home') || '/' || gen_random_uuid() || '.mp4',
         'video/mp4', 1000, 'real_time', 'uploaded', tests.id('adult')
    from generate_series(1, 29);
select tests.authenticate_as('adult');
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'more.mp4', 'video/mp4', 4000000, null, 'real_time', null, null)$$,
                           tests.job('home')),
  'BR005', 'a full holder refuses another clip');
select tests.clear_authentication();
