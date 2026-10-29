-- SeamState: the analysis switch and spending limits, permission (with the
-- guardian gate for minors), capture details, idempotent requests, who can see
-- and review results, worker callbacks that refuse stale or late answers,
-- immutable analyses, and removal of a clip's records.

select tests.create_user('admin', 'parent', 'seamstate.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('adult', 'athlete', p_display_name => 'Alex Adult', p_date_of_birth => (current_date - interval '20 years')::date);
select tests.create_user('kid', 'athlete', p_display_name => 'Kai Kid', p_date_of_birth => (current_date - interval '15 years')::date);
select tests.create_user('parent', 'parent', p_date_of_birth => (current_date - interval '44 years')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '22 years')::date);
select tests.enable_assessment(true);
select tests.link_family('kid', 'parent');
select tests.link_development_coach('adult', 'dev');

-- An uploaded clip (the upload flow itself is covered in 016).
create function tests.ss_clip(p_name text, p_assessment uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_athlete uuid := (select a.athlete_id from public.assessments a where a.id = p_assessment);
begin
  insert into public.assessment_media (id, assessment_id, athlete_id, storage_path, mime_type, byte_size, camera_view,
                                       timing_basis, status, uploaded_at, created_by)
  values (v_id, p_assessment, v_athlete, v_athlete || '/' || p_assessment || '/' || v_id || '.mp4', 'video/mp4', 4000000,
          'side_facing', 'real_time', 'uploaded', now(), v_athlete);
  perform tests.remember_job(p_name, v_id);
  return v_id;
end;
$$;

create function tests.ss_context(p_setting jsonb, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('protocolVersion', 'seamstate-capture-v1', 'battingSide', 'right', 'cameraView', 'side_facing',
                            'setting', p_setting, 'task', null, 'devices', '[]'::jsonb, 'limitations', null) || p_extra
$$;

create function tests.ss_request(p_clip text, p_key text, p_setting jsonb default '{"setting": "tee", "teeZone": 5}')
returns uuid
language sql
as $$
  select r.job_id from public.seamstate_request_analysis(tests.job(p_clip), tests.ss_context(p_setting), p_key) r
$$;

-- A small valid packet and findings, shaped like src/lib/seamstate/packet.ts and validate.ts output.
create function tests.ss_analysis(p_frame text default 'f000012') returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'clip_verdict', 'suitable', 'pipeline_version', 'seamstate-v1', 'catalog_version', 'seamstate-mechanics-v1',
    'policy_version', 'seamstate-evidence-v1', 'schema_version', 'seamstate-interpretation-v1', 'model_id', 'test-model',
    'packet', jsonb_build_object('swings', jsonb_build_array(jsonb_build_object('index', 0)),
                                 'frames', jsonb_build_array(jsonb_build_object('frameId', p_frame, 'swingIndex', 0))),
    'result', jsonb_build_object('unableToAssess', '[]'::jsonb))
$$;

create function tests.ss_findings(p_frame text default 'f000012') returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('position', 0, 'mechanic_key', 'head_movement', 'mechanic_version', 1, 'pillar', 'load_timing',
                       'category', 'adjustment', 'priority', true, 'swing_indexes', jsonb_build_array(0),
                       'observation', 'The head moves toward the pitcher during the stride.',
                       'suggested_experiment', 'Try a shorter stride for ten swings.',
                       'reassessment', 'Film the same view after a week.', 'cue', 'Quiet head',
                       'evidence_frame_ids', jsonb_build_array(p_frame), 'eligible_swing_count', 1,
                       'observed_swing_count', 1, 'evidence_grade', 'limited',
                       'evidence_grade_reasons', jsonb_build_array('one swing')),
    jsonb_build_object('position', 1, 'mechanic_key', 'finish_support', 'mechanic_version', 1, 'pillar', 'lower_body_contribution',
                       'category', 'strength', 'swing_indexes', jsonb_build_array(0),
                       'observation', 'The back foot stays connected through the finish.',
                       'evidence_frame_ids', jsonb_build_array(p_frame), 'eligible_swing_count', 1,
                       'observed_swing_count', 1, 'evidence_grade', 'moderate'))
$$;

-- Reads tables as the owner (the service role can call the worker functions but not read tables).
create function tests.ss_owner(p_sql text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result boolean;
begin
  execute p_sql into v_result;
  return v_result;
end;
$$;

grant execute on all functions in schema tests to public;

select tests.authenticate_as('adult');
select tests.remember_job('adult_hit', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10}'));
select tests.remember_job('adult_pitch', public.create_assessment(auth.uid(), 'pitching-video', 1, current_date, '{"rep_goal": 10}'));
select tests.authenticate_as('kid');
select tests.remember_job('kid_hit', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10}'));
select tests.clear_authentication();
select tests.ss_clip('clip1', tests.job('adult_hit'));
select tests.ss_clip('clip2', tests.job('adult_hit'));
select tests.ss_clip('clip3', tests.job('adult_hit'));
select tests.ss_clip('clip4', tests.job('adult_hit'));
select tests.ss_clip('clip5', tests.job('adult_hit'));
select tests.ss_clip('clip6', tests.job('adult_hit'));
select tests.ss_clip('pitch_clip', tests.job('adult_pitch'));
select tests.ss_clip('kid_clip', tests.job('kid_hit'));

-- ================================================================ switch and settings
select tests.authenticate_as('adult');
select tests.ok((select not enabled and monthly_limit = 0 and used_this_month is null from public.seamstate_switches()),
  'SeamState starts switched off with a monthly limit of 0, and site-wide usage is hidden from non-administrators');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a')$$, 'BR004', 'nothing can be requested while SeamState is off');
select tests.throws($$select public.admin_set_seamstate_settings(true, 2, 3)$$, 'BR002', 'only administrators change the switch');

select tests.clear_authentication();
update private.assessment_settings set video_enabled = false where id;
select tests.authenticate_as('admin');
select tests.throws($$select public.admin_set_seamstate_settings(true, 2, 3)$$, 'BR003',
  'SeamState cannot be switched on while Assessment video is off');
select tests.clear_authentication();
select tests.enable_assessment(true);
select tests.authenticate_as('admin');
select tests.throws($$select public.admin_set_seamstate_settings(true, 101, 3)$$, 'BR003', 'the daily limit is capped');
select tests.throws($$select public.admin_set_seamstate_settings(true, 2, 3, false, 101)$$, 'BR003', 'the weekly limit is capped');
select tests.ok((select weekly_limit = 12 from public.seamstate_switches()), 'the weekly limit starts at 12 (F41)');
select tests.ok((select outside_analysis_disclosed from public.seamstate_switches()),
  'the approved privacy wording has lifted the lock (F36)');
-- Without that disclosure the switch refuses, as it did while the old wording stood.
select tests.clear_authentication();
update private.seamstate_settings set outside_analysis_disclosed = false where id;
select tests.authenticate_as('admin');
select tests.throws($$select public.admin_set_seamstate_settings(true, 2, 3)$$, 'BR004',
  'SeamState cannot be switched on while the site promises video is never sent to an outside analysis service');
select tests.ok((select not enabled and not outside_analysis_disclosed from public.seamstate_switches()), 'and it stays off');
select tests.clear_authentication();
update private.seamstate_settings set outside_analysis_disclosed = true where id;
select tests.authenticate_as('admin');
select tests.lives($$select public.admin_set_seamstate_settings(true, 2, 3)$$, 'an administrator switches SeamState on with limits');
select tests.ok((select enabled and daily_limit = 2 and monthly_limit = 3 and used_this_month = 0 from public.seamstate_switches()),
  'administrators see the settings and site-wide usage');
select tests.ok(exists (select 1 from public.audit_events where action = 'seamstate.settings_changed'), 'settings changes are audited');

-- ================================================================ permission
select tests.authenticate_as('adult');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a')$$, 'BR004',
  'analysis needs the athlete''s permission to send stills to the analysis provider');
select tests.ok(public.seamstate_permission(tests.id('adult')) = 'not_allowed', 'the page can tell that permission is missing');
select tests.ok((select status = 'active' from public.grant_consent('seamstate_analysis', 'seamstate-analysis-v1')),
  'an adult athlete''s permission is active immediately');
select tests.ok(public.seamstate_permission(tests.id('adult')) = 'allowed', 'and that it is now allowed');
select tests.authenticate_as('dev');
select tests.ok(public.seamstate_permission(tests.id('adult')) = 'allowed', 'the athlete''s development coach sees the permission state');
select tests.authenticate_as('other');
select tests.throws(format($$select public.seamstate_permission(%L)$$, tests.id('adult')), 'BR002',
  'a stranger cannot ask about another athlete''s permission');
select tests.authenticate_as('adult');
select tests.ok((select expires_at between now() + interval '364 days' and now() + interval '366 days'
                   from public.consent_grants where athlete_id = auth.uid() and scope = 'seamstate_analysis'),
  'the permission lasts at most a year');

-- ================================================================ capture details
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a', '{"setting": "tee", "teeZone": 10}')$$, 'BR003', 'zones are 1 to 9');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a', '{"setting": "tee", "intendedZone": 4}')$$, 'BR003',
  'details that belong to another setting are refused');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a', '{"setting": "overhand_bp"}')$$, 'BR003',
  'overhand BP must say coach BP or a live pitcher');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a', '{"setting": "machine", "machineSettingAsEntered": "1234567890123456789012345678901234567890X"}')$$,
  'BR003', 'the machine setting as entered is short text');
select tests.throws($$select tests.ss_request('clip1', 'key-clip1-a', '{"setting": "batting_cage"}')$$, 'BR003', 'settings come from the list');
select tests.throws(format($$select * from public.seamstate_request_analysis(%L, tests.ss_context('{"setting": "tee"}', '{"heightInches": 70}'), 'key-clip1-a')$$,
  tests.job('clip1')), 'BR003', 'unknown details (such as body measurements) are refused rather than stored');
select tests.throws(format($$select * from public.seamstate_request_analysis(%L, tests.ss_context('{"setting": "tee"}', '{"battingSide": "switch"}'), 'key-clip1-a')$$,
  tests.job('clip1')), 'BR003', 'the batting side for one clip is right or left');
select tests.throws($$select tests.ss_request('clip1', 'short')$$, 'BR003', 'a request key is required');
select tests.throws($$select tests.ss_request('pitch_clip', 'key-pitch-a')$$, 'BR003', 'pitching clips are not analyzed');

-- ================================================================ requests and idempotency
select tests.remember_job('job1', tests.ss_request('clip1', 'key-clip1-a',
  '{"setting": "machine", "machineSettingAsEntered": "60 on the dial", "placement": "fixed", "pitchType": "four_seam"}'));
select tests.ok((select c.setting = 'machine' and c.setting_details = '{"machineSettingAsEntered": "60 on the dial", "placement": "fixed", "pitchType": "four_seam"}'::jsonb
                        and c.batting_side = 'right' and j.state = 'queued' and j.attempt_count = 0
                   from public.seamstate_jobs j join public.seamstate_captures c on c.id = j.capture_id where j.id = tests.job('job1')),
  'a request stores the capture details (the typed machine setting as context) and queues the job');
select tests.ok((select job_id = tests.job('job1') and not created
                   from public.seamstate_request_analysis(tests.job('clip1'), tests.ss_context('{"setting": "tee"}'), 'key-clip1-a')),
  'sending the same request twice returns the same job');
select tests.ok((select job_id = tests.job('job1') and not created
                   from public.seamstate_request_analysis(tests.job('clip1'), tests.ss_context('{"setting": "tee"}'), 'key-clip1-b')),
  'a second request for a clip that is already being analyzed returns the open job');
select tests.throws($$select tests.ss_request('clip2', 'key-clip1-a')$$, 'BR003', 'a request key cannot be reused for another clip');
select tests.ok((select count(*) = 1 from public.seamstate_jobs), 'duplicates created no extra jobs');
select tests.ok((select used_today = 1 from public.seamstate_switches()), 'only the one real request counts toward the limit');

-- ================================================================ minors: closed until counsel's review, then a guardian approves
select tests.authenticate_as('kid');
select tests.ok((select status = 'pending_guardian' from public.grant_consent('seamstate_analysis', 'seamstate-analysis-v1')),
  'a minor''s permission waits for a parent or legal guardian');
select tests.ok(public.seamstate_permission(tests.id('kid')) = 'not_open_to_minors', 'SeamState starts closed to minors, and the page can say so');
select tests.throws($$select tests.ss_request('kid_clip', 'key-kid-a')$$, 'BR004', 'a minor''s clip is not analyzed while SeamState is closed to minors');
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(true, 2, 3, true);
select tests.ok((select minors_enabled from public.seamstate_switches()), 'an administrator opens SeamState to minors');
select tests.authenticate_as('kid');
select tests.ok(public.seamstate_permission(tests.id('kid')) = 'waiting_for_guardian', 'the page can say a guardian''s approval is awaited');
select tests.throws($$select tests.ss_request('kid_clip', 'key-kid-a')$$, 'BR004', 'a minor''s clip is not analyzed before a guardian approves');
select tests.authenticate_as('parent');
select tests.lives(format($$select public.approve_consent_as_guardian(%L)$$,
  (select id from public.consent_grants where athlete_id = tests.id('kid') and scope = 'seamstate_analysis')), 'the parent approves');
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(true, 2, 3);
select tests.authenticate_as('kid');
select tests.throws($$select tests.ss_request('kid_clip', 'key-kid-a')$$, 'BR004',
  'closing SeamState to minors again stops requests even with a guardian''s approval');
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(true, 2, 3, true);
select tests.authenticate_as('kid');
select tests.ok(public.seamstate_permission(tests.id('kid')) = 'allowed', 'with SeamState open to minors and a guardian''s approval, it is allowed');
select tests.remember_job('job_kid', tests.ss_request('kid_clip', 'key-kid-a'));
select tests.ok(tests.job('job_kid') is not null, 'after guardian approval the minor''s clip can be analyzed');

-- ================================================================ who can see and request
select tests.authenticate_as('other');
select tests.throws($$select tests.ss_request('clip2', 'key-other-a')$$, 'BR003', 'a stranger cannot request analysis of someone else''s clip');
select tests.ok(tests.visible_count('select 1 from public.seamstate_jobs') = 0
                and tests.visible_count('select 1 from public.seamstate_captures') = 0,
  'a stranger sees no SeamState jobs or capture details');
select tests.throws(format($$select public.seamstate_cancel_analysis(%L)$$, tests.job('job1')), 'BR003', 'a stranger cannot cancel');
select tests.authenticate_as('dev');
select tests.ok(tests.visible_count('select 1 from public.seamstate_jobs') = 1, 'the athlete''s development coach sees the athlete''s job only');
select tests.authenticate_as('parent');
select tests.ok(tests.visible_count('select 1 from public.seamstate_jobs') = 0,
  'a parent sees nothing until the athlete shares assessments with family');
select tests.throws(format($$insert into public.seamstate_jobs (capture_id, athlete_id, idempotency_key, pipeline_version)
                             select capture_id, athlete_id, 'key-direct-insert', 'x' from public.seamstate_jobs limit 1$$),
  '42501', 'nobody writes SeamState tables directly');

-- ================================================================ limits
select tests.authenticate_as('adult');
select tests.remember_job('job2', tests.ss_request('clip2', 'key-clip2-a'));
select tests.throws($$select tests.ss_request('clip3', 'key-clip3-a')$$, 'BR005', 'the per-person daily limit applies');
select tests.authenticate_as('dev');
select tests.throws($$select tests.ss_request('clip3', 'key-clip3-dev')$$, 'BR005', 'the site-wide monthly limit applies to everyone');
select tests.authenticate_as('admin');
select tests.ok((select used_this_month = 3 from public.seamstate_switches()), 'monthly usage counts real requests');
select public.admin_set_seamstate_settings(true, 10, 20, true, 2);
select tests.authenticate_as('adult');
select tests.ok((select weekly_limit = 2 and used_this_week = 2 from public.seamstate_switches()),
  'a person sees the weekly limit and their own use of it');
select tests.throws($$select tests.ss_request('clip3', 'key-clip3-w')$$, 'BR005', 'the per-person weekly limit applies');
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(true, 10, 20, true);
select tests.ok((select weekly_limit = 2 from public.seamstate_switches()), 'leaving out the weekly limit keeps it unchanged');
select public.admin_set_seamstate_settings(true, 10, 20, true, 12);

-- ================================================================ worker callbacks
select tests.authenticate_as('adult');
select tests.throws(format($$select * from public.seamstate_worker_begin_attempt(%L, 'worker-1')$$, tests.job('job1')),
  '42501', 'signed-in people cannot call worker callbacks');

select tests.authenticate_as_service_role();
select tests.ok((select count(*) = 3 from public.seamstate_worker_due_jobs(600, 10)),
  'queued jobs are listed for dispatch');
select tests.remember_job('a1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job1'), 'worker-1')));
select tests.ok(tests.ss_owner($q$select state = 'preprocessing' and attempt_count = 1 and current_attempt_id = tests.job('a1')
                   from public.seamstate_jobs where id = tests.job('job1')$q$), 'the first attempt starts preprocessing');
select tests.ok((select count(*) = 0 from public.seamstate_worker_begin_attempt(tests.job('job1'), 'worker-1')),
  'a job that already started cannot be started twice');
select tests.ok(public.seamstate_worker_report(tests.job('a1'), 'tracking', '{"frames": 240, "ms": 5100}'), 'the worker reports a stage');
select tests.throws(format($$select public.seamstate_worker_report(%L, 'failed', '{}', 'failed', null, null)$$, tests.job('a1')),
  'BR003', 'a failure needs its kind and code');
select tests.throws(format($$select public.seamstate_worker_report(%L, 'tracking', '{}', 'complete')$$, tests.job('a1')),
  'BR003', 'a report cannot mark a job complete without saving an analysis');
select tests.throws(format($$select public.seamstate_worker_record_inspection(%L, '{"sha256": "%s", "container": "mov", "video_codec": "h264", "width": 1080, "height": 1920, "measured_fps": 240, "variable_frame_rate": false, "frame_count": 2400, "duration_ms": 10000, "inspector_version": "i1", "file_name": "x"}')$$,
  tests.job('a1'), repeat('a', 64)), 'BR003', 'unknown inspection fields are refused');
select tests.ok(public.seamstate_worker_record_inspection(tests.job('a1'), jsonb_build_object('sha256', repeat('a', 64), 'container', 'mov',
  'video_codec', 'h264', 'width', 1080, 'height', 1920, 'measured_fps', 240, 'variable_frame_rate', false, 'frame_count', 2400,
  'duration_ms', 10000, 'inspector_version', 'i1')), 'the decoded inspection is recorded');
select tests.ok(public.seamstate_worker_report(tests.job('a1'), 'interpreting', '{}', 'analyzing'), 'the job moves to analyzing');
select tests.throws(format($$select public.seamstate_worker_save_analysis(%L, 'complete', tests.ss_analysis('f000012'), tests.ss_findings('f000099'))$$,
  tests.job('a1')), 'BR003', 'a finding cannot cite a still that is not in its evidence packet');
select tests.remember_job('analysis1', public.seamstate_worker_save_analysis(tests.job('a1'), 'complete', tests.ss_analysis(), tests.ss_findings()));
select tests.ok(tests.ss_owner($q$select j.state = 'complete' and j.finished_at is not null and a.revision = 1 and a.cause = 'initial' and a.status = 'current'
                   from public.seamstate_jobs j join public.seamstate_analyses a on a.job_id = j.id where j.id = tests.job('job1')$q$),
  'saving the analysis completes the job with its first revision');
select tests.ok(tests.ss_owner($q$select count(*) = 2 and bool_and(review_state = 'provisional') from public.seamstate_findings where analysis_id = tests.job('analysis1')$q$),
  'findings are saved as provisional AI assessment');
select tests.ok(not public.seamstate_worker_report(tests.job('a1'), 'saving', '{}'), 'a late report after the job finished is refused');
select tests.ok(public.seamstate_worker_save_analysis(tests.job('a1'), 'complete', tests.ss_analysis(), tests.ss_findings()) is null,
  'a repeated save after the job finished writes nothing');
select tests.ok(tests.ss_owner($q$select count(*) = 1 from public.seamstate_analyses where job_id = tests.job('job1')$q$), 'there is still one analysis');

-- Stale attempts: a stalled attempt is requeued and its late answers are refused.
select tests.remember_job('b1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job2'), 'worker-1')));
select tests.clear_authentication();
update public.seamstate_job_attempts set last_report_at = now() - interval '20 minutes' where id = tests.job('b1');
select tests.authenticate_as_service_role();
select tests.ok((select count(*) = 0 from public.seamstate_worker_due_jobs(600, 10) where job_id = tests.job('job2')),
  'a requeued job waits for its retry backoff before being dispatched again');
select tests.ok(tests.ss_owner($q$select state = 'queued' and current_attempt_id is null from public.seamstate_jobs where id = tests.job('job2')$q$),
  'a stalled attempt is requeued');
select tests.ok(not public.seamstate_worker_report(tests.job('b1'), 'tracking', '{}'), 'the stalled attempt''s late report is refused');
select tests.clear_authentication();
update public.seamstate_job_attempts set finished_at = now() - interval '1 minute' where id = tests.job('b1');
select tests.authenticate_as_service_role();
select tests.ok(exists (select 1 from public.seamstate_worker_due_jobs(600, 10) where job_id = tests.job('job2') and attempt_count = 1),
  'after the backoff the job is listed again');
select tests.remember_job('b2', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job2'), 'worker-1')));
select tests.ok(public.seamstate_worker_save_analysis(tests.job('b1'), 'complete', tests.ss_analysis(), tests.ss_findings()) is null,
  'the old attempt cannot save results over the new attempt');
select tests.ok(public.seamstate_worker_save_analysis(tests.job('b2'), 'partial', tests.ss_analysis(), tests.ss_findings()) is not null,
  'the current attempt saves its results');

-- Three stalled attempts fail the job as a service problem, not a footage problem.
select tests.authenticate_as('adult');
select tests.remember_job('job3', tests.ss_request('clip3', 'key-clip3-b'));
select tests.authenticate_as_service_role();
select tests.remember_job('c1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job3'), 'worker-1')));
select tests.clear_authentication();
update public.seamstate_jobs set attempt_count = 3 where id = tests.job('job3');
update public.seamstate_job_attempts set last_report_at = now() - interval '20 minutes' where id = tests.job('c1');
select tests.authenticate_as_service_role();
select count(*) from public.seamstate_worker_due_jobs(600, 10);
select tests.ok(tests.ss_owner($q$select state = 'failed' and failure_kind = 'service' and failure_code = 'stalled' from public.seamstate_jobs where id = tests.job('job3')$q$),
  'after the last attempt stalls the job fails as a service problem');

-- A footage failure is reported with its kind and code.
select tests.authenticate_as('adult');
select tests.remember_job('job4', tests.ss_request('clip4', 'key-clip4-a'));
select tests.authenticate_as_service_role();
select tests.remember_job('d1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job4'), 'worker-1')));
select tests.ok(public.seamstate_worker_report(tests.job('d1'), 'failed', '{}', 'failed', 'footage', 'feet_not_visible'),
  'the worker reports a footage problem');
select tests.ok(tests.ss_owner($q$select state = 'failed' and failure_kind = 'footage' and failure_code = 'feet_not_visible' from public.seamstate_jobs where id = tests.job('job4')$q$),
  'the job records why the footage could not be analyzed');

-- Withdrawn permission cancels the job at the next callback.
select tests.remember_job('k1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job_kid'), 'worker-1')));
select tests.authenticate_as('kid');
select public.revoke_consent((select id from public.consent_grants where athlete_id = auth.uid() and scope = 'seamstate_analysis'));
select tests.authenticate_as_service_role();
select tests.ok(not public.seamstate_worker_report(tests.job('k1'), 'interpreting', '{}'),
  'after permission is withdrawn the worker may not continue (no stills go to the provider)');
select tests.ok(tests.ss_owner($q$select state = 'cancelled' from public.seamstate_jobs where id = tests.job('job_kid')$q$), 'the job is cancelled');

-- Cancellation by the person.
select tests.authenticate_as('adult');
select tests.remember_job('job5', tests.ss_request('clip5', 'key-clip5-a'));
select tests.authenticate_as_service_role();
select tests.remember_job('e1', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job5'), 'worker-1')));
select tests.authenticate_as('adult');
select tests.lives(format($$select public.seamstate_cancel_analysis(%L)$$, tests.job('job5')), 'the athlete cancels an analysis in progress');
select tests.throws(format($$select public.seamstate_cancel_analysis(%L)$$, tests.job('job5')), 'BR004', 'a finished analysis cannot be cancelled');
select tests.authenticate_as_service_role();
select tests.ok(public.seamstate_worker_save_analysis(tests.job('e1'), 'complete', tests.ss_analysis(), tests.ss_findings()) is null,
  'a result that arrives after cancellation is not saved');

-- Switching SeamState off stops work in progress.
select tests.authenticate_as('adult');
select tests.remember_job('job5b', tests.ss_request('clip5', 'key-clip5-b'));
select tests.authenticate_as_service_role();
select tests.remember_job('e2', (select attempt_id from public.seamstate_worker_begin_attempt(tests.job('job5b'), 'worker-1')));
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(false, 10, 20, true);
select tests.authenticate_as_service_role();
select tests.ok(not public.seamstate_worker_report(tests.job('e2'), 'interpreting', '{}'), 'switching SeamState off refuses further work');
select tests.ok(tests.ss_owner($q$select state = 'failed' and failure_kind = 'service' and failure_code = 'switched_off' from public.seamstate_jobs where id = tests.job('job5b')$q$),
  'the job fails as a service problem, not the swing''s fault');
select tests.ok((select count(*) = 0 from public.seamstate_worker_due_jobs(600, 10)), 'nothing is dispatched while switched off');
select tests.authenticate_as('admin');
select public.admin_set_seamstate_settings(true, 10, 20, true);

-- Giving an attempt back to the queue, the capture the worker receives, and where stills go.
select tests.authenticate_as('adult');
select tests.remember_job('job6', tests.ss_request('clip6', 'key-clip6-a', '{"setting": "front_toss", "intendedZone": 4, "locationAnnounced": true}'));
select tests.authenticate_as_service_role();
select tests.ok((select capture = jsonb_build_object('protocolVersion', 'seamstate-capture-v1', 'battingSide', 'right',
                   'cameraView', 'side_facing', 'setting', '{"setting": "front_toss", "intendedZone": 4, "locationAnnounced": true}'::jsonb,
                   'task', null, 'devices', '[]'::jsonb, 'limitations', null)
                   and timing = '{"timingBasis": "real_time", "slowdownFactor": null}'::jsonb
                   and tests.remember_job('g1', attempt_id) is not null
                   from public.seamstate_worker_begin_attempt(tests.job('job6'), 'worker-1')),
  'the worker receives the capture context in the app''s shape and the clip''s timing');
select tests.ok(public.seamstate_worker_artifact_path(tests.job('g1'))
                = tests.id('adult') || '/' || tests.job('clip6') || '/' || tests.job('job6') || '/' || tests.job('g1'),
  'stills go under athlete/clip/job/attempt');
select tests.throws(format($$select public.seamstate_worker_report(%L, 'failed', '{}', 'queued')$$, tests.job('g1')),
  'BR003', 'giving a job back to the queue needs a reason code');
select tests.ok(public.seamstate_worker_report(tests.job('g1'), 'failed', '{}', 'queued', null, 'worker_busy'),
  'a busy worker gives the job back to the queue');
select tests.ok(tests.ss_owner($q$select state = 'queued' and current_attempt_id is null and failure_kind is null
                                  from public.seamstate_jobs where id = tests.job('job6')$q$), 'the job waits for another attempt');
select tests.ok(public.seamstate_worker_artifact_path(tests.job('g1')) is null, 'the given-back attempt can no longer upload');

-- ================================================================ immutability
select tests.clear_authentication();
select tests.throws(format($$update public.seamstate_analyses set packet = '{}' where id = %L$$, tests.job('analysis1')),
  'BR002', 'an analysis and its evidence packet cannot be rewritten');
select tests.throws(format($$update public.seamstate_findings set observation = 'edited' where analysis_id = %L$$, tests.job('analysis1')),
  'BR002', 'a finding''s wording cannot be edited');

-- ================================================================ review
select tests.authenticate_as('adult');
select tests.throws(format($$select public.seamstate_review_finding(%L, 'approve')$$,
  (select id from public.seamstate_findings where analysis_id = tests.job('analysis1') and position = 0)),
  'BR002', 'an athlete cannot approve their own AI finding');
select tests.throws(format($$select public.seamstate_review_finding(%L, 'note', '  ')$$,
  (select id from public.seamstate_findings where analysis_id = tests.job('analysis1') and position = 0)),
  'BR003', 'a note needs text');
select tests.lives(format($$select public.seamstate_review_finding(%L, 'note', 'Felt rushed on this one.')$$,
  (select id from public.seamstate_findings where analysis_id = tests.job('analysis1') and position = 0)),
  'an athlete adds a note');
select tests.authenticate_as('other');
select tests.throws(format($$select public.seamstate_review_finding(%L, 'note', 'hi')$$,
  (select id from public.seamstate_findings where analysis_id = tests.job('analysis1') and position = 0)),
  'BR003', 'a stranger cannot review');
select tests.authenticate_as('dev');
select tests.lives(format($$select public.seamstate_review_finding(%L, 'approve', 'Agree, start with the stride.')$$,
  (select id from public.seamstate_findings where analysis_id = tests.job('analysis1') and position = 0)),
  'the development coach approves a finding');
select tests.ok((select review_state = 'approved' and reviewed_by = tests.id('dev') from public.seamstate_findings
                  where analysis_id = tests.job('analysis1') and position = 0), 'the finding shows who approved it');
select tests.ok((select count(*) = 2 from public.seamstate_reviews where analysis_id = tests.job('analysis1')), 'review history is kept');
select tests.clear_authentication();
select tests.throws($$update public.seamstate_reviews set note = 'changed'$$, 'BR002', 'review history is append-only');

-- ================================================================ stored artifacts
select tests.authenticate_as('adult');
create temporary table t_paths on commit drop as
  select j.athlete_id || '/' || c.media_id || '/' || j.id || '/' || tests.job('a1') || '/f000012.jpg' as path
    from public.seamstate_jobs j join public.seamstate_captures c on c.id = j.capture_id where j.id = tests.job('job1');
grant select on t_paths to public;
select tests.ok(private.seamstate_object_access((select path from t_paths)), 'the athlete can open their evidence stills');
select tests.ok(not private.seamstate_object_access('../' || (select path from t_paths)), 'malformed paths are refused');
select tests.authenticate_as('other');
select tests.ok(not private.seamstate_object_access((select path from t_paths)), 'a stranger cannot open them');

-- ================================================================ removing a clip
select tests.authenticate_as('adult');
select public.remove_assessment_media(tests.job('clip1'));
select tests.clear_authentication();
select tests.ok(not exists (select 1 from public.seamstate_captures where media_id = tests.job('clip1'))
                and not exists (select 1 from public.seamstate_jobs where id = tests.job('job1'))
                and not exists (select 1 from public.seamstate_analyses where id = tests.job('analysis1'))
                and not exists (select 1 from public.seamstate_findings where analysis_id = tests.job('analysis1'))
                and not exists (select 1 from public.seamstate_media_inspections where media_id = tests.job('clip1')),
  'removing a clip removes its capture details, jobs, analyses, findings, reviews and inspection');
select tests.authenticate_as('admin');
select tests.ok((select used_this_month = 8 from public.seamstate_switches()), 'removing clips does not give back used analyses');
