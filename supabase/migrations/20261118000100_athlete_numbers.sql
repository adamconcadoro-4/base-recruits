-- =============================================================================
-- Base Recruits / Saved grades and baseball numbers (decision F63, 2026-11-18)
--
-- Until now a player's grades, scores and baseball numbers lived only in their
-- browser (F45). The founder decided players should be able to share their
-- grades ("Yes they should be able to share their grades"), so a signed-in
-- athlete can now choose to save them to their account:
--
-- * One row per athlete, typed columns, every value self-reported
--   (verification = 'self_reported', shown as "Needs transcripts for
--   verification"). Nothing is saved unless the athlete asks.
-- * The athlete reads, replaces and deletes their own row.
-- * A linked parent or guardian sees it only while the athlete shares it with
--   them by name (consent scope family_academic, checked at read time). Ending
--   the family link or turning sharing off stops it on the next request.
-- * Coaches see nothing. A future "Show academics" setting (scope
--   coach_academic_summary, default off, guardian approval for minors) is the
--   only way a coach would ever see grades, and it is not built.
-- * The table has no client privileges at all; every read and write is one of
--   the functions below. Audit records which fields changed, never the values.
-- =============================================================================

create table public.athlete_numbers (
  athlete_id uuid primary key references public.athletes (user_id) on delete cascade,
  applicant_type public.applicant_type not null default 'first_year',
  entry_year smallint
    constraint athlete_numbers_entry_year check (entry_year is null or entry_year between 2020 and 2100),
  gpa numeric(5, 2)
    constraint athlete_numbers_gpa check (gpa is null or gpa >= 0),
  gpa_scale smallint not null default 4
    constraint athlete_numbers_gpa_scale check (gpa_scale in (4, 5, 100)),
  gpa_type text
    constraint athlete_numbers_gpa_type check (gpa_type is null or gpa_type in ('unweighted', 'weighted')),
  sat_total smallint
    constraint athlete_numbers_sat_total check (sat_total is null or (sat_total between 400 and 1600 and sat_total % 10 = 0)),
  act_composite smallint
    constraint athlete_numbers_act check (act_composite is null or act_composite between 1 and 36),
  submit_scores text not null default 'yes'
    constraint athlete_numbers_submit_scores check (submit_scores in ('yes', 'no', 'undecided')),
  core_gpa_division_i numeric(3, 2)
    constraint athlete_numbers_core_gpa_d1 check (core_gpa_division_i is null or core_gpa_division_i between 0 and 4),
  core_gpa_division_ii numeric(3, 2)
    constraint athlete_numbers_core_gpa_d2 check (core_gpa_division_ii is null or core_gpa_division_ii between 0 and 4),
  main_position text
    constraint athlete_numbers_position check (main_position is null or main_position in
      ('pitcher', 'catcher', 'first_base', 'second_base', 'shortstop', 'third_base', 'outfield')),
  fastball_mph numeric(4, 1)
    constraint athlete_numbers_fastball check (fastball_mph is null or fastball_mph between 40 and 105),
  exit_velocity_mph numeric(4, 1)
    constraint athlete_numbers_exit_velocity check (exit_velocity_mph is null or exit_velocity_mph between 40 and 125),
  sixty_yard_s numeric(4, 2)
    constraint athlete_numbers_sixty check (sixty_yard_s is null or sixty_yard_s between 5.5 and 10),
  infield_velocity_mph numeric(4, 1)
    constraint athlete_numbers_infield check (infield_velocity_mph is null or infield_velocity_mph between 40 and 105),
  outfield_velocity_mph numeric(4, 1)
    constraint athlete_numbers_outfield check (outfield_velocity_mph is null or outfield_velocity_mph between 40 and 110),
  catcher_velocity_mph numeric(4, 1)
    constraint athlete_numbers_catcher check (catcher_velocity_mph is null or catcher_velocity_mph between 40 and 100),
  pop_time_s numeric(3, 2)
    constraint athlete_numbers_pop_time check (pop_time_s is null or pop_time_s between 1.5 and 3.5),
  verification text not null default 'self_reported'
    constraint athlete_numbers_verification check (verification = 'self_reported'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_numbers_gpa_within_scale check (gpa is null or gpa <= gpa_scale),
  constraint athlete_numbers_metrics_need_position check (
    main_position is not null
    or (fastball_mph is null and exit_velocity_mph is null and sixty_yard_s is null and infield_velocity_mph is null
        and outfield_velocity_mph is null and catcher_velocity_mph is null and pop_time_s is null))
);
comment on table public.athlete_numbers is
  'Grades, test scores and baseball numbers an athlete chose to save to their account (F63). All self-reported. '
  'Read and written only through save_my_numbers, my_numbers, delete_my_numbers and family_shared_numbers.';

alter table public.athlete_numbers enable row level security;
revoke all on table public.athlete_numbers from public, anon, authenticated, service_role;

-- Records which fields changed and who changed them; grades and numbers are
-- recorded only as changed/set/empty, never by value.
create trigger athlete_numbers_audit
  after insert or update or delete on public.athlete_numbers
  for each row execute function private.audit_row_change(
    'athlete_id', 'athlete_id', 'applicant_type', '~entry_year', '~gpa', 'gpa_scale', 'gpa_type', '~sat_total',
    '~act_composite', 'submit_scores', '~core_gpa_division_i', '~core_gpa_division_ii', 'main_position', '~fastball_mph',
    '~exit_velocity_mph', '~sixty_yard_s', '~infield_velocity_mph', '~outfield_velocity_mph',
    '~catcher_velocity_mph', '~pop_time_s');

-- The parent-sharing permission now names what is shared.
update public.consent_scope_rules
   set description = 'Let a linked parent/guardian see the grades, test scores and baseball numbers you saved to your account.'
 where scope = 'family_academic';

-- -----------------------------------------------------------------------------
-- The athlete's own numbers
-- -----------------------------------------------------------------------------

-- Reads one optional number from the JSON the site sends. Blank or missing is
-- null; anything that is not a number is refused in plain language.
create function private.numbers_field(p_numbers jsonb, p_key text) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value jsonb := p_numbers -> p_key;
begin
  if v_value is null or v_value = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(v_value) <> 'number' then
    raise exception 'one of your numbers is not a number' using errcode = 'BR003';
  end if;
  return (v_value #>> '{}')::numeric;
end;
$$;
revoke all on function private.numbers_field(jsonb, text) from public;

create function public.save_my_numbers(p_numbers jsonb) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_allowed text[] := array['applicant_type', 'entry_year', 'gpa', 'gpa_scale', 'gpa_type', 'sat_total',
    'act_composite', 'submit_scores', 'core_gpa_division_i', 'core_gpa_division_ii', 'main_position', 'fastball_mph',
    'exit_velocity_mph', 'sixty_yard_s', 'infield_velocity_mph', 'outfield_velocity_mph', 'catcher_velocity_mph',
    'pop_time_s'];
  v_applicant text;
  v_gpa_type text;
  v_submit text;
  v_position text;
  v_saved timestamptz;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  if not private.has_role(v_uid, 'athlete') then
    raise exception 'only athletes can save grades and baseball numbers' using errcode = 'BR002';
  end if;
  if not private.has_recorded_birthdate(v_uid) then
    raise exception 'complete the age step first' using errcode = 'BR004';
  end if;
  if p_numbers is null or jsonb_typeof(p_numbers) <> 'object' or octet_length(p_numbers::text) > 2000 then
    raise exception 'your numbers could not be read' using errcode = 'BR003';
  end if;
  if exists (select 1 from jsonb_object_keys(p_numbers) k where k <> all (v_allowed)) then
    raise exception 'your numbers could not be read' using errcode = 'BR003';
  end if;
  if exists (select 1 from unnest(array['applicant_type', 'gpa_type', 'submit_scores', 'main_position']) k
              where p_numbers ? k and jsonb_typeof(p_numbers -> k) not in ('string', 'null')) then
    raise exception 'your numbers could not be read' using errcode = 'BR003';
  end if;

  v_applicant := coalesce(p_numbers ->> 'applicant_type', 'first_year');
  v_gpa_type := nullif(p_numbers ->> 'gpa_type', '');
  v_submit := coalesce(p_numbers ->> 'submit_scores', 'yes');
  v_position := nullif(p_numbers ->> 'main_position', '');
  if v_applicant not in ('first_year', 'transfer') then
    raise exception 'choose first-year or transfer' using errcode = 'BR003';
  end if;

  begin
    insert into public.athlete_numbers as n (
      athlete_id, applicant_type, entry_year, gpa, gpa_scale, gpa_type, sat_total, act_composite, submit_scores,
      core_gpa_division_i, core_gpa_division_ii, main_position, fastball_mph, exit_velocity_mph, sixty_yard_s,
      infield_velocity_mph, outfield_velocity_mph, catcher_velocity_mph, pop_time_s)
    values (
      v_uid, v_applicant::public.applicant_type, private.numbers_field(p_numbers, 'entry_year'),
      private.numbers_field(p_numbers, 'gpa'), coalesce(private.numbers_field(p_numbers, 'gpa_scale'), 4), v_gpa_type,
      private.numbers_field(p_numbers, 'sat_total'), private.numbers_field(p_numbers, 'act_composite'), v_submit,
      private.numbers_field(p_numbers, 'core_gpa_division_i'), private.numbers_field(p_numbers, 'core_gpa_division_ii'),
      v_position, private.numbers_field(p_numbers, 'fastball_mph'), private.numbers_field(p_numbers, 'exit_velocity_mph'),
      private.numbers_field(p_numbers, 'sixty_yard_s'), private.numbers_field(p_numbers, 'infield_velocity_mph'),
      private.numbers_field(p_numbers, 'outfield_velocity_mph'), private.numbers_field(p_numbers, 'catcher_velocity_mph'),
      private.numbers_field(p_numbers, 'pop_time_s'))
    on conflict (athlete_id) do update set
      applicant_type = excluded.applicant_type, entry_year = excluded.entry_year, gpa = excluded.gpa,
      gpa_scale = excluded.gpa_scale, gpa_type = excluded.gpa_type, sat_total = excluded.sat_total,
      act_composite = excluded.act_composite, submit_scores = excluded.submit_scores,
      core_gpa_division_i = excluded.core_gpa_division_i, core_gpa_division_ii = excluded.core_gpa_division_ii,
      main_position = excluded.main_position, fastball_mph = excluded.fastball_mph, exit_velocity_mph = excluded.exit_velocity_mph,
      sixty_yard_s = excluded.sixty_yard_s, infield_velocity_mph = excluded.infield_velocity_mph,
      outfield_velocity_mph = excluded.outfield_velocity_mph, catcher_velocity_mph = excluded.catcher_velocity_mph,
      pop_time_s = excluded.pop_time_s, updated_at = now()
    returning n.updated_at into v_saved;
  exception
    when check_violation or numeric_value_out_of_range then
      raise exception 'one of your numbers is outside the range we accept' using errcode = 'BR003';
  end;
  return v_saved;
end;
$$;
comment on function public.save_my_numbers(jsonb) is
  'Saves (replaces) the signed-in athlete''s self-reported grades, scores and baseball numbers. Returns when they were saved.';

create function public.my_numbers()
returns table (
  applicant_type public.applicant_type, entry_year smallint, gpa numeric, gpa_scale smallint, gpa_type text,
  sat_total smallint, act_composite smallint, submit_scores text, core_gpa_division_i numeric,
  core_gpa_division_ii numeric, main_position text, fastball_mph numeric, exit_velocity_mph numeric, sixty_yard_s numeric,
  infield_velocity_mph numeric, outfield_velocity_mph numeric, catcher_velocity_mph numeric, pop_time_s numeric,
  verification text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.applicant_type, n.entry_year, n.gpa, n.gpa_scale, n.gpa_type, n.sat_total, n.act_composite, n.submit_scores,
         n.core_gpa_division_i, n.core_gpa_division_ii, n.main_position, n.fastball_mph, n.exit_velocity_mph, n.sixty_yard_s,
         n.infield_velocity_mph, n.outfield_velocity_mph, n.catcher_velocity_mph, n.pop_time_s, n.verification,
         n.updated_at
    from public.athlete_numbers n
   where n.athlete_id = (select auth.uid())
$$;
comment on function public.my_numbers() is 'The signed-in athlete''s saved numbers (no row when nothing is saved).';

create function public.delete_my_numbers() returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  delete from public.athlete_numbers n where n.athlete_id = v_uid;
  return found;
end;
$$;
comment on function public.delete_my_numbers() is
  'Deletes the signed-in athlete''s saved numbers. Sharing permissions stay as they are but have nothing to show.';

-- -----------------------------------------------------------------------------
-- Sharing with a linked parent or guardian
-- -----------------------------------------------------------------------------
create function public.numbers_family_access()
returns table (
  link_id uuid,
  guardian_name text,
  relationship public.family_relationship,
  grant_id uuid,
  in_effect boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, p.display_name, l.relationship, g.id,
         coalesce(private.has_active_grant(l.athlete_id, 'family_academic', 'specific_user', l.guardian_id), false)
    from public.family_links l
    join public.profiles p on p.id = l.guardian_id
    left join public.consent_grants g
      on g.athlete_id = l.athlete_id and g.scope = 'family_academic' and g.grantee_id = l.guardian_id
     and g.status in ('pending_guardian', 'active')
   where l.athlete_id = (select auth.uid()) and l.status = 'active'
   order by l.created_at
$$;
comment on function public.numbers_family_access() is
  'The signed-in athlete''s linked family members and whether each can see the saved grades and numbers.';

create function public.share_numbers_with_family(p_link_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_guardian uuid;
  v_grant uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = 'BR001';
  end if;
  select l.guardian_id into v_guardian from public.family_links l
   where l.id = p_link_id and l.athlete_id = v_uid and l.status = 'active';
  if v_guardian is null then
    raise exception 'family link not found' using errcode = 'BR003';
  end if;
  select g.grant_id into v_grant
    from public.grant_consent('family_academic', 'family-academic-v2', v_guardian) g;
  return v_grant;
end;
$$;
comment on function public.share_numbers_with_family(uuid) is
  'Lets one linked parent/guardian see the athlete''s saved grades and numbers (scope family_academic). Stop with revoke_consent.';

-- What a parent or guardian sees: only athletes who share with them by name,
-- decided at read time from the family link and the grant.
create function public.family_shared_numbers()
returns table (
  athlete_id uuid, athlete_name text, applicant_type public.applicant_type, entry_year smallint, gpa numeric,
  gpa_scale smallint, gpa_type text, sat_total smallint, act_composite smallint, submit_scores text,
  core_gpa_division_i numeric, core_gpa_division_ii numeric, main_position text, fastball_mph numeric,
  exit_velocity_mph numeric, sixty_yard_s numeric, infield_velocity_mph numeric, outfield_velocity_mph numeric,
  catcher_velocity_mph numeric, pop_time_s numeric, verification text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.athlete_id, p.display_name, n.applicant_type, n.entry_year, n.gpa, n.gpa_scale, n.gpa_type, n.sat_total,
         n.act_composite, n.submit_scores, n.core_gpa_division_i, n.core_gpa_division_ii, n.main_position, n.fastball_mph,
         n.exit_velocity_mph, n.sixty_yard_s, n.infield_velocity_mph, n.outfield_velocity_mph, n.catcher_velocity_mph,
         n.pop_time_s, n.verification, n.updated_at
    from public.athlete_numbers n
    join public.profiles p on p.id = n.athlete_id
   where (select auth.uid()) is not null
     and private.guardian_can_view((select auth.uid()), n.athlete_id, 'family_academic')
   order by p.display_name nulls last, n.athlete_id
$$;
comment on function public.family_shared_numbers() is
  'Saved grades and numbers of athletes who currently share them with the signed-in parent/guardian.';

revoke all on function public.save_my_numbers(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.my_numbers() from public, anon, authenticated, service_role;
revoke all on function public.delete_my_numbers() from public, anon, authenticated, service_role;
revoke all on function public.numbers_family_access() from public, anon, authenticated, service_role;
revoke all on function public.share_numbers_with_family(uuid) from public, anon, authenticated, service_role;
revoke all on function public.family_shared_numbers() from public, anon, authenticated, service_role;

grant execute on function public.save_my_numbers(jsonb) to authenticated;
grant execute on function public.my_numbers() to authenticated;
grant execute on function public.delete_my_numbers() to authenticated;
grant execute on function public.numbers_family_access() to authenticated;
grant execute on function public.share_numbers_with_family(uuid) to authenticated;
grant execute on function public.family_shared_numbers() to authenticated;
