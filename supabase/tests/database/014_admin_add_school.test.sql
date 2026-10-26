-- Adding a school the federal athletics report leaves out (service academies,
-- men's colleges, schools without federal aid, new teams). Uses the registry
-- fixture for the "already listed" and "later imports keep it" cases.

-- A helper call with every argument spelled out, so each refusal changes one thing.
create function tests.add_school(
  p_unitid integer default 197036,
  p_name text default 'United States Military Academy',
  p_city text default 'West Point',
  p_state text default 'NY',
  p_website text default 'https://www.westpoint.edu/',
  p_season text default '2026-27',
  p_association text default 'ncaa',
  p_division text default 'ncaa_d1',
  p_conference text default 'Patriot League',
  p_verification public.program_verification default 'official_athletics_site',
  p_evidence text default 'https://goarmywestpoint.com/sports/baseball',
  p_note text default 'Army baseball 2027 schedule and Patriot League play on the official athletics site'
) returns text language sql as $$
  select public.admin_add_baseball_program(p_unitid, p_name, p_city, p_state, p_website, 'public', 'four_year', p_season,
                                           p_association, p_division, p_conference, 'https://goarmywestpoint.com/sports/baseball',
                                           p_verification, p_evidence, p_note)
$$;

select tests.create_user('admin', 'parent', 'add.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2000-01-01');

select tests.authenticate_as('admin');
select tests.remember_job('base', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('base'), tests.rows_between(1, 13));
select public.admin_finalize_import_job(tests.job('base'));
select public.admin_publish_import_job(tests.job('base'), 'Fixture publish for the add-a-school tests');

-- ---------------------------------------------------------------- who may add
select tests.authenticate_as_anon();
select tests.throws('select tests.add_school()', '42501', 'signed-out visitors cannot add a school');
select tests.authenticate_as('athlete');
select tests.throws('select tests.add_school()', 'BR002', 'non-admin accounts cannot add a school');

-- ---------------------------------------------------------------- what an addition needs
select tests.authenticate_as('admin');
select tests.throws('select tests.add_school(p_verification => ''federal_report'')', 'BR003',
  'a school added by hand cannot claim the federal report');
select tests.throws('select tests.add_school(p_evidence => null)', 'BR003', 'an addition must cite the official page checked');
select tests.throws('select tests.add_school(p_evidence => ''http://goarmywestpoint.com/sports/baseball'')', 'BR003',
  'the evidence link must be https');
select tests.throws('select tests.add_school(p_evidence => ''https://goarmywestpoint.com@evil.example/x'')', 'BR003',
  'the evidence link cannot hide another host behind a user name');
select tests.throws('select tests.add_school(p_website => null)', 'BR003', 'the school''s website is required');
select tests.throws('select tests.add_school(p_unitid => 19703)', 'BR003', 'the federal school ID has six digits');
select tests.throws('select tests.add_school(p_unitid => 162928)', 'BR003',
  'a school already in the registry is corrected from its page, not added twice');
select tests.throws('select tests.add_school(p_season => ''2026-28'')', 'BR003', 'the season is two consecutive years');
select tests.throws('select tests.add_school(p_association => ''naia'')', 'BR003', 'association and division must match');
select tests.throws('select tests.add_school(p_state => ''New York'')', 'BR003', 'the state is a two-letter code');
select tests.throws('select tests.add_school(p_note => ''ok'')', 'BR003', 'the administrator explains what was checked');
select tests.ok(not exists (select 1 from public.institutions where unitid = 197036), 'refused additions leave nothing behind');

-- ---------------------------------------------------------------- adding
select tests.ok(tests.add_school() = 'united-states-military-academy-ny', 'an administrator adds a school and gets its page address');
-- Checked as the database owner: who checked a program is not readable through the API.
select tests.clear_authentication();
select tests.ok(
  (select i.facts_source_id = 'official_site' and i.website_url = 'https://www.westpoint.edu/' and i.is_listed
          and p.status = 'active' and p.status_source = 'admin' and p.status_season = '2026-27' and p.season = '2026-27'
          and p.division_code = 'ncaa_d1' and p.conference = 'Patriot League'
          and p.verification = 'official_athletics_site'
          and p.verification_source_url = 'https://goarmywestpoint.com/sports/baseball'
          and p.verified_by = tests.id('admin') and p.source_id = 'official_site' and p.reported_participants is null
     from public.institutions i join public.baseball_programs p on p.institution_id = i.id where i.unitid = 197036),
  'the school and its program record the official source, the season checked and who checked it');
select tests.ok(
  (select count(*) = 2 and bool_and(actor_id = tests.id('admin'))
          and bool_and(reason = 'Army baseball 2027 schedule and Patriot League play on the official athletics site')
     from public.registry_revisions
    where institution_id = (select id from public.institutions where unitid = 197036) and action = 'insert'
      and entity_type in ('institution', 'baseball_program')),
  'the revision log records both new rows with the administrator and the note');
select tests.ok(
  exists (select 1 from public.audit_events where action = 'registry.program_added' and actor_id = tests.id('admin')
             and metadata ->> 'unitid' = '197036'),
  'the addition is in the audit log');
select tests.authenticate_as('admin');
select tests.throws('select tests.add_school()', 'BR003', 'the same school cannot be added twice');

-- ---------------------------------------------------------------- what visitors see
select tests.authenticate_as_anon();
select tests.ok(
  (select (s -> 'program' -> 'division' ->> 'name') = 'NCAA Division I'
          and (s -> 'program' ->> 'conference') = 'Patriot League'
          and (s -> 'program' ->> 'verification') = 'official_athletics_site'
     from public.get_school('united-states-military-academy-ny') s),
  'the added school appears publicly with its division, conference and verification');
select tests.ok(exists (select 1 from public.search_schools('military academy') where slug = 'united-states-military-academy-ny'),
  'the added school can be found by name');
select tests.ok(
  exists (select 1 from public.search_schools(p_divisions => array['ncaa_d1']) where slug = 'united-states-military-academy-ny'),
  'the added school appears under its division filter');

-- ---------------------------------------------------------------- later imports keep it
select tests.authenticate_as('admin');
select tests.remember_job('again', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('again'), tests.rows_between(1, 13));
select public.admin_finalize_import_job(tests.job('again'));
select tests.ok(not exists (select 1 from public.data_import_rows where job_id = tests.job('again') and unitid = 197036),
  'a federal import that does not list the school does not propose dropping it');
select public.admin_publish_import_job(tests.job('again'), 'Second fixture publish');
select tests.ok(
  (select p.status = 'active' and p.division_code = 'ncaa_d1' and p.verification = 'official_athletics_site'
     from public.baseball_programs p join public.institutions i on i.id = p.institution_id where i.unitid = 197036),
  'after another import, the added school is still active with its checked division');

