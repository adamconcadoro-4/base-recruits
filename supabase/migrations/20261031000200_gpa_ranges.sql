-- =============================================================================
-- Base Recruits — Published high school GPA ranges (founder decision F51)
--
-- The middle half of a school's entering first-year class by high school GPA,
-- as the school published it, on a 4.0 scale. The player's GPA is compared with
-- it whether either is weighted or unweighted (the founder's decision,
-- 2026-10-31); most schools don't say which, and the page says so.
--
--  - Keyed by federal IPEDS unit ID, so a range can be recorded before or
--    after the school's registry record is loaded, and survives a re-import.
--  - Sources: a school's Common Data Set (section C11 bands; the middle half is
--    worked out from the bands, see private.cds_gpa_middle_half) or the
--    school's own class-profile page (a published 25th–75th percentile range).
--  - A newer range for the same school supersedes the old one, which stays in
--    history. Every change is in the audit log.
--  - Seeded with the 17 New York, New Jersey and Connecticut schools whose
--    Common Data Set GPA figures could be read on 2026-10-31.
--
-- Additive only: no existing table, column or function changes.
-- Rollback: drop the functions below and table public.gpa_ranges.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Common Data Set GPA bands (C11), in the form's order, on a 4.0 scale
-- -----------------------------------------------------------------------------
-- 1: 4.0 · 2: 3.75–3.99 · 3: 3.50–3.74 · 4: 3.25–3.49 · 5: 3.00–3.24 · 6: 2.50–2.99 · 7: 2.0–2.49 · 8: 1.0–1.99 · 9: below 1.0

create function private.gpa_bands_ok(p_bands numeric[]) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_bands is not null
     and array_ndims(p_bands) = 1 and array_length(p_bands, 1) = 9
     and not exists (select 1 from unnest(p_bands) v where v is null or v < 0 or v > 100)
     and (select sum(v) from unnest(p_bands) v) between 95 and 105
$$;

-- The middle half of the class from the bands: the low end of the band holding
-- the 25th percentile and the high end of the band holding the 75th. Band edges
-- make the range as wide as the bands, never narrower. Bands are scaled to
-- their own total, because published columns often add to 99–101%.
create function private.cds_gpa_middle_half(p_bands numeric[]) returns numeric[]
language sql
immutable
set search_path = ''
as $$
  with b(i, lo, hi) as (
    values (1, 4.00, 4.00), (2, 3.75, 3.99), (3, 3.50, 3.74), (4, 3.25, 3.49), (5, 3.00, 3.24),
           (6, 2.50, 2.99), (7, 2.00, 2.49), (8, 1.00, 1.99), (9, 0.00, 0.99)
  ), c as (
    select b.i, b.lo, b.hi, p_bands[b.i] as v,
           sum(p_bands[b.i]) over (order by b.i) * 100 / (select sum(x) from unnest(p_bands) x) as cum
      from b
  )
  select array[(select lo from c where v > 0 and cum >= 75 order by i limit 1)::numeric(3, 2),
               (select hi from c where v > 0 and cum >= 25 order by i limit 1)::numeric(3, 2)]
   where private.gpa_bands_ok(p_bands)
$$;
revoke all on function private.gpa_bands_ok(numeric[]) from public;
revoke all on function private.cds_gpa_middle_half(numeric[]) from public;

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table public.gpa_ranges (
  id uuid primary key default gen_random_uuid(),
  unitid integer not null constraint gpa_ranges_unitid check (unitid > 0),
  -- The school's name as the source gives it, so the record reads on its own before the school is loaded.
  school_name text not null constraint gpa_ranges_school_name check (length(school_name) between 2 and 200),
  source_kind text not null constraint gpa_ranges_source_kind check (source_kind in ('common_data_set', 'school_profile')),
  -- The entering class described, e.g. "Fall 2025".
  entering_term text not null constraint gpa_ranges_term check (entering_term ~ '^Fall (19|20)[0-9]{2}$'),
  cds_year text constraint gpa_ranges_cds_year
    check (cds_year ~ '^[0-9]{4}-[0-9]{4}$' and right(cds_year, 4)::integer = left(cds_year, 4)::integer + 1),
  bands numeric(5, 2)[] constraint gpa_ranges_bands check (bands is null or private.gpa_bands_ok(bands)),
  low numeric(3, 2) not null,
  high numeric(3, 2) not null,
  average numeric(3, 2) constraint gpa_ranges_average check (average is null or average between 0 and 5),
  percent_submitting numeric(5, 2) constraint gpa_ranges_submitting check (percent_submitting is null or percent_submitting between 0 and 100),
  weighting text not null default 'not_stated'
    constraint gpa_ranges_weighting check (weighting in ('not_stated', 'weighted', 'unweighted')),
  source_url text not null constraint gpa_ranges_source_url check (private.is_web_url(source_url, true)),
  source_title text constraint gpa_ranges_source_title check (source_title is null or length(source_title) between 3 and 200),
  note text constraint gpa_ranges_note check (note is null or length(note) <= 1000),
  recorded_at timestamptz not null default now(),
  recorded_by uuid,
  is_current boolean not null default true,
  superseded_at timestamptz,
  constraint gpa_ranges_superseded check (is_current = (superseded_at is null)),
  constraint gpa_ranges_range check (low >= 0 and low <= high and high <= 4),
  -- A Common Data Set range is always the one its bands give; a class-profile range has no bands.
  constraint gpa_ranges_source_shape check (
    case source_kind
      when 'common_data_set' then cds_year is not null and bands is not null
                                  and array[low, high] = private.cds_gpa_middle_half(bands)
                                  and entering_term = 'Fall ' || left(cds_year, 4)
      else bands is null
    end),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.gpa_ranges is
  'High school GPA ranges schools published for a past entering first-year class (middle half, 4.0 scale), by IPEDS unit ID, with the source. Founder decision F51.';
create unique index gpa_ranges_one_current on public.gpa_ranges (unitid) where is_current;

create trigger gpa_ranges_updated_at before update on public.gpa_ranges
  for each row execute function private.set_updated_at();

alter table public.gpa_ranges enable row level security;
revoke all on public.gpa_ranges from anon, authenticated, service_role;
-- Who recorded a range and their internal note stay out of the Data API.
grant select (id, unitid, school_name, source_kind, entering_term, cds_year, bands, low, high, average, percent_submitting,
              weighting, source_url, source_title, recorded_at, is_current, superseded_at, created_at, updated_at)
  on public.gpa_ranges to anon, authenticated;
create policy gpa_ranges_visible on public.gpa_ranges for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- Public read: current ranges by school slug
-- -----------------------------------------------------------------------------
create function public.gpa_ranges_for(p_slugs text[])
returns table (
  slug text,
  source_kind text,
  entering_term text,
  cds_year text,
  low numeric,
  high numeric,
  average numeric,
  percent_submitting numeric,
  weighting text,
  source_url text,
  source_title text,
  recorded_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.slug, g.source_kind, g.entering_term, g.cds_year, g.low, g.high, g.average, g.percent_submitting, g.weighting,
         g.source_url, g.source_title, g.recorded_at
    from public.gpa_ranges g
    join public.institutions i on i.unitid = g.unitid
   where g.is_current
     and i.slug = any (select lower(btrim(s)) from unnest(p_slugs[1:1000]) s where s is not null)
   order by i.slug
$$;
comment on function public.gpa_ranges_for(text[]) is
  'Current published high school GPA ranges, by school. A school with none has no published range on record.';

-- -----------------------------------------------------------------------------
-- Admin: record a range from a Common Data Set or a class-profile page
-- -----------------------------------------------------------------------------
-- For a Common Data Set, pass the nine C11 band percentages and leave low and
-- high null: they are worked out from the bands. For a class-profile page, pass
-- the published 25th and 75th percentile GPAs and no bands.
create function public.admin_set_gpa_range(
  p_unitid integer,
  p_source_kind text,
  p_entering_year integer,
  p_bands numeric[],
  p_low numeric,
  p_high numeric,
  p_average numeric,
  p_percent_submitting numeric,
  p_weighting text,
  p_source_url text,
  p_source_title text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_this_year integer := extract(year from private.today_utc())::integer;
  v_name text;
  v_range numeric[];
  v_id uuid;
begin
  if p_unitid is null or p_source_kind is null or p_entering_year is null then
    raise exception 'school, source and entering year are required' using errcode = 'BR003';
  end if;
  select i.name into v_name from public.institutions i where i.unitid = p_unitid;
  if v_name is null then
    raise exception 'unknown school' using errcode = 'BR003';
  end if;
  if p_source_kind not in ('common_data_set', 'school_profile') then
    raise exception 'choose a Common Data Set or the school''s class-profile page' using errcode = 'BR003';
  end if;
  if p_entering_year < v_this_year - 6 or p_entering_year > v_this_year then
    raise exception 'the entering class must be from the last six years' using errcode = 'BR003';
  end if;
  if not private.is_web_url(p_source_url, true) then
    raise exception 'an https link to the page or document you read is required' using errcode = 'BR003';
  end if;
  if p_note is null or length(btrim(p_note)) < 5 then
    raise exception 'say what you checked (at least 5 characters)' using errcode = 'BR003';
  end if;
  if p_source_kind = 'common_data_set' then
    if not private.gpa_bands_ok(p_bands) then
      raise exception 'enter all nine C11 band percentages (blank as 0); they must add up to about 100' using errcode = 'BR003';
    end if;
    v_range := private.cds_gpa_middle_half(p_bands);
  else
    if p_bands is not null then
      raise exception 'bands are only for a Common Data Set' using errcode = 'BR003';
    end if;
    if p_low is null or p_high is null or p_low < 0 or p_low > p_high or p_high > 4 then
      raise exception 'enter the published 25th and 75th percentile GPAs on a 4.0 scale' using errcode = 'BR003';
    end if;
    v_range := array[p_low, p_high];
  end if;

  -- Serialize changes to the same school's range.
  perform 1 from public.institutions i where i.unitid = p_unitid for update;
  update public.gpa_ranges set is_current = false, superseded_at = now() where unitid = p_unitid and is_current;

  insert into public.gpa_ranges (unitid, school_name, source_kind, entering_term, cds_year, bands, low, high, average,
                                 percent_submitting, weighting, source_url, source_title, note, recorded_by)
  values (p_unitid, v_name, p_source_kind, 'Fall ' || p_entering_year,
          case when p_source_kind = 'common_data_set' then p_entering_year || '-' || (p_entering_year + 1) end,
          p_bands, v_range[1], v_range[2], p_average, p_percent_submitting, coalesce(nullif(btrim(p_weighting), ''), 'not_stated'),
          btrim(p_source_url), nullif(btrim(p_source_title), ''), btrim(p_note), v_admin)
  returning id into v_id;

  perform private.log_audit('registry.gpa_range_set', 'gpa_range', v_id::text, null,
                            jsonb_build_object('unitid', p_unitid, 'source_kind', p_source_kind, 'entering_year', p_entering_year,
                                               'low', v_range[1], 'high', v_range[2]), v_admin);
  return v_id;
exception
  when check_violation then
    raise exception 'those GPA figures don''t fit together; check the numbers' using errcode = 'BR003';
end;
$$;

-- Withdraws a range recorded by mistake (it stays in history).
create function public.admin_retire_gpa_range(p_range_id uuid, p_note text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'say why the range is withdrawn' using errcode = 'BR003';
  end if;
  update public.gpa_ranges set is_current = false, superseded_at = now() where id = p_range_id and is_current;
  if not found then
    raise exception 'no current range with that id' using errcode = 'BR004';
  end if;
  perform private.log_audit('registry.gpa_range_retired', 'gpa_range', p_range_id::text, null,
                            jsonb_build_object('note', btrim(p_note)), v_admin);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: every function starts closed, then opens to exactly who needs it.
-- -----------------------------------------------------------------------------
revoke all on function public.gpa_ranges_for(text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_gpa_range(integer, text, integer, numeric[], numeric, numeric, numeric, numeric, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_retire_gpa_range(uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.gpa_ranges_for(text[]) to anon, authenticated;
grant execute on function public.admin_set_gpa_range(integer, text, integer, numeric[], numeric, numeric, numeric, numeric, text, text, text, text)
  to authenticated;
grant execute on function public.admin_retire_gpa_range(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Seed: Common Data Set GPA ranges read on 2026-10-31 (NY, NJ, CT)
-- -----------------------------------------------------------------------------
-- Bands are the C11 percentages as published (a blank band as 0). An average
-- printed on another scale (for example 89.3) is left out. Nothing here is
-- estimated; every row cites its document.
insert into public.gpa_ranges (unitid, school_name, source_kind, entering_term, cds_year, bands, low, high, average,
                               percent_submitting, source_url, source_title, note)
select s.unitid, s.school_name, 'common_data_set', s.entering_term, s.cds_year, s.bands,
       (private.cds_gpa_middle_half(s.bands))[1], (private.cds_gpa_middle_half(s.bands))[2],
       s.average, s.percent_submitting, s.source_url, s.source_title, s.note
  from (values
  (190512, 'CUNY Bernard M Baruch College', 'Fall 2024', '2024-2025', array[0.26, 30.59, 57.55, 9.61, 1.86, 0, 0, 0, 0.13]::numeric[], 3.66, 91.3, 'https://ir.baruch.cuny.edu/wp-content/uploads/sites/23/2025/07/CDS-2024-2025-FINAL-Jun-12.pdf', 'Baruch College Common Data Set 2024-2025', 'Values are not in the page text; they come from the PDF''s numbered C11 form fields (EN_FRSH_GPA_1..9, in CDS band order; same on two reads). Fields 6-7 (2.50-2.99, 2.0-2.49) are blank. Unusual: 0.26% at 4.0 and 0.13% below 1.0. The submitter and all-enrolled columns are identical. Bands sum to 100%.'),
  (190567, 'CUNY City College', 'Fall 2025', '2025-2026', array[0.34, 17.29, 29.6, 23.94, 16.53, 11.64, 0.64, 0.02, 0]::numeric[], 3.14, 92, 'https://www.ccny.cuny.edu/sites/default/files/2026-07/20260716_CDS_2025-2026_UPDATED.pdf', 'The City College of New York Common Data Set 2025-2026', 'C11 values are only in the ''Students who submitted scores'' column (fields FRSH_GPA_SUBMIT_1-9); the ''All enrolled'' column is empty (total 0). The C12 average of 3.14 is lower than the C11 distribution suggests (about 3.4). A re-read gave the same values.'),
  (189705, 'Canisius University', 'Fall 2023', '2023-2024', array[4, 27, 20, 12, 11, 14, 9, 3, 0]::numeric[], null, 98, 'https://www.canisius.edu/sites/default/files/documents/CDS_2023-2024.pdf', 'Canisius University Common Data Set 2023-2024', 'C12 average is reported as 89.3, which looks like a 100-point scale and can''t be compared with the 4.0-scale C11 bands (confirmed on re-read). The below 1.0 band and the submitter/non-submitter columns are blank. Could not check for a newer CDS (IR page unreachable).'),
  (190150, 'Columbia University in the City of New York', 'Fall 2025', '2025-2026', array[74.9, 20.8, 3.3, 0.9, 0.1, 0, 0, 0, 0]::numeric[], 4.25, 99.9, 'https://opir.columbia.edu/sites/opir.columbia.edu/files/content/Common%20Data%20Set/2025-26_Columbia_College_and_Columbia_Enginnering_CDS.pdf', 'Columbia College / Columbia Engineering Common Data Set 2025-26', 'CDS covers Columbia College + Columbia Engineering only (General Studies has a separate CDS). C12 average 4.25 is above the 4.0 top band; footnote c1 says C11/C12 are based on the 72.2% of first-years with GPAs recorded on a 4.0 scale, while 99.9% = students with a GPA on any scale. Document does not state weighting.'),
  (185590, 'Montclair State University', 'Fall 2025', '2025-2026', array[11.62, 12.15, 17.58, 16.52, 17.55, 23.09, 1.45, 0.06, 0]::numeric[], 3.35, 94.08, 'https://irdata.montclair.edu/institutionalresearch/CDS/CDS%202025-2026.pdf', 'Montclair State University Common Data Set 2025-2026', 'Values from ''all enrolled students'' column. The PDF text puts labels and numbers in separate blocks, so they were matched by order; the same mapping came back on two reads, every column sums to 100%, and each row''s all-enrolled value falls between its submitter and non-submitter values. Bloomfield College of Montclair State has a separate CDS (not used).'),
  (194310, 'Pace University', 'Fall 2024', '2024-2025', array[25, 0, 7, 6, 50, 4, 8, 0, 0]::numeric[], 3.3, 86.11, 'https://www.pace.edu/sites/default/files/2025-11/university-wide-common-data-set-2024-2025.pdf', 'Pace University University Wide Common Data Set 2024-2025', 'University-wide CDS; values from ''all enrolled students'' column. 2025-26 CDS is listed on the OPAIR page but requires a Pace login. The 3.75-3.99 and below-1.0 rows are blank in the document (unusual: 25% at 4.0, 0 in 3.75-3.99, 50% in 3.00-3.24), read the same way on two reads. The 1.0-1.99 row prints only two ''0%'' values for three columns, so its all-enrolled value is left null. Listed bands sum to 100%.'),
  (130226, 'Quinnipiac University', 'Fall 2023', '2023-2024', array[16.9, 24.4, 25.3, 14.7, 10.6, 7.9, 0.2, 0, 0]::numeric[], 3.6, 99.9, 'https://www.qu.edu/499cca/globalassets/global/media/qu/documents/about/institutional-research/cds_2023-2024_quinnipiac.pdf', 'Quinnipiac University Common Data Set 2023-2024', 'Most recent CDS listed on QU Institutional Research page is 2023-24. Band values are printed once (Total 100.0% in the all-enrolled column).'),
  (186201, 'Ramapo College of New Jersey', 'Fall 2025', '2025-2026', array[8.8, 21.1, 28.2, 14.3, 17.4, 9.1, 1, 0.1, 0]::numeric[], 3.48, 100, 'https://www.ramapo.edu/ir/wp-content/uploads/sites/52/2026/02/CDS-2025-2026-Final-Report-3.pdf', 'Ramapo College of New Jersey Common Data Set 2025-2026', 'C11 is from the ''All enrolled students'' column.'),
  (184782, 'Rowan University', 'Fall 2024', '2024-2025', array[21.85, 15.85, 18.34, 12.11, 15.65, 15.51, 0.69, 0, 0]::numeric[], 3.48, 100, 'https://sites.rowan.edu/academic-affairs/ida/_docs/rowan_university_cds.pdf', 'Rowan University Common Data Set 2024-2025', 'Most recent CDS posted is 2024-25 (Fall 2024). C11 is from the ''Percent of all enrolled students'' column.'),
  (196121, 'SUNY Brockport', 'Fall 2023', '2023-2024', array[0, 20, 10, 11, 12, 23, 20, 4, 0]::numeric[], 3.3, 95, 'https://www.brockport.edu/live/files/7692-common-data-set-2023-2024', 'SUNY Brockport Common Data Set 2023-2024 (Fall 2023)', 'The newest CDS posted on brockport.edu is 2023-2024. The distribution is unusual (0% at 4.0, 20% at 3.75-3.99), and the 3.3 average is above what the bands suggest (about 3.0). A re-read confirmed the values as published.'),
  (196015, 'SUNY College of Technology at Canton', 'Fall 2025', '2025-2026', array[0.8, 7.9, 13.4, 17.1, 17.4, 22.5, 15.5, 5.2, 0.2]::numeric[], null, 95, 'https://www.canton.edu/media/ir/CDS2025-2026.pdf', 'SUNY Canton Common Data Set 2025-2026', 'The C12 average reads ''85.7 or 3'' (85.7 looks like a 100-point scale and the 4.0-scale figure is cut off), so it is left null. Only an all-enrolled column is reported.'),
  (195474, 'Siena University', 'Fall 2023', '2023-2024', array[4, 23.9, 34.4, 24.7, 12, 1, 0, 0, 0]::numeric[], 3.54, 99.6, 'https://www.siena.edu/files/resources/siena_college_cds_2023-2024_final.pdf', 'Siena College Common Data Set 2023-2024', 'A 2025-2026 CDS exists (siena.edu/files/resources/oie-common-data-set-2025-2026.pdf), but its data values can''t be extracted (no numbers in the text). No 2024-2025 CDS is posted, so 2023-2024 was used. The submitter/non-submitter columns are blank.'),
  (195720, 'St. John Fisher University', 'Fall 2025', '2025-2026', array[5.3, 24.9, 37.1, 10.4, 14.2, 7.3, 0.8, 0, 0]::numeric[], 3.52, 100, 'https://www.sjf.edu/media/services/institutional-research/documents/CommonDataSet.pdf', 'St. John Fisher University Common Data Set 2025-2026', 'The ''All enrolled'' column is identical to the ''submitted scores'' column; the ''did not submit'' column is 0.'),
  (195243, 'St. Thomas Aquinas College', 'Fall 2025', '2025-2026', array[8, 6, 17, 9, 14, 26, 18, 2, 0]::numeric[], 3, 100, 'https://stac.edu/wp-content/uploads/2026/07/STAC-CDS-PDF-2025-2026_PDF_Template.pdf', 'St. Thomas Aquinas College Common Data Set 2025-2026', 'C11 is from the ''All enrolled students'' column, confirmed by form field names EN_FRSH_GPA_1-9.'),
  (186867, 'Stevens Institute of Technology', 'Fall 2023', '2023-2024', array[69.1, 11.9, 12.4, 3.7, 2.2, 0.5, 0.1, 0, 0]::numeric[], 3.89, 95, 'https://assets.stevens.edu/mviowpldu823/8g2creKHAYezWQm7Qgapu/369b640de25d98e2222b6abce45d0d4f/CDS_2024.pdf', 'Stevens Institute of Technology Common Data Set (Fall 2023 data, file CDS_2024.pdf)', 'The 2025-26 PDFs (two versions) and the 2024-25 PDF have garbled text and could not be read, so 2023-24 was used. This file prints no year label; its data are for Fall 2023. C11 matches the 2023-24 file linked on Stevens'' CDS page, but that file reads 94% submitting (garbled text) against 95% here.'),
  (196866, 'Union College', 'Fall 2024', '2024-2025', array[14, 23, 21, 23, 12, 5, 1, 0, 0]::numeric[], null, 100, 'https://www.union.edu/sites/default/files/institutional-research/202505/common-data-set-2024-2025-final-website-march-2025.pdf', 'Union College Common Data Set 2024-2025 Edition', 'The 2025-26 CDS text was garbled, so 2024-25 was used. The 1.0-1.99 and below-1.0 rows are blank and the columns sum to 99. The C12 average is printed as ''91'' with no decimal or scale, so it is left null.'),
  (195030, 'University of Rochester', 'Fall 2025', '2025-2026', array[24.33, 31.57, 25.22, 11.72, 5.55, 1.61, 0, 0, 0]::numeric[], 3.73, 99.9, 'https://www.rochester.edu/provost/wp-content/uploads/2026/06/CDS-2025-26-completed-for-web.pdf', 'University of Rochester Common Data Set 2025-2026 (updated June 9, 2026)', null)
  ) as s(unitid, school_name, entering_term, cds_year, bands, average, percent_submitting, source_url, source_title, note);

