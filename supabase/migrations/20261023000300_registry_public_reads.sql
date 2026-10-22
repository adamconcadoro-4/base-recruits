-- =============================================================================
-- Base Recruits — Stage 2 / Migration 3: public registry reads
--
-- Free for everyone, signed in or not (permanent free-access invariant: basic
-- school discovery and comparison are never paywalled). These functions are
-- SECURITY INVOKER: they read through the same row-level security as a direct
-- query, so unlisted institutions stay hidden from visitors.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Search: listed institutions with an active baseball program
-- -----------------------------------------------------------------------------
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
  p_offset integer default 0
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
begin
  if v_query is not null then
    select coalesce(array_agg(w), '{}') into v_words
      from regexp_split_to_table(v_query, '[^a-z0-9]+') w where w <> '';
  end if;

  return query
  with candidates as (
    select i.slug, i.name, i.city, i.state, i.control, i.level, i.setting, i.undergraduate_enrollment, i.enrollment_term,
           i.search_text,
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
      left join lateral (select s.* from public.admissions_statistics s
                          where s.institution_id = i.id order by s.term_year desc limit 1) a on true
      left join lateral (select k.* from public.institution_costs k
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
  )
  select c.slug, c.name, c.city, c.state, c.control, c.level, c.setting, c.undergraduate_enrollment, c.enrollment_term,
         c.association_code, c.association_short_name, c.division_code, c.division_name, c.two_year_association,
         c.conference, c.program_season, c.verification, c.admissions_term, c.admission_rate,
         c.sat_erw_25, c.sat_erw_75, c.sat_math_25, c.sat_math_75, c.act_composite_25, c.act_composite_75, c.test_policy,
         c.cost_year, c.cost_of_attendance, c.tuition_in_state, c.tuition_out_of_state, c.relevance,
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
  'Free school search: listed institutions with an active baseball program, with their latest admissions and published prices. A filter on admission rate, test policy, enrollment or cost leaves out schools that do not report that figure.';

-- -----------------------------------------------------------------------------
-- One school's public record, with sources. Null when not found or unlisted.
-- -----------------------------------------------------------------------------
create function public.get_school(p_slug text) returns jsonb
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
comment on function public.get_school(text) is
  'One listed institution with its baseball program, latest admissions and published prices, each with its source and year.';

-- -----------------------------------------------------------------------------
-- Up to five schools for side-by-side comparison, in the order asked.
-- -----------------------------------------------------------------------------
create function public.compare_schools(p_slugs text[]) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(s.school order by s.position), '[]'::jsonb)
    from (select distinct on (lower(btrim(x.slug))) x.position, public.get_school(x.slug) as school
            from unnest(p_slugs[1:5]) with ordinality as x(slug, position)
           where x.slug is not null
           order by lower(btrim(x.slug)), x.position) s
   where s.school is not null
$$;
comment on function public.compare_schools(text[]) is
  'Side-by-side records for up to five schools (extra slugs are ignored; unknown or unlisted ones are left out).';

-- -----------------------------------------------------------------------------
-- Coverage and quality statistics (public; counts only)
-- -----------------------------------------------------------------------------
create function public.registry_coverage() returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with listed as (
    select i.id, i.level, p.status, p.division_code, p.association_code, p.verification, p.conference, p.season,
           p.source_retrieved_at,
           (select s.term from public.admissions_statistics s where s.institution_id = i.id order by s.term_year desc limit 1) as adm_term,
           (select s.term_year from public.admissions_statistics s where s.institution_id = i.id order by s.term_year desc limit 1) as adm_year,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id and s.admission_rate is not null) as has_rate,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id
                    and (s.sat_math_25 is not null or s.act_composite_25 is not null)) as has_scores,
           exists (select 1 from public.admissions_statistics s where s.institution_id = i.id and s.test_policy is not null) as has_policy,
           exists (select 1 from public.institution_costs c where c.institution_id = i.id and c.cost_of_attendance is not null) as has_cost
      from public.institutions i join public.baseball_programs p on p.institution_id = i.id
     where i.is_listed
  ), active as (select * from listed where status = 'active'),
  newest as (select max(adm_year) as y from active)
  select jsonb_build_object(
    'active_programs', (select count(*) from active),
    'programs_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                             from (select status, count(*) n from listed group by status) x),
    'by_division', (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'association', d.association_code,
                                                                   'count', (select count(*) from active a where a.division_code = d.code))
                                              order by d.sort_order), '[]'::jsonb)
                      from public.athletic_divisions d),
    'seasons', (select coalesce(jsonb_agg(distinct season), '[]'::jsonb) from active),
    'with_admission_rate', (select count(*) from active where has_rate),
    'with_test_scores', (select count(*) from active where has_scores),
    'with_test_policy', (select count(*) from active where has_policy),
    'with_cost_of_attendance', (select count(*) from active where has_cost),
    'with_gpa', 0,
    'four_year_without_admissions', (select count(*) from active where level = 'four_year' and adm_term is null),
    'stale_admissions', (select count(*) from active, newest where adm_year is not null and adm_year < newest.y),
    'latest_admissions_term', (select max(adm_term) from active),
    'latest_cost_year', (select max(c.academic_year) from public.institution_costs c
                          join active a on a.id = c.institution_id),
    'association_or_school_verified', (select count(*) from active where verification <> 'federal_report'),
    'federal_report_only', (select count(*) from active where verification = 'federal_report'),
    'with_conference', (select count(*) from active where conference is not null),
    'last_retrieved_at', (select max(source_retrieved_at) from active))
$$;
comment on function public.registry_coverage() is
  'Actual registry coverage: confirmed active programs by division, admissions/cost coverage and verification levels. GPA is always 0 until a school-published source is added.';

-- -----------------------------------------------------------------------------
-- Privileges: free for everyone
-- -----------------------------------------------------------------------------
revoke all on function public.search_schools(text, text[], text[], public.institution_control[], public.institution_level[],
  public.campus_setting[], integer, integer, numeric, numeric, public.test_policy[], integer, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_school(text) from public, anon, authenticated, service_role;
revoke all on function public.compare_schools(text[]) from public, anon, authenticated, service_role;
revoke all on function public.registry_coverage() from public, anon, authenticated, service_role;

grant execute on function public.search_schools(text, text[], text[], public.institution_control[], public.institution_level[],
  public.campus_setting[], integer, integer, numeric, numeric, public.test_policy[], integer, text, integer, integer)
  to anon, authenticated;
grant execute on function public.get_school(text) to anon, authenticated;
grant execute on function public.compare_schools(text[]) to anon, authenticated;
grant execute on function public.registry_coverage() to anon, authenticated;
