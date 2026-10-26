-- Assessment results and reports: the calculation, pillar coverage, frozen
-- published revisions, corrections as new revisions, who can read reports,
-- reassessments, and reference percentiles.

select tests.create_user('admin', 'parent', 'results.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_display_name => 'Avery Athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('college', 'coach', 'results.recruiter@example.edu', p_date_of_birth => (current_date - interval '40 years')::date);
select tests.verify_coach('college', 'admin');
select tests.enable_assessment(true);
select tests.link_development_coach('athlete', 'dev');

create temporary table t_values (name text primary key, value text) on commit drop;
grant all on t_values to public;

-- ================================================================ an assessment with known values
select tests.authenticate_as('athlete');
select tests.remember_job('h', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date - 10,
  '{"rep_goal": 5, "drill_type": "front_toss", "camera_views": ["side_facing"], "environment": "indoor"}'::jsonb));
select public.add_assessment_repetitions(tests.job('h'), 5);
select tests.authenticate_as('dev');
select public.record_assessment_observation(tests.job('h'), 'hit_load_repeatability', null, 3, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_drill_preparation', null, 5, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_contact_location_consistency', null, 2, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_stride_direction_repeatability', null, 4, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_balance_through_swing', null, null, true, 'Finish is out of frame', null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_lower_body_consistency', null, 4, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_solid_contact', r.id, v, false, null, null, null, null, null, null)
  from public.assessment_repetitions r join (values (1, 1), (2, 1), (3, 0), (4, 1), (5, 0)) as x(seq, v) on x.seq = r.seq
 where r.assessment_id = tests.job('h');
select public.record_assessment_observation(tests.job('h'), 'hit_launch_angle_deg', r.id, 0, false, null, null, 'ball_tracking', 'Tracker', null, null)
  from public.assessment_repetitions r where r.assessment_id = tests.job('h') and r.seq <= 3;
select public.record_assessment_observation(tests.job('h'), 'hit_exit_velocity_mph', r.id, 70 + r.seq, false, null, null, 'radar',
                                            case when r.seq = 3 then 'Radar B' else 'Radar A' end, null, null)
  from public.assessment_repetitions r where r.assessment_id = tests.job('h') and r.seq <= 3;
select tests.clear_authentication();

insert into t_values select 'results', private.assessment_results(tests.job('h'))::text;
create function pg_temp.metric(p_key text) returns jsonb language sql as $$
  select m from jsonb_array_elements((select value::jsonb from t_values where name = 'results') -> 'metrics') m
   where m ->> 'metric_key' = p_key and m ->> 'pitch_type' is null
$$;
create function pg_temp.pillar(p_key text) returns jsonb language sql as $$
  select p from jsonb_array_elements((select value::jsonb from t_values where name = 'results') -> 'pillars') p
   where p ->> 'pillar' = p_key
$$;

select tests.ok((select value::jsonb ->> 'calculation_version' from t_values where name = 'results') = 'calc-v1',
  'results record their calculation version');
select tests.ok(pg_temp.metric('hit_bat_speed_mph') @> '{"status": "not_collected", "value": null, "score": null, "evidence": []}',
  'an uncollected metric stays missing: no value, no score, evidence unavailable');
select tests.ok(pg_temp.metric('hit_balance_through_swing') @> '{"status": "unable_to_assess", "value": null, "score": null, "excluded_count": 1}',
  '"Unable to assess" is missing, not a zero rating');
select tests.ok(pg_temp.metric('hit_load_repeatability') @> '{"status": "ok", "value": 3, "score": 50.0, "method": "rubric", "source_kinds": ["development_coach"]}',
  'a rating of 3 gives a rubric score of 50, labelled with the coach as its source');
select tests.ok(pg_temp.metric('hit_launch_angle_deg') @> '{"status": "ok", "value": 0, "method": "descriptive", "score": null}',
  'a valid zero is kept, and a metric with no target is described, not scored');
select tests.ok(pg_temp.metric('hit_solid_contact') @> '{"status": "ok", "statistic": "rate", "value": 60, "valid_count": 5}',
  'charted outcomes become a rate with the number of valid repetitions');
select tests.ok(pg_temp.metric('hit_exit_velocity_mph') @> '{"status": "mixed_devices", "value": null, "devices": ["radar a", "radar b"]}',
  'readings from different devices are never combined');
select tests.ok(jsonb_array_length(pg_temp.metric('hit_load_repeatability') -> 'inputs') = 1
  and (pg_temp.metric('hit_load_repeatability') -> 'inputs' ->> 0)::uuid in (select id from public.assessment_observations),
  'every result lists the observations it was calculated from');

select tests.ok(pg_temp.pillar('load_timing') @> '{"status": "complete", "score": 75.0}'
  and pg_temp.pillar('load_timing') -> 'excluded' @> '[{"metric_key": "hit_fc_to_contact_ms", "reason": "not_collected"}]',
  'a pillar with all required evidence shows its score and lists what it left out and why');
select tests.ok(pg_temp.pillar('barrel_delivery') @> '{"status": "incomplete", "score": null, "missing_required": ["hit_barrel_delivery_consistency"]}',
  'a pillar missing required evidence shows no score and names what is missing');
select tests.ok(pg_temp.pillar('lower_body_contribution') @> '{"status": "incomplete", "score": null}'
  and pg_temp.pillar('lower_body_contribution') -> 'excluded' @> '[{"metric_key": "hit_balance_through_swing", "reason": "unable_to_assess"}]',
  '"Unable to assess" on a required metric keeps the pillar incomplete');
select tests.ok(pg_temp.pillar('impact_output') @> '{"status": "descriptive", "score": null}',
  'a pillar with evidence but nothing scorable is described, not scored');

-- ================================================================ publishing and frozen reports
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.publish_assessment(%L, %L)$$, tests.job('h'), repeat('x', 501)), 'BR003', 'publish notes are limited');
select tests.remember_job('rev1', public.publish_assessment(tests.job('h'), 'First look'));
select tests.ok((select review_kind || '|' || status || '|' || revision || '|' || calculation_version from public.assessment_report_revisions where id = tests.job('rev1'))
  = 'self_assessed|current|1|calc-v1', 'an athlete publishes a self-assessment report');
select tests.ok((select status from public.assessments where id = tests.job('h')) = 'published', 'the assessment is published');
select tests.throws(format($$select public.record_assessment_observation(%L, 'hit_barrel_delivery_consistency', null, 3, false, null, null, null, null, null, null)$$, tests.job('h')),
  'BR004', 'a published assessment cannot be edited without reopening it');
select tests.clear_authentication();
insert into t_values select 'rev1', md5(snapshot::text) from public.assessment_report_revisions where id = tests.job('rev1');

select tests.authenticate_as('dev');
select public.set_assessment_target(tests.id('athlete'), 'hit_solid_contact', null, 'higher_is_better', 30, 80, null, 'Coach goal for this block');
select tests.ok(public.preview_assessment_report(tests.job('h')) -> 'results' -> 'pillars' @> '[{"pillar": "impact_output", "status": "complete", "score": 60.0}]',
  'a new coach target changes the live preview (60% against 30–80 scores 60)');
select tests.ok((select snapshot -> 'results' -> 'pillars' @> '[{"pillar": "impact_output", "status": "descriptive"}]'
                   from public.assessment_report_revisions where id = tests.job('rev1')),
  'but the published report keeps the results it was published with');

select tests.throws(format($$select public.reopen_assessment(%L, '')$$, tests.job('h')), 'BR003', 'reopening needs a reason');
select tests.lives(format($$select public.reopen_assessment(%L, 'Balance was visible on the second clip')$$, tests.job('h')),
  'the coach reopens the assessment for a correction');
select public.record_assessment_observation(tests.job('h'), 'hit_balance_through_swing', null, 4, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_barrel_delivery_consistency', null, 3, false, null, null, null, null, null, null);
select tests.remember_job('rev2', public.publish_assessment(tests.job('h'), 'Coach review'));
select tests.ok((select review_kind || '|' || status || '|' || revision || '|' || (reviewer_id = tests.id('dev')) from public.assessment_report_revisions where id = tests.job('rev2'))
  = 'coach_reviewed|current|2|true', 'the coach publishes a coach-reviewed report as revision 2');
select tests.clear_authentication();
select tests.ok((select status from public.assessment_report_revisions where id = tests.job('rev1')) = 'superseded'
  and (select md5(snapshot::text) from public.assessment_report_revisions where id = tests.job('rev1')) = (select value from t_values where name = 'rev1'),
  'the first report is kept, marked superseded, and is byte-for-byte unchanged');
select tests.ok((select snapshot -> 'results' -> 'pillars' @> '[{"pillar": "lower_body_contribution", "status": "complete", "score": 75.0}]'
                   from public.assessment_report_revisions where id = tests.job('rev2')),
  'the correction appears only in the new revision');
select tests.ok((select snapshot -> 'review' ->> 'reviewer_name' from public.assessment_report_revisions where id = tests.job('rev2')) = 'Dana Dev'
  and (select snapshot -> 'review' ->> 'note' from public.assessment_report_revisions where id = tests.job('rev2')) = 'Coach review',
  'the report records who reviewed it and the publishing note');
select tests.ok((select current_revision_id from public.assessments where id = tests.job('h')) = tests.job('rev2'),
  'the assessment points at its current report');

select tests.throws(format($$update public.assessment_report_revisions set snapshot = '{}'::jsonb where id = %L$$, tests.job('rev1')),
  'BR002', 'nobody — not even the database owner — can rewrite a published report');
select tests.throws(format($$update public.assessment_report_revisions set status = 'current' where id = %L$$, tests.job('rev1')),
  'BR002', 'a superseded report cannot be made current again');
select tests.authenticate_as('athlete');
select tests.throws(format($$update public.assessment_report_revisions set note = 'x' where id = %L$$, tests.job('rev2')),
  '42501', 'signed-in users cannot write reports directly');

-- ================================================================ who can read reports
select tests.authenticate_as('college');
select tests.ok(tests.visible_count('select * from public.assessment_report_revisions') = 0
  and (select count(*) from public.shared_assessment_reports()) = 0, 'a college coach sees no reports until the athlete shares them');
select tests.authenticate_as('athlete');
select public.share_assessment_reports_with_coach('results.recruiter@example.edu');
select tests.authenticate_as('college');
select tests.ok(tests.visible_count('select * from public.assessment_report_revisions') = 1
  and (select revision_id from public.shared_assessment_reports()) = tests.job('rev2'),
  'after sharing, the college coach sees the current report only — not superseded revisions');
select tests.ok(tests.visible_count('select * from public.assessments') = 0 and tests.visible_count('select * from public.assessment_media') = 0,
  'sharing reports never opens the assessment, its values or its video');
select tests.authenticate_as('dev');
select tests.ok(tests.visible_count('select * from public.assessment_report_revisions') = 2, 'the development coach sees the full revision history');
select tests.authenticate_as('other');
select tests.ok(tests.visible_count('select * from public.assessment_report_revisions') = 0, 'other athletes see no reports');
select tests.authenticate_as('athlete');
select public.revoke_consent((select grant_id from public.my_assessment_report_shares()));
select tests.authenticate_as('college');
select tests.ok(tests.visible_count('select * from public.assessment_report_revisions') = 0, 'stopping sharing ends the coach''s access to future views');

-- ================================================================ reassessment and baselines
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.set_reassessment_date(%L, current_date - 30)$$, tests.job('h')), 'BR003',
  'a reassessment date cannot be before the assessment');
select tests.lives(format($$select public.set_reassessment_date(%L, current_date + 30)$$, tests.job('h')), 'a reassessment date is set');
select tests.remember_job('re', public.create_reassessment(tests.job('h'), current_date));
select tests.ok((select protocol_key = 'hitting-video' and drill_type = 'front_toss' and camera_views = '{side_facing}' and rep_goal = 5
                        and baseline_assessment_id = tests.job('h') and reassessment_of_id = tests.job('h') and status = 'draft'
                   from public.assessments where id = tests.job('re')),
  'a reassessment copies the protocol and capture settings and uses the earlier assessment as its baseline');
select tests.ok((select count(*) from public.assessment_observations where assessment_id = tests.job('re')) = 0
  and (select count(*) from public.assessment_repetitions where assessment_id = tests.job('re')) = 0
  and (select count(*) from public.assessment_media where assessment_id = tests.job('re')) = 0,
  'a reassessment copies no measurements, ratings, repetitions or clips');
select tests.remember_job('pitch', public.create_assessment(auth.uid(), 'pitching-video', 1, current_date, '{"rep_goal": 10}'::jsonb));
select tests.throws(format($$select public.set_assessment_baseline(%L, %L)$$, tests.job('pitch'), tests.job('h')),
  'BR003', 'a baseline must be the same discipline');
select tests.throws(format($$select public.create_reassessment(%L, current_date)$$, tests.job('pitch')),
  'BR004', 'only published assessments can be reassessed');

-- ================================================================ reference percentiles
select tests.authenticate_as('athlete');
select tests.throws($$select public.admin_create_benchmark_release('{}'::jsonb)$$, 'BR002', 'only administrators manage reference data');
select tests.ok(tests.visible_count('select * from public.assessment_benchmark_releases') = 0, 'reference releases are not visible to athletes');

select tests.authenticate_as('admin');
select tests.remember_job('bench', public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_exit_velocity_mph', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'mph', 'statistic', 'median', 'device_kind', 'radar', 'source', 'Test reference (fixture)', 'usage_rights', 'Test only',
  'collected_from', '2026-01-01', 'collected_to', '2026-06-30', 'cohort_description', 'Fixture cohort',
  'aggregation_note', 'One median per athlete', 'dataset_version', 'fixture-1')));
select tests.throws($$select public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_load_repeatability', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'rating', 'statistic', 'median', 'source', 'x', 'usage_rights', 'x', 'collected_from', '2026-01-01', 'collected_to', '2026-01-02',
  'cohort_description', 'x', 'aggregation_note', 'x', 'dataset_version', 'x'))$$, 'BR003', 'rubric ratings never get a population reference');
select public.admin_add_benchmark_values(tests.job('bench'),
  (select jsonb_agg(jsonb_build_object('subject_key', 'athlete-' || g, 'value', case when g <= 10 then 70 when g <= 20 then 72 else 80 end))
     from generate_series(1, 29) g));
select tests.throws(format($$select public.admin_set_benchmark_release_status(%L, 'approved')$$, tests.job('bench')),
  'BR004', 'a reference needs at least 30 distinct athletes');
select tests.throws(format($$select public.admin_add_benchmark_values(%L, '[{"subject_key": "athlete-1", "value": 99}]')$$, tests.job('bench')),
  '23505', 'each athlete contributes one value, so nobody''s many repetitions can dominate');
select public.admin_add_benchmark_values(tests.job('bench'), '[{"subject_key": "athlete-30", "value": 80}]');
select tests.lives(format($$select public.admin_set_benchmark_release_status(%L, 'approved', 'Fixture approval')$$, tests.job('bench')),
  'an administrator approves a complete, non-synthetic reference');
select tests.throws(format($$select public.admin_add_benchmark_values(%L, '[{"subject_key": "late", "value": 70}]')$$, tests.job('bench')),
  'BR004', 'an approved reference cannot be changed');

select tests.remember_job('synthetic', public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_exit_velocity_mph', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'mph', 'statistic', 'median', 'device_kind', 'radar', 'source', 'Synthetic', 'usage_rights', 'Test only',
  'collected_from', '2026-01-01', 'collected_to', '2026-06-30', 'cohort_description', 'Synthetic',
  'aggregation_note', 'Synthetic', 'dataset_version', 'synthetic-1', 'is_synthetic', true)));
select public.admin_add_benchmark_values(tests.job('synthetic'),
  (select jsonb_agg(jsonb_build_object('subject_key', 's-' || g, 'value', 60)) from generate_series(1, 40) g));
select tests.throws(format($$select public.admin_set_benchmark_release_status(%L, 'approved')$$, tests.job('synthetic')),
  'BR004', 'synthetic data can never be approved as a reference');

select tests.remember_job('older', public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_exit_velocity_mph', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'mph', 'statistic', 'median', 'device_kind', 'radar', 'age_band', '23_plus', 'source', 'Older cohort fixture',
  'usage_rights', 'Test only', 'collected_from', '2026-01-01', 'collected_to', '2026-06-30', 'cohort_description', 'Adults 23+',
  'aggregation_note', 'One median per athlete', 'dataset_version', 'fixture-older')));
select public.admin_add_benchmark_values(tests.job('older'),
  (select jsonb_agg(jsonb_build_object('subject_key', 'o-' || g, 'value', 95)) from generate_series(1, 30) g));
select public.admin_set_benchmark_release_status(tests.job('older'), 'approved');

select tests.authenticate_as('athlete');
select tests.remember_job('h2', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 3}'::jsonb));
select public.add_assessment_repetitions(tests.job('h2'), 3);
select public.record_assessment_observation(tests.job('h2'), 'hit_exit_velocity_mph', r.id, v, false, null, null, 'radar', 'Radar A', null, null)
  from public.assessment_repetitions r join (values (1, 70), (2, 72), (3, 75)) as x(seq, v) on x.seq = r.seq
 where r.assessment_id = tests.job('h2');
select public.record_assessment_observation(tests.job('h2'), 'hit_load_repeatability', null, 4, false, null, null, null, null, null, null);
select tests.clear_authentication();
select tests.ok((select m -> 'percentile' from jsonb_array_elements(private.assessment_results(tests.job('h2')) -> 'metrics') m
                  where m ->> 'metric_key' = 'hit_exit_velocity_mph')
                = jsonb_build_object('release_id', tests.job('bench'), 'dataset_version', 'fixture-1', 'reference_count', 30, 'value', 50.0),
  'a median of 72 against a reference with ten 70s, ten 72s and ten 80s is the 50th percentile (ties split evenly), from the matching release only');
select tests.ok((select m -> 'percentile' from jsonb_array_elements(private.assessment_results(tests.job('h2')) -> 'metrics') m
                  where m ->> 'metric_key' = 'hit_load_repeatability') = 'null'::jsonb,
  'rubric ratings are never given a percentile');
select tests.ok((select (m -> 'percentile') = 'null'::jsonb and m ->> 'method' = 'descriptive'
                   from jsonb_array_elements(private.assessment_results(tests.job('h2')) -> 'metrics') m
                  where m ->> 'metric_key' = 'hit_exit_velocity_mph') is false
  and (select (m ->> 'score') is null from jsonb_array_elements(private.assessment_results(tests.job('h2')) -> 'metrics') m
                  where m ->> 'metric_key' = 'hit_exit_velocity_mph'),
  'a percentile is shown as context; it is not turned into a score');

select tests.authenticate_as('athlete');
select tests.remember_job('h3', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date, '{"rep_goal": 3}'::jsonb));
select public.add_assessment_repetitions(tests.job('h3'), 3);
select public.record_assessment_observation(tests.job('h3'), 'hit_exit_velocity_mph', r.id, 72, false, null, null, 'ball_tracking', 'Tracker', null, null)
  from public.assessment_repetitions r where r.assessment_id = tests.job('h3');
select tests.clear_authentication();
select tests.ok((select m -> 'percentile' from jsonb_array_elements(private.assessment_results(tests.job('h3')) -> 'metrics') m
                  where m ->> 'metric_key' = 'hit_exit_velocity_mph') = 'null'::jsonb,
  'values from a different kind of device are not compared with a radar reference');
select tests.ok(not (private.assessment_snapshot(tests.job('h3'), null) ->> 'benchmarks_available')::boolean
  and (private.assessment_snapshot(tests.job('h2'), null) ->> 'benchmarks_available')::boolean,
  'reports say whether any reference applied');
