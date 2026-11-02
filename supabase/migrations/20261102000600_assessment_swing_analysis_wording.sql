-- =============================================================================
-- Assessment swing analysis: the name people see (2026-11-02)
--
-- The founder renamed SeamState to Assessment on the site. This changes only
-- the words people read: the consent description and the messages the two
-- functions below show when a request or a settings change is refused (BR003
-- and BR004 messages are shown as written, and so is the BR005 site-wide limit
-- message). Function names, signatures, defaults, checks, tables and grants
-- are unchanged; each body is the one from 20261029000200 with only those
-- messages reworded.
-- =============================================================================

update public.consent_scope_rules
   set description = 'Let Base Recruits send still frames from your swing videos, cropped to the hitter and without your name, to its AI analysis provider to create Assessment swing reports.'
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
    raise exception 'Assessment swing analysis cannot be turned on while the site promises video is never sent to an outside analysis service'
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
    raise exception 'Assessment swing analysis is not switched on yet' using errcode = 'BR004';
  end if;
  if v_assessment.discipline <> 'hitting' then
    raise exception 'Assessment swing analysis works on hitting clips only for now' using errcode = 'BR003';
  end if;
  if not private.seamstate_open_to(v_media.athlete_id) then
    raise exception 'Assessment swing analysis works on clips of hitters 18 and older for now' using errcode = 'BR004';
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
      raise exception 'a parent or legal guardian needs to approve Assessment swing analysis first' using errcode = 'BR004';
    end if;
    raise exception 'the athlete has not allowed Assessment swing analysis yet' using errcode = 'BR004';
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
    raise exception 'Assessment swing analysis has reached its limit for this month; please try again later' using errcode = 'BR005';
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
