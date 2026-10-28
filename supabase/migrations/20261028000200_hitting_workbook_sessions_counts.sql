-- Hitting Development Workbook, phase 2 (decision F39): session templates and
-- practice counts.
--
-- 1. A hitting plan can start from one of the workbook's session templates
--    (S2, S3, S5, S6, S7; kept in step with SESSION_TEMPLATE_IDS in
--    src/lib/assessment/catalog/session-templates.ts). The plan keeps the
--    template so it can show the whole session, warm-up and retest included.
--    create_training_plan gains p_session_template (default null), so
--    existing callers are unchanged.
-- 2. A training log on a hitting plan can carry practice counts: swings and
--    solid contacts, swing/take decisions judged and good ones, landings
--    checked and on the intended spot. Every count is optional (blank is not
--    zero), and a "made" count needs its "out of" count and cannot exceed it.
--    Counts are adherence and practice quality only: like the rest of the log,
--    they never change any score. Who logged them (logger_kind) tells a coach
--    observation from the athlete's or family's own report.

alter table public.assessment_training_plans
  add column session_template text
    constraint assessment_training_plans_session_template check (session_template in ('S2', 'S3', 'S5', 'S6', 'S7')),
  add constraint assessment_training_plans_session_hitting check (session_template is null or discipline = 'hitting');
comment on column public.assessment_training_plans.session_template is
  'Workbook session template the plan started from (hitting only), or null.';

alter table public.assessment_training_logs
  add column swings smallint constraint assessment_training_logs_swings check (swings between 0 and 300),
  add column solid_contacts smallint constraint assessment_training_logs_solid check (solid_contacts between 0 and 300),
  add column decisions_assessed smallint constraint assessment_training_logs_decisions check (decisions_assessed between 0 and 300),
  add column decisions_correct smallint constraint assessment_training_logs_correct check (decisions_correct between 0 and 300),
  add column landings_assessed smallint constraint assessment_training_logs_landings check (landings_assessed between 0 and 300),
  add column landings_intended smallint constraint assessment_training_logs_intended check (landings_intended between 0 and 300),
  add constraint assessment_training_logs_solid_of_swings
    check (solid_contacts is null or (swings is not null and solid_contacts <= swings)),
  add constraint assessment_training_logs_correct_of_assessed
    check (decisions_correct is null or (decisions_assessed is not null and decisions_correct <= decisions_assessed)),
  add constraint assessment_training_logs_intended_of_assessed
    check (landings_intended is null or (landings_assessed is not null and landings_intended <= landings_assessed));
comment on column public.assessment_training_logs.swings is
  'Practice count (optional; null = not counted). Counts never change a score.';

-- -----------------------------------------------------------------------------
-- create_training_plan, with an optional session template
-- -----------------------------------------------------------------------------
drop function public.create_training_plan(uuid, uuid, text, date, date, jsonb, jsonb);

create function public.create_training_plan(
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
  if v_template is not null and (v_revision.discipline <> 'hitting' or v_template not in ('S2', 'S3', 'S5', 'S6', 'S7')) then
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

-- -----------------------------------------------------------------------------
-- log_training, with optional practice counts
-- -----------------------------------------------------------------------------
drop function public.log_training(uuid, date, integer, integer, text, uuid);

create function public.log_training(
  p_assignment_id uuid,
  p_completed_on date,
  p_sets_completed integer,
  p_effort integer,
  p_feedback text,
  p_media_id uuid,
  p_swings integer default null,
  p_solid_contacts integer default null,
  p_decisions_assessed integer default null,
  p_decisions_correct integer default null,
  p_landings_assessed integer default null,
  p_landings_intended integer default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_assignment public.assessment_plan_assignments%rowtype;
  v_plan public.assessment_training_plans%rowtype;
  v_counted boolean := coalesce(p_swings, p_solid_contacts, p_decisions_assessed, p_decisions_correct,
                                p_landings_assessed, p_landings_intended) is not null;
  v_id uuid;
begin
  select * into v_assignment from public.assessment_plan_assignments a where a.id = p_assignment_id and a.status = 'active';
  v_plan := private.plan_for_work(v_assignment.plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is complete' using errcode = 'BR004';
  end if;
  if p_completed_on is null or p_completed_on > private.today_utc() + 1 or p_completed_on < v_plan.start_on - 7 then
    raise exception 'choose the day you did the drill (not before the plan started or in the future)' using errcode = 'BR003';
  end if;
  if (p_sets_completed is not null and p_sets_completed not between 0 and 50)
     or (p_effort is not null and p_effort not between 1 and 5) or char_length(coalesce(p_feedback, '')) > 500 then
    raise exception 'check the sets (0–50), effort (1–5) and feedback (up to 500 characters)' using errcode = 'BR003';
  end if;
  if v_counted and v_plan.discipline <> 'hitting' then
    raise exception 'practice counts are for hitting drills' using errcode = 'BR003';
  end if;
  if exists (select 1 from unnest(array[p_swings, p_solid_contacts, p_decisions_assessed, p_decisions_correct,
                                        p_landings_assessed, p_landings_intended]) c where c not between 0 and 300) then
    raise exception 'each practice count is between 0 and 300' using errcode = 'BR003';
  end if;
  if (p_solid_contacts is not null and (p_swings is null or p_solid_contacts > p_swings))
     or (p_decisions_correct is not null and (p_decisions_assessed is null or p_decisions_correct > p_decisions_assessed))
     or (p_landings_intended is not null and (p_landings_assessed is null or p_landings_intended > p_landings_assessed)) then
    raise exception 'a count of good ones needs how many were counted, and cannot be more' using errcode = 'BR003';
  end if;
  if p_media_id is not null and not exists (
       select 1 from public.assessment_media m where m.id = p_media_id and m.athlete_id = v_plan.athlete_id and m.status = 'uploaded') then
    raise exception 'that clip is not available' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_training_logs l
       where l.assignment_id = p_assignment_id and l.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many entries for this drill today' using errcode = 'BR005';
  end if;
  insert into public.assessment_training_logs
    (plan_id, assignment_id, athlete_id, completed_on, sets_completed, effort, feedback, media_id, logged_by, logger_kind,
     swings, solid_contacts, decisions_assessed, decisions_correct, landings_assessed, landings_intended)
  values
    (v_plan.id, p_assignment_id, v_plan.athlete_id, p_completed_on, p_sets_completed, p_effort, nullif(btrim(p_feedback), ''),
     p_media_id, v_uid, private.assessment_source_kind(v_plan.athlete_id),
     p_swings, p_solid_contacts, p_decisions_assessed, p_decisions_correct, p_landings_assessed, p_landings_intended)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_training_plan(uuid, uuid, text, date, date, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.log_training(uuid, date, integer, integer, text, uuid, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_training_plan(uuid, uuid, text, date, date, jsonb, jsonb, text) to authenticated;
grant execute on function public.log_training(uuid, date, integer, integer, text, uuid, integer, integer, integer, integer, integer, integer)
  to authenticated;
