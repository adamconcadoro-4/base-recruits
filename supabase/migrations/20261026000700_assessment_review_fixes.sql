-- Base Recruits Assessment: fixes from the independent review (2026-10-26).
--
--  1. Removing a clip (and deleting a draft) works whatever the switch, deletes
--     the clip's markers, notes and the timing values taken from them, and
--     returns the path so the server deletes the file. (The app now deletes
--     files with the server's storage key: the storage read policy hides
--     removed clips, so a user-scoped delete could not see them.)
--  2. begin_assessment_deletion checks a draft can be deleted, under lock,
--     before any clip is removed.
--  3. A development coach whose earlier connection ended (for example when a
--     guardian ended the family link) can reconnect with a new code; dead links
--     no longer count toward the limit; declining revokes any grant.
--  4. The athlete's side cannot overwrite a value the development coach
--     entered (it already could not delete one).
--  5. Timing from markers requires both markers on the chosen repetition.
--  6. create_reassessment locks the athlete before counting open drafts.

-- -----------------------------------------------------------------------------
-- 1. Removing a clip
-- -----------------------------------------------------------------------------
create or replace function public.remove_assessment_media(p_media_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_media public.assessment_media%rowtype;
  v_row public.assessments%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  -- Deliberately not gated on the Assessment switch: people can always delete their video.
  select * into v_media from public.assessment_media m where m.id = p_media_id and m.status <> 'removed';
  if not found then
    raise exception 'clip not found' using errcode = 'BR003';
  end if;
  select * into v_row from public.assessments a where a.id = v_media.assessment_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_row.athlete_id) then
    raise exception 'clip not found' using errcode = 'BR003';
  end if;
  -- Timing values measured from this clip's markers go with it, then the markers, notes and drawings.
  delete from public.assessment_observations o where o.media_id = p_media_id;
  delete from public.assessment_annotations n where n.media_id = p_media_id;
  update public.assessment_repetitions r set media_id = null where r.media_id = p_media_id;
  update public.assessment_training_logs t set media_id = null where t.media_id = p_media_id;
  update public.assessment_media m set status = 'removed', removed_at = now() where m.id = p_media_id;
  perform private.log_audit('assessment.clip_removed', 'assessment_media', p_media_id::text, v_row.athlete_id, '{}'::jsonb, v_uid);
  return v_media.storage_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Deleting a draft: check first, then remove its clips, then delete
-- -----------------------------------------------------------------------------
create function private.assessment_for_deletion(p_assessment_id uuid) returns public.assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select * into v_row from public.assessments a where a.id = p_assessment_id for update;
  if not found or not private.can_work_on_assessments(v_uid, v_row.athlete_id) then
    raise exception 'assessment not found' using errcode = 'BR003';
  end if;
  if v_row.status = 'published' or v_row.current_revision_id is not null
     or exists (select 1 from public.assessment_report_revisions r where r.assessment_id = p_assessment_id) then
    raise exception 'published assessments are kept; reopen it to make corrections instead' using errcode = 'BR004';
  end if;
  return v_row;
end;
$$;
revoke all on function private.assessment_for_deletion(uuid) from public;

-- Marks every clip of a deletable draft removed and returns all of its storage
-- paths (including clips removed earlier, so a failed file deletion can be retried).
create function public.begin_assessment_deletion(p_assessment_id uuid) returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
begin
  v_row := private.assessment_for_deletion(p_assessment_id);
  update public.assessment_media m set status = 'removed', removed_at = now()
   where m.assessment_id = p_assessment_id and m.status <> 'removed';
  return query select m.storage_path from public.assessment_media m where m.assessment_id = p_assessment_id order by m.created_at;
end;
$$;

create or replace function public.delete_assessment(p_assessment_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessments%rowtype;
begin
  v_row := private.assessment_for_deletion(p_assessment_id);
  if exists (select 1 from public.assessment_media m where m.assessment_id = p_assessment_id and m.status in ('pending', 'uploaded')) then
    raise exception 'remove this assessment''s clips first' using errcode = 'BR004';
  end if;
  delete from public.assessments a where a.id = p_assessment_id;
  perform private.log_audit('assessment.deleted', 'assessment', p_assessment_id::text, v_row.athlete_id, '{}'::jsonb, null);
end;
$$;

revoke all on function public.begin_assessment_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_assessment_deletion(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Development coach connections
-- -----------------------------------------------------------------------------
create or replace function public.redeem_development_coach_invite(p_code text)
returns table (outcome text, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.development_coach_invites%rowtype;
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  perform private.require_assessment_enabled();
  if not private.has_role(v_uid, 'development_coach') or private.has_role(v_uid, 'coach') then
    raise exception 'only development coach accounts can use this code' using errcode = 'BR002';
  end if;
  if not private.is_eligible_development_coach(v_uid) then
    raise exception 'development coach accounts must belong to an adult; complete the age step first' using errcode = 'BR004';
  end if;

  if (select count(*) from public.audit_events e
       where e.actor_id = v_uid and e.action = 'assessment.coach_invite_redeem_failed'
         and e.occurred_at > now() - interval '1 hour') >= 10 then
    outcome := 'too_many_attempts';
    link_id := null;
    return next;
    return;
  end if;

  select * into v_invite
    from public.development_coach_invites i
   where i.code_hash = private.family_code_hash(p_code)
     and i.redeemed_at is null and i.cancelled_at is null and i.expires_at > now()
   for update;

  if not found or v_invite.athlete_id = v_uid then
    perform private.log_audit('assessment.coach_invite_redeem_failed', 'development_coach_invite', null, null, '{}'::jsonb, v_uid);
    outcome := 'invalid_or_expired';
    link_id := null;
    return next;
    return;
  end if;

  perform 1 from public.athletes a where a.user_id = v_invite.athlete_id for update;

  -- A connection that has ended in effect (its grant was revoked, for example when a guardian
  -- ended the family link) is closed, so this code starts a fresh request.
  update public.development_coach_links l
     set status = 'ended', ended_at = now(), ended_by = v_uid
   where l.athlete_id = v_invite.athlete_id and l.coach_id = v_uid and l.status = 'approved'
     and private.development_coach_link_access(l) = 'ended';

  select l.id into v_link from public.development_coach_links l
   where l.athlete_id = v_invite.athlete_id and l.coach_id = v_uid
     and l.status in ('pending_athlete_approval', 'approved');

  if v_link is not null and exists (select 1 from public.development_coach_links l
                                     where l.id = v_link and l.status = 'approved') then
    outcome := 'already_connected';
    link_id := v_link;
    return next;
    return;
  end if;

  if v_link is null then
    if (select count(*) from public.development_coach_links l
         where l.athlete_id = v_invite.athlete_id and l.status in ('pending_athlete_approval', 'approved')
           and private.development_coach_link_access(l) <> 'ended') >= 5 then
      outcome := 'athlete_link_limit_reached';
      link_id := null;
      return next;
      return;
    end if;
    insert into public.development_coach_links (athlete_id, coach_id)
    values (v_invite.athlete_id, v_uid)
    returning id into v_link;
  end if;

  update public.development_coach_invites i
     set redeemed_at = now(), redeemed_by = v_uid
   where i.id = v_invite.id;

  perform private.log_audit('assessment.coach_invite_redeemed', 'development_coach_link', v_link::text,
                            v_invite.athlete_id, '{}'::jsonb, v_uid);
  outcome := 'pending_athlete_approval';
  link_id := v_link;
  return next;
end;
$$;

create or replace function public.decline_development_coach_link(p_link_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.development_coach_links%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  update public.development_coach_links l
     set status = 'declined', ended_at = now(), ended_by = v_uid
   where l.id = p_link_id and l.athlete_id = v_uid and l.status = 'pending_athlete_approval'
  returning * into v_link;
  if not found then
    raise exception 'request not found or not waiting for you' using errcode = 'BR003';
  end if;
  -- No access survives a declined request, however a grant was made.
  update public.consent_grants g
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid, revocation_reason = 'withdrawn_by_athlete'
   where g.athlete_id = v_uid and g.scope = 'development_coach_access'
     and g.grantee_id = v_link.coach_id and g.status in ('pending_guardian', 'active');
  perform private.log_audit('assessment.coach_link_declined', 'development_coach_link', p_link_id::text, v_uid, '{}'::jsonb, v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. The athlete's side cannot overwrite the development coach's values
-- -----------------------------------------------------------------------------
create or replace function public.record_assessment_observation(
  p_assessment_id uuid,
  p_metric_key text,
  p_repetition_id uuid,
  p_value numeric,
  p_unable_to_assess boolean,
  p_quality_reason text,
  p_evidence_category text,
  p_device_kind text,
  p_device_label text,
  p_source_timestamp timestamptz,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessments%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_rep public.assessment_repetitions%rowtype;
  v_source text;
  v_unable boolean := coalesce(p_unable_to_assess, false);
  v_value numeric := p_value;
  v_evidence text := p_evidence_category;
  v_reason text := nullif(btrim(p_quality_reason), '');
  v_problem text;
  v_id uuid;
  v_quality text;
begin
  v_row := private.assessment_for_work(p_assessment_id, true);
  v_definition := private.assessment_protocol_metric(v_row, p_metric_key);
  v_source := private.assessment_source_kind(v_row.athlete_id);

  if v_evidence is null and cardinality(v_definition.evidence) = 1 then
    v_evidence := v_definition.evidence[1];
  end if;
  if v_evidence is null or not (v_evidence = any (v_definition.evidence)) then
    raise exception 'that kind of evidence is not accepted for this metric' using errcode = 'BR003';
  end if;

  if v_definition.granularity = 'assessment' then
    if p_repetition_id is not null then
      raise exception 'this metric is rated once for the whole assessment' using errcode = 'BR003';
    end if;
  else
    select * into v_rep from public.assessment_repetitions r where r.id = p_repetition_id and r.assessment_id = p_assessment_id;
    if not found then
      raise exception 'choose a repetition in this assessment' using errcode = 'BR003';
    end if;
    if v_definition.per_pitch_type and v_rep.pitch_type is null then
      raise exception 'set the pitch type for this repetition first' using errcode = 'BR003';
    end if;
  end if;

  if v_unable then
    v_value := null;
    if v_reason is null or char_length(v_reason) not between 3 and 300 then
      raise exception 'say why this could not be assessed (3 to 300 characters)' using errcode = 'BR003';
    end if;
    v_quality := 'unable_to_assess';
  else
    v_problem := private.assessment_value_problem(v_definition, v_value);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'BR003';
    end if;
    v_reason := null;
    -- A development coach's own entry counts as reviewed; self-entered values wait for review.
    v_quality := case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end;
  end if;

  if v_definition.requires_device and not v_unable then
    if p_device_kind is null or p_device_kind not in ('radar', 'ball_tracking', 'bat_sensor', 'motion_capture', 'force_plate', 'other')
       or char_length(coalesce(btrim(p_device_label), '')) not between 1 and 80 then
      raise exception 'measured values need the kind of device and its name' using errcode = 'BR003';
    end if;
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'the note is longer than 500 characters' using errcode = 'BR003';
  end if;

  if v_definition.granularity = 'assessment' then
    select o.id into v_id from public.assessment_observations o
     where o.assessment_id = p_assessment_id and o.metric_key = p_metric_key
       and o.source_kind = v_source and o.repetition_id is null
     for update;
  else
    select o.id into v_id from public.assessment_observations o
     where o.repetition_id = p_repetition_id and o.metric_key = p_metric_key
     for update;
  end if;

  if v_id is not null and v_source = 'self' and exists (
       select 1 from public.assessment_observations o where o.id = v_id and o.source_kind = 'development_coach') then
    raise exception 'only the development coach can change the coach''s values' using errcode = 'BR002';
  end if;

  if v_id is null then
    insert into public.assessment_observations (
      assessment_id, repetition_id, metric_key, metric_version, value, unit, evidence_category, entry_method,
      source_kind, quality_state, quality_reason, device_kind, device_label, source_timestamp, note, entered_by,
      reviewed_by, reviewed_at)
    values (
      p_assessment_id, p_repetition_id, v_definition.key, v_definition.version, v_value, v_definition.unit, v_evidence,
      'manual_entry', v_source, v_quality, v_reason,
      case when v_definition.requires_device and not v_unable then p_device_kind end,
      case when v_definition.requires_device and not v_unable then btrim(p_device_label) end,
      p_source_timestamp, nullif(btrim(p_note), ''), v_uid,
      case when v_source = 'development_coach' then v_uid end,
      case when v_source = 'development_coach' then now() end)
    returning id into v_id;
  else
    update public.assessment_observations o
       set value = v_value, metric_version = v_definition.version, unit = v_definition.unit,
           evidence_category = v_evidence, entry_method = 'manual_entry', source_kind = v_source,
           quality_state = v_quality, quality_reason = v_reason,
           device_kind = case when v_definition.requires_device and not v_unable then p_device_kind end,
           device_label = case when v_definition.requires_device and not v_unable then btrim(p_device_label) end,
           source_value = null, source_unit = null, media_id = null, start_annotation_id = null,
           end_annotation_id = null, import_batch_id = null, source_row = null, dedupe_key = null,
           source_timestamp = p_source_timestamp, note = nullif(btrim(p_note), ''), entered_by = v_uid,
           reviewed_by = case when v_source = 'development_coach' then v_uid end,
           reviewed_at = case when v_source = 'development_coach' then now() end
     where o.id = v_id;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Timing from markers: both markers on the chosen repetition
-- -----------------------------------------------------------------------------
create or replace function public.record_interval_from_markers(
  p_repetition_id uuid,
  p_metric_key text,
  p_start_annotation_id uuid,
  p_end_annotation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rep public.assessment_repetitions%rowtype;
  v_row public.assessments%rowtype;
  v_definition public.assessment_metric_definitions%rowtype;
  v_start public.assessment_annotations%rowtype;
  v_end public.assessment_annotations%rowtype;
  v_media public.assessment_media%rowtype;
  v_source text;
  v_interval numeric;
  v_problem text;
  v_id uuid;
begin
  select * into v_rep from public.assessment_repetitions r where r.id = p_repetition_id;
  v_row := private.assessment_for_work(v_rep.assessment_id, true);
  v_definition := private.assessment_protocol_metric(v_row, p_metric_key);
  if v_definition.marker_start is null then
    raise exception 'this metric is not measured from video markers' using errcode = 'BR003';
  end if;
  select * into v_start from public.assessment_annotations n where n.id = p_start_annotation_id and n.assessment_id = v_row.id;
  select * into v_end from public.assessment_annotations n where n.id = p_end_annotation_id and n.assessment_id = v_row.id;
  if v_start.id is null or v_end.id is null or v_start.media_id <> v_end.media_id
     or v_start.repetition_id is distinct from p_repetition_id or v_end.repetition_id is distinct from p_repetition_id
     or v_start.event_type is distinct from v_definition.marker_start or v_end.event_type is distinct from v_definition.marker_end then
    raise exception 'mark both required moments on this repetition, on the same clip' using errcode = 'BR003';
  end if;
  select * into v_media from public.assessment_media m where m.id = v_start.media_id and m.status = 'uploaded';
  if not found then
    raise exception 'that clip is no longer available' using errcode = 'BR004';
  end if;
  if v_media.timing_basis = 'unknown' then
    raise exception 'say whether this clip plays at real speed before measuring timing from it' using errcode = 'BR004';
  end if;
  if v_end.time_ms <= v_start.time_ms then
    raise exception 'the second marker must come after the first' using errcode = 'BR003';
  end if;
  v_interval := round((v_end.time_ms - v_start.time_ms)::numeric / coalesce(v_media.slowdown_factor, 1), 1);
  v_problem := private.assessment_value_problem(v_definition, v_interval);
  if v_problem is not null then
    raise exception 'the marked interval is not plausible: %', v_problem using errcode = 'BR003';
  end if;
  v_source := private.assessment_source_kind(v_row.athlete_id);

  select o.id into v_id from public.assessment_observations o
   where o.repetition_id = p_repetition_id and o.metric_key = p_metric_key for update;
  if v_id is not null and v_source = 'self' and exists (
       select 1 from public.assessment_observations o where o.id = v_id and o.source_kind = 'development_coach') then
    raise exception 'only the development coach can change the coach''s values' using errcode = 'BR002';
  end if;
  if v_id is null then
    insert into public.assessment_observations (
      assessment_id, repetition_id, metric_key, metric_version, value, unit, evidence_category, entry_method,
      source_kind, quality_state, media_id, start_annotation_id, end_annotation_id, entered_by, reviewed_by, reviewed_at)
    values (
      v_row.id, p_repetition_id, v_definition.key, v_definition.version, v_interval, v_definition.unit, 'video_estimate',
      'in_app_review', v_source, case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end,
      v_media.id, v_start.id, v_end.id, v_uid,
      case when v_source = 'development_coach' then v_uid end, case when v_source = 'development_coach' then now() end)
    returning id into v_id;
  else
    update public.assessment_observations o
       set value = v_interval, metric_version = v_definition.version, unit = v_definition.unit,
           evidence_category = 'video_estimate', entry_method = 'in_app_review', source_kind = v_source,
           quality_state = case when v_source = 'development_coach' then 'usable' else 'not_reviewed' end,
           quality_reason = null, device_kind = null, device_label = null, source_value = null, source_unit = null,
           media_id = v_media.id, start_annotation_id = v_start.id, end_annotation_id = v_end.id,
           import_batch_id = null, source_row = null, dedupe_key = null, entered_by = v_uid,
           reviewed_by = case when v_source = 'development_coach' then v_uid end,
           reviewed_at = case when v_source = 'development_coach' then now() end
     where o.id = v_id;
  end if;
  update public.assessment_repetitions r set media_id = coalesce(r.media_id, v_media.id) where r.id = p_repetition_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Reassessment counts open drafts under the athlete lock
-- -----------------------------------------------------------------------------
create or replace function public.create_reassessment(p_previous_id uuid, p_assessment_date date) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_previous public.assessments%rowtype;
  v_id uuid;
begin
  v_previous := private.assessment_for_work(p_previous_id, false);
  if v_previous.current_revision_id is null then
    raise exception 'publish this assessment before creating its reassessment' using errcode = 'BR004';
  end if;
  if not exists (select 1 from public.assessment_protocols p
                  where p.key = v_previous.protocol_key and p.version = v_previous.protocol_version and p.active) then
    raise exception 'this protocol version has been retired; start a new assessment instead' using errcode = 'BR004';
  end if;
  if p_assessment_date is null or p_assessment_date > private.today_utc() + 1
     or p_assessment_date < v_previous.assessment_date then
    raise exception 'choose a date on or after the previous assessment and not in the future' using errcode = 'BR003';
  end if;
  perform 1 from public.athletes a where a.user_id = v_previous.athlete_id for update;
  if (select count(*) from public.assessments a
       where a.athlete_id = v_previous.athlete_id and a.status <> 'published') >= 30 then
    raise exception 'too many unfinished assessments; publish or delete some first' using errcode = 'BR005';
  end if;
  insert into public.assessments (
    athlete_id, discipline, mode, protocol_key, protocol_version, assessment_date, age_band,
    competition_level, bats, throws, drill_type, equipment, bat_details, camera_views, environment, surface,
    rep_goal, baseline_assessment_id, reassessment_of_id, created_by)
  values (
    v_previous.athlete_id, v_previous.discipline, v_previous.mode, v_previous.protocol_key, v_previous.protocol_version,
    p_assessment_date, private.assessment_age_band(v_previous.athlete_id, p_assessment_date),
    v_previous.competition_level, v_previous.bats, v_previous.throws, v_previous.drill_type, v_previous.equipment,
    v_previous.bat_details, v_previous.camera_views, v_previous.environment, v_previous.surface,
    v_previous.rep_goal, v_previous.id, v_previous.id, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
