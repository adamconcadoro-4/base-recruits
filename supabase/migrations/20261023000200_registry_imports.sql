-- =============================================================================
-- Base Recruits — Stage 2 / Migration 2: import, review, publish and reconcile
--
-- Flow (all admin-only, all SECURITY DEFINER with a pinned search_path):
--   admin_create_import_job   -> a job in 'staging' for one snapshot file
--   admin_stage_import_rows   -> the snapshot's records, in chunks
--   admin_finalize_import_job -> validates every record and computes exactly
--                                what would change ('staged' for review)
--   admin_set_import_decision -> skip or re-include a row
--   admin_publish_import_job  -> applies the reviewed rows ('published')
--   admin_discard_import_job  -> drops a job without publishing it
--   admin_restage_import_job  -> copies an earlier job's records into a new
--                                job for review: republish / roll back
-- Reconcile: admin_update_baseball_program, admin_set_institution_listing.
-- =============================================================================

create function private.require_admin() returns uuid
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
  if not private.has_role(v_uid, 'admin') then
    raise exception 'admin role required' using errcode = 'BR002';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.require_admin() from public;

-- Tags the registry revisions written by the rest of this transaction.
create function private.set_registry_context(p_import_job_id uuid, p_reason text) returns void
language sql
security definer
set search_path = ''
as $$
  select set_config('base_recruits.import_job_id', coalesce(p_import_job_id::text, ''), true),
         set_config('base_recruits.change_reason', coalesce(left(p_reason, 1000), ''), true);
$$;
revoke all on function private.set_registry_context(uuid, text) from public;

-- Every leaf of a JSON object as (dotted path, value). Arrays are leaves.
create function private.jsonb_leaves(p_value jsonb, p_prefix text default '')
returns table (path text, value jsonb)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
  v_path text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return;
  end if;
  for v_key, v_child in select e.key, e.value from jsonb_each(p_value) e loop
    v_path := case when p_prefix = '' then v_key else p_prefix || '.' || v_key end;
    if jsonb_typeof(v_child) = 'object' then
      return query select l.path, l.value from private.jsonb_leaves(v_child, v_path) l;
    else
      path := v_path;
      value := v_child;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function private.jsonb_leaves(jsonb, text) from public;

-- The fields that differ between two records: {path: {"old": …, "new": …}}.
create function private.jsonb_changes(p_old jsonb, p_new jsonb) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(coalesce(o.path, n.path),
                                   jsonb_build_object('old', coalesce(o.value, 'null'::jsonb),
                                                      'new', coalesce(n.value, 'null'::jsonb))
                                   order by coalesce(o.path, n.path)), '{}'::jsonb)
    from private.jsonb_leaves(p_old) o
    full join private.jsonb_leaves(p_new) n on n.path = o.path
   where coalesce(o.value, 'null'::jsonb) is distinct from coalesce(n.value, 'null'::jsonb)
$$;
revoke all on function private.jsonb_changes(jsonb, jsonb) from public;

-- -----------------------------------------------------------------------------
-- The live registry state of one institution, in the snapshot record shape,
-- for the terms a job covers. Used to compute what an import would change.
-- -----------------------------------------------------------------------------
create function private.registry_record(p_institution_id uuid, p_admissions_term text, p_cost_year text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unitid', i.unitid,
    'institution_source', i.facts_source_id,
    'facts', jsonb_build_object(
      'name', i.name,
      'aliases', coalesce((select jsonb_agg(a.alias order by a.alias) from public.institution_aliases a
                            where a.institution_id = i.id), '[]'::jsonb),
      'city', i.city, 'state', i.state, 'zip', i.zip, 'ope8_id', i.ope8_id,
      'website_url', i.website_url, 'price_calculator_url', i.price_calculator_url,
      'control', i.control, 'level', i.level, 'predominant_degree', i.predominant_degree, 'setting', i.setting,
      'latitude', i.latitude, 'longitude', i.longitude,
      'undergraduate_enrollment', case when i.undergraduate_enrollment is null then null else
        jsonb_build_object('term', i.enrollment_term, 'scorecard_year', i.enrollment_source_year,
                           'value', i.undergraduate_enrollment) end),
    'baseball', (select jsonb_build_object(
                   'status', p.status, 'season', p.season, 'association', p.association_code, 'division', p.division_code,
                   'classification_code', p.classification_code, 'classification_name', p.classification_label,
                   'classification_other', p.classification_other, 'participants', p.reported_participants)
                   from public.baseball_programs p where p.institution_id = i.id),
    'admissions', (select jsonb_build_object(
                     'term', a.term, 'scorecard_year', a.source_year, 'admission_rate', a.admission_rate,
                     'test_policy', a.test_policy, 'sat_erw_25', a.sat_erw_25, 'sat_erw_75', a.sat_erw_75,
                     'sat_math_25', a.sat_math_25, 'sat_math_75', a.sat_math_75,
                     'act_composite_25', a.act_composite_25, 'act_composite_75', a.act_composite_75)
                     from public.admissions_statistics a
                    where a.institution_id = i.id and a.source_id = 'college_scorecard' and a.term = p_admissions_term),
    'costs', (select jsonb_build_object(
                'academic_year', c.academic_year, 'scorecard_year', c.source_year,
                'cost_of_attendance', c.cost_of_attendance, 'tuition_in_state', c.tuition_in_state,
                'tuition_out_of_state', c.tuition_out_of_state)
                from public.institution_costs c
               where c.institution_id = i.id and c.source_id = 'college_scorecard' and c.academic_year = p_cost_year))
  from public.institutions i
  where i.id = p_institution_id
$$;
revoke all on function private.registry_record(uuid, text, text) from public;

-- True when a JSON value is a number within [min, max] (and whole when asked).
-- A missing value or JSON null counts as valid only when nullable. Never casts
-- anything that is not a JSON number, so it cannot throw.
create function private.json_number_ok(p_value jsonb, p_min numeric, p_max numeric, p_whole boolean,
                                       p_nullable boolean default true) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_nullable;
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;
  v := (p_value #>> '{}')::numeric;
  return v between p_min and p_max and (not p_whole or v = trunc(v));
end;
$$;
revoke all on function private.json_number_ok(jsonb, numeric, numeric, boolean, boolean) from public;

-- True when a JSON value is absent/null (if nullable) or a string within a length range.
create function private.json_text_ok(p_value jsonb, p_min integer, p_max integer, p_nullable boolean default true) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
           when p_value is null or jsonb_typeof(p_value) = 'null' then p_nullable
           when jsonb_typeof(p_value) <> 'string' then false
           else length(p_value #>> '{}') between p_min and p_max
         end
$$;
revoke all on function private.json_text_ok(jsonb, integer, integer, boolean) from public;

-- -----------------------------------------------------------------------------
-- Validation of one snapshot record against the job it belongs to. Returns the
-- problems found (empty when the record can be applied as is). Every value is
-- type- and range-checked before anything casts it, so a record that passes
-- here cannot make publishing fail.
-- -----------------------------------------------------------------------------
create function private.import_record_problems(p_record jsonb, p_unitid integer, p_job public.data_import_jobs)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problems text[] := '{}';
  v_facts jsonb := p_record -> 'facts';
  v_base jsonb := p_record -> 'baseball';
  v_adm jsonb := nullif(p_record -> 'admissions', 'null'::jsonb);
  v_cost jsonb := nullif(p_record -> 'costs', 'null'::jsonb);
  v_enrollment jsonb;
  v_key text;
  v_alias jsonb;
  v_slug text;
begin
  if not private.json_number_ok(p_record -> 'unitid', p_unitid, p_unitid, true, false) then
    v_problems := array_append(v_problems, 'unitid does not match the row');
  end if;
  if coalesce(p_record ->> 'institution_source', '') not in ('college_scorecard', 'eada') then
    v_problems := array_append(v_problems, 'institution_source must be college_scorecard or eada');
  end if;

  -- facts
  if coalesce(jsonb_typeof(v_facts), '') <> 'object' then
    return array_append(v_problems, 'facts are missing');
  end if;
  if not private.json_text_ok(v_facts -> 'name', 2, 200, false) then
    v_problems := array_append(v_problems, 'name must be 2–200 characters');
  else
    v_slug := private.slugify(v_facts ->> 'name');
    if v_slug <> '' and v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      v_problems := array_append(v_problems, 'name does not produce a usable page address');
    end if;
  end if;
  if coalesce(jsonb_typeof(v_facts -> 'aliases'), '') <> 'array' then
    v_problems := array_append(v_problems, 'aliases must be a list');
  else
    for v_alias in select value from jsonb_array_elements(v_facts -> 'aliases') loop
      if not private.json_text_ok(v_alias, 2, 120, false) then
        v_problems := array_append(v_problems, 'each alias must be 2–120 characters');
      end if;
    end loop;
  end if;
  if not private.json_text_ok(v_facts -> 'state', 2, 2) or coalesce(v_facts ->> 'state', 'AA') !~ '^[A-Z]{2}$' then
    v_problems := array_append(v_problems, 'state must be a two-letter code');
  end if;
  if not private.json_text_ok(v_facts -> 'zip', 5, 10) or coalesce(v_facts ->> 'zip', '00000') !~ '^[0-9]{5}(-?[0-9]{4})?$' then
    v_problems := array_append(v_problems, 'zip is not a U.S. ZIP code');
  end if;
  if not private.json_text_ok(v_facts -> 'ope8_id', 8, 8) or coalesce(v_facts ->> 'ope8_id', '00000000') !~ '^[0-9]{8}$' then
    v_problems := array_append(v_problems, 'ope8_id must be 8 digits');
  end if;
  if not private.json_text_ok(v_facts -> 'city', 1, 100) then
    v_problems := array_append(v_problems, 'city must be text of at most 100 characters');
  end if;
  foreach v_key in array array['website_url', 'price_calculator_url'] loop
    if not private.json_text_ok(v_facts -> v_key, 1, 500) or not private.is_web_url(v_facts ->> v_key) then
      v_problems := array_append(v_problems, v_key || ' is not a web link');
    end if;
  end loop;
  if (v_facts ->> 'control') is not null and (v_facts ->> 'control') <> all (enum_range(null::public.institution_control)::text[]) then
    v_problems := array_append(v_problems, 'control is not a known value');
  end if;
  if (v_facts ->> 'level') is not null and (v_facts ->> 'level') <> all (enum_range(null::public.institution_level)::text[]) then
    v_problems := array_append(v_problems, 'level is not a known value');
  end if;
  if (v_facts ->> 'setting') is not null and (v_facts ->> 'setting') <> all (enum_range(null::public.campus_setting)::text[]) then
    v_problems := array_append(v_problems, 'setting is not a known value');
  end if;
  if (v_facts ->> 'predominant_degree') is not null
     and (v_facts ->> 'predominant_degree') not in ('certificate', 'associate', 'bachelors', 'graduate') then
    v_problems := array_append(v_problems, 'predominant_degree is not a known value');
  end if;
  if not private.json_number_ok(v_facts -> 'latitude', -90, 90, false) then
    v_problems := array_append(v_problems, 'latitude is out of range');
  end if;
  if not private.json_number_ok(v_facts -> 'longitude', -180, 180, false) then
    v_problems := array_append(v_problems, 'longitude is out of range');
  end if;
  v_enrollment := nullif(v_facts -> 'undergraduate_enrollment', 'null'::jsonb);
  if v_enrollment is not null then
    if jsonb_typeof(v_enrollment) <> 'object'
       or not private.json_text_ok(v_enrollment -> 'term', 9, 9, false) or (v_enrollment ->> 'term') !~ '^Fall [0-9]{4}$'
       or not private.json_number_ok(v_enrollment -> 'value', 0, 2000000, true, false)
       or not private.json_number_ok(v_enrollment -> 'scorecard_year', 1990, 2100, true, false) then
      v_problems := array_append(v_problems, 'undergraduate_enrollment needs a fall term, a data year and a whole number');
    end if;
  end if;

  -- baseball
  if coalesce(jsonb_typeof(v_base), '') <> 'object' then
    return array_append(v_problems, 'baseball program is missing');
  end if;
  if (v_base ->> 'season') is distinct from p_job.season then
    v_problems := array_append(v_problems, 'baseball season must be ' || p_job.season);
  end if;
  if not exists (select 1 from public.athletic_divisions d
                  where d.code = v_base ->> 'division' and d.association_code = v_base ->> 'association') then
    v_problems := array_append(v_problems, 'association and division are not a known pair');
  end if;
  if not private.json_number_ok(v_base -> 'participants', 1, 1000, true, false) then
    v_problems := array_append(v_problems, 'participants must be a whole number from 1 to 1,000');
  end if;
  if not private.json_text_ok(v_base -> 'classification_name', 1, 100) or not private.json_text_ok(v_base -> 'classification_other', 1, 100) then
    v_problems := array_append(v_problems, 'classification text must be at most 100 characters');
  end if;
  if not private.json_number_ok(v_base -> 'classification_code', 0, 999, true) then
    v_problems := array_append(v_problems, 'classification_code must be a whole number');
  end if;

  -- admissions
  if v_adm is not null then
    if jsonb_typeof(v_adm) <> 'object' then
      v_problems := array_append(v_problems, 'admissions must be an object');
    else
      if p_job.admissions_term is null or (v_adm ->> 'term') is distinct from p_job.admissions_term then
        v_problems := array_append(v_problems, 'admissions term must be ' || coalesce(p_job.admissions_term, 'absent for this import'));
      end if;
      if not private.json_number_ok(v_adm -> 'scorecard_year', 1990, 2100, true, false) then
        v_problems := array_append(v_problems, 'admissions need their data year');
      end if;
      if not private.json_number_ok(v_adm -> 'admission_rate', 0, 1, false) then
        v_problems := array_append(v_problems, 'admission_rate must be between 0 and 1');
      end if;
      if (v_adm ->> 'test_policy') is not null and (v_adm ->> 'test_policy') <> all (enum_range(null::public.test_policy)::text[]) then
        v_problems := array_append(v_problems, 'test_policy is not a known value');
      end if;
      foreach v_key in array array['sat_erw_25', 'sat_erw_75', 'sat_math_25', 'sat_math_75'] loop
        if not private.json_number_ok(v_adm -> v_key, 200, 800, true) then
          v_problems := array_append(v_problems, v_key || ' must be a whole number from 200 to 800');
        end if;
      end loop;
      foreach v_key in array array['act_composite_25', 'act_composite_75'] loop
        if not private.json_number_ok(v_adm -> v_key, 1, 36, true) then
          v_problems := array_append(v_problems, v_key || ' must be a whole number from 1 to 36');
        end if;
      end loop;
      if cardinality(v_problems) = 0 then
        if ((v_adm ->> 'sat_erw_25') is null) <> ((v_adm ->> 'sat_erw_75') is null)
           or ((v_adm ->> 'sat_math_25') is null) <> ((v_adm ->> 'sat_math_75') is null)
           or ((v_adm ->> 'act_composite_25') is null) <> ((v_adm ->> 'act_composite_75') is null) then
          v_problems := array_append(v_problems, 'score percentiles must come in 25th/75th pairs');
        elsif coalesce((v_adm ->> 'sat_erw_25')::numeric > (v_adm ->> 'sat_erw_75')::numeric, false)
           or coalesce((v_adm ->> 'sat_math_25')::numeric > (v_adm ->> 'sat_math_75')::numeric, false)
           or coalesce((v_adm ->> 'act_composite_25')::numeric > (v_adm ->> 'act_composite_75')::numeric, false) then
          v_problems := array_append(v_problems, '25th percentile is above the 75th');
        end if;
      end if;
    end if;
  end if;

  -- costs
  if v_cost is not null then
    if jsonb_typeof(v_cost) <> 'object' then
      v_problems := array_append(v_problems, 'costs must be an object');
    else
      if p_job.cost_year is null or (v_cost ->> 'academic_year') is distinct from p_job.cost_year then
        v_problems := array_append(v_problems, 'cost year must be ' || coalesce(p_job.cost_year, 'absent for this import'));
      end if;
      if not private.json_number_ok(v_cost -> 'scorecard_year', 1990, 2100, true, false) then
        v_problems := array_append(v_problems, 'costs need their data year');
      end if;
      foreach v_key in array array['cost_of_attendance', 'tuition_in_state', 'tuition_out_of_state'] loop
        if not private.json_number_ok(v_cost -> v_key, 0, 250000, true) then
          v_problems := array_append(v_problems, v_key || ' must be a whole number from 0 to 250,000');
        end if;
      end loop;
    end if;
  end if;

  return v_problems;
end;
$$;
revoke all on function private.import_record_problems(jsonb, integer, public.data_import_jobs) from public;

-- The record as it would be applied, given decisions administrators already made:
-- an administrator's status decision stands until a newer season arrives, and an
-- administrator-verified association/division is not overwritten by the
-- institution-level EADA classification. Returns the record and notes.
create function private.effective_import_record(p_record jsonb, p_institution_id uuid, p_season text,
                                                out effective jsonb, out notes text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program public.baseball_programs;
begin
  effective := jsonb_set(p_record, '{baseball,status}', '"active"');
  notes := '{}';
  if jsonb_typeof(effective -> 'facts' -> 'aliases') = 'array' then
    effective := jsonb_set(effective, '{facts,aliases}',
      coalesce((select jsonb_agg(distinct a) from jsonb_array_elements(effective -> 'facts' -> 'aliases') a), '[]'::jsonb));
  end if;
  select * into v_program from public.baseball_programs p where p.institution_id = p_institution_id;
  if not found then
    return;
  end if;
  if v_program.status_source = 'admin' and p_season <= coalesce(v_program.status_season, v_program.season) then
    effective := jsonb_set(effective, '{baseball,status}', to_jsonb(v_program.status));
    if v_program.status <> 'active' then
      notes := array_append(notes, format('keeps the administrator''s decision that the program is %s', v_program.status));
    end if;
  end if;
  if v_program.verification <> 'federal_report' then
    if (effective -> 'baseball' ->> 'association') is distinct from v_program.association_code
       or (effective -> 'baseball' ->> 'division') is distinct from v_program.division_code then
      notes := array_append(notes, format('EADA classification differs (%s); the administrator-verified division is kept — recheck it',
                               effective -> 'baseball' ->> 'classification_name'));
    end if;
    effective := jsonb_set(jsonb_set(effective, '{baseball,association}', to_jsonb(v_program.association_code)),
                        '{baseball,division}', to_jsonb(v_program.division_code));
  end if;
end;
$$;
revoke all on function private.effective_import_record(jsonb, uuid, text) from public;

-- -----------------------------------------------------------------------------
-- Admin: create a job for one snapshot file
-- -----------------------------------------------------------------------------
create function public.admin_create_import_job(
  p_snapshot_name text,
  p_snapshot_sha256 text,
  p_content_sha256 text,
  p_snapshot_format text,
  p_generated_at timestamptz,
  p_sources jsonb,
  p_expected_rows integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_eada jsonb;
  v_scorecard jsonb;
  v_source jsonb;
  v_admissions_year integer;
  v_cost_year integer;
  v_id uuid;
begin
  if jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'sources must be a list' using errcode = 'BR003';
  end if;
  for v_source in select value from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(v_source) <> 'object' or (v_source ->> 'id') not in ('eada', 'college_scorecard')
       or not private.is_web_url(v_source ->> 'url', true) or (v_source ->> 'url') is null
       or (v_source ->> 'retrieved_at') is null or (v_source ->> 'dataset') is null
       or length(v_source ->> 'dataset') > 200 then
      raise exception 'each source needs a known id, an https url, a dataset and a retrieval time' using errcode = 'BR003';
    end if;
    perform (v_source ->> 'retrieved_at')::timestamptz;
  end loop;
  select value into v_eada from jsonb_array_elements(p_sources) where value ->> 'id' = 'eada' limit 1;
  select value into v_scorecard from jsonb_array_elements(p_sources) where value ->> 'id' = 'college_scorecard' limit 1;
  if v_eada is null or v_scorecard is null then
    raise exception 'a snapshot needs both the EADA and College Scorecard sources' using errcode = 'BR003';
  end if;
  if coalesce(v_eada ->> 'season', '') !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'the EADA source must name its season (for example 2024-25)' using errcode = 'BR003';
  end if;
  v_admissions_year := nullif(v_scorecard -> 'years' ->> 'admissions', '')::integer;
  v_cost_year := nullif(v_scorecard -> 'years' ->> 'costs', '')::integer;

  insert into public.data_import_jobs (snapshot_name, snapshot_sha256, content_sha256, snapshot_format, generated_at,
                                       sources, season, admissions_term, cost_year, expected_rows, created_by)
  values (p_snapshot_name, lower(p_snapshot_sha256), lower(p_content_sha256), p_snapshot_format, p_generated_at,
          p_sources, v_eada ->> 'season',
          case when v_admissions_year is not null then 'Fall ' || v_admissions_year end,
          case when v_cost_year is not null then v_cost_year || '-' || lpad(((v_cost_year + 1) % 100)::text, 2, '0') end,
          p_expected_rows, v_admin)
  returning id into v_id;

  perform private.log_audit('registry.import_created', 'data_import_job', v_id::text, null,
    jsonb_build_object('snapshot', p_snapshot_name, 'season', v_eada ->> 'season', 'rows', p_expected_rows));
  return v_id;
exception
  when unique_violation then
    raise exception 'another import is still being staged; finish or discard it first' using errcode = 'BR004';
  when check_violation or invalid_datetime_format or invalid_text_representation or datetime_field_overflow then
    raise exception 'snapshot details are invalid: %', sqlerrm using errcode = 'BR003';
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: add a chunk of snapshot records (at most 500 per call)
-- -----------------------------------------------------------------------------
create function public.admin_stage_import_rows(p_job_id uuid, p_rows jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_job public.data_import_jobs;
  v_count integer;
begin
  select * into v_job from public.data_import_jobs where id = p_job_id for update;
  if not found then
    raise exception 'import not found' using errcode = 'BR003';
  end if;
  if v_job.status <> 'staging' then
    raise exception 'rows can only be added while an import is being staged' using errcode = 'BR004';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 rows at a time' using errcode = 'BR003';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
              where jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'unitid') is distinct from 'number'
                 or jsonb_typeof(r -> 'record') is distinct from 'object'
                 or coalesce(jsonb_typeof(r -> 'issues'), 'array') <> 'array') then
    raise exception 'each row needs a numeric unitid and a record object' using errcode = 'BR003';
  end if;
  if v_job.staged_rows + jsonb_array_length(p_rows) > v_job.expected_rows then
    raise exception 'more rows than the snapshot declared' using errcode = 'BR003';
  end if;

  insert into public.data_import_rows (job_id, unitid, record, source_issues)
  select p_job_id, (r ->> 'unitid')::integer, r -> 'record', coalesce(r -> 'issues', '[]'::jsonb)
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;

  update public.data_import_jobs set staged_rows = staged_rows + v_count where id = p_job_id;
  return v_job.staged_rows + v_count;
exception
  when unique_violation then
    raise exception 'the snapshot lists an institution twice' using errcode = 'BR003';
  when numeric_value_out_of_range or invalid_text_representation or check_violation then
    raise exception 'a row has an invalid unitid' using errcode = 'BR003';
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: validate every row and compute what publishing would change
-- -----------------------------------------------------------------------------
create function public.admin_finalize_import_job(p_job_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_job public.data_import_jobs;
  v_row record;
  v_institution_id uuid;
  v_problems text[];
  v_effective record;
  v_current jsonb;
  v_changes jsonb;
  v_counts jsonb;
begin
  -- Reviews and publishes take turns, so a review is computed against one
  -- known registry version.
  perform pg_advisory_xact_lock(hashtext('base_recruits.registry_publish'));
  select * into v_job from public.data_import_jobs where id = p_job_id for update;
  if not found then
    raise exception 'import not found' using errcode = 'BR003';
  end if;
  if v_job.status <> 'staging' then
    raise exception 'this import has already been reviewed' using errcode = 'BR004';
  end if;
  if v_job.staged_rows <> v_job.expected_rows then
    raise exception 'the import has % of % rows; staging is incomplete', v_job.staged_rows, v_job.expected_rows
      using errcode = 'BR004';
  end if;

  for v_row in select r.unitid, r.record from public.data_import_rows r where r.job_id = p_job_id order by r.unitid loop
    v_problems := private.import_record_problems(v_row.record, v_row.unitid, v_job);
    if cardinality(v_problems) > 0 then
      update public.data_import_rows
         set change = 'invalid', problems = v_problems, decision = 'skip', changes = '{}'::jsonb
       where job_id = p_job_id and unitid = v_row.unitid;
      continue;
    end if;
    select i.id into v_institution_id from public.institutions i where i.unitid = v_row.unitid;
    select e.effective, e.notes into v_effective
      from private.effective_import_record(v_row.record, v_institution_id, v_job.season) e;
    if v_institution_id is null then
      update public.data_import_rows set change = 'new', changes = '{}'::jsonb, problems = v_effective.notes
       where job_id = p_job_id and unitid = v_row.unitid;
    else
      v_current := private.registry_record(v_institution_id, v_job.admissions_term, v_job.cost_year);
      v_changes := private.jsonb_changes(v_current, v_effective.effective);
      update public.data_import_rows
         set change = case when v_changes = '{}'::jsonb then 'unchanged'::public.import_change else 'changed' end,
             changes = v_changes, problems = v_effective.notes
       where job_id = p_job_id and unitid = v_row.unitid;
    end if;
  end loop;

  -- Programs this import would no longer confirm.
  insert into public.data_import_rows (job_id, unitid, record, change, changes, decision)
  select p_job_id, i.unitid, null, 'missing',
         jsonb_build_object('baseball.status', jsonb_build_object('old', p.status, 'new', 'not_reported')), 'apply'
    from public.institutions i
    join public.baseball_programs p on p.institution_id = i.id
   where p.status = 'active' and p.status_source = 'import'
     and not exists (select 1 from public.data_import_rows r where r.job_id = p_job_id and r.unitid = i.unitid);

  select jsonb_build_object(
           'new', count(*) filter (where change = 'new'),
           'changed', count(*) filter (where change = 'changed'),
           'unchanged', count(*) filter (where change = 'unchanged'),
           'missing', count(*) filter (where change = 'missing'),
           'invalid', count(*) filter (where change = 'invalid'),
           'with_source_issues', count(*) filter (where jsonb_array_length(source_issues) > 0),
           'with_notes', count(*) filter (where change <> 'invalid' and cardinality(problems) > 0))
    into v_counts
    from public.data_import_rows where job_id = p_job_id;

  update public.data_import_jobs
     set status = 'staged', staged_at = clock_timestamp(), counts = v_counts,
         base_publish_version = (select publish_version from private.registry_state)
   where id = p_job_id;
  perform private.log_audit('registry.import_staged', 'data_import_job', p_job_id::text, null, v_counts);
  return v_counts;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: skip or re-include one reviewed row
-- -----------------------------------------------------------------------------
create function public.admin_set_import_decision(p_job_id uuid, p_unitid integer, p_decision text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_change public.import_change;
begin
  if p_decision not in ('apply', 'skip') then
    raise exception 'decision must be apply or skip' using errcode = 'BR003';
  end if;
  -- Shares the row lock publishing takes, so a decision cannot change mid-publish.
  perform 1 from public.data_import_jobs where id = p_job_id and status = 'staged' for share;
  if not found then
    raise exception 'decisions can only change while an import is awaiting review' using errcode = 'BR004';
  end if;
  select change into v_change from public.data_import_rows where job_id = p_job_id and unitid = p_unitid;
  if not found then
    raise exception 'row not found in this import' using errcode = 'BR003';
  end if;
  if v_change = 'invalid' and p_decision = 'apply' then
    raise exception 'an invalid record cannot be applied' using errcode = 'BR004';
  end if;
  update public.data_import_rows set decision = p_decision where job_id = p_job_id and unitid = p_unitid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Applying one record (used by publish)
-- -----------------------------------------------------------------------------
create function private.unique_institution_slug(p_name text, p_state text, p_unitid integer) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := private.slugify(p_name);
  v_slug text;
begin
  if v_base = '' then
    return 'school-' || p_unitid;
  end if;
  v_slug := v_base || coalesce('-' || lower(p_state), '');
  if exists (select 1 from public.institutions where slug = v_slug) then
    v_slug := v_slug || '-' || p_unitid;
  end if;
  return v_slug;
end;
$$;
revoke all on function private.unique_institution_slug(text, text, integer) from public;

create function private.apply_import_record(p_job public.data_import_jobs, p_record jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facts jsonb := p_record -> 'facts';
  v_base jsonb := p_record -> 'baseball';
  v_adm jsonb := p_record -> 'admissions';
  v_cost jsonb := p_record -> 'costs';
  v_facts_source text := p_record ->> 'institution_source';
  v_facts_meta jsonb := (select value from jsonb_array_elements(p_job.sources) where value ->> 'id' = v_facts_source limit 1);
  v_eada jsonb := (select value from jsonb_array_elements(p_job.sources) where value ->> 'id' = 'eada' limit 1);
  v_scorecard jsonb := (select value from jsonb_array_elements(p_job.sources) where value ->> 'id' = 'college_scorecard' limit 1);
  v_unitid integer := (p_record ->> 'unitid')::integer;
  v_id uuid;
  v_program public.baseball_programs;
  v_enrollment jsonb := nullif(v_facts -> 'undergraduate_enrollment', 'null'::jsonb);
  v_aliases text[] := coalesce((select array_agg(distinct a #>> '{}') from jsonb_array_elements(v_facts -> 'aliases') a), '{}');
  v_keep_admin boolean;
begin
  select id into v_id from public.institutions where unitid = v_unitid;
  if v_id is null then
    insert into public.institutions (unitid, slug, name, ope8_id, city, state, zip, latitude, longitude, website_url,
                                     price_calculator_url, control, level, predominant_degree, setting,
                                     undergraduate_enrollment, enrollment_term, enrollment_source_year,
                                     facts_source_id, facts_dataset, facts_source_url, facts_retrieved_at, import_job_id)
    values (v_unitid, private.unique_institution_slug(v_facts ->> 'name', v_facts ->> 'state', v_unitid),
            v_facts ->> 'name', v_facts ->> 'ope8_id', v_facts ->> 'city', v_facts ->> 'state', v_facts ->> 'zip',
            (v_facts ->> 'latitude')::double precision, (v_facts ->> 'longitude')::double precision,
            v_facts ->> 'website_url', v_facts ->> 'price_calculator_url',
            (v_facts ->> 'control')::public.institution_control, (v_facts ->> 'level')::public.institution_level,
            v_facts ->> 'predominant_degree', (v_facts ->> 'setting')::public.campus_setting,
            (v_enrollment ->> 'value')::numeric::integer, v_enrollment ->> 'term', (v_enrollment ->> 'scorecard_year')::numeric::smallint,
            v_facts_source, v_facts_meta ->> 'dataset', v_facts_meta ->> 'url',
            (v_facts_meta ->> 'retrieved_at')::timestamptz, p_job.id)
    returning id into v_id;
  else
    update public.institutions
       set name = v_facts ->> 'name', ope8_id = v_facts ->> 'ope8_id', city = v_facts ->> 'city',
           state = v_facts ->> 'state', zip = v_facts ->> 'zip',
           latitude = (v_facts ->> 'latitude')::double precision, longitude = (v_facts ->> 'longitude')::double precision,
           website_url = v_facts ->> 'website_url', price_calculator_url = v_facts ->> 'price_calculator_url',
           control = (v_facts ->> 'control')::public.institution_control,
           level = (v_facts ->> 'level')::public.institution_level,
           predominant_degree = v_facts ->> 'predominant_degree', setting = (v_facts ->> 'setting')::public.campus_setting,
           undergraduate_enrollment = (v_enrollment ->> 'value')::numeric::integer, enrollment_term = v_enrollment ->> 'term',
           enrollment_source_year = (v_enrollment ->> 'scorecard_year')::numeric::smallint,
           facts_source_id = v_facts_source, facts_dataset = v_facts_meta ->> 'dataset',
           facts_source_url = v_facts_meta ->> 'url', facts_retrieved_at = (v_facts_meta ->> 'retrieved_at')::timestamptz,
           import_job_id = p_job.id
     where id = v_id;
  end if;

  -- Aliases come from College Scorecard; the list is replaced to match the source.
  delete from public.institution_aliases where institution_id = v_id and not (alias = any (v_aliases));
  insert into public.institution_aliases (institution_id, alias, source_id)
  select v_id, a, v_facts_source from unnest(v_aliases) a
  on conflict (institution_id, alias) do nothing;
  perform private.refresh_institution_search_text(v_id);

  -- Program
  select * into v_program from public.baseball_programs where institution_id = v_id;
  v_keep_admin := found and v_program.status_source = 'admin'
                  and p_job.season <= coalesce(v_program.status_season, v_program.season);
  if not found then
    insert into public.baseball_programs (institution_id, status, season, association_code, division_code,
                                          classification_code, classification_label, classification_other,
                                          reported_participants, verification, verified_at, source_id, source_dataset,
                                          source_url, source_retrieved_at, import_job_id)
    values (v_id, 'active', v_base ->> 'season', v_base ->> 'association', v_base ->> 'division',
            (v_base ->> 'classification_code')::numeric::smallint, v_base ->> 'classification_name', v_base ->> 'classification_other',
            (v_base ->> 'participants')::numeric::integer, 'federal_report', (v_eada ->> 'retrieved_at')::timestamptz,
            'eada', v_eada ->> 'dataset', v_eada ->> 'url', (v_eada ->> 'retrieved_at')::timestamptz, p_job.id);
  else
    update public.baseball_programs p
       set status = case when v_keep_admin then p.status else 'active' end,
           status_source = case when v_keep_admin then 'admin' else 'import' end,
           status_note = case when v_keep_admin then p.status_note end,
           status_season = case when v_keep_admin then p.status_season end,
           season = v_base ->> 'season',
           association_code = case when p.verification = 'federal_report' then v_base ->> 'association' else p.association_code end,
           division_code = case when p.verification = 'federal_report' then v_base ->> 'division' else p.division_code end,
           verified_at = case when p.verification = 'federal_report' then (v_eada ->> 'retrieved_at')::timestamptz else p.verified_at end,
           classification_code = (v_base ->> 'classification_code')::numeric::smallint,
           classification_label = v_base ->> 'classification_name',
           classification_other = v_base ->> 'classification_other',
           reported_participants = (v_base ->> 'participants')::numeric::integer,
           source_id = 'eada', source_dataset = v_eada ->> 'dataset', source_url = v_eada ->> 'url',
           source_retrieved_at = (v_eada ->> 'retrieved_at')::timestamptz,
           import_job_id = p_job.id
     where p.id = v_program.id;
  end if;

  -- Admissions for the job's fall term
  if v_adm is not null and jsonb_typeof(v_adm) = 'object' then
    insert into public.admissions_statistics as a (institution_id, term, admission_rate, sat_erw_25, sat_erw_75,
                                                   sat_math_25, sat_math_75, act_composite_25, act_composite_75,
                                                   test_policy, source_id, source_dataset, source_url, source_year,
                                                   retrieved_at, import_job_id)
    values (v_id, v_adm ->> 'term', (v_adm ->> 'admission_rate')::numeric,
            (v_adm ->> 'sat_erw_25')::numeric::smallint, (v_adm ->> 'sat_erw_75')::numeric::smallint,
            (v_adm ->> 'sat_math_25')::numeric::smallint, (v_adm ->> 'sat_math_75')::numeric::smallint,
            (v_adm ->> 'act_composite_25')::numeric::smallint, (v_adm ->> 'act_composite_75')::numeric::smallint,
            (v_adm ->> 'test_policy')::public.test_policy, 'college_scorecard', v_scorecard ->> 'dataset',
            v_scorecard ->> 'url', (v_adm ->> 'scorecard_year')::numeric::smallint,
            (v_scorecard ->> 'retrieved_at')::timestamptz, p_job.id)
    on conflict (institution_id, source_id, term) do update
      set admission_rate = excluded.admission_rate, sat_erw_25 = excluded.sat_erw_25, sat_erw_75 = excluded.sat_erw_75,
          sat_math_25 = excluded.sat_math_25, sat_math_75 = excluded.sat_math_75,
          act_composite_25 = excluded.act_composite_25, act_composite_75 = excluded.act_composite_75,
          test_policy = excluded.test_policy, source_dataset = excluded.source_dataset, source_url = excluded.source_url,
          source_year = excluded.source_year, retrieved_at = excluded.retrieved_at, import_job_id = excluded.import_job_id;
  elsif p_job.admissions_term is not null then
    delete from public.admissions_statistics
     where institution_id = v_id and source_id = 'college_scorecard' and term = p_job.admissions_term;
  end if;

  -- Published prices for the job's academic year
  if v_cost is not null and jsonb_typeof(v_cost) = 'object' then
    insert into public.institution_costs (institution_id, academic_year, cost_of_attendance, tuition_in_state,
                                          tuition_out_of_state, source_id, source_dataset, source_url, source_year,
                                          retrieved_at, import_job_id)
    values (v_id, v_cost ->> 'academic_year', (v_cost ->> 'cost_of_attendance')::numeric::integer,
            (v_cost ->> 'tuition_in_state')::numeric::integer, (v_cost ->> 'tuition_out_of_state')::numeric::integer,
            'college_scorecard', v_scorecard ->> 'dataset', v_scorecard ->> 'url', (v_cost ->> 'scorecard_year')::numeric::smallint,
            (v_scorecard ->> 'retrieved_at')::timestamptz, p_job.id)
    on conflict (institution_id, source_id, academic_year) do update
      set cost_of_attendance = excluded.cost_of_attendance, tuition_in_state = excluded.tuition_in_state,
          tuition_out_of_state = excluded.tuition_out_of_state, source_dataset = excluded.source_dataset,
          source_url = excluded.source_url, source_year = excluded.source_year, retrieved_at = excluded.retrieved_at,
          import_job_id = excluded.import_job_id;
  elsif p_job.cost_year is not null then
    delete from public.institution_costs
     where institution_id = v_id and source_id = 'college_scorecard' and academic_year = p_job.cost_year;
  end if;
end;
$$;
revoke all on function private.apply_import_record(public.data_import_jobs, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Admin: publish a reviewed import
-- -----------------------------------------------------------------------------
create function public.admin_publish_import_job(p_job_id uuid, p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_job public.data_import_jobs;
  v_row record;
  v_applied integer := 0;
  v_marked integer := 0;
  v_skipped integer;
  v_result jsonb;
begin
  -- One publish at a time.
  perform pg_advisory_xact_lock(hashtext('base_recruits.registry_publish'));
  select * into v_job from public.data_import_jobs where id = p_job_id for update;
  if not found then
    raise exception 'import not found' using errcode = 'BR003';
  end if;
  if v_job.status <> 'staged' then
    raise exception 'only an import awaiting review can be published' using errcode = 'BR004';
  end if;
  if length(p_note) > 2000 then
    raise exception 'note is too long (2000 characters max)' using errcode = 'BR003';
  end if;
  if v_job.base_publish_version is distinct from (select publish_version from private.registry_state) then
    raise exception 'the registry changed after this import was reviewed; stage it again to see current changes'
      using errcode = 'BR004';
  end if;
  update private.registry_state set publish_version = publish_version + 1 where singleton;

  perform private.set_registry_context(p_job_id, coalesce(p_note, 'import published'));

  for v_row in select r.record from public.data_import_rows r
                where r.job_id = p_job_id and r.decision = 'apply' and r.change in ('new', 'changed')
                order by r.unitid loop
    perform private.apply_import_record(v_job, v_row.record);
    v_applied := v_applied + 1;
  end loop;

  -- Unchanged rows still confirm the program for this season and source.
  update public.baseball_programs p
     set import_job_id = p_job_id
    from public.data_import_rows r join public.institutions i on i.unitid = r.unitid
   where r.job_id = p_job_id and r.change = 'unchanged' and r.decision = 'apply' and p.institution_id = i.id
     and p.import_job_id is distinct from p_job_id;

  update public.baseball_programs p
     set status = 'not_reported', import_job_id = p_job_id
    from public.data_import_rows r join public.institutions i on i.unitid = r.unitid
   where r.job_id = p_job_id and r.change = 'missing' and r.decision = 'apply'
     and p.institution_id = i.id and p.status = 'active' and p.status_source = 'import';
  get diagnostics v_marked = row_count;

  select count(*) into v_skipped from public.data_import_rows where job_id = p_job_id and decision = 'skip';

  v_result := jsonb_build_object('applied', v_applied, 'marked_not_reported', v_marked, 'skipped', v_skipped);
  update public.data_import_jobs
     set status = 'published', published_by = v_admin, published_at = clock_timestamp(), publish_note = p_note,
         counts = counts || jsonb_build_object('published', v_result)
   where id = p_job_id;
  perform private.log_audit('registry.import_published', 'data_import_job', p_job_id::text, null, v_result);
  perform private.set_registry_context(null, null);
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: discard an import that has not been published
-- -----------------------------------------------------------------------------
create function public.admin_discard_import_job(p_job_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.data_import_jobs
     set status = 'discarded', discarded_by = v_admin, discarded_at = now()
   where id = p_job_id and status in ('staging', 'staged');
  if not found then
    raise exception 'only an import that has not been published can be discarded' using errcode = 'BR004';
  end if;
  perform private.log_audit('registry.import_discarded', 'data_import_job', p_job_id::text);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: stage an earlier import again (republish, or roll back to it)
-- -----------------------------------------------------------------------------
create function public.admin_restage_import_job(p_job_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_job public.data_import_jobs;
  v_new uuid;
  v_rows integer;
begin
  select * into v_job from public.data_import_jobs where id = p_job_id;
  if not found then
    raise exception 'import not found' using errcode = 'BR003';
  end if;
  if v_job.status not in ('published', 'discarded') or v_job.staged_at is null then
    raise exception 'only an import that was fully staged and reviewed can be staged again' using errcode = 'BR004';
  end if;
  select count(*) into v_rows from public.data_import_rows where job_id = p_job_id and record is not null;
  if v_rows <> v_job.expected_rows then
    raise exception 'this import is incomplete (% of % records) and cannot be staged again', v_rows, v_job.expected_rows
      using errcode = 'BR004';
  end if;

  insert into public.data_import_jobs (snapshot_name, snapshot_sha256, content_sha256, snapshot_format, generated_at,
                                       sources, season, admissions_term, cost_year, expected_rows, staged_rows,
                                       restaged_from, created_by)
  values (v_job.snapshot_name, v_job.snapshot_sha256, v_job.content_sha256, v_job.snapshot_format, v_job.generated_at,
          v_job.sources, v_job.season, v_job.admissions_term, v_job.cost_year, v_rows, v_rows, p_job_id, v_admin)
  returning id into v_new;
  insert into public.data_import_rows (job_id, unitid, record, source_issues)
  select v_new, unitid, record, source_issues from public.data_import_rows where job_id = p_job_id and record is not null;

  perform private.log_audit('registry.import_restaged', 'data_import_job', v_new::text, null,
                            jsonb_build_object('from', p_job_id));
  perform public.admin_finalize_import_job(v_new);
  return v_new;
exception
  when unique_violation then
    raise exception 'another import is still being staged; finish or discard it first' using errcode = 'BR004';
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: reconcile one program against an official page
-- -----------------------------------------------------------------------------
create function public.admin_update_baseball_program(
  p_institution_id uuid,
  p_status public.program_status,
  p_association_code text,
  p_division_code text,
  p_conference text,
  p_athletics_url text,
  p_roster_url text,
  p_questionnaire_url text,
  p_verification public.program_verification,
  p_verification_source_url text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_program public.baseball_programs;
  v_note text := nullif(btrim(p_note), '');
  v_conference text := nullif(btrim(p_conference), '');
  v_evidence text := nullif(btrim(p_verification_source_url), '');
  v_changed jsonb;
begin
  select * into v_program from public.baseball_programs where institution_id = p_institution_id for update;
  if not found then
    raise exception 'this institution has no baseball program record' using errcode = 'BR003';
  end if;
  if v_note is null or length(v_note) not between 5 and 1000 then
    raise exception 'explain the change (5–1000 characters)' using errcode = 'BR003';
  end if;
  if p_status is null or p_verification is null or p_association_code is null or p_division_code is null then
    raise exception 'status, verification, association and division are required' using errcode = 'BR003';
  end if;
  if not exists (select 1 from public.athletic_divisions d where d.code = p_division_code and d.association_code = p_association_code) then
    raise exception 'that division does not belong to that association' using errcode = 'BR003';
  end if;
  if v_conference is not null and length(v_conference) not between 2 and 120 then
    raise exception 'conference must be 2–120 characters' using errcode = 'BR003';
  end if;
  if not (private.is_web_url(nullif(btrim(p_athletics_url), ''), true) and private.is_web_url(nullif(btrim(p_roster_url), ''), true)
          and private.is_web_url(nullif(btrim(p_questionnaire_url), ''), true) and private.is_web_url(v_evidence, true)) then
    raise exception 'links must be https web addresses without a user name' using errcode = 'BR003';
  end if;
  -- Anything beyond the federal listing needs the official page that shows it.
  if (p_verification <> 'federal_report'
      or p_status is distinct from v_program.status
      or p_association_code is distinct from v_program.association_code
      or p_division_code is distinct from v_program.division_code
      or v_conference is distinct from v_program.conference)
     and v_evidence is null then
    raise exception 'cite the official page you checked' using errcode = 'BR003';
  end if;
  if (p_association_code is distinct from v_program.association_code or p_division_code is distinct from v_program.division_code)
     and p_verification = 'federal_report' then
    raise exception 'a division correction must be verified against the association directory or the school''s athletics site'
      using errcode = 'BR003';
  end if;
  if p_status = 'not_reported' and v_program.status <> 'not_reported' then
    raise exception 'not reported is set by imports; choose inactive or suspended for a confirmed change' using errcode = 'BR003';
  end if;

  perform private.set_registry_context(null, v_note);
  update public.baseball_programs p
     set status = p_status,
         status_source = case when p_status is distinct from v_program.status then 'admin' else p.status_source end,
         status_note = case when p_status is distinct from v_program.status then v_note else p.status_note end,
         status_season = case when p_status is distinct from v_program.status then p.season else p.status_season end,
         association_code = p_association_code, division_code = p_division_code,
         conference = v_conference,
         athletics_url = nullif(btrim(p_athletics_url), ''), roster_url = nullif(btrim(p_roster_url), ''),
         questionnaire_url = nullif(btrim(p_questionnaire_url), ''),
         verification = p_verification,
         verification_source_url = v_evidence,
         verification_note = v_note,
         verified_at = case when p_verification = 'federal_report' then p.verified_at else now() end,
         verified_by = case when p_verification = 'federal_report' then p.verified_by else v_admin end
   where p.id = v_program.id;

  select jsonb_object_agg(key, true) into v_changed
    from jsonb_each(to_jsonb(v_program)) o
    join jsonb_each((select to_jsonb(p) from public.baseball_programs p where p.id = v_program.id)) n using (key)
   where o.value is distinct from n.value and key not in ('updated_at');
  perform private.log_audit('registry.program_updated', 'baseball_program', v_program.id::text, null,
                            jsonb_build_object('changed', coalesce(v_changed, '{}'::jsonb)));
  perform private.set_registry_context(null, null);
exception
  when check_violation then
    raise exception 'the program details are invalid: %', sqlerrm using errcode = 'BR003';
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: hide an institution from public pages, or list it again
-- -----------------------------------------------------------------------------
create function public.admin_set_institution_listing(p_institution_id uuid, p_listed boolean, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_listed is null then
    raise exception 'say whether the institution is listed' using errcode = 'BR003';
  end if;
  if v_reason is null or length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (3–500 characters)' using errcode = 'BR003';
  end if;
  perform private.set_registry_context(null, v_reason);
  update public.institutions
     set is_listed = p_listed, unlisted_reason = case when p_listed then null else v_reason end
   where id = p_institution_id;
  if not found then
    raise exception 'institution not found' using errcode = 'BR003';
  end if;
  perform private.log_audit(case when p_listed then 'registry.institution_listed' else 'registry.institution_unlisted' end,
                            'institution', p_institution_id::text, null, jsonb_build_object('reason', v_reason));
  perform private.set_registry_context(null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.admin_create_import_job(text, text, text, text, timestamptz, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_stage_import_rows(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_finalize_import_job(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_import_decision(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_publish_import_job(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_discard_import_job(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_restage_import_job(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_baseball_program(uuid, public.program_status, text, text, text, text, text, text, public.program_verification, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_institution_listing(uuid, boolean, text) from public, anon, authenticated, service_role;

grant execute on function public.admin_create_import_job(text, text, text, text, timestamptz, jsonb, integer) to authenticated;
grant execute on function public.admin_stage_import_rows(uuid, jsonb) to authenticated;
grant execute on function public.admin_finalize_import_job(uuid) to authenticated;
grant execute on function public.admin_set_import_decision(uuid, integer, text) to authenticated;
grant execute on function public.admin_publish_import_job(uuid, text) to authenticated;
grant execute on function public.admin_discard_import_job(uuid) to authenticated;
grant execute on function public.admin_restage_import_job(uuid) to authenticated;
grant execute on function public.admin_update_baseball_program(uuid, public.program_status, text, text, text, text, text, text, public.program_verification, text, text) to authenticated;
grant execute on function public.admin_set_institution_listing(uuid, boolean, text) to authenticated;
