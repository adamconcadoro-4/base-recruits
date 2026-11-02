-- Hitting Master Workbook (F55): its 69 drills join the library beside the
-- Development Workbook's, and a hitting plan can start from one of the six
-- progression stages with at most one optional focus drill.

select tests.create_user('athlete', 'athlete', p_display_name => 'Avery Athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.enable_assessment(false);

select tests.authenticate_as('athlete');
select tests.remember_job('h', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date - 3, '{"rep_goal": 5}'::jsonb));
select public.record_assessment_observation(tests.job('h'), 'hit_load_repeatability', null, 2, false, null, null, null, null, null, null);
select tests.remember_job('rev', public.publish_assessment(tests.job('h'), null));

-- ================================================================ drills
select tests.ok((select count(*) from public.assessment_drills where key like 'hit-mw%' and version = 1 and active and discipline = 'hitting') = 69,
  'all 69 master workbook drills are in the library and open to new plans');
select tests.ok((select count(*) from public.assessment_drills where key ~ '^hit-[hr]\d{2}$' and active) = 46,
  'the development workbook drills are untouched');

-- ================================================================ stages
select tests.remember_job('stage1', public.create_training_plan(auth.uid(), tests.job('rev'), 'Stage 1 block', current_date, current_date + 28,
  '[]'::jsonb,
  '[{"drill_key": "hit-mw22", "drill_version": 1, "reason": "From Stage 1, rear-leg block.", "dosage": "4 drill reps, then 4 normal swings"},
    {"drill_key": "hit-mw13", "drill_version": 1, "reason": "From Stage 1, front-leg block.", "dosage": "4 drill reps, then 4 normal swings"},
    {"drill_key": "hit-mw01", "drill_version": 1, "reason": "From Stage 1, upper-body block.", "dosage": "4 drill reps, then 4 normal swings"},
    {"drill_key": "hit-mw34", "drill_version": 1, "reason": "From Stage 1, optional posture focus.", "dosage": "4 task reps, then 4 normal swings"}]'::jsonb,
  'ST1'));
select tests.ok((select session_template from public.assessment_training_plans where id = tests.job('stage1')) = 'ST1'
  and (select count(*) from public.assessment_plan_assignments where plan_id = tests.job('stage1')) = 4,
  'a plan can start from a progression stage with one optional focus drill');
select tests.throws(format($$select public.create_training_plan(%L, %L, 'Two focus blocks', current_date, current_date + 28, '[]',
  '[{"drill_key": "hit-mw22", "drill_version": 1, "reason": "Rear-leg block", "dosage": "4 + 4"},
    {"drill_key": "hit-mw34", "drill_version": 1, "reason": "Posture focus", "dosage": "4 + 4"},
    {"drill_key": "hit-mw58", "drill_version": 1, "reason": "Medicine-ball focus", "dosage": "4 + 4"}]', 'ST1')$$,
  tests.id('athlete'), tests.job('rev')),
  'BR003', 'a stage plan takes at most one optional focus drill');
select tests.throws(format($$select public.create_training_plan(%L, %L, 'Stage seven', current_date, current_date + 28, '[]',
  '[{"drill_key": "hit-mw22", "drill_version": 1, "reason": "Rear-leg block", "dosage": "4 + 4"}]', 'ST7')$$,
  tests.id('athlete'), tests.job('rev')),
  'BR003', 'only the six stages can start a plan');
select tests.remember_job('free', public.create_training_plan(auth.uid(), tests.job('rev'), 'Own choice', current_date, current_date + 28,
  '[]'::jsonb,
  '[{"drill_key": "hit-mw34", "drill_version": 1, "reason": "Chosen by the athlete", "dosage": "6-8 reps"},
    {"drill_key": "hit-mw46", "drill_version": 1, "reason": "Chosen by the athlete", "dosage": "4-6 reps"}]'::jsonb));
select tests.ok((select session_template from public.assessment_training_plans where id = tests.job('free')) is null,
  'the one-focus rule applies only to stage plans');
