-- =============================================================================
-- SeamState gets its own page, separate from Assessment (2026-11-03)
--
-- The founder, 2026-11-03: "Can you separate seam state from assment" and
-- "Make the new one named seamstate". Swing analysis is called SeamState on the
-- site again (reversing F59's "Assessment swing analysis" wording), and a
-- player can upload a clip for it without starting an assessment.
--
-- How: SeamState clips live in one hidden holder row per athlete in
-- public.assessments, marked purpose = 'seamstate_clips'. That keeps the
-- upload checks (18+ only, F40), private storage paths, row-level security,
-- the worker and every SeamState table exactly as they are. The holder never
-- leaves draft, so it never becomes a report, a baseline or a progress point,
-- and the site leaves it out of assessment lists.
--
-- Also: the consent description and the people-facing messages of the
-- request and settings functions say SeamState again (bodies otherwise the
-- ones from 20261102000600), and the upload's clip-count message names
-- SeamState clips when it is the holder that is full (body otherwise the one
-- from 20261102000200).
-- =============================================================================

alter table public.assessments
  add column purpose text not null default 'assessment'
    constraint assessments_purpose check (purpose in ('assessment', 'seamstate_clips'));
comment on column public.assessments.purpose is
  'assessment: a real assessment. seamstate_clips: the one hidden holder for an athlete''s SeamState clips (never published or reviewed).';
create unique index assessments_one_seamstate_holder on public.assessments (athlete_id) where purpose = 'seamstate_clips';

-- The holder stays a draft holder, and a real assessment never becomes one.
create function private.assessment_purpose_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.purpose is distinct from old.purpose then
    raise exception 'an assessment''s purpose cannot change' using errcode = 'BR004';
  end if;
  if old.purpose = 'seamstate_clips' and new.status <> 'draft' then
    raise exception 'SeamState clips are not an assessment, so they cannot be sent for review or published' using errcode = 'BR004';
  end if;
  return new;
end;
$$;
revoke all on function private.assessment_purpose_guard() from public;
create trigger assessments_purpose_guard before update on public.assessments
  for each row execute function private.assessment_purpose_guard();

-- The athlete's SeamState clip holder, created the first time it is needed.
-- Only for people who can work on the athlete's assessments, and only while
-- clips could be uploaded for the athlete (video on, athlete 18 or older).
create function public.seamstate_clip_home(p_athlete_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_protocol public.assessment_protocols%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if p_athlete_id is null or not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR003';
  end if;
  select a.id into v_id from public.assessments a where a.athlete_id = p_athlete_id and a.purpose = 'seamstate_clips';
  if found then
    return v_id;
  end if;
  if not private.assessment_video_enabled() then
    raise exception 'video uploads are not switched on yet' using errcode = 'BR004';
  end if;
  if not private.is_adult(p_athlete_id) then
    raise exception 'video uploads are for athletes 18 and older' using errcode = 'BR004';
  end if;
  select * into v_protocol from public.assessment_protocols p
   where p.discipline = 'hitting' and p.mode = 'video_coach' and p.active
   order by p.version desc
   limit 1;
  if not found then
    raise exception 'SeamState is not available yet' using errcode = 'BR004';
  end if;

  perform 1 from public.athletes a where a.user_id = p_athlete_id for update;
  insert into public.assessments (athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date, age_band,
                                  rep_goal, notes, purpose, created_by)
  values (p_athlete_id, 'hitting', v_protocol.mode, v_protocol.key, v_protocol.version, private.today_utc(),
          private.assessment_age_band(p_athlete_id, private.today_utc()), 1, 'SeamState clips', 'seamstate_clips', v_uid)
  on conflict (athlete_id) where purpose = 'seamstate_clips' do nothing
  returning id into v_id;
  if v_id is null then
    select a.id into v_id from public.assessments a where a.athlete_id = p_athlete_id and a.purpose = 'seamstate_clips';
  end if;
  return v_id;
end;
$$;
comment on function public.seamstate_clip_home(uuid) is
  'The athlete''s hidden SeamState clip holder (created on first use), so a clip can be analyzed without starting an assessment.';
revoke all on function public.seamstate_clip_home(uuid) from public, anon, authenticated, service_role;
grant execute on function public.seamstate_clip_home(uuid) to authenticated;

-- Clip-count message names SeamState clips for the holder.
create or replace function public.begin_assessment_upload(
  p_assessment_id uuid,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_camera_view text,
  p_timing_basis text,
  p_slowdown_factor numeric,
  p_label text
) returns table (media_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  v_row := private.assessment_for_work(p_assessment_id, false);
  if not private.assessment_video_enabled() then
    raise exception 'video uploads are not switched on yet' using errcode = 'BR004';
  end if;
  if not private.is_adult(v_row.athlete_id) then
    raise exception 'video uploads are for athletes 18 and older' using errcode = 'BR004';
  end if;
  if p_mime_type is null or p_mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
    raise exception 'upload an MP4, MOV or WebM video' using errcode = 'BR003';
  end if;
  if p_byte_size is null or p_byte_size not between 1 and 209715200 then
    raise exception 'videos can be up to 200 MB' using errcode = 'BR003';
  end if;
  if p_camera_view is not null and p_camera_view not in ('side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other') then
    raise exception 'choose a camera view from the list' using errcode = 'BR003';
  end if;
  if coalesce(p_timing_basis, '') not in ('real_time', 'slow_motion', 'unknown') then
    raise exception 'say whether the clip plays at real speed' using errcode = 'BR003';
  end if;
  if (p_timing_basis = 'slow_motion') <> (p_slowdown_factor is not null)
     or (p_slowdown_factor is not null and p_slowdown_factor not between 2 and 32) then
    raise exception 'for slow motion, enter how many times slower it plays (2 to 32)' using errcode = 'BR003';
  end if;
  if char_length(coalesce(p_label, '')) > 80 or char_length(coalesce(p_file_name, '')) > 160 then
    raise exception 'the clip name is too long' using errcode = 'BR003';
  end if;
  if (select count(*) from public.assessment_media m where m.assessment_id = p_assessment_id and m.status <> 'removed') >= 30 then
    if v_row.purpose = 'seamstate_clips' then
      raise exception 'you can keep up to 30 SeamState clips; remove one you no longer need, then try again' using errcode = 'BR005';
    end if;
    raise exception 'an assessment can have at most 30 clips' using errcode = 'BR005';
  end if;
  if (select count(*) from public.assessment_media m
       where m.created_by = v_uid and m.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'too many uploads in the last hour; please wait and try again' using errcode = 'BR005';
  end if;

  v_path := v_row.athlete_id::text || '/' || v_row.id::text || '/' || v_id::text || '.'
            || case p_mime_type when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' else 'webm' end;
  insert into public.assessment_media
    (id, assessment_id, athlete_id, storage_path, original_name, mime_type, byte_size, camera_view, timing_basis,
     slowdown_factor, label, created_by)
  values
    (v_id, v_row.id, v_row.athlete_id, v_path, nullif(btrim(p_file_name), ''), p_mime_type, p_byte_size, p_camera_view,
     p_timing_basis, p_slowdown_factor, nullif(btrim(p_label), ''), v_uid);
  media_id := v_id;
  storage_path := v_path;
  return next;
end;
$$;

-- The name people see is SeamState again.
update public.consent_scope_rules
   set description = 'Let Base Recruits send still frames from your swing videos, cropped to the hitter and without your name, to its AI analysis provider to create SeamState swing reports.'
 where scope = 'seamstate_analysis';

create or replace function public.admin_set_seamstate_settings(
  p_enabled boolean, p_daily_limit integer, p_monthly_limit integer, p_minors_enabled boolean default false,
  p_person_monthly_limit integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_person_monthly integer;
begin
  if p_enabled is null or p_daily_limit is null or p_monthly_limit is null or p_minors_enabled is null then
    raise exception 'the switches and both limits need a value' using errcode = 'BR003';
  end if;
  if p_daily_limit not between 0 and 100 then
    raise exception 'the daily limit per person must be 0 to 100' using errcode = 'BR003';
  end if;
  if p_person_monthly_limit is not null and p_person_monthly_limit not between 0 and 100 then
    raise exception 'the monthly limit per person must be 0 to 100' using errcode = 'BR003';
  end if;
  if p_monthly_limit not between 0 and 100000 then
    raise exception 'the monthly limit must be 0 to 100,000' using errcode = 'BR003';
  end if;
  if p_enabled and not private.assessment_video_enabled() then
    raise exception 'turn on Assessment and its video uploads first' using errcode = 'BR003';
  end if;
  if p_enabled and not coalesce((select s.outside_analysis_disclosed from private.seamstate_settings s where s.id), false) then
    raise exception 'SeamState cannot be turned on while the site promises video is never sent to an outside analysis service'
      using errcode = 'BR004';
  end if;
  select coalesce(p_person_monthly_limit, s.per_person_monthly_limit) into v_person_monthly from private.seamstate_settings s where s.id;
  update private.seamstate_settings s
     set analysis_enabled = p_enabled, per_person_daily_limit = p_daily_limit, per_person_monthly_limit = v_person_monthly,
         monthly_limit = p_monthly_limit, minors_enabled = p_minors_enabled, updated_at = now(), updated_by = v_uid
   where s.id;
  perform private.log_audit('seamstate.settings_changed', 'seamstate_settings', null, null,
                            jsonb_build_object('enabled', p_enabled, 'daily_limit', p_daily_limit, 'person_monthly_limit', v_person_monthly,
                                               'monthly_limit', p_monthly_limit, 'minors_enabled', p_minors_enabled), v_uid);
end;
$$;

create or replace function public.seamstate_request_analysis(p_media_id uuid, p_context jsonb, p_idempotency_key text)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_media public.assessment_media%rowtype;
  v_assessment public.assessments%rowtype;
  v_settings private.seamstate_settings%rowtype;
  v_problem text;
  v_job public.seamstate_jobs%rowtype;
  v_capture uuid;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status <> 'removed';
  v_assessment := private.assessment_for_work(v_media.assessment_id, false);
  if not private.seamstate_enabled() then
    raise exception 'SeamState is not switched on yet' using errcode = 'BR004';
  end if;
  if v_assessment.discipline <> 'hitting' then
    raise exception 'SeamState works on hitting clips only for now' using errcode = 'BR003';
  end if;
  if not private.seamstate_open_to(v_media.athlete_id) then
    raise exception 'SeamState works on clips of hitters 18 and older for now' using errcode = 'BR004';
  end if;
  if v_media.status <> 'uploaded' then
    raise exception 'the video has not finished uploading' using errcode = 'BR004';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'request key is missing; refresh the page and try again' using errcode = 'BR003';
  end if;
  v_problem := private.seamstate_context_problem(p_context);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'BR003';
  end if;

  -- Serialize requests per athlete.
  perform 1 from public.athletes a where a.user_id = v_media.athlete_id for update;

  -- The same request sent twice (a double tap, a retried network call).
  select * into v_job from public.seamstate_jobs j where j.requested_by = v_uid and j.idempotency_key = p_idempotency_key;
  if found then
    if (select c.media_id from public.seamstate_captures c where c.id = v_job.capture_id) is distinct from p_media_id then
      raise exception 'this request was already used for another clip; refresh the page and try again' using errcode = 'BR003';
    end if;
    job_id := v_job.id;
    created := false;
    return next;
    return;
  end if;

  -- An analysis of this clip is already under way.
  select j.* into v_job
    from public.seamstate_jobs j join public.seamstate_captures c on c.id = j.capture_id
   where c.media_id = p_media_id and j.state in ('queued', 'preprocessing', 'analyzing', 'needs_input')
   order by j.created_at desc
   limit 1;
  if found then
    job_id := v_job.id;
    created := false;
    return next;
    return;
  end if;

  if not private.has_active_grant(v_media.athlete_id, 'seamstate_analysis', 'outside_service') then
    if exists (select 1 from public.consent_grants g
                where g.athlete_id = v_media.athlete_id and g.scope = 'seamstate_analysis' and g.status = 'pending_guardian') then
      raise exception 'a parent or legal guardian needs to approve SeamState first' using errcode = 'BR004';
    end if;
    raise exception 'the athlete has not allowed SeamState yet' using errcode = 'BR004';
  end if;

  select * into v_settings from private.seamstate_settings s where s.id;
  if (select count(*) from private.seamstate_request_log l
       where l.requested_by = v_uid and l.requested_at > now() - interval '24 hours') >= v_settings.per_person_daily_limit then
    raise exception 'you have reached today''s limit of % swing analyses; please try again tomorrow', v_settings.per_person_daily_limit
      using errcode = 'BR005';
  end if;
  if (select count(*) from private.seamstate_request_log l
       where l.requested_by = v_uid and l.requested_at > now() - interval '30 days') >= v_settings.per_person_monthly_limit then
    raise exception 'you have reached your limit of % swing analyses in 30 days; please try again later this month', v_settings.per_person_monthly_limit
      using errcode = 'BR005';
  end if;
  insert into private.seamstate_monthly_usage (month) values (v_month) on conflict (month) do nothing;
  select u.analyses into v_used from private.seamstate_monthly_usage u where u.month = v_month for update;
  if v_used >= v_settings.monthly_limit then
    raise exception 'SeamState has reached its limit for this month; please try again later' using errcode = 'BR005';
  end if;
  update private.seamstate_monthly_usage u set analyses = u.analyses + 1 where u.month = v_month;
  insert into private.seamstate_request_log (requested_by) values (v_uid);

  insert into public.seamstate_captures
    (assessment_id, media_id, athlete_id, protocol_version, setting, batting_side, camera_view, setting_details,
     task, devices, limitations, created_by)
  values
    (v_assessment.id, p_media_id, v_media.athlete_id, p_context ->> 'protocolVersion', p_context #>> '{setting,setting}',
     p_context ->> 'battingSide', p_context ->> 'cameraView', (p_context -> 'setting') - 'setting',
     nullif(btrim(p_context ->> 'task'), ''),
     coalesce(array(select btrim(d) from jsonb_array_elements_text(coalesce(nullif(p_context -> 'devices', 'null'::jsonb), '[]'::jsonb)) d),
              '{}'::text[]),
     nullif(btrim(p_context ->> 'limitations'), ''), v_uid)
  returning id into v_capture;

  insert into public.seamstate_jobs (capture_id, athlete_id, requested_by, idempotency_key, pipeline_version)
  values (v_capture, v_media.athlete_id, v_uid, p_idempotency_key, 'seamstate-v1')
  returning id into v_id;

  job_id := v_id;
  created := true;
  return next;
end;
$$;
