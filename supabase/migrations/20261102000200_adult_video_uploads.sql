-- =============================================================================
-- Video uploads are for athletes 18 and older (decision F40)
--
-- The founder, 2026-10-29: video uploads are "Only 18+". Until now the video
-- switch opened uploads for every athlete. A clip can now be started only for
-- an athlete whose recorded date of birth shows 18 or older, whoever uploads it
-- (the athlete, a parent or a development coach). An unknown age counts as
-- under 18. Clips already stored are untouched and can still be viewed and
-- deleted. Opening uploads to under-18s waits for counsel (L9) and the founder.
-- =============================================================================

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


-- Whether clips can be uploaded for this athlete now, for people who can work on their assessments.
create function public.assessment_video_open(p_athlete_id uuid) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if p_athlete_id is null or not private.can_work_on_assessments(v_uid, p_athlete_id) then
    raise exception 'athlete not found' using errcode = 'BR002';
  end if;
  return private.assessment_video_enabled() and private.is_adult(p_athlete_id);
end;
$$;
comment on function public.assessment_video_open(uuid) is
  'Whether video uploads are on and open to this athlete (18 and older only, decision F40).';
revoke all on function public.assessment_video_open(uuid) from public, anon, authenticated, service_role;
grant execute on function public.assessment_video_open(uuid) to authenticated;
