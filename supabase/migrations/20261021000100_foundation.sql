-- =============================================================================
-- Base Recruits — Stage 1 / Migration 1: foundation
--
-- * `private` schema for helpers used by RLS policies and triggers. It is not
--   exposed through the Data API, so nothing in it is callable over HTTP.
-- * Enumerations shared by identity, verification and consent.
-- * Append-only audit log and the shared updated_at trigger.
--
-- Error codes raised by Base Recruits functions (mapped to messages in the app):
--   BR001 not signed in        BR002 not allowed        BR003 invalid input
--   BR004 invalid state change BR005 rate limited       BR013 under minimum age
--   BR020 free-access invariant violation
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
comment on schema private is
  'Base Recruits internal helpers for RLS policies and triggers. Never exposed through the Data API.';

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('athlete', 'parent', 'coach', 'admin');
comment on type public.app_role is
  'Account roles. athlete/parent/coach are self-selected at signup; admin is only ever granted by an existing admin.';

create type public.applicant_type as enum ('first_year', 'transfer');

create type public.coach_verification_status as enum (
  'unverified',               -- account exists; institutional email not yet confirmed
  'email_verified',           -- institutional email ownership confirmed; affiliation not yet reviewed
  'affiliation_under_review', -- coach submitted staff-directory evidence; awaiting an admin
  'more_info_requested',      -- admin asked for more evidence (remediation path)
  'verified',                 -- admin confirmed the baseball coaching affiliation; time-limited
  'reverification_required',  -- verification expired or the work email changed
  'suspended',                -- temporarily blocked by an admin
  'rejected',                 -- application declined; an admin can reopen it (appeal path)
  'revoked'                   -- verification withdrawn; an admin can reopen it (appeal path)
);

create type public.family_relationship as enum ('parent', 'legal_guardian', 'other_family');

create type public.family_link_status as enum (
  'pending_athlete_approval', -- guardian redeemed the athlete's invite; athlete must confirm
  'active',
  'reconsent_required',       -- athlete turned 18; the adult athlete must re-approve
  'ended'
);

create type public.consent_scope as enum (
  'coach_discovery',          -- appear in verified-coach search with a basic recruiting profile
  'coach_academic_summary',   -- verified coaches may see academic summary (labelled self-reported/verified)
  'coach_athletic_metrics',   -- verified coaches may see athletic metrics and video
  'coach_contact_info',       -- verified coaches may see contact details
  'coach_messaging',          -- verified coaches may start conversations
  'document_access',          -- one named person may view academic documents (transcripts, score reports)
  'family_recruiting',        -- a linked guardian may see shortlists and recruiting activity
  'family_academic'           -- a linked guardian may see the academic profile
);

create type public.consent_audience as enum ('verified_coaches', 'specific_user');

create type public.consent_status as enum ('pending_guardian', 'active', 'revoked', 'expired');

-- -----------------------------------------------------------------------------
-- "Today" for age rules, fixed to UTC so a client-chosen session time zone
-- (PostgREST lets requests set one) cannot shift anyone's age by a day.
-- -----------------------------------------------------------------------------
create function private.today_utc() returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'UTC')::date
$$;
revoke all on function private.today_utc() from public;
grant execute on function private.today_utc() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared trigger: updated_at
-- -----------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- Stores identifiers and non-sensitive metadata only — never dates of birth,
-- grades, scores, document contents or message bodies.
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null
    constraint audit_events_action_format check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  subject_user_id uuid,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb
    constraint audit_events_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);
comment on table public.audit_events is
  'Append-only record of security-relevant changes (accounts, roles, verification, consent, family access). No foreign keys, so history survives account deletion; retention is handled by a reviewed job.';

create index audit_events_subject_idx on public.audit_events (subject_user_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, occurred_at desc);

create function private.prevent_audit_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The retention job (run by the database owner) may delete expired rows after
  -- setting base_recruits.allow_audit_retention = 'on' in its own transaction.
  if tg_op = 'DELETE'
     and coalesce(current_setting('base_recruits.allow_audit_retention', true), '') = 'on'
     and current_user = 'postgres' then
    return old;
  end if;
  raise exception 'audit_events is append-only' using errcode = 'BR002';
end;
$$;
revoke all on function private.prevent_audit_mutation() from public;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.prevent_audit_mutation();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function private.prevent_audit_mutation();

create function private.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_subject_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (actor_id, action, subject_user_id, entity_type, entity_id, metadata)
  values (coalesce(p_actor_id, (select auth.uid())), p_action, p_subject_user_id,
          p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke all on function private.log_audit(text, text, text, uuid, jsonb, uuid) from public;

-- Row-level audit for security tables. Attached as an AFTER trigger with
-- arguments: (subject_user_id column, entity id column, columns to record...).
-- A column prefixed with "~" is recorded only as changed/set/empty, never by
-- value (for personal data such as emails and dates of birth). Records changes
-- made through any path — Base Recruits functions, the service role, or direct
-- SQL by the database owner.
create function private.audit_row_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields jsonb := '{}'::jsonb;
  v_changed boolean := tg_op <> 'UPDATE';
  v_column text;
  v_redacted boolean;
  i integer;
begin
  for i in 2 .. coalesce(array_length(tg_argv, 1), 0) - 1 loop
    v_column := tg_argv[i];
    v_redacted := left(v_column, 1) = '~';
    if v_redacted then
      v_column := substr(v_column, 2);
    end if;
    if tg_op = 'UPDATE' then
      if (v_old -> v_column) is distinct from (v_new -> v_column) then
        v_changed := true;
        v_fields := v_fields || jsonb_build_object(
          v_column,
          case when v_redacted then to_jsonb('changed'::text)
               else jsonb_build_object('old', v_old -> v_column, 'new', v_new -> v_column) end);
      end if;
    else
      v_fields := v_fields || jsonb_build_object(
        v_column,
        case when not v_redacted then v_row -> v_column
             when coalesce(v_row -> v_column, 'null'::jsonb) = 'null'::jsonb then to_jsonb('empty'::text)
             else to_jsonb('set'::text) end);
    end if;
  end loop;

  if v_changed then
    insert into public.audit_events (actor_id, action, subject_user_id, entity_type, entity_id, metadata)
    values ((select auth.uid()),
            'row.' || tg_table_name || '.' || lower(tg_op),
            (v_row ->> tg_argv[0])::uuid,
            tg_table_name,
            v_row ->> tg_argv[1],
            jsonb_build_object('fields', v_fields, 'db_session_user', session_user::text));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_row_change() from public;

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from anon, authenticated, service_role;
grant select on table public.audit_events to authenticated, service_role;
-- Identity sequences inherit Supabase's default grants; nobody but the owner needs them.
revoke all on sequence public.audit_events_id_seq from anon, authenticated, service_role;
-- Select policy is created in the identity migration, once private.is_admin() exists.
