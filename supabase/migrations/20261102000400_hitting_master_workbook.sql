-- Hitting Master Workbook (decision F56).
--
-- 1. Adds the Master Workbook's 69 drills (MW01-MW69) to the drill library,
--    beside the Development Workbook's drills. Nothing is replaced or switched
--    off. Instructions live in src/lib/assessment/catalog/master-drills.ts,
--    built from src/lib/assessment/hitting-workbook/master-v1.json; these rows
--    are generated from that TypeScript catalog and a contract test keeps them
--    equal. Every drill has a generic Base Recruits name, and every outside
--    organisation's name, link and source reference was removed from the
--    workbook at the founder's request (2026-11-02).
-- 2. A hitting plan can start from one of the six progression stages
--    (ST1-ST6), as well as from sessions S2, S3, S5, S6 and S7. Kept in step
--    with SESSION_TEMPLATE_IDS in src/lib/assessment/catalog/session-templates.ts.
-- 3. A plan started from a stage takes at most one of that stage's optional
--    focus drills (posture, balance/head control or medicine ball), matching
--    focusProblem() in the same file.

insert into public.assessment_drills (key, version, discipline, pillars, name)
values
  ('hit-mw01', 1, 'hitting', array['barrel_delivery'], 'One-Hand Top-Hand Tee'),
  ('hit-mw02', 1, 'hitting', array['load_timing', 'barrel_delivery', 'impact_output'], 'Top-Hand Soft Toss'),
  ('hit-mw03', 1, 'hitting', array['load_timing', 'barrel_delivery'], 'Back-Elbow Slot Pause'),
  ('hit-mw04', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Open Top-Hand Tee'),
  ('hit-mw05', 1, 'hitting', array['barrel_delivery'], 'Split-Grip Contact Tee'),
  ('hit-mw06', 1, 'hitting', array['load_timing', 'barrel_delivery'], 'Top-Hand Release Tee'),
  ('hit-mw07', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Top-Hand Extension Hold'),
  ('hit-mw08', 1, 'hitting', array['load_timing', 'barrel_delivery'], 'Double-Tee Path Swings'),
  ('hit-mw09', 1, 'hitting', array['barrel_delivery'], 'Soft-Net Hand-Path Swings'),
  ('hit-mw10', 1, 'hitting', array['barrel_delivery'], 'Rear-Elbow Path Video Check'),
  ('hit-mw11', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Opposite-Field Deep Tee'),
  ('hit-mw12', 1, 'hitting', array['barrel_delivery'], 'Top-Hand Delivery, One-Hand Finish'),
  ('hit-mw13', 1, 'hitting', array['lower_body_contribution'], 'Stride-to-Landing Hold'),
  ('hit-mw14', 1, 'hitting', array['lower_body_contribution'], 'Paused-Landing Tee Swings'),
  ('hit-mw15', 1, 'hitting', array['lower_body_contribution'], 'Walk-Up Momentum Swings'),
  ('hit-mw16', 1, 'hitting', array['lower_body_contribution'], 'Front-Leg Post Finish'),
  ('hit-mw17', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'High-Tee Transfer Check'),
  ('hit-mw18', 1, 'hitting', array['lower_body_contribution'], 'Landing-Foot Tape Line'),
  ('hit-mw19', 1, 'hitting', array['lower_body_contribution'], 'Raised Front-Foot Platform'),
  ('hit-mw20', 1, 'hitting', array['lower_body_contribution'], 'Stride Height Guide'),
  ('hit-mw21', 1, 'hitting', array['lower_body_contribution'], 'One-and-One Front-Leg Swings'),
  ('hit-mw22', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Rear-Hip Hinge Pause'),
  ('hit-mw23', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Coil-and-Freeze Stride'),
  ('hit-mw24', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Step-Back Tee Swings'),
  ('hit-mw25', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Wide-Stance Rocker Swings'),
  ('hit-mw26', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Rear-Leg Balance Start'),
  ('hit-mw27', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Crossed-Leg Load and Stride'),
  ('hit-mw28', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Offset Open-Stance Swings'),
  ('hit-mw29', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'No-Bat Lower-Half Turns'),
  ('hit-mw30', 1, 'hitting', '{}'::text[], 'Rotational Medicine-Ball Throw'),
  ('hit-mw31', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Rear-Foot Tape Outline'),
  ('hit-mw32', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Kneeling Rear-Leg Rise'),
  ('hit-mw33', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Shuffle-Step Swings'),
  ('hit-mw34', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Hinge-to-Landing Posture Rehearsal'),
  ('hit-mw35', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Shoulder-Line Posture Turns'),
  ('hit-mw36', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Slow Delivery-Path Rehearsal'),
  ('hit-mw37', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'No-Stride Posture Swings'),
  ('hit-mw38', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Low-Tee Posture Swings'),
  ('hit-mw39', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'High-Tee Posture Swings'),
  ('hit-mw40', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Mixed-Height Posture Tee'),
  ('hit-mw41', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Low-Outside Tee Reach'),
  ('hit-mw42', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Short-Bat Posture Swings'),
  ('hit-mw43', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Three-Stance Rotation Check'),
  ('hit-mw44', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Torso Path Video Check'),
  ('hit-mw45', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution'], 'Location-Change Transfer Tee'),
  ('hit-mw46', 1, 'hitting', array['load_timing', 'lower_body_contribution', 'impact_output'], 'Four-Count Dry Swing'),
  ('hit-mw47', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Small Toe-Tap Rhythm Swings'),
  ('hit-mw48', 1, 'hitting', array['lower_body_contribution'], 'Feet-Together Stride Swings'),
  ('hit-mw49', 1, 'hitting', array['lower_body_contribution'], 'Leg-Lift Stride Swings'),
  ('hit-mw50', 1, 'hitting', array['lower_body_contribution', 'impact_output'], 'Two-Foot Finish Hold'),
  ('hit-mw51', 1, 'hitting', array['lower_body_contribution', 'impact_output'], 'Contact-to-Finish Rehearsal'),
  ('hit-mw52', 1, 'hitting', array['lower_body_contribution', 'impact_output'], 'Tee-Top Focus Swings'),
  ('hit-mw53', 1, 'hitting', array['lower_body_contribution'], 'Post-Swing Symbol Call'),
  ('hit-mw54', 1, 'hitting', array['lower_body_contribution', 'impact_output'], 'Slow-Motion Head-Path Review'),
  ('hit-mw55', 1, 'hitting', '{}'::text[], 'No-Swing Pitch Tracking'),
  ('hit-mw56', 1, 'hitting', '{}'::text[], 'Color-Call Takes'),
  ('hit-mw57', 1, 'hitting', '{}'::text[], 'Controlled Take-or-Swing Reads'),
  ('hit-mw58', 1, 'hitting', '{}'::text[], 'Paused Standing Scoop Toss'),
  ('hit-mw59', 1, 'hitting', '{}'::text[], 'Split-Stance Scoop Toss'),
  ('hit-mw60', 1, 'hitting', '{}'::text[], 'Step-Back Scoop Toss'),
  ('hit-mw61', 1, 'hitting', '{}'::text[], 'Step-In Rotational Toss'),
  ('hit-mw62', 1, 'hitting', '{}'::text[], 'Small-Shuffle Scoop Toss'),
  ('hit-mw63', 1, 'hitting', '{}'::text[], 'Step-Behind Rotational Push Throw'),
  ('hit-mw64', 1, 'hitting', '{}'::text[], 'Tall-Kneeling Rotational Scoop'),
  ('hit-mw65', 1, 'hitting', '{}'::text[], 'Half-Kneeling Scoop Toss'),
  ('hit-mw66', 1, 'hitting', '{}'::text[], 'Standing Rotational Push Throw'),
  ('hit-mw67', 1, 'hitting', '{}'::text[], 'Half-Kneeling Rotational Push'),
  ('hit-mw68', 1, 'hitting', '{}'::text[], 'Controlled Overhead Floor Slam'),
  ('hit-mw69', 1, 'hitting', '{}'::text[], 'Medicine-Ball Carry and Place');

alter table public.assessment_training_plans
  drop constraint assessment_training_plans_session_template,
  add constraint assessment_training_plans_session_template
    check (session_template in ('S2', 'S3', 'S5', 'S6', 'S7', 'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6'));

-- -----------------------------------------------------------------------------
-- create_training_plan: the stages, and at most one focus drill per stage plan
-- -----------------------------------------------------------------------------
create or replace function public.create_training_plan(
  p_athlete_id uuid,
  p_source_revision_id uuid,
  p_title text,
  p_start_on date,
  p_review_on date,
  p_focus jsonb,
  p_assignments jsonb,
  p_session_template text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_revision public.assessment_report_revisions%rowtype;
  v_coach boolean;
  v_previous uuid;
  v_problem text;
  v_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_template text := nullif(btrim(p_session_template), '');
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR003';
  end if;
  select * into v_revision from public.assessment_report_revisions r where r.id = p_source_revision_id and r.athlete_id = p_athlete_id;
  if not found then
    raise exception 'start a plan from one of this athlete''s published reports' using errcode = 'BR003';
  end if;
  if char_length(coalesce(btrim(p_title), '')) not between 3 and 120 then
    raise exception 'give the plan a title (3 to 120 characters)' using errcode = 'BR003';
  end if;
  if p_start_on is null or p_review_on is null or p_review_on < p_start_on or p_review_on > p_start_on + 366
     or p_start_on < private.today_utc() - 31 then
    raise exception 'choose a start date and a review date within a year after it' using errcode = 'BR003';
  end if;
  if v_template is not null and (v_revision.discipline <> 'hitting' or v_template not in ('S2', 'S3', 'S5', 'S6', 'S7', 'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6')) then
    raise exception 'choose one of the hitting sessions' using errcode = 'BR003';
  end if;
  if p_focus is null or jsonb_typeof(p_focus) <> 'array' or jsonb_array_length(p_focus) > 3
     or exists (select 1 from jsonb_array_elements(p_focus) f
                 where jsonb_typeof(f) <> 'object' or char_length(coalesce(f ->> 'summary', '')) > 300
                    or not exists (select 1 from public.assessment_metric_definitions m
                                    where m.key = f ->> 'metric_key' and m.discipline = v_revision.discipline)) then
    raise exception 'choose up to three focus areas from this report' using errcode = 'BR003';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) not between 1 and 8 then
    raise exception 'a plan has between one and eight drills' using errcode = 'BR003';
  end if;
  if v_template like 'ST%' and (
    select count(*) from jsonb_array_elements(p_assignments) e
      join (values
        ('ST1', array['hit-mw34', 'hit-mw46', 'hit-mw58']),
        ('ST2', array['hit-mw35', 'hit-mw47', 'hit-mw59']),
        ('ST3', array['hit-mw37', 'hit-mw50', 'hit-mw66']),
        ('ST4', array['hit-mw38', 'hit-mw49', 'hit-mw60']),
        ('ST5', array['hit-mw40', 'hit-mw55', 'hit-mw61']),
        ('ST6', array['hit-mw45', 'hit-mw57', 'hit-mw62'])
      ) as stage_focus(template, drill_keys) on stage_focus.template = v_template
     where e ->> 'drill_key' = any (stage_focus.drill_keys)
  ) > 1 then
    raise exception 'choose at most one optional focus block (posture, balance or medicine ball) for a stage' using errcode = 'BR003';
  end if;
  for v_item in select e from jsonb_array_elements(p_assignments) e loop
    v_problem := private.assignment_problem(v_revision.discipline, v_item);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'BR003';
    end if;
  end loop;

  v_coach := private.assessment_relation(v_uid, p_athlete_id) = 'development_coach';
  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;

  select t.id into v_previous from public.assessment_training_plans t
   where t.athlete_id = p_athlete_id and t.discipline = v_revision.discipline and t.status = 'active'
   for update;
  if v_previous is not null then
    update public.assessment_training_plans t set status = 'completed', completed_at = now() where t.id = v_previous;
    perform private.record_plan_change(v_previous, 'completed', 'Replaced by a new training block');
  end if;

  insert into public.assessment_training_plans
    (athlete_id, discipline, source_revision_id, title, approval, approved_by, approved_at, start_on, review_on, focus,
     session_template, created_by)
  values
    (p_athlete_id, v_revision.discipline, v_revision.id, btrim(p_title),
     case when v_coach then 'coach_approved' else 'self_directed' end,
     case when v_coach then v_uid end, case when v_coach then now() end,
     p_start_on, p_review_on,
     (select coalesce(jsonb_agg(jsonb_build_object('metric_key', f ->> 'metric_key',
                                                   'pitch_type', nullif(f ->> 'pitch_type', ''),
                                                   'summary', left(coalesce(f ->> 'summary', ''), 300))), '[]'::jsonb)
        from jsonb_array_elements(p_focus) f),
     v_template,
     v_uid)
  returning id into v_id;

  for v_item in select e from jsonb_array_elements(p_assignments) e loop
    v_position := v_position + 1;
    insert into public.assessment_plan_assignments
      (plan_id, position, drill_key, drill_version, focus_metric_key, reason, dosage, created_by)
    values
      (v_id, v_position, v_item ->> 'drill_key', (v_item ->> 'drill_version')::smallint,
       nullif(v_item ->> 'focus_metric_key', ''), btrim(v_item ->> 'reason'), btrim(v_item ->> 'dosage'), v_uid);
  end loop;

  perform private.record_plan_change(v_id, 'created', null);
  return v_id;
end;
$$;
