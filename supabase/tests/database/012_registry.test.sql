-- Registry import, review, publish, reconcile and public reads, using the 13
-- real records in tests/bootstrap/20_registry_fixture.sql.

select tests.create_user('admin', 'parent', 'registry.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2000-01-01');

-- ---------------------------------------------------------------- who may import
select tests.authenticate_as_anon();
select tests.throws('select tests.create_job(13)', '42501', 'signed-out visitors cannot start an import');
select tests.authenticate_as('athlete');
select tests.throws('select tests.create_job(13)', 'BR002', 'non-admin accounts cannot start an import');

-- ---------------------------------------------------------------- staging
select tests.authenticate_as('admin');
select tests.remember_job('first', tests.create_job(13));
select tests.ok(
  (select season = '2024-25' and admissions_term = 'Fall 2024' and cost_year = '2025-26' and status = 'staging'
     from public.data_import_jobs where id = tests.job('first')),
  'a job takes its season from EADA and its admissions term and cost year from the College Scorecard years');
select tests.throws('select tests.create_job(13)', 'BR004', 'only one import can be staged at a time');
select tests.throws(
  format('select public.admin_stage_import_rows(%L, %L)', tests.job('first'),
         (select jsonb_agg(jsonb_build_object('unitid', g, 'record', '{}'::jsonb)) from generate_series(1, 501) g)),
  'BR003', 'rows arrive in chunks of at most 500');
select tests.ok(public.admin_stage_import_rows(tests.job('first'), tests.rows_between(1, 7)) = 7, 'a first chunk is staged');
select tests.throws(format('select public.admin_finalize_import_job(%L)', tests.job('first')), 'BR004',
  'review cannot start before every declared row has arrived');
select tests.throws(format('select public.admin_stage_import_rows(%L, %L)', tests.job('first'), tests.rows_between(7, 7)),
  'BR003', 'the same institution cannot be staged twice');
select tests.ok(public.admin_stage_import_rows(tests.job('first'), tests.rows_between(8, 13)) = 13, 'the rest is staged');
select tests.throws(format('select public.admin_stage_import_rows(%L, %L)', tests.job('first'), tests.rows_between(1, 1)),
  'BR003', 'a job cannot receive more rows than its snapshot declared');
select tests.ok(
  (select public.admin_finalize_import_job(tests.job('first')))
    @> '{"new": 13, "changed": 0, "unchanged": 0, "missing": 0, "invalid": 0, "with_source_issues": 1}',
  'review shows all 13 real records as new, valid, and the one EADA-only institution with its source issue');

-- ---------------------------------------------------------------- nothing is public before publishing
select tests.authenticate_as_anon();
select tests.ok((select count(*) from public.search_schools()) = 0, 'staged records are not visible to anyone before publishing');
select tests.throws('select count(*) from public.data_import_jobs', '42501', 'visitors cannot read import jobs');
select tests.authenticate_as('athlete');
select tests.ok(tests.visible_count('select 1 from public.data_import_jobs') = 0
            and tests.visible_count('select 1 from public.data_import_rows') = 0,
  'signed-in non-admins see no import jobs or staged rows');
select tests.throws(format('select public.admin_publish_import_job(%L)', tests.job('first')), 'BR002',
  'non-admin accounts cannot publish');

-- ---------------------------------------------------------------- publish
select tests.authenticate_as('admin');
select tests.ok(
  (select public.admin_publish_import_job(tests.job('first'), 'First registry publish (EADA 2024-25)'))
    = '{"applied": 13, "marked_not_reported": 0, "skipped": 0}',
  'publishing applies all 13 reviewed records');
select tests.throws(format('select public.admin_publish_import_job(%L)', tests.job('first')), 'BR004',
  'a published import cannot be published twice');

select tests.clear_authentication();
select tests.ok(
  (select i.slug = 'stanford-university-ca' and i.facts_source_id = 'college_scorecard'
          and i.enrollment_term = 'Fall 2024' and i.undergraduate_enrollment = 7554
          and p.status = 'active' and p.season = '2024-25' and p.division_code = 'ncaa_d1'
          and p.verification = 'federal_report' and p.reported_participants = 38
          and p.source_dataset = 'EADA_2024-2025.zip'
          and a.term = 'Fall 2024' and a.admission_rate = 0.0361 and a.test_policy = 'considered_not_required'
          and a.sat_math_25 = 770 and a.act_composite_75 = 35
          and c.academic_year = '2025-26' and c.cost_of_attendance = 92892
     from public.institutions i
     join public.baseball_programs p on p.institution_id = i.id
     join public.admissions_statistics a on a.institution_id = i.id
     join public.institution_costs c on c.institution_id = i.id
    where i.unitid = 243744),
  'a published record keeps the source values with their season, term and academic year');
select tests.ok(
  (select i.facts_source_id = 'eada' and i.slug = 'frontier-community-college-il'
          and not exists (select 1 from public.admissions_statistics a where a.institution_id = i.id)
          and not exists (select 1 from public.institution_costs c where c.institution_id = i.id)
     from public.institutions i where i.unitid = 403469),
  'an institution College Scorecard does not cover keeps its EADA facts and has no admissions or cost rows');
select tests.ok(
  (select count(*) from public.registry_revisions where import_job_id = tests.job('first') and action = 'insert'
      and actor_id = tests.id('admin')) >= 13 * 3,
  'every inserted registry row has a revision tagged with the import job and the administrator');
select tests.ok(
  exists (select 1 from public.audit_events where action = 'registry.import_published'
           and entity_id = tests.job('first')::text and actor_id = tests.id('admin')),
  'publishing is in the audit log');
select tests.throws('update public.registry_revisions set reason = ''edited''', 'BR002', 'the revision log is append-only');

-- ---------------------------------------------------------------- free public reads
select tests.authenticate_as_anon();
select tests.ok(
  (select slug = 'stanford-university-ca' and division_name = 'NCAA Division I' and admissions_term = 'Fall 2024'
          and cost_year = '2025-26' and total_count = 1
     from public.search_schools('Stanford')),
  'a visitor finds a school by name, with its division and data years');
select tests.ok((select slug from public.search_schools('uc berkeley') limit 1) = 'university-of-california-berkeley-ca',
  'aliases from the source are searchable');
select tests.ok((select slug from public.search_schools('stanfrod') limit 1) = 'stanford-university-ca',
  'a misspelled name still finds the school');
select tests.ok((select count(*) from public.search_schools()) = 13
            and (select max(total_count) from public.search_schools(p_limit => 5)) = 13
            and (select count(*) from public.search_schools(p_limit => 5)) = 5,
  'the unfiltered list has every published program, paged, with the full count');
select tests.ok(
  (select array_agg(slug order by slug) from public.search_schools(p_divisions => '{cccaa}'))
    = array['long-beach-city-college-ca'],
  'division filter: CCCAA lists the California community college');
select tests.ok(
  (select array_agg(slug order by slug) from public.search_schools(p_max_admission_rate => 0.05))
    = array['harvard-university-ma', 'stanford-university-ca'],
  'admission-rate filter keeps only schools that report a rate within it');
select tests.ok(
  (select array_agg(slug order by slug) from public.search_schools(p_test_policies => '{not_considered}'))
    = array['united-states-sports-university-al', 'university-of-california-berkeley-ca'],
  'test-policy filter: test-blind');
select tests.ok(
  (select array_agg(slug order by slug) from public.search_schools(p_states => '{IL}'))
    = array['college-of-dupage-il', 'frontier-community-college-il'],
  'state filter');
select tests.ok(
  (select slug from public.search_schools(p_sort => 'cost') limit 1) = (
    select i.slug from public.institutions i join public.institution_costs c on c.institution_id = i.id
     order by c.cost_of_attendance limit 1)
  and (select slug from public.search_schools(p_sort => 'cost') offset 12 limit 1) = 'frontier-community-college-il',
  'cost sort runs cheapest first and puts schools without a published cost last');
select tests.ok(
  (select (s -> 'program' -> 'division' ->> 'name') = 'NCAA Division I'
          and (s -> 'program' -> 'source' ->> 'dataset') = 'EADA_2024-2025.zip'
          and (s -> 'program' -> 'source' ->> 'name') = 'Equity in Athletics Data Analysis (EADA)'
          and (s -> 'admissions' ->> 'term') = 'Fall 2024'
          and (s -> 'admissions' ->> 'score_cohort') = 'enrolled_first_time_score_users'
          and (s -> 'admissions' -> 'source' ->> 'name') = 'College Scorecard'
          and (s -> 'costs' ->> 'academic_year') = '2025-26'
          and (s -> 'institution' ->> 'price_calculator_url') like 'https://financialaid.stanford.edu/%'
     from public.get_school('stanford-university-ca') s),
  'a school page carries every figure''s source, dataset and year');
select tests.ok(
  (select s -> 'admissions' = 'null'::jsonb and s -> 'costs' = 'null'::jsonb and (s -> 'program' ->> 'status') = 'active'
     from public.get_school('frontier-community-college-il') s),
  'missing figures come back as missing, not as zero');
select tests.ok(public.get_school('no-such-school') is null, 'an unknown slug is simply not found');
select tests.ok(
  (select jsonb_agg(x -> 'institution' ->> 'slug')
     from jsonb_array_elements(public.compare_schools(array['harvard-university-ma', 'no-such-school', 'stanford-university-ca',
       'harvard-university-ma', 'alabama-a-and-m-university-al', 'faulkner-university-al', 'huntingdon-college-al',
       'college-of-dupage-il'])) x)
  = '["harvard-university-ma", "stanford-university-ca", "alabama-a-and-m-university-al"]'::jsonb,
  'compare takes at most five slugs, in order, without duplicates or unknown schools');
select tests.ok(
  (select (c ->> 'active_programs')::int = 13 and (c ->> 'with_gpa')::int = 0
          and (c ->> 'with_admission_rate')::int = 9 and (c ->> 'federal_report_only')::int = 13
          and (c ->> 'latest_admissions_term') = 'Fall 2024'
          and (select (x ->> 'count')::int from jsonb_array_elements(c -> 'by_division') x where x ->> 'code' = 'ncaa_d1') = 5
     from public.registry_coverage() c),
  'coverage reports the actual counts, including zero GPA coverage');
select tests.throws('update public.institutions set name = ''Changed''', '42501', 'visitors cannot change registry rows');

select tests.authenticate_as('athlete');
select tests.throws('update public.baseball_programs set status = ''inactive''', '42501',
  'signed-in users cannot change registry rows directly');
select tests.ok(tests.visible_count('select 1 from public.registry_revisions') = 0, 'non-admins cannot read the revision log');

-- ---------------------------------------------------------------- re-import: unchanged, changed, missing, invalid
select tests.authenticate_as('admin');
select tests.remember_job('again', public.admin_restage_import_job(tests.job('first')));
select tests.ok(
  (select counts @> '{"unchanged": 13, "changed": 0, "missing": 0, "new": 0}' and restaged_from = tests.job('first')
     from public.data_import_jobs where id = tests.job('again')),
  'restaging the same snapshot finds nothing to change');
select tests.lives(format('select public.admin_discard_import_job(%L)', tests.job('again')), 'an import can be discarded');
select tests.throws(format('select public.admin_publish_import_job(%L)', tests.job('again')), 'BR004',
  'a discarded import cannot be published');

-- A test-only edited copy: Stanford's cost changes, Harvard is absent, and one
-- record names an association/division pair that does not exist.
select tests.remember_job('edited', tests.create_job(12));
select public.admin_stage_import_rows(tests.job('edited'), (
  select jsonb_agg(case
           when (r ->> 'unitid')::int = 243744 then jsonb_set(r, '{record,costs,cost_of_attendance}', '95000')
           when (r ->> 'unitid')::int = 101189 then jsonb_set(r, '{record,baseball,division}', '"ncaa_d1"')
           else r end)
    from jsonb_array_elements(tests.snapshot_rows()) r where (r ->> 'unitid')::int <> 166027));
select tests.ok(
  (select public.admin_finalize_import_job(tests.job('edited'))) @> '{"changed": 1, "unchanged": 10, "missing": 1, "invalid": 1}',
  'review classifies changed, unchanged, missing and invalid records');
select tests.ok(
  (select changes = '{"costs.cost_of_attendance": {"old": 92892, "new": 95000}}'::jsonb
     from public.data_import_rows where job_id = tests.job('edited') and unitid = 243744),
  'a changed record lists exactly the fields that differ, old and new');
select tests.ok(
  (select changes = '{"baseball.status": {"old": "active", "new": "not_reported"}}'::jsonb and decision = 'apply'
     from public.data_import_rows where job_id = tests.job('edited') and unitid = 166027),
  'a program missing from the new release would be marked not reported');
select tests.ok(
  (select decision = 'skip' and 'association and division are not a known pair' = any (problems)
     from public.data_import_rows where job_id = tests.job('edited') and unitid = 101189),
  'an invalid record is explained and skipped');
select tests.throws(format('select public.admin_set_import_decision(%L, 101189, ''apply'')', tests.job('edited')), 'BR004',
  'an invalid record cannot be forced through');
select tests.lives(format('select public.admin_set_import_decision(%L, 243744, ''skip'')', tests.job('edited')),
  'an administrator can skip a change they do not accept');
select tests.ok(
  (select public.admin_publish_import_job(tests.job('edited'), 'Test release'))
    = '{"applied": 0, "marked_not_reported": 1, "skipped": 2}',
  'publishing applies only accepted rows');
select tests.ok(
  (select c.cost_of_attendance = 92892 from public.institution_costs c join public.institutions i on i.id = c.institution_id
    where i.unitid = 243744),
  'a skipped change leaves the published value as it was');

select tests.authenticate_as_anon();
select tests.ok(not exists (select 1 from public.search_schools('Harvard')),
  'a program the newest release no longer reports drops out of search');
select tests.ok((select s -> 'program' ->> 'status' from public.get_school('harvard-university-ma') s) = 'not_reported',
  'its page says it is not reported rather than pretending it is active');

-- ---------------------------------------------------------------- stale reviews and rollback
select tests.authenticate_as('admin');
select tests.remember_job('restore_a', public.admin_restage_import_job(tests.job('first')));
select tests.remember_job('restore_b', public.admin_restage_import_job(tests.job('first')));
select tests.ok(
  (select counts @> '{"changed": 1, "unchanged": 12}' from public.data_import_jobs where id = tests.job('restore_b')),
  'restaging the first import shows Harvard returning');
select tests.lives(format('select public.admin_publish_import_job(%L, ''Roll back to the first import'')', tests.job('restore_b')),
  'an earlier import can be published again (rollback)');
select tests.throws(format('select public.admin_publish_import_job(%L)', tests.job('restore_a')), 'BR004',
  'a review made before another publish must be staged again');
select tests.ok(
  (select p.status = 'active' from public.baseball_programs p join public.institutions i on i.id = p.institution_id
    where i.unitid = 166027),
  'the rollback restored the program');

-- ---------------------------------------------------------------- reconcile a program against an official page
select tests.ok(
  (select p.association_code = 'other' and p.classification_other = 'NCAA DIII w/FB; M/W LAX DI'
     from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 162928),
  'EADA''s "Other" classification is kept as reported until someone checks it');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''ncaa'', ''ncaa_d3'', null, null, null, null, ''official_athletics_site'', null, ''Checked the athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'BR003', 'a correction must cite the page that was checked');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''ncaa'', ''ncaa_d3'', null, null, null, null, ''federal_report'', ''https://hopkinssports.com/sports/baseball'', ''Checked the athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'BR003', 'a division correction needs a verification level beyond the federal listing');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''naia'', ''ncaa_d3'', null, null, null, null, ''official_athletics_site'', ''https://hopkinssports.com/sports/baseball'', ''Checked the athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'BR003', 'association and division must match');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''ncaa'', ''ncaa_d3'', null, ''http://hopkinssports.com/sports/baseball'', null, null, ''official_athletics_site'', ''https://hopkinssports.com/sports/baseball'', ''Checked the athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'BR003', 'program links must be https');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''ncaa'', ''ncaa_d3'', null, null, null, null, ''official_athletics_site'', ''https://hopkinssports.com@evil.example/x'', ''Checked the athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'BR003', 'evidence links cannot hide another host behind a user name');
select tests.lives(format(
  'select public.admin_update_baseball_program(%L, ''active'', ''ncaa'', ''ncaa_d3'', ''Centennial Conference'', ''https://hopkinssports.com/sports/baseball'', null, null, ''official_athletics_site'', ''https://hopkinssports.com/sports/baseball'', ''Baseball schedule and conference listed on the official athletics site'')',
  (select id from public.institutions where unitid = 162928)), 'an administrator corrects the division with the official page as evidence');

select tests.authenticate_as('athlete');
select tests.throws(format(
  'select public.admin_update_baseball_program(%L, ''inactive'', ''ncaa'', ''ncaa_d3'', null, null, null, null, ''official_athletics_site'', ''https://hopkinssports.com/sports/baseball'', ''not an admin'')',
  (select id from public.institutions where unitid = 162928)), 'BR002', 'non-admins cannot reconcile programs');

select tests.authenticate_as_anon();
select tests.ok(
  (select (s -> 'program' -> 'division' ->> 'name') = 'NCAA Division III' and (s -> 'program' ->> 'conference') = 'Centennial Conference'
          and (s -> 'program' ->> 'verification') = 'official_athletics_site'
          and (s -> 'program' ->> 'verification_source_url') = 'https://hopkinssports.com/sports/baseball'
     from public.get_school('johns-hopkins-university-md') s),
  'the corrected division, conference and evidence appear publicly');

select tests.authenticate_as('admin');
select tests.lives(format(
  'select public.admin_update_baseball_program(%L, ''inactive'', ''ncaa'', ''ncaa_d1'', null, null, null, null, ''official_athletics_site'', ''https://aamusports.com/sports/baseball'', ''Test: program marked discontinued'')',
  (select id from public.institutions where unitid = 100654)), 'an administrator can record a confirmed status change');
select tests.ok(
  (select reason = 'Test: program marked discontinued' and actor_id = tests.id('admin')
     from public.registry_revisions r where r.entity_type = 'baseball_program'
      and r.institution_id = (select id from public.institutions where unitid = 100654) order by id desc limit 1),
  'the revision log keeps who changed the program and why');

-- Re-importing the same season keeps both administrator decisions.
select tests.remember_job('after_review', public.admin_restage_import_job(tests.job('first')));
select tests.ok(
  (select change = 'unchanged' and problems[1] like 'EADA classification differs%'
     from public.data_import_rows where job_id = tests.job('after_review') and unitid = 162928)
  and (select change = 'unchanged' and problems[1] like 'keeps the administrator''s decision%'
     from public.data_import_rows where job_id = tests.job('after_review') and unitid = 100654),
  're-importing the same season keeps verified divisions and status decisions, and says so');
select public.admin_publish_import_job(tests.job('after_review'));
select tests.ok(
  (select p.division_code = 'ncaa_d3' from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 162928)
  and (select p.status = 'inactive' from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 100654),
  'after publishing, the corrections still stand');

-- ---------------------------------------------------------------- listing
select tests.throws(format('select public.admin_set_institution_listing(%L, false, '''')',
  (select id from public.institutions where unitid = 110635)), 'BR003', 'hiding a school needs a reason');
select tests.lives(format('select public.admin_set_institution_listing(%L, false, ''Duplicate under review'')',
  (select id from public.institutions where unitid = 110635)), 'an administrator can hide a school');
select tests.ok(tests.visible_count('select 1 from public.institutions where unitid = 110635') = 1,
  'administrators still see the hidden school');
select tests.authenticate_as_anon();
select tests.ok(not exists (select 1 from public.search_schools('berkeley')) and public.get_school('university-of-california-berkeley-ca') is null
            and tests.visible_count('select 1 from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 110635') = 0,
  'a hidden school and its program disappear from every public read');
select tests.authenticate_as('admin');
select public.admin_set_institution_listing((select id from public.institutions where unitid = 110635), true, 'Review finished');
select tests.authenticate_as_anon();
select tests.ok(exists (select 1 from public.search_schools('berkeley')), 'listing it again brings it back');
select tests.clear_authentication();

-- ---------------------------------------------------------------- review regressions
select tests.clear_authentication();
create function tests.season_sources(p_season text) returns jsonb language sql immutable as $$
  select jsonb_agg(case when s ->> 'id' = 'eada' then jsonb_set(s, '{season}', to_jsonb(p_season)) else s end)
    from jsonb_array_elements(tests.snapshot_sources()) s
$$;
select tests.authenticate_as('admin');

-- A confirmed status survives an older season's import and the current one after it.
select tests.remember_job('older_season', public.admin_create_import_job('registry-2023-24.json', repeat('c', 64), repeat('d', 64),
  'base-recruits.registry-snapshot/1', now(), tests.season_sources('2023-24'), 13));
select public.admin_stage_import_rows(tests.job('older_season'),
  (select jsonb_agg(jsonb_set(r, '{record,baseball,season}', '"2023-24"')) from jsonb_array_elements(tests.snapshot_rows()) r));
select public.admin_finalize_import_job(tests.job('older_season'));
select public.admin_publish_import_job(tests.job('older_season'), 'Test: roll back a season');
select tests.remember_job('current_again', public.admin_restage_import_job(tests.job('first')));
select public.admin_publish_import_job(tests.job('current_again'));
select tests.ok(
  (select p.status = 'inactive' and p.status_source = 'admin' and p.status_season = '2024-25' and p.season = '2024-25'
     from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 100654),
  'a confirmed status survives rolling back to an older season and forward again');

-- Only a fully staged and reviewed import can be staged again.
select tests.remember_job('partial', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('partial'), tests.rows_between(1, 5));
select public.admin_discard_import_job(tests.job('partial'));
select tests.throws(format('select public.admin_restage_import_job(%L)', tests.job('partial')), 'BR004',
  'an import discarded before it was complete cannot be staged again');

-- Records that would make publishing fail are caught at review instead.
select tests.remember_job('edge', tests.create_job(8));
select public.admin_stage_import_rows(tests.job('edge'), (
  select jsonb_agg(case n
           when 1 then jsonb_set(r, '{record,admissions,sat_math_25}', '500.5')
           when 2 then jsonb_set(r, '{record,admissions,sat_math_25}', '"700"')
           when 3 then jsonb_set(r, '{record,baseball,participants}', '3000000000')
           when 4 then r #- '{record,unitid}'
           when 5 then r #- '{record,costs,scorecard_year}'
           when 6 then jsonb_set(r, '{record,baseball,classification_code}', '1.5')
           when 7 then jsonb_set(r, '{record,facts,undergraduate_enrollment,value}', '1500.0')
           else r end order by n)
    from jsonb_array_elements(tests.snapshot_rows()) with ordinality as x(r, n) where n <= 8));
select tests.ok(
  (select public.admin_finalize_import_job(tests.job('edge'))) @> '{"invalid": 6}',
  'fractional, text, out-of-range and missing values are flagged as invalid at review');
create temporary table edge_result on commit drop as select public.admin_publish_import_job(tests.job('edge')) as r;
select tests.ok(
  (select r ->> 'applied' from edge_result) = '1'
  and (select undergraduate_enrollment = 1500 from public.institutions
        where unitid = (select (r ->> 'unitid')::int from jsonb_array_elements(tests.snapshot_rows()) with ordinality as x(r, n) where n = 7)),
  'publishing then succeeds, and a whole-number decimal is stored as a whole number');

-- A program's reviewer, notes and import ids are not readable outside admin screens.
select tests.authenticate_as_anon();
select tests.throws('select verified_by from public.baseball_programs limit 1', '42501', 'visitors cannot read who reviewed a program');
select tests.ok(
  (select count(*) from public.baseball_programs) > 0 and (select count(*) from public.search_schools()) > 0,
  'the public columns stay readable');
select tests.clear_authentication();

-- The slug never ends in a dash after shortening a long name.
select tests.ok(private.slugify(repeat('a', 91) || ' b') !~ '-$' and private.slugify(repeat('a', 91) || ' b') ~ '^[a-z0-9]+(-[a-z0-9]+)*$',
  'shortened page addresses stay well formed');
