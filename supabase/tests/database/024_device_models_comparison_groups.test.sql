-- Named devices (F52), showcase results (F53) and comparison groups (F54).

select tests.create_user('admin', 'parent', 'groups.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.create_user('adult', 'athlete', p_display_name => 'Adult Athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('adult2', 'athlete', p_date_of_birth => (current_date - interval '20 years')::date);
select tests.create_user('minor', 'athlete', p_display_name => 'Minor Athlete', p_date_of_birth => (current_date - interval '16 years')::date);
select tests.create_user('parent', 'parent', p_date_of_birth => (current_date - interval '44 years')::date);
select tests.create_user('stranger', 'parent', p_date_of_birth => (current_date - interval '40 years')::date);
select tests.create_user('dev', 'development_coach', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.enable_assessment(true);
select tests.link_development_coach('adult', 'dev');
select tests.link_family('minor', 'parent');

create function pg_temp.bat_speed_assessment(p_user text, p_device_kind text, p_device text, p_values numeric[]) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  perform tests.authenticate_as(p_user);
  v_id := public.create_assessment(auth.uid(), 'hitting-video', 1, current_date - 5, '{"rep_goal": 3}'::jsonb);
  perform public.add_assessment_repetitions(v_id, cardinality(p_values));
  perform public.record_assessment_observation(v_id, 'hit_bat_speed_mph', r.id, p_values[r.seq], false, null, null, p_device_kind, p_device, null, null)
     from public.assessment_repetitions r where r.assessment_id = v_id;
  perform tests.clear_authentication();
  return v_id;
end;
$$;

create function pg_temp.bat_speed(p_assessment uuid) returns jsonb language sql as $$
  select m from jsonb_array_elements(private.assessment_results(p_assessment) -> 'metrics') m where m ->> 'metric_key' = 'hit_bat_speed_mph'
$$;

-- ================================================================ device models
select tests.ok(private.assessment_device_model('ball_tracking', 'Rapsodo') = 'rapsodo'
  and private.assessment_device_model('ball_tracking', 'Trackman B1') = 'trackman'
  and private.assessment_device_model('bat_sensor', 'Blast Motion') = 'blast_motion'
  and private.assessment_device_model('bat_sensor', 'DK SwingTracker') = 'diamond_kinetics'
  and private.assessment_device_model('bat_sensor', 'Diamond Kinetics') = 'diamond_kinetics',
  'the four named devices are recognised from their names');
select tests.ok(private.assessment_device_model('radar', 'Pocket radar') is null
  and private.assessment_device_model('ball_tracking', 'Blast Motion') is null
  and private.assessment_device_model('radar', 'Rapsodo') is null
  and private.assessment_device_model('bat_sensor', 'Dark sensor') is null,
  'any other device, or a named device under the wrong kind, has no model');

select tests.remember_job('blast', pg_temp.bat_speed_assessment('adult', 'bat_sensor', 'Blast Motion', array[70, 72, 74]));
select tests.remember_job('dk', pg_temp.bat_speed_assessment('adult2', 'bat_sensor', 'Diamond Kinetics', array[70, 72, 74]));
select tests.ok((select bool_and(o.device_model = 'blast_motion') from public.assessment_observations o where o.assessment_id = tests.job('blast'))
  and (select bool_and(o.device_model = 'diamond_kinetics') from public.assessment_observations o where o.assessment_id = tests.job('dk')),
  'each observation records the named device it came from');
update public.assessment_observations o set device_label = 'Something else'
 where o.assessment_id = tests.job('dk') and o.repetition_id = (select r.id from public.assessment_repetitions r where r.assessment_id = tests.job('dk') and r.seq = 1);
select tests.ok((select count(*) from public.assessment_observations o where o.assessment_id = tests.job('dk') and o.device_model is null) = 1,
  'the model follows the device name on every change, whatever path made it');
update public.assessment_observations o set device_label = 'Diamond Kinetics' where o.assessment_id = tests.job('dk');

-- ================================================================ references match the device model
select tests.authenticate_as('admin');
select tests.throws($$select public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_bat_speed_mph', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'mph', 'statistic', 'median', 'device_kind', 'bat_sensor', 'source', 'Fixture', 'usage_rights', 'Test only',
  'collected_from', '2026-01-01', 'collected_to', '2026-06-30', 'cohort_description', 'Fixture',
  'aggregation_note', 'One median per athlete', 'dataset_version', 'no-model'))$$,
  'BR003', 'a bat-sensor reference must name its device model');
select tests.clear_authentication();
select tests.throws($$insert into public.assessment_benchmark_releases (metric_key, metric_version, protocol_key, protocol_version, unit,
    statistic, device_kind, device_model, source, usage_rights, collected_from, collected_to, cohort_description, aggregation_note, dataset_version)
  values ('hit_bat_speed_mph', 1, 'hitting-video', 1, 'mph', 'median', 'radar', 'blast_motion', 'x', 'x', current_date, current_date, 'x', 'x', 'x')$$,
  '23514', 'a device model must belong to the release''s device kind');
select tests.authenticate_as('admin');
select tests.remember_job('blast_ref', public.admin_create_benchmark_release(jsonb_build_object(
  'metric_key', 'hit_bat_speed_mph', 'metric_version', 1, 'protocol_key', 'hitting-video', 'protocol_version', 1,
  'unit', 'mph', 'statistic', 'median', 'device_kind', 'bat_sensor', 'device_model', 'blast_motion', 'source', 'Fixture',
  'usage_rights', 'Test only', 'collected_from', '2026-01-01', 'collected_to', '2026-06-30', 'cohort_description', 'Fixture',
  'aggregation_note', 'One median per athlete', 'dataset_version', 'blast-fixture')));
select public.admin_add_benchmark_values(tests.job('blast_ref'),
  (select jsonb_agg(jsonb_build_object('subject_key', 'b-' || g, 'value', case when g <= 15 then 65 else 80 end)) from generate_series(1, 30) g));
select public.admin_set_benchmark_release_status(tests.job('blast_ref'), 'approved');
select tests.clear_authentication();

select tests.ok(pg_temp.bat_speed(tests.job('blast')) -> 'percentile' ->> 'dataset_version' = 'blast-fixture'
  and (pg_temp.bat_speed(tests.job('blast')) -> 'percentile' ->> 'value')::numeric = 50.0,
  'Blast Motion bat speed is placed in the Blast Motion group');
select tests.ok(pg_temp.bat_speed(tests.job('dk')) ->> 'status' = 'ok' and pg_temp.bat_speed(tests.job('dk')) -> 'percentile' = 'null'::jsonb,
  'Diamond Kinetics bat speed is never compared with a Blast Motion group');

-- ================================================================ showcase results
select tests.authenticate_as('minor');
select tests.remember_job('sc', public.record_showcase_result(auth.uid(), 'pbr', 'Fall ID Showcase', current_date - 30, 'exit_velocity', 88.5,
  'https://example.test/profile/123'));
select tests.ok((select unit || '|' || source_kind || '|' || (checked_by is null) from public.athlete_showcase_results where id = tests.job('sc'))
  = 'mph|self|true', 'an athlete records a showcase result; it is self-entered and unchecked');
select tests.throws(format($$select public.record_showcase_result(%L, 'pbr', 'Next week', current_date + 3, 'exit_velocity', 88, null)$$, tests.id('minor')),
  'BR003', 'an event date can''t be in the future');
select tests.throws(format($$select public.record_showcase_result(%L, 'pbr', 'Fall ID', current_date, 'sixty_yard', 4.1, null)$$, tests.id('minor')),
  'BR003', 'values outside a believable range are refused');
select tests.throws(format($$select public.record_showcase_result(%L, 'pbr', 'Fall ID', current_date, 'pop_time', 2.0, 'http://insecure.test')$$, tests.id('minor')),
  'BR003', 'profile links must be https');
select tests.throws(format($$select public.check_showcase_result(%L, true)$$, tests.job('sc')),
  'BR002', 'an athlete cannot mark their own result as checked');
select tests.authenticate_as('stranger');
select tests.ok(tests.visible_count('select * from public.athlete_showcase_results') = 0, 'other people can''t see an athlete''s event results');
select tests.throws(format($$select public.record_showcase_result(%L, 'pbr', 'Fall ID', current_date, 'pop_time', 2.0, null)$$, tests.id('minor')),
  'BR002', 'other people can''t add results for an athlete');
select tests.throws(format($$select public.delete_showcase_result(%L)$$, tests.job('sc')), 'BR002', 'or remove them');

select tests.authenticate_as('adult');
select tests.remember_job('sc2', public.record_showcase_result(auth.uid(), 'other_event', 'Summer Scout Day', current_date - 3, 'sixty_yard', 6.95, null));
select tests.authenticate_as('dev');
select tests.lives(format($$select public.check_showcase_result(%L, true)$$, tests.job('sc2')), 'the development coach checks a result');
select tests.ok((select unit = 's' and checked_by = tests.id('dev') from public.athlete_showcase_results where id = tests.job('sc2')),
  'the check records who checked it; a 60-yard time is in seconds');
select tests.lives(format($$select public.delete_showcase_result(%L)$$, tests.job('sc2')), 'results can be removed');
select tests.clear_authentication();

-- ================================================================ comparison groups: opting in
select tests.authenticate_as('adult');
select tests.throws($$select public.join_comparison_groups('comparison-groups-v1')$$, 'BR004', 'opting in stays closed until an administrator opens it');
select tests.throws($$select public.admin_set_comparison_groups_open(true)$$, 'BR002', 'only administrators open it');
select tests.authenticate_as('admin');
select public.admin_set_comparison_groups_open(true);

select tests.authenticate_as('adult');
select tests.throws($$select public.join_comparison_groups('comparison-groups-v0')$$, 'BR003', 'the athlete must agree to the current wording');
select tests.ok(public.join_comparison_groups('comparison-groups-v1') = 'active', 'an adult athlete opts in and counts at once');
select tests.throws($$select public.join_comparison_groups('comparison-groups-v1')$$, 'BR004', 'opting in twice is refused');
select tests.ok((select counted from public.comparison_group_status(auth.uid())), 'the status says the athlete is counted');

select tests.authenticate_as('parent');
select tests.throws($$select public.join_comparison_groups('comparison-groups-v1')$$, 'BR002', 'a parent cannot opt in on the athlete''s behalf');
select tests.authenticate_as('minor');
select tests.ok(public.join_comparison_groups('comparison-groups-v1') = 'pending_guardian', 'an athlete under 18 opts in and waits for a parent');
select tests.clear_authentication();
select tests.ok(not private.in_comparison_groups(tests.id('minor')), 'nothing about a minor is used before a parent agrees');
select tests.authenticate_as('stranger');
select tests.throws(format($$select public.approve_comparison_groups(%L)$$, tests.id('minor')), 'BR002', 'only the minor''s linked parent or guardian can agree');
select tests.authenticate_as('parent');
select tests.ok((select count(*) from public.my_comparison_group_requests()) = 1, 'the parent sees the request');
select tests.lives(format($$select public.approve_comparison_groups(%L)$$, tests.id('minor')), 'the parent agrees');
select tests.clear_authentication();
select tests.ok(private.in_comparison_groups(tests.id('minor')), 'then the minor counts');

-- ================================================================ building a group, and leaving
select tests.authenticate_as('dev');
select public.publish_assessment(tests.job('blast'), 'Coach review');
select tests.clear_authentication();
select tests.remember_job('minor_blast', pg_temp.bat_speed_assessment('minor', 'bat_sensor', 'Blast Motion', array[60, 62, 64]));
select tests.authenticate_as('minor');
select public.publish_assessment(tests.job('minor_blast'), null);
select tests.authenticate_as('adult2');
select public.publish_assessment(tests.job('dk'), null);

select tests.throws($$select public.admin_build_comparison_group('{}'::jsonb)$$, 'BR002', 'only administrators build groups');
select tests.authenticate_as('admin');
select tests.throws($$select public.admin_build_comparison_group(jsonb_build_object('metric_key', 'hit_bat_speed_mph', 'metric_version', 1,
  'protocol_key', 'hitting-video', 'protocol_version', 1, 'device_kind', 'bat_sensor',
  'collected_from', current_date - 60, 'collected_to', current_date))$$, 'BR003', 'a bat-sensor group must name its device model');
select tests.remember_job('group', public.admin_build_comparison_group(jsonb_build_object('metric_key', 'hit_bat_speed_mph', 'metric_version', 1,
  'protocol_key', 'hitting-video', 'protocol_version', 1, 'device_kind', 'bat_sensor', 'device_model', 'blast_motion',
  'collected_from', current_date - 60, 'collected_to', current_date, 'coach_reviewed_only', false)));
select tests.ok((select status || '|' || built_from || '|' || distinct_athletes from public.assessment_benchmark_releases where id = tests.job('group'))
  = 'draft|opted_in_athletes|2', 'a draft group holds one value for each opted-in athlete with a matching report');
select tests.clear_authentication();
select tests.ok((select array_agg(value order by value) from public.assessment_benchmark_values where release_id = tests.job('group')) = array[62, 72]::numeric[]
  and not exists (select 1 from public.assessment_benchmark_values where release_id = tests.job('group') and subject_key !~ '^oa-[0-9a-f]{32}$'),
  'values are each athlete''s typical result, under a key with no name');
select tests.authenticate_as('admin');
select tests.remember_job('coach_group', public.admin_build_comparison_group(jsonb_build_object('metric_key', 'hit_bat_speed_mph', 'metric_version', 1,
  'protocol_key', 'hitting-video', 'protocol_version', 1, 'device_kind', 'bat_sensor', 'device_model', 'blast_motion',
  'collected_from', current_date - 60, 'collected_to', current_date)));
select tests.ok((select distinct_athletes from public.assessment_benchmark_releases where id = tests.job('coach_group')) = 1,
  'by default only coach-reviewed reports are used');
select tests.remember_job('dk_group', public.admin_build_comparison_group(jsonb_build_object('metric_key', 'hit_bat_speed_mph', 'metric_version', 1,
  'protocol_key', 'hitting-video', 'protocol_version', 1, 'device_kind', 'bat_sensor', 'device_model', 'diamond_kinetics',
  'collected_from', current_date - 60, 'collected_to', current_date, 'coach_reviewed_only', false)));
select tests.ok((select distinct_athletes from public.assessment_benchmark_releases where id = tests.job('dk_group')) = 0,
  'athletes who didn''t opt in are never used');
select tests.throws(format($$select public.admin_set_benchmark_release_status(%L, 'approved')$$, tests.job('group')),
  'BR004', 'a group still needs 30 athletes before it can be approved');
select tests.ok((select count(*) from public.admin_benchmark_releases()) >= 4, 'administrators can list groups and references');
select tests.ok((select opted_in = 2 and counted = 2 and is_open from public.admin_comparison_group_settings()), 'administrators see how many athletes opted in');

select tests.authenticate_as('parent');
select tests.ok(public.leave_comparison_groups(tests.id('minor')) = 1, 'a parent can take a minor out; their values leave every group');
select tests.clear_authentication();
select tests.ok((select distinct_athletes from public.assessment_benchmark_releases where id = tests.job('group')) = 1
  and not exists (select 1 from public.comparison_group_consents where athlete_id = tests.id('minor')),
  'the group''s count drops and the opt-in is gone');

select tests.authenticate_as('stranger');
select tests.ok((select count(*) from public.comparison_group_status(tests.id('adult'))) = 0, 'other people can''t see whether an athlete opted in');
select tests.ok(not has_table_privilege('authenticated', 'public.comparison_group_consents', 'select')
  and not has_table_privilege('anon', 'public.comparison_group_consents', 'select'),
  'nobody reads the opt-in table directly; only the status function, for the athlete and their family');
select tests.ok((select count(*) from public.admin_comparison_group_settings()) = 0, 'the admin summary is empty for non-administrators');
