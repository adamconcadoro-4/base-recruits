-- Registry import, review, publish, reconcile and public reads.
--
-- Fixture: 13 real records copied unchanged from data/snapshots/registry-2024-25.json
-- (EADA 2024-25 and College Scorecard, retrieved 2026-10-22T20:57:36Z). Where a test
-- needs a change or an invalid record it edits a copy here; the copy is rolled
-- back with the rest of the test and never published anywhere.

create function tests.snapshot_sources() returns jsonb language sql immutable as $fixture$
  select '[{"id":"eada","dataset":"EADA_2024-2025.zip","label":"Data for academic year 2024-25","season":"2024-25","url":"https://ope.ed.gov/athletics/api/dataFiles/file?fileName=EADA_2024-2025.zip","homepage":"https://ope.ed.gov/athletics/","retrieved_at":"2026-10-22T20:56:12Z","sha256":"f510439ffa7625a4065690bbd8c77bd8990618ef58d5aba65ef360b8b4d31264","bytes":12034717},{"id":"college_scorecard","dataset":"College Scorecard API v1, institution data","url":"https://api.data.gov/ed/collegescorecard/v1/schools","homepage":"https://collegescorecard.ed.gov/","retrieved_at":"2026-10-22T20:56:27Z","years":{"admissions":2024,"costs":2025,"enrollment":2024}}]'::jsonb
$fixture$;

create function tests.snapshot_rows() returns jsonb language sql immutable as $fixture$
  select '[{"unitid":100654,"record":{"admissions":{"act_composite_25":14,"act_composite_75":19,"admission_rate":0.5795,"sat_erw_25":420,"sat_erw_75":530,"sat_math_25":390,"sat_math_75":510,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"ncaa","classification_code":2,"classification_name":"NCAA Division I-FCS","classification_other":null,"division":"ncaa_d1","participants":47,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":27732,"scorecard_year":2025,"tuition_in_state":10558,"tuition_out_of_state":19318},"facts":{"aliases":["AAMU"],"city":"Normal","control":"public","latitude":34.783368,"level":"four_year","longitude":-86.568502,"name":"Alabama A & M University","ope8_id":"00100200","predominant_degree":"bachelors","price_calculator_url":"https://www.aamu.edu/admissions-aid/tuition-fees/net-price-calculator.html","setting":"city","state":"AL","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":6124},"website_url":"https://www.aamu.edu/","zip":"35762"},"institution_source":"college_scorecard","unitid":100654},"issues":[]},{"unitid":101189,"record":{"admissions":{"act_composite_25":18,"act_composite_75":21,"admission_rate":0.7307,"sat_erw_25":null,"sat_erw_75":null,"sat_math_25":null,"sat_math_75":null,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"naia","classification_code":9,"classification_name":"NAIA Division I","classification_other":null,"division":"naia","participants":60,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":37209,"scorecard_year":2025,"tuition_in_state":26590,"tuition_out_of_state":26590},"facts":{"aliases":["Faulkner"],"city":"Montgomery","control":"private_nonprofit","latitude":32.384181,"level":"four_year","longitude":-86.21641,"name":"Faulkner University","ope8_id":"00100300","predominant_degree":"bachelors","price_calculator_url":"https://www.faulkner.edu/net-price-calculator/","setting":"city","state":"AL","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":1549},"website_url":"https://www.faulkner.edu/","zip":"36109-3390"},"institution_source":"college_scorecard","unitid":101189},"issues":[]},{"unitid":101435,"record":{"admissions":{"act_composite_25":20,"act_composite_75":25,"admission_rate":0.6949,"sat_erw_25":533,"sat_erw_75":610,"sat_math_25":473,"sat_math_75":610,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"ncaa","classification_code":6,"classification_name":"NCAA Division III with football","classification_other":null,"division":"ncaa_d3","participants":48,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":40933,"scorecard_year":2025,"tuition_in_state":29570,"tuition_out_of_state":29570},"facts":{"aliases":[],"city":"Montgomery","control":"private_nonprofit","latitude":32.351034,"level":"four_year","longitude":-86.284366,"name":"Huntingdon College","ope8_id":"00101900","predominant_degree":"bachelors","price_calculator_url":"https://www.huntingdon.edu/admission-aid/student-financial-services/net-price-calculator/","setting":"city","state":"AL","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":879},"website_url":"https://www.huntingdon.edu/","zip":"36106-2148"},"institution_source":"college_scorecard","unitid":101435},"issues":[]},{"unitid":102395,"record":{"admissions":{"act_composite_25":null,"act_composite_75":null,"admission_rate":0.6137,"sat_erw_25":null,"sat_erw_75":null,"sat_math_25":null,"sat_math_75":null,"scorecard_year":2024,"term":"Fall 2024","test_policy":"not_considered"},"baseball":{"association":"uscaa","classification_code":20,"classification_name":"USCAA","classification_other":null,"division":"uscaa","participants":29,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":17720,"scorecard_year":2025,"tuition_in_state":14840,"tuition_out_of_state":14840},"facts":{"aliases":["United States Sports Academy","The Academy","America''s Sports University"],"city":"Daphne","control":"private_nonprofit","latitude":30.639329,"level":"four_year","longitude":-87.91163,"name":"United States Sports University","ope8_id":"02170600","predominant_degree":"bachelors","price_calculator_url":"https://ussu.edu/admissions/costs-aid/cost-estimator/","setting":"city","state":"AL","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":228},"website_url":"https://www.ussu.edu/","zip":"36526-7055"},"institution_source":"college_scorecard","unitid":102395},"issues":[]},{"unitid":110635,"record":{"admissions":{"act_composite_25":null,"act_composite_75":null,"admission_rate":0.1098,"sat_erw_25":null,"sat_erw_75":null,"sat_math_25":null,"sat_math_75":null,"scorecard_year":2024,"term":"Fall 2024","test_policy":"not_considered"},"baseball":{"association":"ncaa","classification_code":1,"classification_name":"NCAA Division I-FBS","classification_other":null,"division":"ncaa_d1","participants":43,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":47842,"scorecard_year":2025,"tuition_in_state":17198,"tuition_out_of_state":54800},"facts":{"aliases":["UC Berkeley"],"city":"Berkeley","control":"public","latitude":37.871918,"level":"four_year","longitude":-122.260463,"name":"University of California-Berkeley","ope8_id":"00131200","predominant_degree":"bachelors","price_calculator_url":"https://financialaid.berkeley.edu/how-aid-works/estimate-your-financial-aid/","setting":"city","state":"CA","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":33068},"website_url":"https://www.berkeley.edu/","zip":"94720"},"institution_source":"college_scorecard","unitid":110635},"issues":[]},{"unitid":117645,"record":{"admissions":null,"baseball":{"association":"cccaa","classification_code":17,"classification_name":"CCCAA","classification_other":null,"division":"cccaa","participants":34,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":11020,"scorecard_year":2025,"tuition_in_state":1560,"tuition_out_of_state":13336},"facts":{"aliases":[],"city":"Long Beach","control":"public","latitude":33.833593,"level":"two_year","longitude":-118.135633,"name":"Long Beach City College","ope8_id":"00121900","predominant_degree":"certificate","price_calculator_url":"https://npc.cccco.edu/841/npcalc.htm","setting":"city","state":"CA","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":22427},"website_url":"https://www.lbcc.edu/","zip":"90808-1706"},"institution_source":"college_scorecard","unitid":117645},"issues":[]},{"unitid":144865,"record":{"admissions":null,"baseball":{"association":"njcaa","classification_code":14,"classification_name":"NJCAA Division III","classification_other":null,"division":"njcaa_d3","participants":38,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":13693,"scorecard_year":2025,"tuition_in_state":4680,"tuition_out_of_state":12870},"facts":{"aliases":["COD"],"city":"Glen Ellyn","control":"public","latitude":41.841577,"level":"two_year","longitude":-88.071635,"name":"College of DuPage","ope8_id":"00665600","predominant_degree":"associate","price_calculator_url":"https://www.cod.edu/about/administration/consumer-legal-information/net-price-calculator/index.html","setting":"suburb","state":"IL","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":16114},"website_url":"https://www.cod.edu/","zip":"60137-6599"},"institution_source":"college_scorecard","unitid":144865},"issues":[]},{"unitid":162928,"record":{"admissions":{"act_composite_25":34,"act_composite_75":36,"admission_rate":0.0644,"sat_erw_25":740,"sat_erw_75":770,"sat_math_25":780,"sat_math_75":800,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"other","classification_code":8,"classification_name":"Other","classification_other":"NCAA DIII w/FB; M/W LAX DI","division":"other","participants":44,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":88834,"scorecard_year":2025,"tuition_in_state":67170,"tuition_out_of_state":67170},"facts":{"aliases":["Johns Hopkins"],"city":"Baltimore","control":"private_nonprofit","latitude":39.328977,"level":"four_year","longitude":-76.621595,"name":"Johns Hopkins University","ope8_id":"00207700","predominant_degree":"bachelors","price_calculator_url":"https://npc.collegeboard.org/student/app/jhu","setting":"city","state":"MD","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":5693},"website_url":"https://www.jhu.edu/","zip":"21218-2688"},"institution_source":"college_scorecard","unitid":162928},"issues":[]},{"unitid":166027,"record":{"admissions":{"act_composite_25":34,"act_composite_75":36,"admission_rate":0.0365,"sat_erw_25":740,"sat_erw_75":780,"sat_math_25":770,"sat_math_75":800,"scorecard_year":2024,"term":"Fall 2024","test_policy":"required"},"baseball":{"association":"ncaa","classification_code":2,"classification_name":"NCAA Division I-FCS","classification_other":null,"division":"ncaa_d1","participants":30,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":89279,"scorecard_year":2025,"tuition_in_state":64796,"tuition_out_of_state":64796},"facts":{"aliases":[],"city":"Cambridge","control":"private_nonprofit","latitude":42.374471,"level":"four_year","longitude":-71.118313,"name":"Harvard University","ope8_id":"00215500","predominant_degree":"bachelors","price_calculator_url":"https://college.harvard.edu/financial-aid/net-price-calculator","setting":"city","state":"MA","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":7601},"website_url":"https://www.harvard.edu/","zip":"02138"},"institution_source":"college_scorecard","unitid":166027},"issues":[]},{"unitid":199120,"record":{"admissions":{"act_composite_25":28,"act_composite_75":34,"admission_rate":0.1534,"sat_erw_25":690,"sat_erw_75":750,"sat_math_25":700,"sat_math_75":780,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"ncaa","classification_code":1,"classification_name":"NCAA Division I-FBS","classification_other":null,"division":"ncaa_d1","participants":50,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":26949,"scorecard_year":2025,"tuition_in_state":9095,"tuition_out_of_state":45228},"facts":{"aliases":[],"city":"Chapel Hill","control":"public","latitude":35.911769,"level":"four_year","longitude":-79.050969,"name":"University of North Carolina at Chapel Hill","ope8_id":"00297400","predominant_degree":"bachelors","price_calculator_url":"https://studentaid.unc.edu/net-price-calculator/","setting":"city","state":"NC","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":20752},"website_url":"https://www.unc.edu/","zip":"27599"},"institution_source":"college_scorecard","unitid":199120},"issues":[]},{"unitid":208275,"record":{"admissions":null,"baseball":{"association":"nwac","classification_code":19,"classification_name":"NWAC","classification_other":null,"division":"nwac","participants":58,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":20963,"scorecard_year":2025,"tuition_in_state":7211,"tuition_out_of_state":9956},"facts":{"aliases":["BMCC"],"city":"Pendleton","control":"public","latitude":45.677313,"level":"two_year","longitude":-118.816944,"name":"Blue Mountain Community College","ope8_id":"00318600","predominant_degree":"associate","price_calculator_url":"https://bluecc.edu/net-price-calculator/","setting":"town","state":"OR","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":962},"website_url":"https://bluecc.edu/","zip":"97801"},"institution_source":"college_scorecard","unitid":208275},"issues":[]},{"unitid":243744,"record":{"admissions":{"act_composite_25":34,"act_composite_75":35,"admission_rate":0.0361,"sat_erw_25":740,"sat_erw_75":780,"sat_math_25":770,"sat_math_75":800,"scorecard_year":2024,"term":"Fall 2024","test_policy":"considered_not_required"},"baseball":{"association":"ncaa","classification_code":1,"classification_name":"NCAA Division I-FBS","classification_other":null,"division":"ncaa_d1","participants":38,"season":"2024-25"},"costs":{"academic_year":"2025-26","cost_of_attendance":92892,"scorecard_year":2025,"tuition_in_state":68544,"tuition_out_of_state":68544},"facts":{"aliases":[],"city":"Stanford","control":"private_nonprofit","latitude":37.429434,"level":"four_year","longitude":-122.167359,"name":"Stanford University","ope8_id":"00130500","predominant_degree":"bachelors","price_calculator_url":"https://financialaid.stanford.edu/undergrad/how/calculator/index.html?tab=net-price-calculator","setting":"suburb","state":"CA","undergraduate_enrollment":{"scorecard_year":2024,"term":"Fall 2024","value":7554},"website_url":"https://www.stanford.edu/","zip":"94305"},"institution_source":"college_scorecard","unitid":243744},"issues":[]},{"unitid":403469,"record":{"admissions":null,"baseball":{"association":"njcaa","classification_code":12,"classification_name":"NJCAA Division I","classification_other":null,"division":"njcaa_d1","participants":42,"season":"2024-25"},"costs":null,"facts":{"aliases":[],"city":"Fairfield","control":"public","latitude":null,"level":"two_year","longitude":null,"name":"Frontier Community College","ope8_id":"00174225","predominant_degree":null,"price_calculator_url":null,"setting":null,"state":"IL","undergraduate_enrollment":null,"website_url":null,"zip":"62837"},"institution_source":"eada","unitid":403469},"issues":[{"code":"not_in_scorecard","detail":"no College Scorecard record; institution facts come from EADA","source":"college_scorecard","unitid":403469}]}]'::jsonb
$fixture$;

create function tests.rows_between(p_from integer, p_to integer) returns jsonb language sql immutable as $$
  select jsonb_agg(r order by n) from jsonb_array_elements(tests.snapshot_rows()) with ordinality as x(r, n)
   where n between p_from and p_to
$$;

create function tests.create_job(p_rows integer) returns uuid language sql as $$
  select public.admin_create_import_job('registry-2024-25.json', repeat('a', 64), 'a3973ac10b2b743807e70eab832b5877138039932b9b2d5a65d96f1e15e8ead8',
    'base-recruits.registry-snapshot/1', '2026-10-22T20:57:36Z'::timestamptz, tests.snapshot_sources(), p_rows)
$$;

create function tests.job(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select f.id from tests.fixtures f where f.name = 'job:' || p_name
$$;

create function tests.remember_job(p_name text, p_id uuid) returns uuid language sql security definer set search_path = '' as $$
  insert into tests.fixtures (name, id) values ('job:' || p_name, p_id) returning id
$$;

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
