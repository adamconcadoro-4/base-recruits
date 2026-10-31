-- =============================================================================
-- Base Recruits — Three more published GPA ranges (founder decision F51)
--
-- A second pass over the New York, New Jersey and Connecticut schools whose
-- Common Data Set wasn't found the first time also checked each school's own
-- admissions pages. Three usable ranges came back. Nothing is estimated; each
-- row cites the school's own document or page.
--
--  - SUNY Fredonia, Common Data Set 2025-2026 (C11 bands; its 4.0 row appears
--    to include 3.75 and up, which widens the range rather than narrowing it).
--  - John Jay College (CUNY), Common Data Set 2023-2024, the newest posted.
--  - Purchase College (SUNY), admissions page: "The middle 50% of enrolled
--    first-year students typically have a high school GPA between 3.0 and 3.7
--    (on a 4.0 scale)." The sentence has no year; the next sentence on the same
--    page describes the fall 2025 class, so it is recorded as Fall 2025.
--
-- Additive only. Rollback: delete these three rows by unitid.
-- =============================================================================

insert into public.gpa_ranges (unitid, school_name, source_kind, entering_term, cds_year, bands, low, high, average,
                               percent_submitting, source_url, source_title, note)
select s.unitid, s.school_name, 'common_data_set', s.entering_term, s.cds_year, s.bands,
       (private.cds_gpa_middle_half(s.bands))[1], (private.cds_gpa_middle_half(s.bands))[2],
       s.average, s.percent_submitting, s.source_url, s.source_title, s.note
  from (values
  (196158, 'SUNY at Fredonia', 'Fall 2025', '2025-2026', array[43, 0, 12, 15, 16, 6, 8, 0, 0]::numeric[], 3.48, 99.69,
   'https://www.fredonia.edu/sites/default/files/archive/aa/CDS_2025-2026_Final.pdf', 'Common Data Set 2025-2026',
   'C11 read twice and checked again on 2026-10-31; bands total 100. The 3.75-3.99 row is 0% and 4.0 is 43% (same pattern in 2024-25), so 3.75 and up appear to be reported as 4.0.'),
  (190600, 'CUNY John Jay College of Criminal Justice', 'Fall 2023', '2023-2024', array[0, 14, 13, 16, 20, 32, 6, 0, 0]::numeric[], 3.17, 99,
   'https://www.jjay.cuny.edu/sites/default/files/2024-02/CDS2023_2024.WORK-FILE.pdf', 'Common Data Set 2023-2024',
   'Single C11 column (Fall 2023), read twice; bands total 101 (rounding). No 2024-25 or newer CDS was found.')
  ) as s(unitid, school_name, entering_term, cds_year, bands, average, percent_submitting, source_url, source_title, note);

insert into public.gpa_ranges (unitid, school_name, source_kind, entering_term, low, high, source_url, source_title, note)
values (196219, 'SUNY at Purchase College', 'school_profile', 'Fall 2025', 3.0, 3.7, 'https://www.purchase.edu/admissions/',
        'Admissions, SUNY Purchase',
        'Quoted: "The middle 50% of enrolled first-year students typically have a high school GPA between 3.0 and 3.7 (on a 4.0 scale)." No year in the sentence; the next sentence gives the fall 2025 class average (88.3 out of 100), so recorded as Fall 2025. Checked 2026-10-31.');
