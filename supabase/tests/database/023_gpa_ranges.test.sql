-- Published high school GPA ranges (founder decision F51): the seeded Common
-- Data Set ranges, the middle-half rule, who can read and write them, and the
-- admin record / supersede / withdraw cycle. Uses the registry fixture.

select tests.create_user('admin', 'parent', 'gpa.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2008-01-01');

select tests.authenticate_as('admin');
select tests.remember_job('gpa', tests.create_job(13));
select public.admin_stage_import_rows(tests.job('gpa'), tests.rows_between(1, 13));
select public.admin_finalize_import_job(tests.job('gpa'));
select public.admin_publish_import_job(tests.job('gpa'), 'Fixture publish for the GPA range tests');
select tests.clear_authentication();

-- ================================================================ the middle-half rule
select tests.ok(
  private.cds_gpa_middle_half(array[21.85, 15.85, 18.34, 12.11, 15.65, 15.51, 0.69, 0, 0]) = array[3.00, 3.99]::numeric[],
  'the middle half runs from the band holding the 25th percentile to the band holding the 75th (Rowan: 3.00–3.99)');
select tests.ok(
  private.cds_gpa_middle_half(array[69.1, 11.9, 12.4, 3.7, 2.2, 0.5, 0.1, 0, 0]) = array[3.75, 4.00]::numeric[],
  'a class mostly at 4.0 tops out at 4.0 (Stevens: 3.75–4.00)');
select tests.ok(
  private.cds_gpa_middle_half(array[14, 23, 21, 23, 12, 5, 1, 0, 0]) = array[3.25, 3.99]::numeric[],
  'bands adding to 99% are scaled to their own total (Union)');
select tests.ok(
  private.cds_gpa_middle_half(array[50, 0, 0, 0, 0, 0, 0, 0, 0]) is null
  and private.cds_gpa_middle_half(array[10, 10, 10]) is null,
  'bands that don''t add up to about 100%, or aren''t all nine, give no range');

-- ================================================================ the seed
select tests.ok(
  (select count(*) from public.gpa_ranges where is_current) = 20
  and (select count(*) from public.gpa_ranges where source_kind = 'common_data_set' and weighting = 'not_stated') = 19
  and (select count(*) from public.gpa_ranges where source_kind = 'school_profile' and weighting = 'not_stated') = 1,
  'twenty ranges are seeded (19 Common Data Sets, 1 class profile), none stating whether GPAs are weighted');
select tests.ok(
  (select array[low, high] from public.gpa_ranges where unitid = 196158) = array[3.00, 4.00]::numeric[]
  and (select array[low, high] from public.gpa_ranges where unitid = 190600) = array[2.50, 3.74]::numeric[]
  and (select array[low, high] || average from public.gpa_ranges where unitid = 196219) = array[3.00, 3.70, null]::numeric[],
  'the second pass adds Fredonia (3.00–4.00), John Jay (2.50–3.74) and Purchase (3.0–3.7, class profile)');
select tests.ok(
  (select array[low, high] from public.gpa_ranges where unitid = 184782) = array[3.00, 3.99]::numeric[]
  and (select array[low, high] from public.gpa_ranges where unitid = 195030) = array[3.50, 3.99]::numeric[]
  and (select entering_term || ' ' || cds_year from public.gpa_ranges where unitid = 186867) = 'Fall 2023 2023-2024',
  'seeded ranges and years are as worked out from the published bands (Rowan, Rochester, Stevens)');
select tests.ok(
  (select average from public.gpa_ranges where unitid = 189705) is null
  and (select average from public.gpa_ranges where unitid = 190150) = 4.25,
  'an average printed on another scale is left out (Canisius); one above 4.0 is kept as published (Columbia)');
select tests.ok(
  not exists (select 1 from public.gpa_ranges where source_url not like 'https://%'),
  'every seeded range cites an https document');

-- ================================================================ who can read
select tests.authenticate_as_anon();
select tests.ok(
  tests.visible_count('select 1 from public.gpa_ranges') = 20,
  'signed-out visitors can read published ranges');
select tests.throws('select note from public.gpa_ranges limit 1', '42501', 'internal notes are not readable');
select tests.throws('select recorded_by from public.gpa_ranges limit 1', '42501', 'who recorded a range is not readable');
select tests.ok(
  (select count(*) from public.gpa_ranges_for(array['johns-hopkins-university-md', 'stanford-university-ca'])) = 0,
  'a school with no published range returns nothing, never an estimate');

-- ================================================================ who can write
select tests.throws(
  'select public.admin_set_gpa_range(162928, ''school_profile'', 2025, null, 3.5, 3.9, null, null, null, ''https://apply.jhu.edu/'', null, ''Checked the class profile'')',
  '42501', 'signed-out visitors cannot record a range');
select tests.authenticate_as('athlete');
select tests.throws(
  'select public.admin_set_gpa_range(162928, ''school_profile'', 2025, null, 3.5, 3.9, null, null, null, ''https://apply.jhu.edu/'', null, ''Checked the class profile'')',
  'BR002', 'non-admin accounts cannot record a range');
select tests.throws(
  'insert into public.gpa_ranges (unitid, school_name, source_kind, entering_term, low, high, source_url) values (162928, ''Johns Hopkins University'', ''school_profile'', ''Fall 2025'', 3.5, 3.9, ''https://apply.jhu.edu/'')',
  '42501', 'nobody writes to the table directly');

-- ================================================================ admin: record, supersede, withdraw
select tests.authenticate_as('admin');
select tests.throws(
  'select public.admin_set_gpa_range(184782, ''school_profile'', 2025, null, 3.0, 3.9, null, null, null, ''https://www.rowan.edu/'', null, ''Checked the class profile'')',
  'BR003', 'a range is only recorded for a school in the registry');
select tests.throws(
  format('select public.admin_set_gpa_range(162928, %L, %s, %L::numeric[], null, null, null, null, null, %L, null, %L)',
         'common_data_set', extract(year from now())::integer - 1, '{50,0,0,0,0,0,0,0,0}', 'https://ir.jhu.edu/cds.pdf', 'Read C11'),
  'BR003', 'Common Data Set bands must add up to about 100%');
select tests.throws(
  format('select public.admin_set_gpa_range(162928, %L, %s, null, 3.9, 3.5, null, null, null, %L, null, %L)',
         'school_profile', extract(year from now())::integer - 1, 'https://apply.jhu.edu/', 'Checked the profile'),
  'BR003', 'a class-profile range needs its low end at or below its high end');
select tests.throws(
  format('select public.admin_set_gpa_range(162928, %L, %s, null, 3.5, 3.9, null, null, null, %L, null, %L)',
         'school_profile', extract(year from now())::integer - 1, 'http://apply.jhu.edu/', 'Checked the profile'),
  'BR003', 'a range needs an https link');
select tests.throws(
  format('select public.admin_set_gpa_range(162928, %L, %s, null, 3.5, 3.9, null, null, null, %L, null, %L)',
         'school_profile', extract(year from now())::integer - 9, 'https://apply.jhu.edu/', 'Checked the profile'),
  'BR003', 'a range from a class more than six years old is refused');
select tests.throws(
  format('select public.admin_set_gpa_range(162928, %L, %s, null, 3.5, 3.9, null, null, null, %L, null, %L)',
         'school_profile', extract(year from now())::integer - 1, 'https://apply.jhu.edu/', ''),
  'BR003', 'the admin says what they checked');

select tests.remember_job('gpa_v1', public.admin_set_gpa_range(
  162928, 'common_data_set', extract(year from now())::integer - 1,
  array[60, 25, 10, 3, 1, 1, 0, 0, 0]::numeric[], null, null, 3.92, 99.0, null,
  'https://ir.jhu.edu/common-data-set.pdf', 'Common Data Set', 'Read section C11 and C12'));
select tests.ok(
  (select array[low, high] from public.gpa_ranges where id = tests.job('gpa_v1')) = array[3.75, 4.00]::numeric[]
  and (select cds_year from public.gpa_ranges where id = tests.job('gpa_v1'))
      = (extract(year from now())::integer - 1) || '-' || extract(year from now())::integer,
  'a Common Data Set range is worked out from its bands, with its CDS year');

select tests.authenticate_as_anon();
select tests.ok(
  (select low || '–' || high || ' ' || weighting from public.gpa_ranges_for(array['Johns-Hopkins-University-MD '])) = '3.75–4.00 not_stated',
  'the public read finds the current range by slug');
select tests.authenticate_as('admin');

select tests.remember_job('gpa_v2', public.admin_set_gpa_range(
  162928, 'school_profile', extract(year from now())::integer, null, 3.6, 4.0, null, null, 'unweighted',
  'https://apply.jhu.edu/class-profile/', 'Class profile', 'Checked the class profile page'));
select tests.ok(
  (select count(*) from public.gpa_ranges where unitid = 162928) = 2
  and (select count(*) from public.gpa_ranges where unitid = 162928 and is_current) = 1
  and (select not is_current and superseded_at is not null from public.gpa_ranges where id = tests.job('gpa_v1')),
  'a newer range supersedes the old one, which stays in history');
select tests.ok(
  (select low || '–' || high || ' ' || weighting || ' ' || source_kind from public.gpa_ranges_for(array['johns-hopkins-university-md']))
    = '3.60–4.00 unweighted school_profile',
  'the public read shows only the current range');
select tests.ok(
  (select count(*) from public.audit_events where action = 'registry.gpa_range_set') = 2,
  'each range recorded is in the audit log');

select tests.throws(format('select public.admin_retire_gpa_range(%L, %L)', tests.job('gpa_v2'), ''), 'BR003',
  'withdrawing a range needs a reason');
select public.admin_retire_gpa_range(tests.job('gpa_v2'), 'Entered for the wrong school');
select tests.ok(
  (select count(*) from public.gpa_ranges_for(array['johns-hopkins-university-md'])) = 0
  and (select count(*) from public.gpa_ranges where unitid = 162928) = 2
  and (select count(*) from public.audit_events where action = 'registry.gpa_range_retired') = 1,
  'a withdrawn range leaves the public read but stays in history and the audit log');
select tests.throws(format('select public.admin_retire_gpa_range(%L, %L)', tests.job('gpa_v2'), 'Again'), 'BR004',
  'a range can only be withdrawn once');

select tests.finish();
