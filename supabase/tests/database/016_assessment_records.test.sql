-- Assessment records: creating and autosaving assessments, recording values
-- with their evidence and source, review, Film Room timing from markers,
-- CSV imports (validation, unit conversion, duplicates) and coach targets.

select tests.create_user('admin', 'parent', 'records.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_display_name => 'Jordan Athlete', p_date_of_birth => (current_date - interval '15 years' - interval '30 days')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('parent', 'parent', p_date_of_birth => (current_date - interval '44 years')::date);
select tests.enable_assessment(true);
select tests.link_family('athlete', 'parent');
select tests.link_development_coach('athlete', 'dev', 'parent');

-- ================================================================ creating and autosaving
select tests.authenticate_as('athlete');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 9, current_date, '{"rep_goal": 10}')$$,
  'BR003', 'only listed protocols can be used');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 1, current_date + 3, '{"rep_goal": 10}')$$,
  'BR003', 'an assessment cannot be dated in the future');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 0}')$$,
  'BR003', 'the repetition goal must be at least one');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10, "drill_type": "bullpen"}')$$,
  'BR003', 'a pitching drill cannot be recorded for hitting');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10, "favorite_bat": "x"}')$$,
  'BR003', 'unknown details are refused rather than stored');
select tests.throws($$select public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 10, "camera_views": ["drone"]}')$$,
  'BR003', 'camera views come from the list');

select tests.remember_job('hit', public.create_assessment(auth.uid(), 'hitting-instrumented', 1, current_date,
  '{"rep_goal": 8, "drill_type": "front_toss", "bats": "right", "throws": "right", "competition_level": "high_school",
    "camera_views": ["side_facing", "front_on"], "environment": "indoor", "equipment": "L-screen", "notes": "Intended contact: middle-in"}'::jsonb));
select tests.ok((select age_band || '|' || status || '|' || mode || '|' || draft_version from public.assessments where id = tests.job('hit'))
  = '15_16|draft|instrumented|1', 'a new assessment records the age band (not the date of birth), starts as a draft and records its mode');

select tests.ok(public.update_assessment_context(tests.job('hit'), 1, current_date, '{"rep_goal": 9, "drill_type": "tee"}') = 2,
  'autosave returns the new version');
select tests.throws(format($$select public.update_assessment_context(%L, 1, current_date, '{"rep_goal": 9}')$$, tests.job('hit')),
  'BR004', 'a save from a stale window is refused instead of overwriting newer details');
select tests.ok((select rep_goal = 9 and drill_type = 'tee' and camera_views = '{}' from public.assessments where id = tests.job('hit')),
  'autosave replaces the details with exactly what was sent');

-- ================================================================ ratings
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_load_repeatability', null, 6, false, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', 'ratings above 5 are refused');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_load_repeatability', null, 2.5, false, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', 'ratings are whole numbers');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_load_repeatability', null, null, true, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', '"Unable to assess" needs a reason');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_timing_variation_ms', null, 12, false, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', 'derived values cannot be entered');
select tests.throws(format($$select public.record_assessment_observation(%L, 'pit_velocity_mph', null, 70, false, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', 'metrics outside the protocol are refused');
select tests.remember_job('self_load', public.record_assessment_observation(tests.job('hit'), 'hit_load_repeatability', null, 4, false,
  null, null, null, null, null, null));
select tests.remember_job('unable', public.record_assessment_observation(tests.job('hit'), 'hit_lower_body_consistency', null, null, true,
  'Hips are out of frame on the front view', null, null, null, null, null));
select tests.ok((select source_kind || '|' || quality_state || '|' || evidence_category || '|' || entry_method
                   from public.assessment_observations where id = tests.job('self_load'))
                = 'self|not_reviewed|observation|manual_entry', 'an athlete''s rating is recorded as self-assessed and not yet reviewed');
select tests.ok((select value is null and quality_state = 'unable_to_assess' from public.assessment_observations where id = tests.job('unable')),
  '"Unable to assess" is stored with no value — never as a zero');

select tests.authenticate_as('dev');
select tests.remember_job('coach_load', public.record_assessment_observation(tests.job('hit'), 'hit_load_repeatability', null, 2, false,
  null, null, null, null, null, null));
select tests.ok((select count(*) from public.assessment_observations where assessment_id = tests.job('hit') and metric_key = 'hit_load_repeatability') = 2,
  'the coach''s rating sits beside the athlete''s self-rating instead of replacing it');
select tests.ok((select source_kind = 'development_coach' and quality_state = 'usable' and reviewed_by = tests.id('dev')
                   from public.assessment_observations where id = tests.job('coach_load')),
  'the coach''s own rating counts as reviewed by the coach');

select tests.authenticate_as('athlete');
select tests.throws(format($$select public.set_observation_quality(%L, 'excluded', 'I disagree')$$, tests.job('coach_load')),
  'BR002', 'the athlete cannot override the coach''s values');
select tests.throws(format($$select public.delete_assessment_observation(%L)$$, tests.job('coach_load')),
  'BR002', 'the athlete cannot delete the coach''s values');
select tests.throws(format($$select public.set_assessment_status(%L, 'reviewed')$$, tests.job('hit')),
  'BR002', 'only the development coach can mark an assessment reviewed');
select tests.authenticate_as('dev');
select tests.throws(format($$select public.set_observation_quality(%L, 'limited', null)$$, tests.job('self_load')),
  'BR003', 'a limited value needs a reason');
select tests.lives(format($$select public.set_observation_quality(%L, 'usable', null)$$, tests.job('self_load')),
  'the coach reviews the athlete''s self-rating');
select tests.ok((select source_kind = 'self' and reviewed_by = tests.id('dev') from public.assessment_observations where id = tests.job('self_load')),
  'a reviewed self-rating stays labelled self-assessed, with the coach as reviewer');

-- ================================================================ repetition values and devices
select tests.authenticate_as('athlete');
select public.add_assessment_repetitions(tests.job('hit'), 6);
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_exit_velocity_mph', null, 80, false, null, null, null, null, null, null)$$, tests.job('hit')),
  'BR003', 'per-swing values need a swing');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_exit_velocity_mph', %L, 80, false, null, null, null, null, null, null)$$,
                           tests.job('hit'), (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 1)),
  'BR003', 'a measured value must name the device that produced it');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_exit_velocity_mph', %L, 140, false, null, null, 'radar', 'Radar A', null, null)$$,
                           tests.job('hit'), (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 1)),
  'BR003', 'implausible values are refused');
select tests.lives(format($$select public.record_assessment_observation(%L, 'hit_launch_angle_deg', %L, 0, false, null, null, 'ball_tracking', 'Tracker', null, null)$$,
                          tests.job('hit'), (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 1)),
  'a valid zero is accepted');
select tests.ok((select value = 0 from public.assessment_observations where assessment_id = tests.job('hit') and metric_key = 'hit_launch_angle_deg'),
  'the zero is stored as zero');
select tests.lives(format($$select public.record_assessment_observation(%L, 'hit_exit_velocity_mph', %L, 80, false, null, null, 'radar', 'Radar A', null, null)$$,
                          tests.job('hit'), (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 1)),
  'a hand-entered radar reading is recorded');
select tests.ok((select evidence_category || '|' || entry_method || '|' || device_kind || '|' || device_label
                   from public.assessment_observations where assessment_id = tests.job('hit') and metric_key = 'hit_exit_velocity_mph')
                = 'sensor_measurement|manual_entry|radar|Radar A', 'it says it was entered by hand, and which device produced it');
select tests.throws(format($$select public.set_assessment_repetition_status(%L, 'excluded', '')$$,
                           (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 2)),
  'BR003', 'excluding a swing needs a reason');
select tests.lives(format($$select public.set_assessment_repetition_status(%L, 'excluded', 'Ball hit the screen')$$,
                          (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 2)),
  'a swing is excluded with its reason and kept');
select tests.throws(format($$select public.delete_assessment_repetition(%L)$$,
                           (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 1)),
  'BR004', 'a swing with values cannot be deleted, only excluded');

-- ================================================================ Film Room timing
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'front-toss.mov', 'video/quicktime', 4000000, null, 'real_time', null, null)$$, tests.job('hit')),
  'BR004', 'clips cannot be uploaded for an athlete under 18 (F40)');
-- The checks below need clips, so from here on the athlete has turned 19.
select tests.clear_authentication();
update public.profiles set date_of_birth = (current_date - interval '19 years')::date where id = tests.id('athlete');
select tests.authenticate_as('athlete');
select tests.remember_job('clip', (select media_id from public.begin_assessment_upload(tests.job('hit'), 'front-toss.mp4', 'video/mp4', 4000000,
  'side_facing', 'real_time', null, 'Side view')));
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'x.avi', 'video/x-msvideo', 100, null, 'real_time', null, null)$$, tests.job('hit')),
  'BR003', 'only MP4, MOV and WebM videos are accepted');
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'x.mp4', 'video/mp4', 300000000, null, 'real_time', null, null)$$, tests.job('hit')),
  'BR003', 'videos over 200 MB are refused');
select tests.throws(format($$select * from public.begin_assessment_upload(%L, 'x.mp4', 'video/mp4', 100, null, 'slow_motion', null, null)$$, tests.job('hit')),
  'BR003', 'a slow-motion clip needs its slow-down factor');
select tests.throws(format($$select public.complete_assessment_upload(%L)$$, tests.job('clip')),
  'BR004', 'a clip cannot be confirmed before its file reaches storage');

select tests.clear_authentication();
create temporary table t_flags (name text primary key, ok boolean) on commit drop;
grant all on t_flags to public;
insert into t_flags values ('stored', tests.store_object((select storage_path from public.assessment_media where id = tests.job('clip')), 4000000));
-- Databases without storage (or where tests may not write to it) mark the clip uploaded directly.
update public.assessment_media set status = 'uploaded', uploaded_at = now(), duration_ms = 9000
 where id = tests.job('clip') and not (select ok from t_flags where name = 'stored');
select tests.authenticate_as('athlete');
select case when (select ok from t_flags where name = 'stored')
  then tests.lives(format($$select public.complete_assessment_upload(%L, 9000)$$, tests.job('clip')), 'the clip is confirmed once its file is in storage')
  else tests.ok(true, 'the clip is confirmed once its file is in storage (no storage in this database; marked directly)') end;
select tests.ok((select status from public.assessment_media where id = tests.job('clip')) = 'uploaded', 'the clip is ready to review');

select tests.throws(format($$select public.add_assessment_annotation(%L, 'event', 'release', 1000, null, null, null)$$, tests.job('clip')),
  'BR003', 'pitching events cannot be marked on a hitting clip');
select tests.throws(format($$select public.add_assessment_annotation(%L, 'event', 'contact', 20000, null, null, null)$$, tests.job('clip')),
  'BR003', 'a marker cannot be placed after the end of the clip');
select tests.throws(format($$select public.add_assessment_annotation(%L, 'drawing', null, 500, null, '{"shape": "line", "points": [[0.1, 0.2], [1.4, 0.5]], "color": "red"}', null)$$, tests.job('clip')),
  'BR003', 'drawing coordinates must be inside the video frame (normalized 0–1)');
select tests.lives(format($$select public.add_assessment_annotation(%L, 'drawing', null, 500, null, '{"shape": "arrow", "points": [[0.1, 0.2], [0.4, 0.5]], "color": "yellow"}', null)$$, tests.job('clip')),
  'a drawing is stored with normalized coordinates');
select tests.lives(format($$select public.add_assessment_annotation(%L, 'note', null, 800, 'Front side opens early here', null, null)$$, tests.job('clip')),
  'a timestamped note is stored');
select tests.remember_job('fc', public.add_assessment_annotation(tests.job('clip'), 'event', 'foot_contact', 1000, null, null,
  (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 3)));
select tests.remember_job('contact', public.add_assessment_annotation(tests.job('clip'), 'event', 'contact', 1210, null, null,
  (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 3)));
select tests.ok((select author_kind = 'self' and kind = 'event' from public.assessment_annotations where id = tests.job('fc')),
  'markers record who placed them');
select tests.throws(format($$select public.record_interval_from_markers(%L, 'hit_fc_to_contact_ms', %L, %L)$$,
                           (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 3), tests.job('contact'), tests.job('fc')),
  'BR003', 'markers in the wrong order are refused');
select tests.throws(format($$select public.record_interval_from_markers(%L, 'hit_fc_to_contact_ms', %L, %L)$$,
                           (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 2), tests.job('fc'), tests.job('contact')),
  'BR003', 'markers placed on another repetition cannot time this one');
select tests.lives(format($$select public.record_interval_from_markers(%L, 'hit_fc_to_contact_ms', %L, %L)$$,
                          (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 3), tests.job('fc'), tests.job('contact')),
  'a timing estimate is made from the two markers');
select tests.ok((select value = 210 and evidence_category = 'video_estimate' and entry_method = 'in_app_review'
                        and start_annotation_id = tests.job('fc') and media_id = tests.job('clip')
                   from public.assessment_observations where metric_key = 'hit_fc_to_contact_ms'),
  'the estimate is labelled a video estimate and keeps its markers and clip');
select tests.throws(format($$select public.update_assessment_media(%L, 'Side view', 'side_facing', 'slow_motion', 8)$$, tests.job('clip')),
  'BR004', 'a clip''s speed cannot change while timing estimates use it');
select tests.throws(format($$select public.delete_assessment_annotation(%L)$$, tests.job('fc')),
  'BR004', 'a marker used by an estimate cannot be deleted');

-- A slow-motion clip: media time is divided by the slow-down factor.
select tests.remember_job('slow', (select media_id from public.begin_assessment_upload(tests.job('hit'), 'slow.mov', 'video/quicktime', 9000000,
  'front_on', 'slow_motion', 8, 'Front, 240 fps')));
select tests.clear_authentication();
update public.assessment_media set status = 'uploaded', uploaded_at = now(), duration_ms = 60000 where id = tests.job('slow');
select tests.authenticate_as('athlete');
select public.record_interval_from_markers(
  (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 4),
  'hit_fc_to_contact_ms',
  public.add_assessment_annotation(tests.job('slow'), 'event', 'foot_contact', 10000, null, null,
    (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 4)),
  public.add_assessment_annotation(tests.job('slow'), 'event', 'contact', 11680, null, null,
    (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 4)));
select tests.ok((select value from public.assessment_observations o join public.assessment_repetitions r on r.id = o.repetition_id
                  where r.assessment_id = tests.job('hit') and r.seq = 4 and o.metric_key = 'hit_fc_to_contact_ms') = 210,
  'an 8× slow-motion interval of 1,680 ms is recorded as 210 ms of real time');

-- A clip whose speed is unknown cannot produce timing.
select tests.remember_job('unknown', (select media_id from public.begin_assessment_upload(tests.job('hit'), 'phone.mp4', 'video/mp4', 9000000,
  null, 'unknown', null, null)));
select tests.clear_authentication();
update public.assessment_media set status = 'uploaded', uploaded_at = now() where id = tests.job('unknown');
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.record_interval_from_markers(%L, 'hit_fc_to_contact_ms', %L, %L)$$,
  (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 5),
  public.add_assessment_annotation(tests.job('unknown'), 'event', 'foot_contact', 1000, null, null,
    (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 5)),
  public.add_assessment_annotation(tests.job('unknown'), 'event', 'contact', 1200, null, null,
    (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 5))),
  'BR004', 'timing is not estimated from a clip whose playback speed is unknown');

-- ================================================================ CSV import
select tests.remember_job('import1', (public.import_assessment_measurements(tests.job('hit'), 'radar.csv', repeat('b', 64), jsonb_build_array(
  jsonb_build_object('row', 2, 'rep', 1, 'metric_key', 'hit_exit_velocity_mph', 'value', 80, 'unit', 'mph', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A'),
  jsonb_build_object('row', 3, 'rep', 7, 'metric_key', 'hit_exit_velocity_mph', 'value', 126.1, 'unit', 'KPH', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A', 'recorded_at', '2026-11-02T16:05:40Z'),
  jsonb_build_object('row', 4, 'rep', 8, 'metric_key', 'hit_exit_velocity_mph', 'value', 30, 'unit', 'm/s', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A'),
  jsonb_build_object('row', 5, 'rep', 7, 'metric_key', 'hit_solid_contact', 'value', 1, 'unit', 'yes_no', 'acquisition', 'observation'),
  jsonb_build_object('row', 6, 'rep', 9, 'metric_key', 'hit_load_repeatability', 'value', 3, 'unit', 'rating', 'acquisition', 'observation'),
  jsonb_build_object('row', 7, 'rep', 9, 'metric_key', 'hit_exit_velocity_mph', 'value', 80, 'unit', 'rpm', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A'),
  jsonb_build_object('row', 8, 'rep', 9, 'metric_key', 'hit_exit_velocity_mph', 'value', 80, 'unit', 'mph', 'acquisition', 'sensor_measurement'),
  jsonb_build_object('row', 9, 'rep', 9, 'metric_key', 'hit_exit_velocity_mph', 'value', 'fast', 'unit', 'mph', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A'),
  jsonb_build_object('row', 10, 'rep', 9, 'metric_key', 'hit_exit_velocity_mph', 'value', 80, 'unit', 'mph', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A', 'recorded_at', 'yesterday')
)) ->> 'batch_id')::uuid);
select tests.ok((select accepted_count || '|' || duplicate_count || '|' || rejected_count from public.assessment_import_batches where id = tests.job('import1')) = '3|0|6',
  'valid rows are imported and invalid rows rejected');
select tests.ok((select string_agg((r ->> 'row') || ':' || (r ->> 'reason'), '; ' order by (r ->> 'row')::int)
                   from public.assessment_import_batches b, jsonb_array_elements(b.rejected_rows) r where b.id = tests.job('import1'))
  = '2:repetition 1 already has a value for this metric; 6:ratings and derived values cannot be imported; 7:that unit is not accepted for this metric; '
    || '8:measured values need the kind of device and its name; 9:the value must be a number; 10:recorded_at must be an ISO 8601 date and time',
  'each rejected row is reported with its row number and reason');
select tests.ok(not exists (select 1 from public.assessment_import_batches b, jsonb_array_elements(b.rejected_rows) r
                             where b.id = tests.job('import1') and r ? 'value'), 'rejected values are never stored');
select tests.ok((select value || '|' || source_value || '|' || source_unit from public.assessment_observations o
                   join public.assessment_repetitions r on r.id = o.repetition_id
                  where r.assessment_id = tests.job('hit') and r.seq = 7 and o.metric_key = 'hit_exit_velocity_mph') = '78.355|126.1|km/h',
  'converted values keep the original value and unit');
select tests.ok((select value from public.assessment_observations o join public.assessment_repetitions r on r.id = o.repetition_id
                  where r.assessment_id = tests.job('hit') and r.seq = 8 and o.metric_key = 'hit_exit_velocity_mph') = 67.108,
  'm/s converts to mph');
select tests.ok((select count(*) from public.assessment_repetitions where assessment_id = tests.job('hit') and seq in (7, 8)) = 2,
  'an import creates the repetitions it names');

select tests.ok((public.import_assessment_measurements(tests.job('hit'), 'radar.csv', repeat('b', 64), jsonb_build_array(
  jsonb_build_object('row', 3, 'rep', 7, 'metric_key', 'hit_exit_velocity_mph', 'value', 126.1, 'unit', 'km/h', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'radar a', 'recorded_at', '2026-11-02T16:05:40Z'),
  jsonb_build_object('row', 4, 'rep', 8, 'metric_key', 'hit_exit_velocity_mph', 'value', 30, 'unit', 'm/s', 'acquisition', 'sensor_measurement', 'device_kind', 'radar', 'device_label', 'Radar A')
)) ->> 'duplicates')::int = 2, 'importing the same rows again creates no duplicate measurements');
select tests.ok((select count(*) from public.assessment_observations where assessment_id = tests.job('hit') and metric_key = 'hit_exit_velocity_mph') = 3,
  'the measurement count is unchanged after the repeat import');

-- ================================================================ coach targets
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_exit_velocity_mph', null, 'higher_is_better', 60, 80, null, 'My own goal')$$, tests.id('athlete')),
  'BR002', 'only the development coach sets targets');
select tests.authenticate_as('dev');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_launch_angle_deg', null, 'target_range', 12, 12, 4, 'Coach goal')$$, tests.id('athlete')),
  'BR003', 'a zero-width range is refused');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_launch_angle_deg', null, 'target_range', 8, 20, 0, 'Coach goal')$$, tests.id('athlete')),
  'BR003', 'a range needs a tolerance above zero');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_launch_angle_deg', null, 'higher_is_better', 8, 20, null, 'Coach goal')$$, tests.id('athlete')),
  'BR003', 'the kind of target must fit the metric');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_load_repeatability', null, 'higher_is_better', 1, 5, null, 'Coach goal')$$, tests.id('athlete')),
  'BR003', 'rubric metrics are scored by their anchors, not targets');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_exit_velocity_mph', null, 'higher_is_better', 60, 80, null, '')$$, tests.id('athlete')),
  'BR003', 'a target says where it comes from');
select tests.throws(format($$select public.set_assessment_target(%L, 'hit_exit_velocity_mph', null, 'higher_is_better', 60, 300, null, 'Coach goal')$$, tests.id('athlete')),
  'BR003', 'targets stay inside the metric''s valid range');
select tests.remember_job('target1', public.set_assessment_target(tests.id('athlete'), 'hit_exit_velocity_mph', null, 'higher_is_better', 60, 80, null, 'Coach goal for this block'));
select tests.remember_job('target2', public.set_assessment_target(tests.id('athlete'), 'hit_exit_velocity_mph', null, 'higher_is_better', 65, 85, null, 'Raised after testing'));
select tests.ok((select retired_at is not null from public.assessment_targets where id = tests.job('target1'))
  and (select retired_at is null from public.assessment_targets where id = tests.job('target2')),
  'a new target retires the previous one and keeps it in history');

-- ================================================================ the coach's values stay the coach's
select tests.authenticate_as('dev');
select public.record_assessment_observation(tests.job('hit'), 'hit_solid_contact',
  (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 6), 1, false, null, null, null, null, null, null);
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_solid_contact', %L, 0, false, null, null, null, null, null, null)$$,
                           tests.job('hit'), (select id from public.assessment_repetitions where assessment_id = tests.job('hit') and seq = 6)),
  'BR002', 'the athlete''s side cannot overwrite a value the development coach entered');
select tests.ok((select value = 1 and source_kind = 'development_coach' from public.assessment_observations o
                   join public.assessment_repetitions r on r.id = o.repetition_id
                  where r.assessment_id = tests.job('hit') and r.seq = 6 and o.metric_key = 'hit_solid_contact'),
  'the coach''s value is unchanged');

-- ================================================================ clean-up rules
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.delete_assessment(%L)$$, tests.job('hit')), 'BR004',
  'an assessment with clips cannot be deleted until its clips are removed (no video is left behind)');
select tests.ok(public.remove_assessment_media(tests.job('clip')) like '%/' || tests.job('clip') || '.mp4',
  'removing a clip returns the file path to delete');
select tests.ok(private.assessment_object_access((select storage_path from public.assessment_media where id = tests.job('clip')), 'delete')
  and not private.assessment_object_access((select storage_path from public.assessment_media where id = tests.job('clip')), 'select'),
  'a removed clip''s file can be deleted and can no longer be read');
select tests.ok((select count(*) from public.assessment_annotations where media_id = tests.job('clip')) = 0
                and not exists (select 1 from public.assessment_observations where media_id = tests.job('clip')),
  'removing a clip removes its markers, notes and drawings and the timing values measured from them');

-- Deleting video never depends on the Assessment switch.
select tests.clear_authentication();
update private.assessment_settings set enabled = false, video_enabled = false where id;
select tests.authenticate_as('athlete');
select tests.lives(format('select public.remove_assessment_media(%L)', tests.job('slow')),
  'a clip can be removed while Assessment is switched off');
select tests.throws(format($$select public.add_assessment_repetitions(%L, 1)$$, tests.job('hit')), 'BR004',
  'nothing new can be recorded while Assessment is switched off');
select tests.clear_authentication();
select tests.enable_assessment(true);

-- Deleting a draft: checked under lock before any clip is removed.
select tests.authenticate_as('athlete');
select tests.remember_job('del', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 5}'));
select tests.remember_job('del_clip', (select media_id from public.begin_assessment_upload(tests.job('del'), 'a.mp4', 'video/mp4', 1000, null, 'real_time', null, null)));
select tests.ok((select count(*) from public.begin_assessment_deletion(tests.job('del'))) = 1,
  'starting to delete a draft removes its clips and returns their paths');
select tests.ok((select status from public.assessment_media where id = tests.job('del_clip')) = 'removed', 'the draft''s clip is marked removed');
select tests.lives(format('select public.delete_assessment(%L)', tests.job('del')), 'the draft is then deleted');
select tests.ok(not exists (select 1 from public.assessments where id = tests.job('del')), 'the draft is gone');

select tests.remember_job('kept', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 5}'));
select tests.remember_job('kept_clip', (select media_id from public.begin_assessment_upload(tests.job('kept'), 'b.mp4', 'video/mp4', 1000, null, 'real_time', null, null)));
select public.record_assessment_observation(tests.job('kept'), 'hit_load_repeatability', null, 3, false, null, null, null, null, null, null);
select public.publish_assessment(tests.job('kept'), null);
select tests.throws(format('select * from public.begin_assessment_deletion(%L)', tests.job('kept')), 'BR004',
  'a published assessment cannot be deleted');
select tests.ok((select status from public.assessment_media where id = tests.job('kept_clip')) = 'pending',
  'and refusing the deletion leaves its clips alone');
select tests.authenticate_as('dev');
select tests.throws(format('select * from public.begin_assessment_deletion(%L)', tests.job('kept')), 'BR004',
  'not by the development coach either');
select tests.clear_authentication();
