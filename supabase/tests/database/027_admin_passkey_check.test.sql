-- Administrators need a passkey check within the last 12 hours (F57).

insert into private.admin_allowed_emails (email, note) values ('passkey.admin@baserecruits.test', 'test fixture');
select tests.create_user('admin', 'parent', 'passkey.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('stranger', 'parent', 'someone.else@baserecruits.test', p_date_of_birth => date '1985-01-01');

create temporary table amr_cases (name text primary key, amr jsonb);
insert into amr_cases values
  ('passkey_now', jsonb_build_array(jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now()))::bigint))),
  ('passkey_11h', jsonb_build_array(jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now() - interval '11 hours'))::bigint))),
  ('passkey_13h', jsonb_build_array(jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now() - interval '13 hours'))::bigint))),
  ('passkey_future', jsonb_build_array(jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now() + interval '1 hour'))::bigint))),
  ('code_now', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint))),
  ('password_now', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint))),
  ('passkey_string', jsonb_build_array(jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now()))::text))),
  ('rfc_strings', '["passkey"]'::jsonb),
  ('not_a_list', '{"method": "passkey"}'::jsonb),
  ('code_then_passkey', jsonb_build_array(
     jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now() - interval '2 days'))::bigint),
     jsonb_build_object('method', 'passkey', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)));
grant select on amr_cases to authenticated;

-- ----------------------------------------------------------- which sessions count
select tests.authenticate_as('admin', (select amr from amr_cases where name = 'passkey_now'));
select tests.ok(private.is_admin(), 'a passkey check just now opens administrator access');
select tests.lives(format('select public.admin_grant_role(%L, %L)', tests.id('stranger'), 'coach'),
  'and administrator actions work');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'passkey_11h'));
select tests.ok(private.is_admin(), 'a passkey check 11 hours ago still counts');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'code_then_passkey'));
select tests.ok(private.is_admin(), 'a passkey check after an emailed-code sign-in counts');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'passkey_13h'));
select tests.ok(not private.is_admin(), 'a passkey check 13 hours ago has expired');
select tests.throws(format('select public.admin_grant_role(%L, %L)', tests.id('stranger'), 'coach'), 'BR002',
  'an expired check cannot use administrator actions');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'code_now'));
select tests.ok(not private.is_admin(), 'an emailed-code sign-in alone is not enough');
select tests.throws(format('select public.admin_grant_role(%L, %L)', tests.id('stranger'), 'coach'), 'BR002',
  'an emailed-code session cannot use administrator actions');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'password_now'));
select tests.ok(not private.is_admin(), 'a password sign-in alone is not enough');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'passkey_future'));
select tests.ok(not private.is_admin(), 'a passkey time in the future does not count');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'passkey_string'));
select tests.ok(not private.is_admin(), 'a time that is not a number does not count');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'rfc_strings'));
select tests.ok(not private.is_admin(), 'a method name without a time does not count');

select tests.authenticate_as('admin', (select amr from amr_cases where name = 'not_a_list'));
select tests.ok(not private.is_admin(), 'a malformed record does not count');

select tests.authenticate_as('admin', '[]'::jsonb);
select tests.ok(not private.is_admin(), 'no sign-in record does not count');

-- ----------------------------------------------------------- only the caller's own role
select tests.authenticate_as('stranger', (select amr from amr_cases where name = 'code_now'));
select tests.ok(private.has_role(tests.id('admin'), 'admin'),
  'whether another account is an administrator does not depend on the caller''s session');
select tests.ok(private.has_role(tests.id('stranger'), 'coach'), 'other roles need no passkey check');
select tests.clear_authentication();
select tests.ok(private.has_role(tests.id('admin'), 'admin'), 'the database owner still sees the administrator');

select tests.ok(
  not has_function_privilege('anon', 'private.admin_session_verified()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.admin_session_verified()', 'EXECUTE'),
  'the check itself is not callable through the API');
