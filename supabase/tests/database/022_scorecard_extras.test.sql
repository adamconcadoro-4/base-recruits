-- College Scorecard extras (open admission, programs offered): validated on
-- import, applied on publish, rolled back by restaging, and served by the free
-- public reads. Uses the 13 real records in tests/bootstrap/20_registry_fixture.sql
-- with test-only values added for two of them.

select tests.create_user('admin', 'parent', 'extras.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.authenticate_as('admin');

-- A first publish without the new fields (as today's bundled snapshot).
select tests.remember_job('plain', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('plain'), tests.snapshot_rows());
select public.admin_finalize_import_job(tests.job('plain'));
select public.admin_publish_import_job(tests.job('plain'), 'Without extras');
select tests.ok(
  not exists (select 1 from public.institutions where open_admission is not null or programs_source_year is not null),
  'a snapshot without the new fields leaves them unreported (null), never false or empty');

-- A snapshot with extras: Long Beach City College is open admission and offers
-- associate programs; Stanford is not open admission and offers two bachelor's areas.
select tests.remember_job('extras', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('extras'), (
  select jsonb_agg(case
           when (r ->> 'unitid')::int = 117645 then jsonb_set(jsonb_set(r, '{record,facts,open_admission}', 'true'),
             '{record,facts,programs}', '{"scorecard_year": 2024, "bachelors": [], "associate": ["business_marketing", "health"]}')
           when (r ->> 'unitid')::int = 243744 then jsonb_set(jsonb_set(r, '{record,facts,open_admission}', 'false'),
             '{record,facts,programs}', '{"scorecard_year": 2024, "bachelors": ["engineering", "history"], "associate": []}')
           else r end)
    from jsonb_array_elements(tests.snapshot_rows()) r));
select tests.ok(
  (select public.admin_finalize_import_job(tests.job('extras'))) @> '{"changed": 2, "unchanged": 11, "invalid": 0}',
  'review shows the two records whose new fields changed');
select tests.ok(
  (select changes = '{"facts.open_admission": {"old": null, "new": true},
                      "facts.programs.associate": {"old": null, "new": ["business_marketing", "health"]},
                      "facts.programs.bachelors": {"old": null, "new": []},
                      "facts.programs.scorecard_year": {"old": null, "new": 2024}}'::jsonb
     from public.data_import_rows where job_id = tests.job('extras') and unitid = 117645),
  'the review lists the new fields old and new, like every other field');
select tests.ok(
  (select public.admin_publish_import_job(tests.job('extras'), 'With extras')) = '{"applied": 2, "marked_not_reported": 0, "skipped": 0}',
  'publishing applies the two changed records');
select tests.ok(
  (select open_admission and associate_areas = '{business_marketing,health}' and bachelors_areas = '{}' and programs_source_year = 2024
     from public.institutions where unitid = 117645)
  and (select open_admission = false and bachelors_areas = '{engineering,history}' from public.institutions where unitid = 243744),
  'publishing writes open admission and programs');
select tests.ok(
  (select count(*) from public.registry_revisions r join public.institutions i on i.id = r.institution_id
    where r.import_job_id = tests.job('extras') and r.entity_type = 'institution' and i.unitid = 117645
      and r.after ->> 'open_admission' = 'true' and r.before ->> 'open_admission' is null) = 1
  and not exists (select 1 from public.registry_revisions r join public.institutions i on i.id = r.institution_id
                   where r.import_job_id = tests.job('extras') and r.entity_type = 'institution'
                     and i.unitid not in (117645, 243744)),
  'the change log records the new values with the import, and institutions without changes log nothing');

-- Validation
select tests.remember_job('bad', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('bad'), (
  select jsonb_agg(case
           when (r ->> 'unitid')::int = 117645 then jsonb_set(r, '{record,facts,open_admission}', '"yes"')
           when (r ->> 'unitid')::int = 243744 then jsonb_set(r, '{record,facts,programs}',
             '{"scorecard_year": 2024, "bachelors": ["history", "engineering"], "associate": []}')
           when (r ->> 'unitid')::int = 110635 then jsonb_set(r, '{record,facts,programs}',
             '{"scorecard_year": 2024, "bachelors": ["basket_weaving"], "associate": []}')
           when (r ->> 'unitid')::int = 166027 then jsonb_set(r, '{record,facts,programs}', '{"bachelors": [], "associate": []}')
           else r end)
    from jsonb_array_elements(tests.snapshot_rows()) r));
select public.admin_finalize_import_job(tests.job('bad'));
select tests.ok(
  (select 'open_admission must be true, false or absent' = any (problems) from public.data_import_rows
    where job_id = tests.job('bad') and unitid = 117645),
  'an open admission value that is not true or false is refused');
select tests.ok(
  (select count(*) from public.data_import_rows
    where job_id = tests.job('bad') and unitid in (243744, 110635, 166027)
      and 'programs need a data year and sorted lists of known program areas for bachelors and associate' = any (problems)) = 3,
  'program lists must be sorted, known and carry their data year');
select public.admin_discard_import_job(tests.job('bad'));

-- Public reads
select tests.authenticate_as_anon();
select tests.ok(
  (select (s -> 'institution' ->> 'open_admission')::boolean
          and s -> 'institution' -> 'programs' = '{"scorecard_year": 2024, "bachelors": [],
             "associate": [{"code": "health", "name": "Health professions"},
                           {"code": "business_marketing", "name": "Business, management and marketing"}]}'::jsonb
     from public.get_school('long-beach-city-college-ca') s),
  'a school page gets open admission and its program areas by name, in catalog order');
select tests.ok(
  (select s -> 'institution' -> 'programs' = 'null'::jsonb and s -> 'institution' -> 'open_admission' = 'null'::jsonb
     from public.get_school('harvard-university-ma') s),
  'a school with nothing reported says so (null), not an empty list');
select tests.ok(
  (select array_agg(slug order by slug) from public.search_schools(p_program_areas => '{engineering}'))
    = array['stanford-university-ca']
  and (select array_agg(slug order by slug) from public.search_schools(p_program_areas => '{health,engineering}'))
    = array['long-beach-city-college-ca', 'stanford-university-ca']
  and (select count(*) from public.search_schools(p_program_areas => '{}')) = 13,
  'the majors filter matches any chosen area at either level; an empty filter lists every school');
select tests.ok(
  (select open_admission from public.search_schools('Long Beach')) is true,
  'search results carry open admission');
select tests.ok((select count(*) from public.program_areas) = 38, 'visitors can read the 38 program areas');

-- Rollback: restaging the plain snapshot clears the extras again.
select tests.authenticate_as('admin');
select tests.remember_job('rollback', public.admin_restage_import_job(tests.job('plain')));
select public.admin_publish_import_job(tests.job('rollback'), 'Roll back');
select tests.ok(
  not exists (select 1 from public.institutions where open_admission is not null or programs_source_year is not null),
  'restaging a snapshot without extras rolls them back');
