-- =============================================================================
-- Base Recruits — Stage 2 / Migration 1: school and baseball program registry
--
-- * Reference lists: data sources, athletic associations and divisions.
-- * Institutions, aliases, baseball programs, admissions statistics and costs.
--   Institution and program are separate entities; every source-backed row
--   records its source, dataset, URL, reported year/term and retrieval time.
-- * Import jobs and staged rows (admin-only), and an append-only revision log
--   written by triggers for every registry change.
--
-- Public read access: anyone (including signed-out visitors) may read listed
-- institutions and their program, admissions and cost rows. Nothing in the
-- registry is writable through the Data API; all writes go through the
-- admin-only functions in the next migration.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.institution_control as enum ('public', 'private_nonprofit', 'private_for_profit');
create type public.institution_level as enum ('four_year', 'two_year', 'less_than_two_year');
create type public.campus_setting as enum ('city', 'suburb', 'town', 'rural');

create type public.program_status as enum (
  'active',        -- a source confirms a team for the recorded season
  'not_reported',  -- the newest federal release no longer lists a team; not shown as an opportunity
  'inactive',      -- an administrator confirmed the program was discontinued
  'suspended'      -- an administrator confirmed the program is temporarily suspended
);

create type public.program_verification as enum (
  'federal_report',          -- listed in the EADA release; division is the institution's athletics classification
  'association_directory',   -- an administrator checked the athletics association's official directory
  'official_athletics_site'  -- an administrator checked the school's official athletics website
);

create type public.test_policy as enum (
  'required',                -- "Required to be considered for admission"
  'considered_not_required', -- "Not required for admission, but considered if submitted" (test-optional)
  'not_considered'           -- "Not considered for admission, even if submitted" (test-blind)
);

create type public.import_job_status as enum ('staging', 'staged', 'published', 'discarded');
create type public.import_change as enum ('new', 'changed', 'unchanged', 'missing', 'invalid');

-- -----------------------------------------------------------------------------
-- Shared checks
-- -----------------------------------------------------------------------------
-- An absolute web link with a host and no embedded user name or password.
create function private.is_web_url(p_url text, p_https_only boolean default false) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null
      or (length(p_url) <= 500
          and p_url ~* ((case when p_https_only then '^https://' else '^https?://' end)
                        || '[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$')
          and p_url !~* '^https?://[^/?#]*@')
$$;

-- URL-safe slug from a name: lower case, ASCII letters and digits, single dashes.
create function private.slugify(p_text text) returns text
language sql
stable
set search_path = ''
as $$
  select left(trim(both '-' from regexp_replace(
           lower(extensions.unaccent(replace(coalesce(p_text, ''), '&', ' and '))),
           '[^a-z0-9]+', '-', 'g')), 90)
$$;

-- -----------------------------------------------------------------------------
-- Reference lists
-- -----------------------------------------------------------------------------
create table public.data_sources (
  id text primary key constraint data_sources_id_format check (id ~ '^[a-z][a-z_]*$'),
  name text not null,
  publisher text not null,
  homepage_url text constraint data_sources_homepage check (private.is_web_url(homepage_url, true)),
  access_method text not null,
  terms_note text not null,
  attribution text not null,
  created_at timestamptz not null default now()
);
comment on table public.data_sources is
  'Registry of the sources registry facts may come from: who publishes them, how they are accessed, the terms noted, and the attribution shown.';

insert into public.data_sources (id, name, publisher, homepage_url, access_method, terms_note, attribution) values
  ('eada', 'Equity in Athletics Data Analysis (EADA)',
   'U.S. Department of Education, Office of Postsecondary Education', 'https://ope.ed.gov/athletics/',
   'Annual data files offered for public download on the EADA website.',
   'Published by the U.S. Department of Education for public use. Works of the U.S. Government are not subject to U.S. copyright (17 U.S.C. § 105). Confirm with counsel before launch (decision L6).',
   'U.S. Department of Education, Equity in Athletics Data Analysis'),
  ('college_scorecard', 'College Scorecard',
   'U.S. Department of Education', 'https://collegescorecard.ed.gov/',
   'Official College Scorecard API at api.data.gov, with a registered key.',
   'Published by the U.S. Department of Education for public use. Works of the U.S. Government are not subject to U.S. copyright (17 U.S.C. § 105). Confirm with counsel before launch (decision L6).',
   'U.S. Department of Education, College Scorecard (IPEDS data)'),
  ('base_recruits_review', 'Base Recruits review',
   'Base Recruits', null,
   'A Base Recruits administrator checked the official page cited with the change.',
   'Each change records the official page that was checked.',
   'Checked by Base Recruits against the official page cited');

create table public.athletic_associations (
  code text primary key constraint athletic_associations_code_format check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  short_name text not null,
  two_year boolean not null,
  sort_order smallint not null unique
);

create table public.athletic_divisions (
  code text primary key constraint athletic_divisions_code_format check (code ~ '^[a-z][a-z0-9_]*$'),
  association_code text not null references public.athletic_associations (code),
  name text not null,
  sort_order smallint not null unique,
  unique (association_code, code)
);

insert into public.athletic_associations (code, name, short_name, two_year, sort_order) values
  ('ncaa', 'National Collegiate Athletic Association', 'NCAA', false, 10),
  ('naia', 'National Association of Intercollegiate Athletics', 'NAIA', false, 20),
  ('njcaa', 'National Junior College Athletic Association', 'NJCAA', true, 30),
  ('cccaa', 'California Community College Athletic Association', 'CCCAA', true, 40),
  ('nwac', 'Northwest Athletic Conference', 'NWAC', true, 50),
  ('uscaa', 'United States Collegiate Athletic Association', 'USCAA', false, 60),
  ('nccaa', 'National Christian College Athletic Association', 'NCCAA', false, 70),
  ('independent', 'Independent (no association reported)', 'Independent', false, 80),
  ('other', 'Other association (as reported by the institution)', 'Other', false, 90);

insert into public.athletic_divisions (code, association_code, name, sort_order) values
  ('ncaa_d1', 'ncaa', 'NCAA Division I', 10),
  ('ncaa_d2', 'ncaa', 'NCAA Division II', 11),
  ('ncaa_d3', 'ncaa', 'NCAA Division III', 12),
  ('naia', 'naia', 'NAIA', 20),
  ('njcaa_d1', 'njcaa', 'NJCAA Division I', 30),
  ('njcaa_d2', 'njcaa', 'NJCAA Division II', 31),
  ('njcaa_d3', 'njcaa', 'NJCAA Division III', 32),
  ('cccaa', 'cccaa', 'CCCAA', 40),
  ('nwac', 'nwac', 'NWAC', 50),
  ('uscaa', 'uscaa', 'USCAA', 60),
  ('nccaa_d1', 'nccaa', 'NCCAA Division I', 70),
  ('nccaa_d2', 'nccaa', 'NCCAA Division II', 71),
  ('independent', 'independent', 'Independent', 80),
  ('other', 'other', 'Other', 90);

-- -----------------------------------------------------------------------------
-- Import jobs (admin-only). Declared first so registry rows can reference them.
-- -----------------------------------------------------------------------------
create table public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  snapshot_name text not null constraint data_import_jobs_snapshot_name check (snapshot_name ~ '^[A-Za-z0-9._-]{1,120}$'),
  snapshot_sha256 text not null constraint data_import_jobs_sha check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text not null constraint data_import_jobs_content_sha check (content_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_format text not null constraint data_import_jobs_format check (snapshot_format = 'base-recruits.registry-snapshot/1'),
  generated_at timestamptz not null,
  sources jsonb not null constraint data_import_jobs_sources_array check (jsonb_typeof(sources) = 'array'),
  season text not null constraint data_import_jobs_season check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  admissions_term text constraint data_import_jobs_admissions_term check (admissions_term ~ '^Fall [0-9]{4}$'),
  cost_year text constraint data_import_jobs_cost_year check (cost_year ~ '^[0-9]{4}-[0-9]{2}$'),
  status public.import_job_status not null default 'staging',
  expected_rows integer not null constraint data_import_jobs_expected check (expected_rows between 1 and 20000),
  staged_rows integer not null default 0,
  counts jsonb not null default '{}'::jsonb,
  restaged_from uuid references public.data_import_jobs (id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  staged_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  publish_note text constraint data_import_jobs_note check (publish_note is null or length(publish_note) <= 2000),
  discarded_by uuid,
  discarded_at timestamptz
);
comment on table public.data_import_jobs is
  'One staged snapshot import. Rows are reviewed (staged) and then published or discarded by an administrator.';
create index data_import_jobs_created_idx on public.data_import_jobs (created_at desc);
create unique index data_import_jobs_one_staging on public.data_import_jobs ((true)) where status = 'staging';

create table public.data_import_rows (
  job_id uuid not null references public.data_import_jobs (id) on delete cascade,
  unitid integer not null constraint data_import_rows_unitid check (unitid > 0),
  record jsonb constraint data_import_rows_record_object check (record is null or jsonb_typeof(record) = 'object'),
  source_issues jsonb not null default '[]'::jsonb constraint data_import_rows_issues_array check (jsonb_typeof(source_issues) = 'array'),
  change public.import_change,
  changes jsonb not null default '{}'::jsonb,
  problems text[] not null default '{}',
  decision text not null default 'apply' constraint data_import_rows_decision check (decision in ('apply', 'skip')),
  primary key (job_id, unitid)
);
comment on table public.data_import_rows is
  'Snapshot rows staged for review: the normalized record, what would change, and the administrator''s apply/skip decision.';
create index data_import_rows_change_idx on public.data_import_rows (job_id, change);

-- -----------------------------------------------------------------------------
-- Institutions
-- -----------------------------------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  unitid integer not null unique constraint institutions_unitid check (unitid > 0),
  ope8_id text constraint institutions_ope8 check (ope8_id ~ '^[0-9]{8}$'),
  slug text not null unique
    constraint institutions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name text not null constraint institutions_name check (length(name) between 2 and 200),
  city text constraint institutions_city check (city is null or length(city) <= 100),
  state text constraint institutions_state check (state ~ '^[A-Z]{2}$'),
  zip text constraint institutions_zip check (zip ~ '^[0-9]{5}(-?[0-9]{4})?$'),
  latitude double precision constraint institutions_latitude check (latitude between -90 and 90),
  longitude double precision constraint institutions_longitude check (longitude between -180 and 180),
  website_url text constraint institutions_website check (private.is_web_url(website_url)),
  price_calculator_url text constraint institutions_price_calculator check (private.is_web_url(price_calculator_url)),
  control public.institution_control,
  level public.institution_level,
  predominant_degree text
    constraint institutions_predominant_degree check (predominant_degree in ('certificate', 'associate', 'bachelors', 'graduate')),
  setting public.campus_setting,
  undergraduate_enrollment integer constraint institutions_enrollment check (undergraduate_enrollment >= 0),
  enrollment_term text constraint institutions_enrollment_term check (enrollment_term ~ '^Fall [0-9]{4}$'),
  enrollment_source_year smallint,
  constraint institutions_enrollment_labelled check ((undergraduate_enrollment is null) = (enrollment_term is null)),
  facts_source_id text not null references public.data_sources (id),
  facts_dataset text not null,
  facts_source_url text not null constraint institutions_facts_url check (private.is_web_url(facts_source_url, true)),
  facts_retrieved_at timestamptz not null,
  import_job_id uuid references public.data_import_jobs (id),
  is_listed boolean not null default true,
  unlisted_reason text constraint institutions_unlisted_reason check (unlisted_reason is null or length(unlisted_reason) between 3 and 500),
  constraint institutions_unlisted_has_reason check (is_listed or unlisted_reason is not null),
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.institutions is
  'Colleges keyed by IPEDS unit id (also the College Scorecard id). Facts carry their source and retrieval time; enrollment carries its term.';
comment on column public.institutions.is_listed is
  'False hides the institution from public pages (for example a duplicate or a record under correction). Requires a reason.';

create index institutions_search_trgm on public.institutions using gin (search_text extensions.gin_trgm_ops);
create index institutions_state_idx on public.institutions (state) where is_listed;
create index institutions_name_idx on public.institutions (name);

create table public.institution_aliases (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  alias text not null constraint institution_aliases_alias check (length(alias) between 2 and 120),
  source_id text not null references public.data_sources (id),
  primary key (institution_id, alias)
);

-- -----------------------------------------------------------------------------
-- Baseball programs (men's baseball; one current record per institution)
-- -----------------------------------------------------------------------------
create table public.baseball_programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null unique references public.institutions (id) on delete cascade,
  status public.program_status not null,
  status_source text not null default 'import' constraint baseball_programs_status_source check (status_source in ('import', 'admin')),
  status_note text constraint baseball_programs_status_note check (status_note is null or length(status_note) <= 1000),
  season text not null constraint baseball_programs_season check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  association_code text not null,
  division_code text not null,
  foreign key (association_code, division_code) references public.athletic_divisions (association_code, code),
  classification_code smallint,
  classification_label text constraint baseball_programs_classification_label check (length(classification_label) <= 100),
  classification_other text constraint baseball_programs_classification_other check (length(classification_other) <= 100),
  reported_participants integer constraint baseball_programs_participants check (reported_participants > 0),
  conference text constraint baseball_programs_conference check (conference is null or length(conference) between 2 and 120),
  athletics_url text constraint baseball_programs_athletics_url check (private.is_web_url(athletics_url, true)),
  roster_url text constraint baseball_programs_roster_url check (private.is_web_url(roster_url, true)),
  questionnaire_url text constraint baseball_programs_questionnaire_url check (private.is_web_url(questionnaire_url, true)),
  verification public.program_verification not null default 'federal_report',
  verification_source_url text constraint baseball_programs_verification_url check (private.is_web_url(verification_source_url, true)),
  verification_note text constraint baseball_programs_verification_note check (verification_note is null or length(verification_note) <= 1000),
  constraint baseball_programs_review_has_evidence
    check (verification = 'federal_report' or verification_source_url is not null),
  verified_at timestamptz not null,
  verified_by uuid,
  source_id text not null references public.data_sources (id),
  source_dataset text not null,
  source_url text not null constraint baseball_programs_source_url check (private.is_web_url(source_url, true)),
  source_retrieved_at timestamptz not null,
  import_job_id uuid references public.data_import_jobs (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.baseball_programs is
  'A college''s men''s baseball program: status with its season and source, association/division, and the level of verification behind it. Never implies roster openings or scholarships.';
create index baseball_programs_division_idx on public.baseball_programs (division_code, status);
create index baseball_programs_status_idx on public.baseball_programs (status);

-- -----------------------------------------------------------------------------
-- Admissions (one row per institution, source and fall term)
-- -----------------------------------------------------------------------------
create table public.admissions_statistics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  term text not null constraint admissions_term check (term ~ '^Fall [0-9]{4}$'),
  term_year smallint generated always as (substr(term, 6)::smallint) stored,
  admission_rate numeric(5, 4) constraint admissions_rate check (admission_rate between 0 and 1),
  sat_erw_25 smallint constraint admissions_sat_erw_25 check (sat_erw_25 between 200 and 800),
  sat_erw_75 smallint constraint admissions_sat_erw_75 check (sat_erw_75 between 200 and 800),
  sat_math_25 smallint constraint admissions_sat_math_25 check (sat_math_25 between 200 and 800),
  sat_math_75 smallint constraint admissions_sat_math_75 check (sat_math_75 between 200 and 800),
  act_composite_25 smallint constraint admissions_act_25 check (act_composite_25 between 1 and 36),
  act_composite_75 smallint constraint admissions_act_75 check (act_composite_75 between 1 and 36),
  constraint admissions_sat_erw_pair check ((sat_erw_25 is null) = (sat_erw_75 is null) and (sat_erw_25 is null or sat_erw_25 <= sat_erw_75)),
  constraint admissions_sat_math_pair check ((sat_math_25 is null) = (sat_math_75 is null) and (sat_math_25 is null or sat_math_25 <= sat_math_75)),
  constraint admissions_act_pair check ((act_composite_25 is null) = (act_composite_75 is null) and (act_composite_25 is null or act_composite_25 <= act_composite_75)),
  test_policy public.test_policy,
  score_cohort text not null default 'enrolled_first_time_score_users'
    constraint admissions_score_cohort check (score_cohort in ('enrolled_first_time_score_users')),
  source_id text not null references public.data_sources (id),
  source_dataset text not null,
  source_url text not null constraint admissions_source_url check (private.is_web_url(source_url, true)),
  source_year smallint not null,
  retrieved_at timestamptz not null,
  import_job_id uuid references public.data_import_jobs (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, source_id, term)
);
comment on table public.admissions_statistics is
  'Admissions figures for one fall entering class. SAT/ACT percentiles describe enrolled first-time, degree-seeking students whose scores were used in admission (IPEDS). GPA is not reported in federal data and is not stored here.';
create index admissions_statistics_latest_idx on public.admissions_statistics (institution_id, term_year desc);

-- -----------------------------------------------------------------------------
-- Published prices (one row per institution, source and academic year)
-- -----------------------------------------------------------------------------
create table public.institution_costs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  academic_year text not null constraint institution_costs_year check (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  cost_of_attendance integer constraint institution_costs_coa check (cost_of_attendance between 0 and 250000),
  tuition_in_state integer constraint institution_costs_tuition_in check (tuition_in_state between 0 and 250000),
  tuition_out_of_state integer constraint institution_costs_tuition_out check (tuition_out_of_state between 0 and 250000),
  source_id text not null references public.data_sources (id),
  source_dataset text not null,
  source_url text not null constraint institution_costs_source_url check (private.is_web_url(source_url, true)),
  source_year smallint not null,
  retrieved_at timestamptz not null,
  import_job_id uuid references public.data_import_jobs (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, source_id, academic_year)
);
comment on table public.institution_costs is
  'Published (sticker) prices for one academic year: cost of attendance and tuition and fees. Not net price.';
create index institution_costs_latest_idx on public.institution_costs (institution_id, academic_year desc);

-- -----------------------------------------------------------------------------
-- Revision log (append-only), written by triggers on every registry table
-- -----------------------------------------------------------------------------
create table public.registry_revisions (
  id bigint generated always as identity primary key,
  entity_type text not null
    constraint registry_revisions_entity check (entity_type in ('institution', 'alias', 'baseball_program', 'admissions', 'costs')),
  entity_id text not null,
  institution_id uuid not null,
  action text not null constraint registry_revisions_action check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  import_job_id uuid,
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
comment on table public.registry_revisions is
  'Every change to a registry row: before and after values, the import job or administrator behind it, and the reason given.';
create index registry_revisions_institution_idx on public.registry_revisions (institution_id, id desc);
create index registry_revisions_job_idx on public.registry_revisions (import_job_id) where import_job_id is not null;

revoke all on sequence public.registry_revisions_id_seq from anon, authenticated, service_role;

create trigger registry_revisions_append_only
  before update or delete on public.registry_revisions
  for each row execute function private.prevent_audit_mutation();
create trigger registry_revisions_no_truncate
  before truncate on public.registry_revisions
  for each statement execute function private.prevent_audit_mutation();

create function private.record_registry_revision() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'updated_at' - 'search_text' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'updated_at' - 'search_text' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_job text := nullif(current_setting('base_recruits.import_job_id', true), '');
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.registry_revisions (entity_type, entity_id, institution_id, action, before, after,
                                         import_job_id, actor_id, reason)
  values (tg_argv[0],
          case when tg_argv[0] = 'alias' then (v_row ->> 'institution_id') || ':' || (v_row ->> 'alias')
               else v_row ->> 'id' end,
          case when tg_argv[0] = 'institution' then (v_row ->> 'id')::uuid else (v_row ->> 'institution_id')::uuid end,
          lower(tg_op), v_old, v_new,
          v_job::uuid, (select auth.uid()),
          nullif(current_setting('base_recruits.change_reason', true), ''));
  return null;
end;
$$;
revoke all on function private.record_registry_revision() from public;

create trigger institutions_revision after insert or update or delete on public.institutions
  for each row execute function private.record_registry_revision('institution');
create trigger institution_aliases_revision after insert or update or delete on public.institution_aliases
  for each row execute function private.record_registry_revision('alias');
create trigger baseball_programs_revision after insert or update or delete on public.baseball_programs
  for each row execute function private.record_registry_revision('baseball_program');
create trigger admissions_statistics_revision after insert or update or delete on public.admissions_statistics
  for each row execute function private.record_registry_revision('admissions');
create trigger institution_costs_revision after insert or update or delete on public.institution_costs
  for each row execute function private.record_registry_revision('costs');

create trigger institutions_updated_at before update on public.institutions
  for each row execute function private.set_updated_at();
create trigger baseball_programs_updated_at before update on public.baseball_programs
  for each row execute function private.set_updated_at();
create trigger admissions_statistics_updated_at before update on public.admissions_statistics
  for each row execute function private.set_updated_at();
create trigger institution_costs_updated_at before update on public.institution_costs
  for each row execute function private.set_updated_at();

-- Search text: name, aliases, city and state, lower case without accents.
create function private.refresh_institution_search_text(p_institution_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.institutions i
     set search_text = lower(extensions.unaccent(concat_ws(' ', i.name,
           (select string_agg(a.alias, ' ' order by a.alias) from public.institution_aliases a where a.institution_id = i.id),
           i.city, i.state)))
   where i.id = p_institution_id
$$;
revoke all on function private.refresh_institution_search_text(uuid) from public;

-- -----------------------------------------------------------------------------
-- Row-level security and privileges
-- -----------------------------------------------------------------------------
alter table public.data_sources enable row level security;
alter table public.athletic_associations enable row level security;
alter table public.athletic_divisions enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_aliases enable row level security;
alter table public.baseball_programs enable row level security;
alter table public.admissions_statistics enable row level security;
alter table public.institution_costs enable row level security;
alter table public.data_import_jobs enable row level security;
alter table public.data_import_rows enable row level security;
alter table public.registry_revisions enable row level security;

revoke all on public.data_sources, public.athletic_associations, public.athletic_divisions,
              public.institutions, public.institution_aliases, public.baseball_programs,
              public.admissions_statistics, public.institution_costs,
              public.data_import_jobs, public.data_import_rows, public.registry_revisions
  from anon, authenticated, service_role;

grant select on public.data_sources, public.athletic_associations, public.athletic_divisions,
                public.institutions, public.institution_aliases, public.baseball_programs,
                public.admissions_statistics, public.institution_costs
  to anon, authenticated;
grant select on public.data_import_jobs, public.data_import_rows, public.registry_revisions to authenticated;

create policy data_sources_public on public.data_sources for select to anon, authenticated using (true);
create policy athletic_associations_public on public.athletic_associations for select to anon, authenticated using (true);
create policy athletic_divisions_public on public.athletic_divisions for select to anon, authenticated using (true);

-- Visitors see listed institutions; administrators also see unlisted ones.
create policy institutions_listed_public on public.institutions for select to anon using (is_listed);
create policy institutions_listed_or_admin on public.institutions for select to authenticated
  using (is_listed or (select private.is_admin()));

-- Child rows are visible exactly when their institution is.
create policy institution_aliases_visible on public.institution_aliases for select to anon, authenticated
  using (exists (select 1 from public.institutions i where i.id = institution_id));
create policy baseball_programs_visible on public.baseball_programs for select to anon, authenticated
  using (exists (select 1 from public.institutions i where i.id = institution_id));
create policy admissions_statistics_visible on public.admissions_statistics for select to anon, authenticated
  using (exists (select 1 from public.institutions i where i.id = institution_id));
create policy institution_costs_visible on public.institution_costs for select to anon, authenticated
  using (exists (select 1 from public.institutions i where i.id = institution_id));

create policy data_import_jobs_admin on public.data_import_jobs for select to authenticated using ((select private.is_admin()));
create policy data_import_rows_admin on public.data_import_rows for select to authenticated using ((select private.is_admin()));
create policy registry_revisions_admin on public.registry_revisions for select to authenticated using ((select private.is_admin()));

revoke all on function private.is_web_url(text, boolean) from public;
revoke all on function private.slugify(text) from public;
