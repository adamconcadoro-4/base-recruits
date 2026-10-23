-- Discovery pilot remediation: current admissions policies kept apart from
-- historical statistics, unlimited saved schools, correction reports, and the
-- free reads behind them. Uses the 13 real records in the registry fixture.

select tests.create_user('admin', 'parent', 'pilot.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2008-01-01');
select tests.create_user('parent', 'parent', p_date_of_birth => date '1975-01-01');

select tests.authenticate_as('admin');
select tests.remember_job('pilot', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('pilot'), tests.rows_between(1, 13));
select public.admin_finalize_import_job(tests.job('pilot'));
select public.admin_publish_import_job(tests.job('pilot'), 'Fixture publish for the discovery pilot tests');

-- ================================================================ current admissions policies
select tests.authenticate_as_anon();
select tests.throws(
  format('select public.admin_set_admissions_policy(%L, %L, 2027, %L, null, %L, null, null)',
         (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year', 'required',
         'https://apply.jhu.edu/'),
  '42501', 'signed-out visitors cannot record a policy');
select tests.authenticate_as('athlete');
select tests.throws(
  format('select public.admin_set_admissions_policy(%L, %L, 2027, %L, null, %L, null, null)',
         (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year', 'required',
         'https://apply.jhu.edu/'),
  'BR002', 'non-admin accounts cannot record a policy');

select tests.authenticate_as('admin');
select tests.throws(
  format('select public.admin_set_admissions_policy(%L, %L, %s, %L, null, %L, null, null)',
         (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year',
         extract(year from now())::integer + 1, 'required', 'http://apply.jhu.edu/'),
  'BR003', 'a policy needs an https link to the official page');
select tests.throws(
  format('select public.admin_set_admissions_policy(%L, %L, %s, %L, null, %L, null, null)',
         (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year',
         extract(year from now())::integer + 9, 'required', 'https://apply.jhu.edu/'),
  'BR003', 'a policy is for a near entry year, not a guess about the distant future');

select tests.remember_job('policy_v1', public.admin_set_admissions_policy(
  (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year',
  extract(year from now())::integer + 1, 'considered_not_required', null,
  'https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/standardized-testing/', 'Standardized testing',
  'Entered with the wrong policy'));
select tests.remember_job('policy_v2', public.admin_set_admissions_policy(
  (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'first_year',
  extract(year from now())::integer + 1, 'required', 'Exceptions apply for some applicants.',
  'https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/standardized-testing/', 'Standardized testing',
  'Checked the standardized testing page'));
select public.admin_set_admissions_policy(
  (select id from public.institutions where slug = 'johns-hopkins-university-md'), 'transfer',
  extract(year from now())::integer + 1, 'considered_not_required', null,
  'https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/standardized-testing/', null, null);

select tests.ok(
  (select count(*) from public.admissions_policies p join public.institutions i on i.id = p.institution_id
    where i.slug = 'johns-hopkins-university-md' and p.applicant_type = 'first_year') = 2
  and (select count(*) from public.admissions_policies p join public.institutions i on i.id = p.institution_id
        where i.slug = 'johns-hopkins-university-md' and p.applicant_type = 'first_year' and p.is_current) = 1
  and (select not is_current and superseded_at is not null from public.admissions_policies where id = tests.job('policy_v1')),
  'recording a policy again for the same applicant type and year supersedes the old one and keeps it in history');
select tests.ok(
  (select count(*) from public.registry_revisions where entity_type = 'admissions_policy' and entity_id = tests.job('policy_v2')::text) = 1,
  'each recorded policy leaves a registry revision');

select tests.authenticate_as_anon();
select tests.ok(
  (select array_agg(applicant_type::text || ':' || test_policy::text order by applicant_type)
     from public.current_admissions_policies(array['johns-hopkins-university-md']))
    = array['first_year:required', 'transfer:considered_not_required'],
  'visitors see the current first-year and transfer policies separately');
select tests.ok(
  (select test_policy from public.search_schools('johns hopkins') where slug = 'johns-hopkins-university-md')
    is not distinct from (select a.test_policy from public.admissions_statistics a join public.institutions i on i.id = a.institution_id
                           where i.slug = 'johns-hopkins-university-md' order by a.term_year desc limit 1),
  'the historical (IPEDS) policy for the past entering class is left exactly as reported');
select tests.ok(
  (select count(*) from public.current_admissions_policies(array['stanford-university-ca'])) = 0,
  'a school with no checked policy has none (it is unknown, not inferred from history)');
select tests.throws('select verified_by from public.admissions_policies', '42501',
  'who checked a policy, and their notes, are not readable through the Data API');
select tests.throws('insert into public.admissions_policies (institution_id) values (gen_random_uuid())', '42501',
  'visitors cannot write policies directly');

select tests.authenticate_as('admin');
select tests.throws(format('select public.admin_retire_admissions_policy(%L, %L)', tests.job('policy_v2'), ''), 'BR003',
  'withdrawing a policy needs a reason');
select public.admin_retire_admissions_policy(
  (select p.id from public.admissions_policies p join public.institutions i on i.id = p.institution_id
    where i.slug = 'johns-hopkins-university-md' and p.applicant_type = 'transfer' and p.is_current),
  'Entered for testing');
select tests.ok(
  (select count(*) from public.current_admissions_policies(array['johns-hopkins-university-md'])) = 1,
  'a withdrawn policy is no longer current');
select tests.throws(format('select public.admin_retire_admissions_policy(%L, %L)', tests.job('policy_v1'), 'again'), 'BR004',
  'a superseded policy cannot be withdrawn twice');

-- ================================================================ coverage
select tests.authenticate_as_anon();
select tests.ok(
  (select (c ->> 'with_current_test_policy')::integer = 1 and (c ->> 'reported_as_other')::integer >= 1
     from public.registry_coverage() c),
  'coverage counts checked current policies and programs still reported as Other, from the published records');

-- ================================================================ saved schools
select tests.authenticate_as_anon();
select tests.throws('select public.save_schools(array[''stanford-university-ca''])', '42501',
  'saving to an account needs an account (guests save in their browser)');
select tests.throws('select * from public.my_saved_schools()', '42501', 'visitors have no account list');

select tests.authenticate_as('athlete');
select tests.ok(
  (select (r ->> 'added')::integer = 7 and r -> 'unknown' = '["not-a-real-school-xx"]'::jsonb
     from public.save_schools(array['stanford-university-ca', 'harvard-university-ma', 'university-of-california-berkeley-ca',
                                    'long-beach-city-college-ca', 'college-of-dupage-il', 'frontier-community-college-il',
                                    'united-states-sports-university-al', 'Stanford-University-CA ', 'not-a-real-school-xx']) r),
  'an account saves more than five schools at once; duplicates count once and unknown schools are reported, not invented');
select tests.ok(
  (select (r ->> 'added')::integer = 0 from public.save_schools(array['stanford-university-ca', 'harvard-university-ma']) r),
  'saving again is idempotent (moving a browser list into an account twice adds nothing)');
select tests.ok((select count(*) from public.my_saved_schools()) = 7, 'the account holds each school once');
select tests.ok((select (r ->> 'added')::integer = 1 from public.save_schools(array['johns-hopkins-university-md']) r),
  'one more school is saved');
select tests.ok((select slug from public.my_saved_schools() limit 1) = 'johns-hopkins-university-md',
  'saved schools list newest first');
select tests.throws(
  format('select public.save_schools(%L)', (select array_agg('school-' || g) from generate_series(1, 1001) g)),
  'BR003', 'one call accepts at most 1,000 schools (a request-size limit, not a cap on saves)');
select tests.ok(public.unsave_school('harvard-university-ma'), 'a saved school can be removed');
select tests.ok(not public.unsave_school('harvard-university-ma'), 'removing it again changes nothing');
select tests.ok((select count(*) from public.my_saved_schools()) = 7, 'removing a saved school removes only that school');
select tests.throws('insert into public.saved_schools (user_id, institution_id) values (auth.uid(), gen_random_uuid())',
  '42501', 'saves are written only through the checked functions');

select tests.authenticate_as('parent');
select tests.ok(tests.visible_count('select 1 from public.saved_schools') = 0
            and (select count(*) from public.my_saved_schools()) = 0,
  'one account never sees another account''s saved schools');

select tests.ok(
  (select prosrc !~* '(subscription|entitlement|plan_|has_capability)' from pg_proc where proname = 'save_schools')
  and (select tier = 'core_free' from public.capabilities where key = 'shortlist_unlimited'),
  'saving schools never consults a plan, subscription or entitlement (product invariant 4)');

-- ================================================================ summaries by slug
select tests.authenticate_as_anon();
select tests.ok(
  (select array_agg(slug) from public.schools_by_slugs(
     array['harvard-university-ma', 'unknown-school-zz', 'stanford-university-ca', 'harvard-university-ma']))
    = array['harvard-university-ma', 'stanford-university-ca'],
  'summaries come back in the order asked, once each, leaving out unknown schools');
select tests.ok(
  (select division_name = 'NCAA Division I' and admissions_term = 'Fall 2024'
     from public.schools_by_slugs(array['stanford-university-ca'])),
  'summaries carry the same sourced fields as search results');

select tests.authenticate_as('admin');
select public.admin_set_institution_listing(
  (select id from public.institutions where slug = 'harvard-university-ma'), false, 'Hidden for the discovery pilot tests');
select tests.authenticate_as_anon();
select tests.ok(
  (select count(*) from public.schools_by_slugs(array['harvard-university-ma'])) = 0
  and (select count(*) from public.current_admissions_policies(array['harvard-university-ma'])) = 0,
  'unlisted schools are left out of summaries and policies');

-- ================================================================ correction reports
select tests.authenticate_as_anon();
select tests.throws(
  'select public.submit_correction_report(''johns-hopkins-university-md'', ''division'', ''Baseball plays in Division III.'', null)',
  '42501', 'signed-out visitors cannot send a report');

select tests.authenticate_as('athlete');
select tests.throws(
  'select public.submit_correction_report(''johns-hopkins-university-md'', ''division'', ''short'', null)',
  'BR003', 'a report needs at least a sentence');
select tests.throws(
  'select public.submit_correction_report(''johns-hopkins-university-md'', ''division'', ''Baseball plays in Division III.'', ''not a link'')',
  'BR003', 'evidence must be a web address');
select tests.throws(
  'select public.submit_correction_report(''no-such-school-zz'', ''division'', ''Baseball plays in Division III.'', null)',
  'BR003', 'reports are about real, listed schools');
select tests.remember_job('report', public.submit_correction_report('johns-hopkins-university-md', 'division',
  'Baseball plays in NCAA Division III (Centennial Conference).', 'https://hopkinssports.com/sports/baseball/schedule'));
select tests.ok(tests.visible_count('select 1 from public.correction_reports') = 1, 'the reporter sees their own report');
select tests.throws(format('select public.admin_resolve_correction_report(%L, %L, null)', tests.job('report'), 'resolved'),
  'BR002', 'a reporter cannot close their own report');

select tests.authenticate_as('parent');
select tests.ok(tests.visible_count('select 1 from public.correction_reports') = 0, 'other accounts cannot see the report');

select tests.authenticate_as('admin');
select tests.ok(tests.visible_count('select 1 from public.correction_reports where status = ''open''') = 1,
  'administrators see open reports');
select public.admin_resolve_correction_report(tests.job('report'), 'resolved', 'Corrected against the team schedule page');
select tests.throws(format('select public.admin_resolve_correction_report(%L, %L, null)', tests.job('report'), 'dismissed'),
  'BR004', 'a closed report cannot be closed again');

select tests.authenticate_as('athlete');
select tests.lives(
  'select public.submit_correction_report(''stanford-university-ca'', ''other'', ''Report number '' || g || '' for the daily limit.'', null) from generate_series(1, 19) g',
  'up to 20 reports a day are accepted');
select tests.throws(
  'select public.submit_correction_report(''stanford-university-ca'', ''other'', ''One report too many for today.'', null)',
  'BR005', 'the 21st report in a day is refused');
