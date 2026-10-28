-- Training plans: created from a published report, self-directed until a
-- development coach approves, every change recorded, never overwritten;
-- completion logs are adherence only and never change a score.

select tests.create_user('athlete', 'athlete', p_display_name => 'Avery Athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.enable_assessment(false);
select tests.link_development_coach('athlete', 'dev');

select tests.authenticate_as('athlete');
select tests.remember_job('h', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date - 3, '{"rep_goal": 5}'::jsonb));
select public.record_assessment_observation(tests.job('h'), 'hit_load_repeatability', null, 2, false, null, null, null, null, null, null);
select public.record_assessment_observation(tests.job('h'), 'hit_contact_location_consistency', null, 2, false, null, null, null, null, null, null);
select tests.remember_job('rev', public.publish_assessment(tests.job('h'), null));

create temporary table t_values (name text primary key, value text) on commit drop;
grant all on t_values to public;

-- ================================================================ creating plans
select tests.throws(format($$select public.create_training_plan(auth.uid(), gen_random_uuid(), 'Block one', current_date, current_date + 28,
  '[]', '[{"drill_key": "hit-h13", "drill_version": 1, "reason": "Load rated 2", "dosage": "3x8"}]')$$),
  'BR003', 'a plan starts from one of the athlete''s published reports');
select tests.throws(format($$select public.create_training_plan(auth.uid(), %L, 'Block one', current_date, current_date + 28,
  '[]', '[{"drill_key": "pit-stride-line", "drill_version": 1, "reason": "x", "dosage": "3x8"}]')$$, tests.job('rev')),
  'BR003', 'drills must come from the library for the report''s discipline');
select tests.throws(format($$select public.create_training_plan(auth.uid(), %L, 'Block one', current_date, current_date + 28,
  '[{"metric_key": "hit_load_repeatability"}, {"metric_key": "hit_drill_preparation"}, {"metric_key": "hit_balance_through_swing"}, {"metric_key": "hit_stride_direction_repeatability"}]',
  '[{"drill_key": "hit-h13", "drill_version": 1, "reason": "Load rated 2", "dosage": "3x8"}]')$$, tests.job('rev')),
  'BR003', 'a block has at most three focus areas');
select tests.throws(format($$select public.create_training_plan(auth.uid(), %L, 'Block one', current_date, current_date - 1,
  '[]', '[{"drill_key": "hit-h13", "drill_version": 1, "reason": "Load rated 2", "dosage": "3x8"}]')$$, tests.job('rev')),
  'BR003', 'the review date comes after the start date');
select tests.throws(format($$select public.create_training_plan(auth.uid(), %L, 'Block one', current_date, current_date + 28,
  '[]', '[{"drill_key": "hit-rhythm-load-tee", "drill_version": 1, "reason": "Load rated 2", "dosage": "3x8"}]')$$, tests.job('rev')),
  'BR003', 'a drill replaced in the library cannot go into a new plan');
select tests.ok((select count(*) from public.assessment_drills where not active
                  and key in ('hit-rhythm-load-tee', 'hit-front-toss-tempo', 'hit-contact-point-map', 'hit-stride-line', 'hit-line-drive-rounds')) = 5,
  'replaced drills stay in the library, switched off, so older plans keep pointing at them');
select tests.remember_job('plan1', public.create_training_plan(auth.uid(), tests.job('rev'), 'Block one', current_date, current_date + 28,
  '[{"metric_key": "hit_load_repeatability", "summary": "Load repeatability rated 2 of 5"}]'::jsonb,
  '[{"drill_key": "hit-h13", "drill_version": 1, "focus_metric_key": "hit_load_repeatability",
     "reason": "Suggested because load repeatability was rated 2 of 5.", "dosage": "3 sets of 8 swings, 3 days a week"},
    {"drill_key": "hit-h07", "drill_version": 1, "focus_metric_key": "hit_contact_location_consistency",
     "reason": "Suggested because contact-point consistency was rated 2 of 5.", "dosage": "2 rounds of 15 swings"}]'::jsonb));
select tests.ok((select approval || '|' || status || '|' || revision from public.assessment_training_plans where id = tests.job('plan1'))
  = 'self_directed|active|1', 'a plan the athlete makes is self-directed');
select tests.ok((select count(*) from public.assessment_plan_revisions where plan_id = tests.job('plan1') and change = 'created') = 1,
  'creating a plan is the first entry in its history');
select tests.throws(format($$select public.approve_training_plan(%L)$$, tests.job('plan1')), 'BR002',
  'an athlete cannot mark their own plan coach-approved');

-- ================================================================ coach approval and changes
select tests.authenticate_as('dev');
select tests.lives(format($$select public.approve_training_plan(%L)$$, tests.job('plan1')), 'the development coach approves the plan');
select tests.lives(format($$select public.update_training_assignment(%L, '4 sets of 6 swings, 3 days a week', 'Shorter sets')$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1)),
  'the coach adjusts a dosage');
select tests.ok((select approval from public.assessment_training_plans where id = tests.job('plan1')) = 'coach_approved',
  'the coach''s own change keeps the approval');
select tests.lives(format($$select public.set_training_plan_notes(%L, 'Film one set a week from the side.')$$, tests.job('plan1')),
  'the coach adds notes');
select tests.throws(format($$select public.replace_training_assignment(%L, 'hit-barrel-gate', 1, '')$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 2)),
  'BR003', 'replacing a drill needs a reason');
select tests.remember_job('replacement', public.replace_training_assignment(
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 2),
  'hit-barrel-gate', 1, 'Contact misses come from the barrel route, not the contact point'));
select tests.ok((select count(*) from public.assessment_plan_assignments where plan_id = tests.job('plan1') and status = 'removed'
                   and override_reason = 'Contact misses come from the barrel route, not the contact point') = 1
  and (select replaced_from is not null from public.assessment_plan_assignments where id = tests.job('replacement')),
  'a replaced drill is kept with the coach''s reason and linked to its replacement');

select tests.authenticate_as('athlete');
select tests.throws(format($$select public.set_training_plan_notes(%L, 'mine')$$, tests.job('plan1')), 'BR002', 'coach notes are written by the coach');
select tests.lives(format($$select public.update_training_assignment(%L, '2 sets of 8 swings', null)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1)),
  'the athlete can still adjust their own plan');
select tests.ok((select approval from public.assessment_training_plans where id = tests.job('plan1')) = 'self_directed',
  'but a change by the athlete''s side withdraws coach approval, so the plan never claims approval it no longer has');
select tests.ok((select array_agg(change order by revision) from public.assessment_plan_revisions where plan_id = tests.job('plan1'))
  = array['created', 'approved', 'dosage_changed', 'notes_changed', 'drill_replaced', 'dosage_changed'],
  'every change is recorded in order');
select tests.ok((select changed_by_kind || ':' || approval from public.assessment_plan_revisions where plan_id = tests.job('plan1')
                  order by revision desc limit 1) = 'self:self_directed',
  'the history records who changed it and the approval that followed');

-- ================================================================ logs
select tests.throws(format($$select public.log_training(%L, current_date + 5, 3, 3, null, null)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1 and status = 'active')),
  'BR003', 'a completion cannot be logged in the future');
select tests.throws(format($$select public.log_training(%L, current_date, 3, 9, null, null)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1 and status = 'active')),
  'BR003', 'effort is from 1 to 5');
select tests.clear_authentication();
insert into t_values select 'before', md5(private.assessment_results(tests.job('h'))::text);
select tests.authenticate_as('athlete');
select tests.remember_job('log', public.log_training(
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1 and status = 'active'),
  current_date, 3, 4, 'Felt steadier by the third set', null));
select tests.clear_authentication();
select tests.ok(md5(private.assessment_results(tests.job('h'))::text) = (select value from t_values where name = 'before'),
  'logging a drill changes no result or score');
select tests.authenticate_as('dev');
select tests.ok(tests.visible_count('select * from public.assessment_training_logs') = 1, 'the coach sees the athlete''s completion log');
select tests.throws(format($$select public.delete_training_log(%L)$$, tests.job('log')), 'BR002', 'only the person who logged it can delete it');
select tests.authenticate_as('other');
select tests.ok(tests.visible_count('select * from public.assessment_training_plans') = 0
  and tests.visible_count('select * from public.assessment_training_logs') = 0, 'other athletes see no plans or logs');
select tests.throws(format($$select public.log_training(%L, current_date, 1, 3, null, null)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and position = 1 and status = 'active')),
  'BR003', 'other athletes cannot log against someone else''s plan');

-- ================================================================ next block
select tests.authenticate_as('dev');
select tests.remember_job('plan2', public.create_training_plan(tests.id('athlete'), tests.job('rev'), 'Block two', current_date + 28, current_date + 56,
  '[]'::jsonb, '[{"drill_key": "hit-h15", "drill_version": 1, "reason": "Next focus", "dosage": "3x8"}]'::jsonb));
select tests.ok((select approval from public.assessment_training_plans where id = tests.job('plan2')) = 'coach_approved',
  'a plan the coach makes is coach-approved');
select tests.ok((select status from public.assessment_training_plans where id = tests.job('plan1')) = 'completed'
  and (select count(*) from public.assessment_plan_assignments where plan_id = tests.job('plan1')) = 3
  and (select count(*) from public.assessment_training_logs where plan_id = tests.job('plan1')) = 1,
  'starting the next block completes the previous plan without overwriting its drills or logs');
select tests.throws(format($$select public.update_training_assignment(%L, '1x1', null)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan1') and status = 'active' limit 1)),
  'BR004', 'a completed plan cannot be changed');

-- ================================================================ workbook sessions (F39)
select tests.throws(format($$select public.create_training_plan(%L, %L, 'Session block', current_date, current_date + 28,
  '[]', '[{"drill_key": "hit-h01", "drill_version": 1, "reason": "From session S4", "dosage": "4 swings"}]', 'S4')$$,
  tests.id('athlete'), tests.job('rev')),
  'BR003', 'only the offered hitting sessions can start a plan (S4 needs medicine-ball work)');
select tests.remember_job('plan3', public.create_training_plan(tests.id('athlete'), tests.job('rev'), 'Bailout sessions', current_date, current_date + 28,
  '[]'::jsonb,
  '[{"drill_key": "hit-h01", "drill_version": 1, "reason": "From session S2, baseline video block.", "dosage": "Baseline video block, about 3 min"},
    {"drill_key": "hit-r01", "drill_version": 1, "reason": "From session S2, rehearsal block.", "dosage": "Rehearsal block, about 3 min"}]'::jsonb,
  'S2'));
select tests.ok((select session_template from public.assessment_training_plans where id = tests.job('plan3')) = 'S2'
  and (select session_template from public.assessment_training_plans where id = tests.job('plan2')) is null,
  'a plan keeps the session it started from; plans without one keep null');
select tests.ok(exists (select 1 from pg_constraint where conname = 'assessment_training_plans_session_hitting'),
  'only hitting plans can carry a session');

-- ================================================================ practice counts (F39)
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.log_training(%L, current_date, null, null, null, null, null, 4)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 1)),
  'BR003', 'a count of solid contacts needs the number of swings');
select tests.throws(format($$select public.log_training(%L, current_date, null, null, null, null, 5, 6)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 1)),
  'BR003', 'solid contacts cannot exceed swings');
select tests.throws(format($$select public.log_training(%L, current_date, null, null, null, null, null, null, 6, 7)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 1)),
  'BR003', 'good decisions cannot exceed the pitches judged');
select tests.throws(format($$select public.log_training(%L, current_date, null, null, null, null, 301)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 1)),
  'BR003', 'a count is at most 300');
select tests.clear_authentication();
delete from t_values where name = 'before';
insert into t_values select 'before', md5(private.assessment_results(tests.job('h'))::text);
select tests.authenticate_as('athlete');
select tests.remember_job('counted', public.log_training(
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 1),
  current_date, null, null, null, null, 10, 7, null, null, 5, 4));
select tests.authenticate_as('dev');
select tests.remember_job('observed', public.log_training(
  (select id from public.assessment_plan_assignments where plan_id = tests.job('plan3') and position = 2),
  current_date, null, null, null, null, null, null, null, null, 6, 6));
select tests.clear_authentication();
select tests.ok((select row(swings, solid_contacts, decisions_assessed, decisions_correct, landings_assessed, landings_intended, logger_kind)::text
                   from public.assessment_training_logs where id = tests.job('counted')) = '(10,7,,,5,4,self)'
  and (select logger_kind from public.assessment_training_logs where id = tests.job('observed')) = 'development_coach',
  'counts are stored as given, blanks stay blank, and who counted is recorded');
select tests.ok(md5(private.assessment_results(tests.job('h'))::text) = (select value from t_values where name = 'before'),
  'practice counts change no result or score');
select tests.authenticate_as('athlete');
select tests.remember_job('p', public.create_assessment(auth.uid(), 'pitching-video', 1, current_date - 2, '{"rep_goal": 10}'::jsonb));
select public.record_assessment_observation(tests.job('p'), 'pit_delivery_balance', null, 2, false, null, null, null, null, null, null);
select tests.remember_job('prev', public.publish_assessment(tests.job('p'), null));
select tests.throws(format($$select public.create_training_plan(auth.uid(), %L, 'Pitching block', current_date, current_date + 28,
  '[]', '[{"drill_key": "pit-balance-hold", "drill_version": 1, "reason": "Balance rated 2", "dosage": "3x5"}]', 'S2')$$, tests.job('prev')),
  'BR003', 'a pitching plan cannot start from a hitting session');
select tests.remember_job('pplan', public.create_training_plan(auth.uid(), tests.job('prev'), 'Pitching block', current_date, current_date + 28,
  '[]'::jsonb, '[{"drill_key": "pit-balance-hold", "drill_version": 1, "reason": "Balance rated 2", "dosage": "3x5"}]'::jsonb));
select tests.throws(format($$select public.log_training(%L, current_date, 2, null, null, null, 10)$$,
  (select id from public.assessment_plan_assignments where plan_id = tests.job('pplan'))),
  'BR003', 'practice counts are for hitting drills only');
