-- =============================================================================
-- Base Recruits — College Scorecard extras: open admission and programs offered
--
-- Founder request 2026-10-31 (#1 and #4). Two more institution facts from the
-- same College Scorecard feed the registry already imports:
--
--  * open_admission: the school's open admission policy (IPEDS OPENADMP). An
--    open-admission school accepts any applicant, or only requires a high school
--    diploma. Null when not reported. Used by the suggestion engine: an
--    open-admission school counts as an academic fit (rulebook §2).
--  * programs: the two-digit CIP families the school offers on campus, at the
--    bachelor's and associate level, for one data year. Shown on school pages
--    and used by the "majors" search filter.
--
-- Both travel in the snapshot's facts and go through the same staging, review,
-- publish and rollback as every other imported value. To keep the reviewed
-- import functions as they are, each is renamed to *_base and wrapped by a
-- function of the same name that adds the new fields.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Program areas (two-digit CIP families), as College Scorecard names them
-- -----------------------------------------------------------------------------
create table public.program_areas (
  code text primary key constraint program_areas_code_format check (code ~ '^[a-z][a-z_]*$'),
  cip text not null unique constraint program_areas_cip_format check (cip ~ '^[0-9]{2}$'),
  name text not null constraint program_areas_name check (length(name) between 3 and 80),
  sort_order smallint not null unique
);
comment on table public.program_areas is
  'Two-digit CIP families, keyed by College Scorecard''s developer-friendly names (academics.program.<level>.<code>).';

insert into public.program_areas (code, cip, name, sort_order) values
  ('agriculture', '01', 'Agriculture', 1),
  ('resources', '03', 'Natural resources and conservation', 2),
  ('architecture', '04', 'Architecture', 3),
  ('ethnic_cultural_gender', '05', 'Area, ethnic, cultural and gender studies', 4),
  ('communication', '09', 'Communication and journalism', 5),
  ('communications_technology', '10', 'Communications technologies', 6),
  ('computer', '11', 'Computer and information sciences', 7),
  ('personal_culinary', '12', 'Personal and culinary services', 8),
  ('education', '13', 'Education', 9),
  ('engineering', '14', 'Engineering', 10),
  ('engineering_technology', '15', 'Engineering technologies', 11),
  ('language', '16', 'Foreign languages and linguistics', 12),
  ('family_consumer_science', '19', 'Family and consumer sciences', 13),
  ('legal', '22', 'Legal studies', 14),
  ('english', '23', 'English language and literature', 15),
  ('humanities', '24', 'Liberal arts and humanities', 16),
  ('library', '25', 'Library science', 17),
  ('biological', '26', 'Biological and biomedical sciences', 18),
  ('mathematics', '27', 'Mathematics and statistics', 19),
  ('military', '29', 'Military technologies', 20),
  ('multidiscipline', '30', 'Multi- and interdisciplinary studies', 21),
  ('parks_recreation_fitness', '31', 'Parks, recreation, leisure, fitness and kinesiology', 22),
  ('philosophy_religious', '38', 'Philosophy and religious studies', 23),
  ('theology_religious_vocation', '39', 'Theology and religious vocations', 24),
  ('physical_science', '40', 'Physical sciences', 25),
  ('science_technology', '41', 'Science technologies', 26),
  ('psychology', '42', 'Psychology', 27),
  ('security_law_enforcement', '43', 'Homeland security, law enforcement and firefighting', 28),
  ('public_administration_social_service', '44', 'Public administration and social services', 29),
  ('social_science', '45', 'Social sciences', 30),
  ('construction', '46', 'Construction trades', 31),
  ('mechanic_repair_technology', '47', 'Mechanic and repair technologies', 32),
  ('precision_production', '48', 'Precision production', 33),
  ('transportation', '49', 'Transportation and materials moving', 34),
  ('visual_performing', '50', 'Visual and performing arts', 35),
  ('health', '51', 'Health professions', 36),
  ('business_marketing', '52', 'Business, management and marketing', 37),
  ('history', '54', 'History', 38);

alter table public.program_areas enable row level security;
revoke all on public.program_areas from anon, authenticated, service_role;
grant select on public.program_areas to anon, authenticated;
create policy program_areas_public on public.program_areas for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- New institution facts
-- -----------------------------------------------------------------------------
alter table public.institutions
  add column open_admission boolean,
  add column bachelors_areas text[],
  add column associate_areas text[],
  add column programs_source_year smallint
    constraint institutions_programs_year check (programs_source_year between 1990 and 2100),
  add constraint institutions_programs_labelled check (
    (programs_source_year is null) = (bachelors_areas is null)
    and (programs_source_year is null) = (associate_areas is null)),
  add constraint institutions_program_codes check (
    coalesce(array_to_string(bachelors_areas, ','), '') ~ '^([a-z][a-z_]*(,[a-z][a-z_]*)*)?$'
    and coalesce(array_to_string(associate_areas, ','), '') ~ '^([a-z][a-z_]*(,[a-z][a-z_]*)*)?$');

comment on column public.institutions.open_admission is
  'College Scorecard open admission policy (IPEDS OPENADMP): true = accepts any applicant or requires only a diploma; null = not reported.';
comment on column public.institutions.bachelors_areas is
  'Program areas (public.program_areas codes) offered on campus at the bachelor''s level, for programs_source_year; null = not reported.';

grant select (open_admission, bachelors_areas, associate_areas, programs_source_year)
  on public.institutions to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Import: the live record, validation and apply, each wrapped
-- -----------------------------------------------------------------------------
alter function private.registry_record(uuid, text, text) rename to registry_record_base;
alter function private.import_record_problems(jsonb, integer, public.data_import_jobs) rename to import_record_problems_base;
alter function private.apply_import_record(public.data_import_jobs, jsonb) rename to apply_import_record_base;

create function private.registry_record(p_institution_id uuid, p_admissions_term text, p_cost_year text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when r is null then null else
    jsonb_set(r, '{facts}', (r -> 'facts') || jsonb_build_object(
      'open_admission', i.open_admission,
      'programs', case when i.programs_source_year is null then null else jsonb_build_object(
        'scorecard_year', i.programs_source_year,
        'bachelors', to_jsonb(i.bachelors_areas),
        'associate', to_jsonb(i.associate_areas)) end)) end
  from private.registry_record_base(p_institution_id, p_admissions_term, p_cost_year) r
  join public.institutions i on i.id = p_institution_id
$$;
revoke all on function private.registry_record(uuid, text, text) from public;

-- True when the value is a JSON array of distinct, known program area codes in sorted order.
create function private.program_area_list_ok(p_value jsonb) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'array'
     and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
     and not exists (select 1 from jsonb_array_elements_text(p_value) e
                      where not exists (select 1 from public.program_areas pa where pa.code = e))
     and (select count(*) from jsonb_array_elements_text(p_value)) = (select count(distinct e) from jsonb_array_elements_text(p_value) e)
     and p_value = coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(p_value) e), '[]'::jsonb)
$$;
revoke all on function private.program_area_list_ok(jsonb) from public;

create function private.import_record_problems(p_record jsonb, p_unitid integer, p_job public.data_import_jobs)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problems text[] := private.import_record_problems_base(p_record, p_unitid, p_job);
  v_facts jsonb := p_record -> 'facts';
  v_programs jsonb;
begin
  if coalesce(jsonb_typeof(v_facts), '') <> 'object' then
    return v_problems;
  end if;
  if coalesce(jsonb_typeof(v_facts -> 'open_admission'), 'null') not in ('null', 'boolean') then
    v_problems := array_append(v_problems, 'open_admission must be true, false or absent');
  end if;
  v_programs := nullif(v_facts -> 'programs', 'null'::jsonb);
  if v_programs is not null then
    if jsonb_typeof(v_programs) <> 'object'
       or not private.json_number_ok(v_programs -> 'scorecard_year', 1990, 2100, true, false)
       or not private.program_area_list_ok(v_programs -> 'bachelors')
       or not private.program_area_list_ok(v_programs -> 'associate') then
      v_problems := array_append(v_problems,
        'programs need a data year and sorted lists of known program areas for bachelors and associate');
    end if;
  end if;
  return v_problems;
end;
$$;
revoke all on function private.import_record_problems(jsonb, integer, public.data_import_jobs) from public;

create function private.apply_import_record(p_job public.data_import_jobs, p_record jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facts jsonb := p_record -> 'facts';
  v_programs jsonb := nullif(v_facts -> 'programs', 'null'::jsonb);
begin
  perform private.apply_import_record_base(p_job, p_record);
  update public.institutions
     set open_admission = case when jsonb_typeof(v_facts -> 'open_admission') = 'boolean'
                               then (v_facts ->> 'open_admission')::boolean end,
         programs_source_year = (v_programs ->> 'scorecard_year')::numeric::smallint,
         bachelors_areas = case when v_programs is null then null
                                else array(select jsonb_array_elements_text(v_programs -> 'bachelors')) end,
         associate_areas = case when v_programs is null then null
                                else array(select jsonb_array_elements_text(v_programs -> 'associate')) end
   where unitid = (p_record ->> 'unitid')::integer;
end;
$$;
revoke all on function private.apply_import_record(public.data_import_jobs, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Public reads
-- -----------------------------------------------------------------------------
create or replace function public.get_school(p_slug text) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'institution', jsonb_build_object(
      'slug', i.slug, 'unitid', i.unitid, 'name', i.name, 'city', i.city, 'state', i.state, 'zip', i.zip,
      'website_url', i.website_url, 'price_calculator_url', i.price_calculator_url,
      'control', i.control, 'level', i.level, 'predominant_degree', i.predominant_degree, 'setting', i.setting,
      'undergraduate_enrollment', i.undergraduate_enrollment, 'enrollment_term', i.enrollment_term,
      'open_admission', i.open_admission,
      'programs', case when i.programs_source_year is null then null else jsonb_build_object(
        'scorecard_year', i.programs_source_year,
        'bachelors', coalesce((select jsonb_agg(jsonb_build_object('code', pa.code, 'name', pa.name) order by pa.sort_order)
                                 from public.program_areas pa where pa.code = any (i.bachelors_areas)), '[]'::jsonb),
        'associate', coalesce((select jsonb_agg(jsonb_build_object('code', pa.code, 'name', pa.name) order by pa.sort_order)
                                 from public.program_areas pa where pa.code = any (i.associate_areas)), '[]'::jsonb)) end,
      'aliases', coalesce((select jsonb_agg(a.alias order by a.alias) from public.institution_aliases a
                            where a.institution_id = i.id), '[]'::jsonb),
      'source', jsonb_build_object('id', fs.id, 'name', fs.name, 'publisher', fs.publisher, 'attribution', fs.attribution,
                                   'homepage_url', fs.homepage_url, 'dataset', i.facts_dataset, 'url', i.facts_source_url,
                                   'retrieved_at', i.facts_retrieved_at)),
    'program', (select jsonb_build_object(
        'status', p.status, 'status_note', p.status_note, 'season', p.season,
        'association', jsonb_build_object('code', aa.code, 'name', aa.name, 'short_name', aa.short_name, 'two_year', aa.two_year),
        'division', jsonb_build_object('code', d.code, 'name', d.name),
        'classification_label', p.classification_label, 'classification_other', p.classification_other,
        'reported_participants', p.reported_participants, 'conference', p.conference,
        'athletics_url', p.athletics_url, 'roster_url', p.roster_url, 'questionnaire_url', p.questionnaire_url,
        'verification', p.verification, 'verification_source_url', p.verification_source_url, 'verified_at', p.verified_at,
        'source', jsonb_build_object('id', ps.id, 'name', ps.name, 'publisher', ps.publisher, 'attribution', ps.attribution,
                                     'homepage_url', ps.homepage_url, 'dataset', p.source_dataset, 'url', p.source_url,
                                     'retrieved_at', p.source_retrieved_at))
        from public.baseball_programs p
        join public.athletic_associations aa on aa.code = p.association_code
        join public.athletic_divisions d on d.code = p.division_code
        join public.data_sources ps on ps.id = p.source_id
       where p.institution_id = i.id),
    'admissions', (select jsonb_build_object(
        'term', a.term, 'admission_rate', a.admission_rate, 'test_policy', a.test_policy,
        'sat_erw_25', a.sat_erw_25, 'sat_erw_75', a.sat_erw_75, 'sat_math_25', a.sat_math_25, 'sat_math_75', a.sat_math_75,
        'act_composite_25', a.act_composite_25, 'act_composite_75', a.act_composite_75, 'score_cohort', a.score_cohort,
        'source', jsonb_build_object('id', s.id, 'name', s.name, 'publisher', s.publisher, 'attribution', s.attribution,
                                     'homepage_url', s.homepage_url, 'dataset', a.source_dataset, 'url', a.source_url,
                                     'retrieved_at', a.retrieved_at))
        from public.admissions_statistics a join public.data_sources s on s.id = a.source_id
       where a.institution_id = i.id order by a.term_year desc limit 1),
    'costs', (select jsonb_build_object(
        'academic_year', c.academic_year, 'cost_of_attendance', c.cost_of_attendance,
        'tuition_in_state', c.tuition_in_state, 'tuition_out_of_state', c.tuition_out_of_state,
        'source', jsonb_build_object('id', s.id, 'name', s.name, 'publisher', s.publisher, 'attribution', s.attribution,
                                     'homepage_url', s.homepage_url, 'dataset', c.source_dataset, 'url', c.source_url,
                                     'retrieved_at', c.retrieved_at))
        from public.institution_costs c join public.data_sources s on s.id = c.source_id
       where c.institution_id = i.id order by c.academic_year desc limit 1))
  from public.institutions i
  join public.data_sources fs on fs.id = i.facts_source_id
  where i.slug = lower(btrim(p_slug)) and i.is_listed
$$;

-- search_schools gains a majors filter (p_program_areas: offered at the bachelor's
-- or associate level) and returns open_admission. The return type changes, so
-- the function is dropped and created again with the same grants.
drop function public.search_schools(text, text[], text[], public.institution_control[], public.institution_level[],
  public.campus_setting[], integer, integer, numeric, numeric, public.test_policy[], integer, text, integer, integer);

create function public.search_schools(
  p_query text default null,
  p_states text[] default null,
  p_divisions text[] default null,
  p_controls public.institution_control[] default null,
  p_levels public.institution_level[] default null,
  p_settings public.campus_setting[] default null,
  p_min_enrollment integer default null,
  p_max_enrollment integer default null,
  p_min_admission_rate numeric default null,
  p_max_admission_rate numeric default null,
  p_test_policies public.test_policy[] default null,
  p_max_cost integer default null,
  p_sort text default null,
  p_limit integer default 24,
  p_offset integer default 0,
  p_program_areas text[] default null
)
returns table (
  slug text,
  name text,
  city text,
  state text,
  control public.institution_control,
  level public.institution_level,
  setting public.campus_setting,
  undergraduate_enrollment integer,
  enrollment_term text,
  association_code text,
  association_short_name text,
  division_code text,
  division_name text,
  two_year_association boolean,
  conference text,
  program_season text,
  verification public.program_verification,
  admissions_term text,
  admission_rate numeric,
  sat_erw_25 smallint,
  sat_erw_75 smallint,
  sat_math_25 smallint,
  sat_math_75 smallint,
  act_composite_25 smallint,
  act_composite_75 smallint,
  test_policy public.test_policy,
  cost_year text,
  cost_of_attendance integer,
  tuition_in_state integer,
  tuition_out_of_state integer,
  open_admission boolean,
  relevance real,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text := nullif(lower(extensions.unaccent(btrim(left(coalesce(p_query, ''), 100)))), '');
  v_words text[];
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_sort text := coalesce(p_sort, case when p_query is null or btrim(p_query) = '' then 'name' else 'relevance' end);
  v_areas text[] := case when p_program_areas is null or cardinality(p_program_areas) = 0 then null
                         else p_program_areas[1:40] end;
begin
  if v_query is not null then
    select coalesce(array_agg(w), '{}') into v_words
      from regexp_split_to_table(v_query, '[^a-z0-9]+') w where w <> '';
  end if;

  return query
  with candidates as (
    select i.slug, i.name, i.city, i.state, i.control, i.level, i.setting, i.undergraduate_enrollment, i.enrollment_term,
           i.search_text, i.open_admission,
           p.association_code, aa.short_name as association_short_name, p.division_code, d.name as division_name,
           aa.two_year as two_year_association, p.conference, p.season as program_season, p.verification,
           a.term as admissions_term, a.admission_rate, a.sat_erw_25, a.sat_erw_75, a.sat_math_25, a.sat_math_75,
           a.act_composite_25, a.act_composite_75, a.test_policy,
           c.academic_year as cost_year, c.cost_of_attendance, c.tuition_in_state, c.tuition_out_of_state,
           case when v_query is null then 0::real
                else (case when lower(extensions.unaccent(i.name)) = v_query then 3
                           when lower(extensions.unaccent(i.name)) like v_query || '%' then 2
                           when exists (select 1 from public.institution_aliases al
                                         where al.institution_id = i.id and lower(extensions.unaccent(al.alias)) = v_query) then 2
                           else 0 end)::real
                     + extensions.word_similarity(v_query, i.search_text) end as relevance
      from public.institutions i
      join public.baseball_programs p on p.institution_id = i.id and p.status = 'active'
      join public.athletic_divisions d on d.code = p.division_code
      join public.athletic_associations aa on aa.code = p.association_code
      left join lateral (select s.term, s.admission_rate, s.sat_erw_25, s.sat_erw_75, s.sat_math_25, s.sat_math_75,
                                s.act_composite_25, s.act_composite_75, s.test_policy
                           from public.admissions_statistics s
                          where s.institution_id = i.id order by s.term_year desc limit 1) a on true
      left join lateral (select k.academic_year, k.cost_of_attendance, k.tuition_in_state, k.tuition_out_of_state
                           from public.institution_costs k
                          where k.institution_id = i.id order by k.academic_year desc limit 1) c on true
     where i.is_listed
       and (v_query is null
            or (select bool_and(i.search_text like '%' || w || '%') from unnest(v_words) w)
            or extensions.word_similarity(v_query, i.search_text) >= 0.45)
       and (p_states is null or cardinality(p_states) = 0 or i.state = any (p_states))
       and (p_divisions is null or cardinality(p_divisions) = 0 or p.division_code = any (p_divisions))
       and (p_controls is null or cardinality(p_controls) = 0 or i.control = any (p_controls))
       and (p_levels is null or cardinality(p_levels) = 0 or i.level = any (p_levels))
       and (p_settings is null or cardinality(p_settings) = 0 or i.setting = any (p_settings))
       and (p_min_enrollment is null or i.undergraduate_enrollment >= p_min_enrollment)
       and (p_max_enrollment is null or i.undergraduate_enrollment <= p_max_enrollment)
       and (p_min_admission_rate is null or a.admission_rate >= p_min_admission_rate)
       and (p_max_admission_rate is null or a.admission_rate <= p_max_admission_rate)
       and (p_test_policies is null or cardinality(p_test_policies) = 0 or a.test_policy = any (p_test_policies))
       and (p_max_cost is null or c.cost_of_attendance <= p_max_cost)
       and (v_areas is null or i.bachelors_areas && v_areas or i.associate_areas && v_areas)
  )
  select c.slug, c.name, c.city, c.state, c.control, c.level, c.setting, c.undergraduate_enrollment, c.enrollment_term,
         c.association_code, c.association_short_name, c.division_code, c.division_name, c.two_year_association,
         c.conference, c.program_season, c.verification, c.admissions_term, c.admission_rate,
         c.sat_erw_25, c.sat_erw_75, c.sat_math_25, c.sat_math_75, c.act_composite_25, c.act_composite_75, c.test_policy,
         c.cost_year, c.cost_of_attendance, c.tuition_in_state, c.tuition_out_of_state, c.open_admission, c.relevance,
         count(*) over () as total_count
    from candidates c
   order by
     case when v_sort = 'relevance' then c.relevance end desc nulls last,
     case when v_sort = 'admission_rate' then c.admission_rate end asc nulls last,
     case when v_sort = 'cost' then c.cost_of_attendance end asc nulls last,
     case when v_sort = 'enrollment' then c.undergraduate_enrollment end desc nulls last,
     c.name, c.state, c.slug
   limit v_limit offset v_offset;
end;
$$;
comment on function public.search_schools is
  'Free school search: listed institutions with an active baseball program, with their latest admissions and published prices. A filter on admission rate, test policy, enrollment, cost or program area leaves out schools that do not report that figure.';

revoke all on function public.search_schools(text, text[], text[], public.institution_control[], public.institution_level[],
  public.campus_setting[], integer, integer, numeric, numeric, public.test_policy[], integer, text, integer, integer, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.search_schools(text, text[], text[], public.institution_control[], public.institution_level[],
  public.campus_setting[], integer, integer, numeric, numeric, public.test_policy[], integer, text, integer, integer, text[])
  to anon, authenticated;
