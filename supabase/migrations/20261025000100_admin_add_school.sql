-- =============================================================================
-- Adding a school the federal athletics report leaves out
-- =============================================================================
-- The registry is built from EADA, which only covers coeducational schools that
-- take federal student aid. Active programs at service academies, men's
-- colleges, schools without federal aid and brand-new teams are therefore
-- missing. An administrator can add one by hand from the school's official
-- athletics site (or the association's directory), citing the page checked.
--
-- What an added school gets:
--   * an institution row whose facts come from the new 'official_site' source;
--   * an active program with status_source 'admin' for the season checked, so
--     a later federal import for that season or older keeps it, and a
--     verification level beyond the federal report, so imports never overwrite
--     its division;
--   * a revision-log entry with the administrator's note, and an audit event.
-- Admissions figures and costs are not entered by hand; they arrive only if
-- the school later appears in the federal data.

insert into public.data_sources (id, name, publisher, homepage_url, access_method, terms_note, attribution) values
  ('official_site', 'Official school and athletics websites',
   'Each school', null,
   'Checked by hand by a Base Recruits administrator, who records the page checked.',
   'Only facts are recorded (school name, location, team, division and conference) with a link to the page checked; no text or images are copied.',
   'The school''s official website, checked by Base Recruits');

create function public.admin_add_baseball_program(
  p_unitid integer,
  p_name text,
  p_city text,
  p_state text,
  p_website_url text,
  p_control public.institution_control,
  p_level public.institution_level,
  p_season text,
  p_association_code text,
  p_division_code text,
  p_conference text,
  p_athletics_url text,
  p_verification public.program_verification,
  p_verification_source_url text,
  p_note text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_name text := nullif(btrim(p_name), '');
  v_city text := nullif(btrim(p_city), '');
  v_state text := upper(nullif(btrim(p_state), ''));
  v_website text := nullif(btrim(p_website_url), '');
  v_season text := nullif(btrim(p_season), '');
  v_conference text := nullif(btrim(p_conference), '');
  v_athletics text := nullif(btrim(p_athletics_url), '');
  v_evidence text := nullif(btrim(p_verification_source_url), '');
  v_note text := nullif(btrim(p_note), '');
  v_id uuid;
  v_slug text;
  v_program_id uuid;
begin
  if v_note is null or length(v_note) not between 5 and 1000 then
    raise exception 'explain what you checked (5–1000 characters)' using errcode = 'BR003';
  end if;
  if p_unitid is null or p_unitid not between 100000 and 999999 then
    raise exception 'the federal school ID (IPEDS UNITID) is a six-digit number' using errcode = 'BR003';
  end if;
  if exists (select 1 from public.institutions where unitid = p_unitid) then
    raise exception 'that school is already in the registry; correct it from its own page instead' using errcode = 'BR003';
  end if;
  if v_name is null or length(v_name) not between 2 and 200 then
    raise exception 'school name must be 2–200 characters' using errcode = 'BR003';
  end if;
  if v_city is null or length(v_city) > 100 then
    raise exception 'city is required (at most 100 characters)' using errcode = 'BR003';
  end if;
  if v_state is null or v_state !~ '^[A-Z]{2}$' then
    raise exception 'state must be a two-letter code' using errcode = 'BR003';
  end if;
  if p_control is null or p_level is null then
    raise exception 'choose the school''s control and level' using errcode = 'BR003';
  end if;
  if v_season is null or v_season !~ '^[0-9]{4}-[0-9]{2}$'
     or right(v_season, 2)::integer <> (left(v_season, 4)::integer + 1) % 100 then
    raise exception 'season must look like 2026-27' using errcode = 'BR003';
  end if;
  if p_association_code is null or p_division_code is null
     or not exists (select 1 from public.athletic_divisions d
                     where d.code = p_division_code and d.association_code = p_association_code) then
    raise exception 'that division does not belong to that association' using errcode = 'BR003';
  end if;
  if v_conference is not null and length(v_conference) not between 2 and 120 then
    raise exception 'conference must be 2–120 characters' using errcode = 'BR003';
  end if;
  if p_verification is null or p_verification = 'federal_report' then
    raise exception 'a school added by hand must be confirmed on the association''s directory or the school''s athletics site'
      using errcode = 'BR003';
  end if;
  if v_website is null or v_evidence is null then
    raise exception 'give the school''s website and the official page you checked' using errcode = 'BR003';
  end if;
  if not (private.is_web_url(v_website, true) and private.is_web_url(v_evidence, true)
          and private.is_web_url(v_athletics, true)) then
    raise exception 'links must be https web addresses without a user name' using errcode = 'BR003';
  end if;

  perform private.set_registry_context(null, v_note);

  v_slug := private.unique_institution_slug(v_name, v_state, p_unitid);
  insert into public.institutions (unitid, slug, name, city, state, website_url, control, level,
                                   facts_source_id, facts_dataset, facts_source_url, facts_retrieved_at)
  values (p_unitid, v_slug, v_name, v_city, v_state, v_website, p_control, p_level,
          'official_site', 'Checked by a Base Recruits administrator', v_website, now())
  returning id into v_id;
  perform private.refresh_institution_search_text(v_id);

  insert into public.baseball_programs (institution_id, status, status_source, status_note, status_season, season,
                                        association_code, division_code, conference, athletics_url,
                                        verification, verification_source_url, verification_note, verified_at, verified_by,
                                        source_id, source_dataset, source_url, source_retrieved_at)
  values (v_id, 'active', 'admin', v_note, v_season, v_season,
          p_association_code, p_division_code, v_conference, v_athletics,
          p_verification, v_evidence, v_note, now(), v_admin,
          'official_site', 'Checked by a Base Recruits administrator', v_evidence, now())
  returning id into v_program_id;

  perform private.log_audit('registry.program_added', 'baseball_program', v_program_id::text, null,
                            jsonb_build_object('unitid', p_unitid, 'slug', v_slug, 'division', p_division_code,
                                               'season', v_season));
  perform private.set_registry_context(null, null);
  return v_slug;
exception
  when unique_violation then
    raise exception 'that school is already in the registry; correct it from its own page instead' using errcode = 'BR003';
  when check_violation then
    raise exception 'the school details are invalid: %', sqlerrm using errcode = 'BR003';
end;
$$;

comment on function public.admin_add_baseball_program(integer, text, text, text, text, public.institution_control,
  public.institution_level, text, text, text, text, text, public.program_verification, text, text) is
  'Administrators only: add a school and its active program that the federal athletics report leaves out, citing the official page checked. Returns the new slug.';

revoke all on function public.admin_add_baseball_program(integer, text, text, text, text, public.institution_control,
  public.institution_level, text, text, text, text, text, public.program_verification, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_add_baseball_program(integer, text, text, text, text, public.institution_control,
  public.institution_level, text, text, text, text, text, public.program_verification, text, text) to authenticated;
