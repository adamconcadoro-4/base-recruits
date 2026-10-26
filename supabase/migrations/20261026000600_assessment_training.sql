-- =============================================================================
-- Base Recruits Assessment / Migration 6: training plans and completion logs
--
-- A plan is created from a report (a frozen revision) with up to three focus
-- areas and up to eight drills. Plans made by the athlete's side are
-- self-directed; only the athlete's development coach can approve a plan, and
-- any later change by the athlete's side returns it to self-directed. Every
-- change is recorded as a plan revision. Starting a new plan completes the
-- previous one for that discipline — plans are never overwritten.
--
-- Completion logs record adherence only. They never change any score.
-- =============================================================================

create table public.assessment_training_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  discipline text not null constraint assessment_training_plans_discipline check (discipline in ('hitting', 'pitching')),
  source_revision_id uuid references public.assessment_report_revisions (id) on delete set null,
  title text not null constraint assessment_training_plans_title check (char_length(title) between 3 and 120),
  status text not null default 'active' constraint assessment_training_plans_status check (status in ('active', 'completed')),
  approval text not null default 'self_directed'
    constraint assessment_training_plans_approval check (approval in ('self_directed', 'coach_approved')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  start_on date not null,
  review_on date not null,
  focus jsonb not null default '[]'::jsonb,
  coach_notes text constraint assessment_training_plans_notes check (char_length(coach_notes) <= 2000),
  revision integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint assessment_training_plans_dates check (review_on >= start_on and review_on <= start_on + 366),
  constraint assessment_training_plans_approved check ((approval = 'coach_approved') = (approved_at is not null)),
  constraint assessment_training_plans_focus check (jsonb_typeof(focus) = 'array' and jsonb_array_length(focus) <= 3)
);
comment on table public.assessment_training_plans is
  'Training blocks created from a published report. Self-directed until the athlete''s development coach approves.';
create unique index assessment_training_plans_one_active
  on public.assessment_training_plans (athlete_id, discipline) where status = 'active';
create index assessment_training_plans_athlete_idx on public.assessment_training_plans (athlete_id, created_at desc);

create table public.assessment_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.assessment_training_plans (id) on delete cascade,
  position smallint not null,
  drill_key text not null,
  drill_version smallint not null,
  focus_metric_key text,
  reason text not null constraint assessment_plan_assignments_reason check (char_length(reason) between 3 and 600),
  dosage text not null constraint assessment_plan_assignments_dosage check (char_length(dosage) between 1 and 200),
  note text constraint assessment_plan_assignments_note check (char_length(note) <= 300),
  status text not null default 'active' constraint assessment_plan_assignments_status check (status in ('active', 'removed')),
  override_reason text constraint assessment_plan_assignments_override check (char_length(override_reason) between 3 and 300),
  replaced_from uuid references public.assessment_plan_assignments (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (drill_key, drill_version) references public.assessment_drills (key, version),
  constraint assessment_plan_assignments_removed_reason check (status = 'active' or override_reason is not null)
);
create index assessment_plan_assignments_plan_idx on public.assessment_plan_assignments (plan_id, position);

create table public.assessment_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.assessment_training_plans (id) on delete cascade,
  revision integer not null,
  change text not null constraint assessment_plan_revisions_change check (change in (
    'created', 'approved', 'dosage_changed', 'drill_replaced', 'drill_added', 'drill_removed', 'notes_changed',
    'completed', 'approval_withdrawn')),
  reason text constraint assessment_plan_revisions_reason check (char_length(reason) <= 300),
  approval text not null,
  assignments jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_kind text not null constraint assessment_plan_revisions_kind check (changed_by_kind in ('self', 'development_coach')),
  created_at timestamptz not null default now(),
  unique (plan_id, revision)
);
comment on table public.assessment_plan_revisions is 'History of every plan change, with the drills and dosages as they were.';

create table public.assessment_training_logs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.assessment_training_plans (id) on delete cascade,
  assignment_id uuid not null references public.assessment_plan_assignments (id) on delete cascade,
  athlete_id uuid not null references public.athletes (user_id) on delete cascade,
  completed_on date not null,
  sets_completed smallint constraint assessment_training_logs_sets check (sets_completed between 0 and 50),
  effort smallint constraint assessment_training_logs_effort check (effort between 1 and 5),
  feedback text constraint assessment_training_logs_feedback check (char_length(feedback) <= 500),
  media_id uuid references public.assessment_media (id) on delete set null,
  logged_by uuid references auth.users (id) on delete set null,
  logger_kind text not null constraint assessment_training_logs_kind check (logger_kind in ('self', 'development_coach')),
  created_at timestamptz not null default now()
);
comment on table public.assessment_training_logs is 'Drill completions (adherence). Kept apart from performance; never changes a score.';
create index assessment_training_logs_plan_idx on public.assessment_training_logs (plan_id, completed_on desc);

create trigger assessment_training_plans_set_updated_at before update on public.assessment_training_plans
  for each row execute function private.set_updated_at();
create trigger assessment_plan_assignments_set_updated_at before update on public.assessment_plan_assignments
  for each row execute function private.set_updated_at();
create trigger assessment_training_plans_audit
  after insert or update of status, approval or delete on public.assessment_training_plans
  for each row execute function private.audit_row_change('athlete_id', 'id', 'status', 'approval', 'discipline');

alter table public.assessment_training_plans enable row level security;
alter table public.assessment_plan_assignments enable row level security;
alter table public.assessment_plan_revisions enable row level security;
alter table public.assessment_training_logs enable row level security;
revoke all on table public.assessment_training_plans, public.assessment_plan_assignments,
  public.assessment_plan_revisions, public.assessment_training_logs from anon, authenticated, service_role;
grant select on table public.assessment_training_plans, public.assessment_plan_assignments,
  public.assessment_plan_revisions, public.assessment_training_logs to authenticated;

create function private.can_work_on_plan(p_plan_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.assessment_training_plans t
                  where t.id = p_plan_id and private.can_work_on_assessments((select auth.uid()), t.athlete_id))
$$;
revoke all on function private.can_work_on_plan(uuid) from public;
grant execute on function private.can_work_on_plan(uuid) to authenticated;

create policy assessment_training_plans_read on public.assessment_training_plans for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));
create policy assessment_plan_assignments_read on public.assessment_plan_assignments for select to authenticated
  using (private.can_work_on_plan(plan_id));
create policy assessment_plan_revisions_read on public.assessment_plan_revisions for select to authenticated
  using (private.can_work_on_plan(plan_id));
create policy assessment_training_logs_read on public.assessment_training_logs for select to authenticated
  using (private.can_work_on_assessments((select auth.uid()), athlete_id));

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.plan_for_work(p_plan_id uuid) returns public.assessment_training_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.assessment_training_plans%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  select * into v_plan from public.assessment_training_plans t where t.id = p_plan_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_plan.athlete_id) then
    raise exception 'training plan not found' using errcode = 'BR003';
  end if;
  return v_plan;
end;
$$;

-- Records a revision; a change by the athlete's side withdraws coach approval.
create function private.record_plan_change(p_plan_id uuid, p_change text, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.assessment_training_plans%rowtype;
  v_kind text;
begin
  select * into v_plan from public.assessment_training_plans t where t.id = p_plan_id;
  v_kind := private.assessment_source_kind(v_plan.athlete_id);
  if v_kind = 'self' and v_plan.approval = 'coach_approved'
     and p_change in ('dosage_changed', 'drill_replaced', 'drill_added', 'drill_removed') then
    update public.assessment_training_plans t
       set approval = 'self_directed', approved_by = null, approved_at = null
     where t.id = p_plan_id;
    v_plan.approval := 'self_directed';
  end if;
  update public.assessment_training_plans t set revision = t.revision + 1 where t.id = p_plan_id and p_change <> 'created';
  insert into public.assessment_plan_revisions (plan_id, revision, change, reason, approval, assignments, changed_by, changed_by_kind)
  select p_plan_id, t.revision, p_change, nullif(btrim(p_reason), ''), t.approval,
         (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'drill_key', a.drill_key, 'drill_version', a.drill_version,
                                                       'dosage', a.dosage, 'focus_metric_key', a.focus_metric_key)
                                    order by a.position, a.created_at), '[]'::jsonb)
            from public.assessment_plan_assignments a where a.plan_id = p_plan_id and a.status = 'active'),
         v_uid, v_kind
    from public.assessment_training_plans t where t.id = p_plan_id;
end;
$$;

create function private.assignment_problem(p_discipline text, p_item jsonb) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_item) <> 'object' then 'each drill needs its details'
    when not exists (select 1 from public.assessment_drills d
                      where d.key = p_item ->> 'drill_key' and d.version = (p_item ->> 'drill_version')::smallint
                        and d.active and d.discipline = p_discipline) then 'choose drills from the library for this discipline'
    when char_length(coalesce(btrim(p_item ->> 'reason'), '')) not between 3 and 600 then 'each drill needs a reason (3 to 600 characters)'
    when char_length(coalesce(btrim(p_item ->> 'dosage'), '')) not between 1 and 200 then 'each drill needs a dosage (up to 200 characters)'
    when nullif(p_item ->> 'focus_metric_key', '') is not null and not exists (
           select 1 from public.assessment_metric_definitions m where m.key = p_item ->> 'focus_metric_key' and m.discipline = p_discipline)
      then 'a focus metric is not part of this discipline'
  end
$$;

revoke all on function private.plan_for_work(uuid) from public;
revoke all on function private.record_plan_change(uuid, text, text) from public;
revoke all on function private.assignment_problem(text, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
create function public.create_training_plan(
  p_athlete_id uuid,
  p_source_revision_id uuid,
  p_title text,
  p_start_on date,
  p_review_on date,
  p_focus jsonb,
  p_assignments jsonb
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
    (athlete_id, discipline, source_revision_id, title, approval, approved_by, approved_at, start_on, review_on, focus, created_by)
  values
    (p_athlete_id, v_revision.discipline, v_revision.id, btrim(p_title),
     case when v_coach then 'coach_approved' else 'self_directed' end,
     case when v_coach then v_uid end, case when v_coach then now() end,
     p_start_on, p_review_on,
     (select coalesce(jsonb_agg(jsonb_build_object('metric_key', f ->> 'metric_key',
                                                   'pitch_type', nullif(f ->> 'pitch_type', ''),
                                                   'summary', left(coalesce(f ->> 'summary', ''), 300))), '[]'::jsonb)
        from jsonb_array_elements(p_focus) f),
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

create function public.approve_training_plan(p_plan_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.assessment_training_plans%rowtype;
begin
  v_plan := private.plan_for_work(p_plan_id);
  if private.assessment_relation(v_uid, v_plan.athlete_id) is distinct from 'development_coach' then
    raise exception 'only the athlete''s development coach can approve a plan' using errcode = 'BR002';
  end if;
  if v_plan.status <> 'active' or v_plan.approval = 'coach_approved' then
    raise exception 'this plan is not waiting for approval' using errcode = 'BR004';
  end if;
  update public.assessment_training_plans t
     set approval = 'coach_approved', approved_by = v_uid, approved_at = now()
   where t.id = p_plan_id;
  perform private.record_plan_change(p_plan_id, 'approved', null);
end;
$$;

create function public.update_training_assignment(p_assignment_id uuid, p_dosage text, p_note text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assessment_plan_assignments%rowtype;
  v_plan public.assessment_training_plans%rowtype;
begin
  select * into v_assignment from public.assessment_plan_assignments a where a.id = p_assignment_id and a.status = 'active';
  v_plan := private.plan_for_work(v_assignment.plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is complete' using errcode = 'BR004';
  end if;
  if char_length(coalesce(btrim(p_dosage), '')) not between 1 and 200 or char_length(coalesce(p_note, '')) > 300 then
    raise exception 'the dosage needs up to 200 characters and the note up to 300' using errcode = 'BR003';
  end if;
  update public.assessment_plan_assignments a
     set dosage = btrim(p_dosage), note = nullif(btrim(p_note), '')
   where a.id = p_assignment_id;
  perform private.record_plan_change(v_plan.id, 'dosage_changed', null);
end;
$$;

create function public.replace_training_assignment(
  p_assignment_id uuid,
  p_drill_key text,
  p_drill_version integer,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_assignment public.assessment_plan_assignments%rowtype;
  v_plan public.assessment_training_plans%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_problem text;
  v_id uuid;
begin
  select * into v_assignment from public.assessment_plan_assignments a where a.id = p_assignment_id and a.status = 'active';
  v_plan := private.plan_for_work(v_assignment.plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is complete' using errcode = 'BR004';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'say why the drill is being replaced (3 to 300 characters)' using errcode = 'BR003';
  end if;
  v_problem := private.assignment_problem(v_plan.discipline, jsonb_build_object(
    'drill_key', p_drill_key, 'drill_version', p_drill_version, 'reason', v_reason, 'dosage', v_assignment.dosage,
    'focus_metric_key', v_assignment.focus_metric_key));
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;
  update public.assessment_plan_assignments a
     set status = 'removed', override_reason = v_reason
   where a.id = p_assignment_id;
  insert into public.assessment_plan_assignments
    (plan_id, position, drill_key, drill_version, focus_metric_key, reason, dosage, note, replaced_from, override_reason, created_by)
  values
    (v_plan.id, v_assignment.position, p_drill_key, p_drill_version::smallint, v_assignment.focus_metric_key,
     'Replaced: ' || v_reason, v_assignment.dosage, v_assignment.note, v_assignment.id, v_reason, v_uid)
  returning id into v_id;
  perform private.record_plan_change(v_plan.id, 'drill_replaced', v_reason);
  return v_id;
end;
$$;

create function public.add_training_assignment(
  p_plan_id uuid,
  p_drill_key text,
  p_drill_version integer,
  p_focus_metric_key text,
  p_reason text,
  p_dosage text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.assessment_training_plans%rowtype;
  v_problem text;
  v_id uuid;
begin
  v_plan := private.plan_for_work(p_plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is complete' using errcode = 'BR004';
  end if;
  if (select count(*) from public.assessment_plan_assignments a where a.plan_id = p_plan_id and a.status = 'active') >= 8 then
    raise exception 'a plan has at most eight drills; replace one instead' using errcode = 'BR004';
  end if;
  v_problem := private.assignment_problem(v_plan.discipline, jsonb_build_object(
    'drill_key', p_drill_key, 'drill_version', p_drill_version, 'reason', p_reason, 'dosage', p_dosage,
    'focus_metric_key', p_focus_metric_key));
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;
  insert into public.assessment_plan_assignments
    (plan_id, position, drill_key, drill_version, focus_metric_key, reason, dosage, created_by)
  values
    (p_plan_id, (select coalesce(max(a.position), 0) + 1 from public.assessment_plan_assignments a where a.plan_id = p_plan_id),
     p_drill_key, p_drill_version::smallint, nullif(p_focus_metric_key, ''), btrim(p_reason), btrim(p_dosage), v_uid)
  returning id into v_id;
  perform private.record_plan_change(p_plan_id, 'drill_added', null);
  return v_id;
end;
$$;

create function public.remove_training_assignment(p_assignment_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assessment_plan_assignments%rowtype;
  v_plan public.assessment_training_plans%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  select * into v_assignment from public.assessment_plan_assignments a where a.id = p_assignment_id and a.status = 'active';
  v_plan := private.plan_for_work(v_assignment.plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is complete' using errcode = 'BR004';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'say why the drill is being removed (3 to 300 characters)' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_plan_assignments a where a.plan_id = v_plan.id and a.status = 'active') <= 1 then
    raise exception 'a plan needs at least one drill' using errcode = 'BR004';
  end if;
  update public.assessment_plan_assignments a set status = 'removed', override_reason = v_reason where a.id = p_assignment_id;
  perform private.record_plan_change(v_plan.id, 'drill_removed', v_reason);
end;
$$;

create function public.set_training_plan_notes(p_plan_id uuid, p_notes text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.assessment_training_plans%rowtype;
begin
  v_plan := private.plan_for_work(p_plan_id);
  if private.assessment_relation(v_uid, v_plan.athlete_id) is distinct from 'development_coach' then
    raise exception 'coach notes are written by the development coach' using errcode = 'BR002';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'coach notes can be up to 2,000 characters' using errcode = 'BR003';
  end if;
  update public.assessment_training_plans t set coach_notes = nullif(btrim(p_notes), '') where t.id = p_plan_id;
  perform private.record_plan_change(p_plan_id, 'notes_changed', null);
end;
$$;

create function public.complete_training_plan(p_plan_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.assessment_training_plans%rowtype;
begin
  v_plan := private.plan_for_work(p_plan_id);
  if v_plan.status <> 'active' then
    raise exception 'this plan is already complete' using errcode = 'BR004';
  end if;
  update public.assessment_training_plans t set status = 'completed', completed_at = now() where t.id = p_plan_id;
  perform private.record_plan_change(p_plan_id, 'completed', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Completion logs
-- -----------------------------------------------------------------------------
create function public.log_training(
  p_assignment_id uuid,
  p_completed_on date,
  p_sets_completed integer,
  p_effort integer,
  p_feedback text,
  p_media_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_assignment public.assessment_plan_assignments%rowtype;
  v_plan public.assessment_training_plans%rowtype;
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
  if p_media_id is not null and not exists (
       select 1 from public.assessment_media m where m.id = p_media_id and m.athlete_id = v_plan.athlete_id and m.status = 'uploaded') then
    raise exception 'that clip is not available' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_training_logs l
       where l.assignment_id = p_assignment_id and l.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many entries for this drill today' using errcode = 'BR005';
  end if;
  insert into public.assessment_training_logs
    (plan_id, assignment_id, athlete_id, completed_on, sets_completed, effort, feedback, media_id, logged_by, logger_kind)
  values
    (v_plan.id, p_assignment_id, v_plan.athlete_id, p_completed_on, p_sets_completed, p_effort, nullif(btrim(p_feedback), ''),
     p_media_id, v_uid, private.assessment_source_kind(v_plan.athlete_id))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.delete_training_log(p_log_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_log public.assessment_training_logs%rowtype;
begin
  select * into v_log from public.assessment_training_logs l where l.id = p_log_id;
  perform private.plan_for_work(v_log.plan_id);
  if v_log.logged_by is distinct from v_uid then
    raise exception 'only the person who logged it can delete it' using errcode = 'BR002';
  end if;
  delete from public.assessment_training_logs l where l.id = p_log_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.create_training_plan(uuid, uuid, text, date, date, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.approve_training_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_training_assignment(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.replace_training_assignment(uuid, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.add_training_assignment(uuid, text, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_training_assignment(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.set_training_plan_notes(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_training_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.log_training(uuid, date, integer, integer, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_training_log(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_training_plan(uuid, uuid, text, date, date, jsonb, jsonb) to authenticated;
grant execute on function public.approve_training_plan(uuid) to authenticated;
grant execute on function public.update_training_assignment(uuid, text, text) to authenticated;
grant execute on function public.replace_training_assignment(uuid, text, integer, text) to authenticated;
grant execute on function public.add_training_assignment(uuid, text, integer, text, text, text) to authenticated;
grant execute on function public.remove_training_assignment(uuid, text) to authenticated;
grant execute on function public.set_training_plan_notes(uuid, text) to authenticated;
grant execute on function public.complete_training_plan(uuid) to authenticated;
grant execute on function public.log_training(uuid, date, integer, integer, text, uuid) to authenticated;
grant execute on function public.delete_training_log(uuid) to authenticated;
