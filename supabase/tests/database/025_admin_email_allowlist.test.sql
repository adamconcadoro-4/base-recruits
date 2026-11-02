-- Administrator access is limited to two approved email addresses (F55).

select tests.create_user('admin', 'parent', 'allow.admin@baserecruits.test', p_date_of_birth => date '1980-01-01');
select tests.make_admin('admin');
select tests.create_user('jonathan', 'parent', 'JCaceres120@Gmail.com', p_date_of_birth => date '1990-01-01');
select tests.create_user('jonathan_twin', 'parent', 'jcaceres120@gmail.com.example.test', p_date_of_birth => date '1990-01-01');
select tests.create_user('stranger', 'parent', 'someone.else@gmail.com', p_date_of_birth => date '1985-01-01');
select tests.create_user('unconfirmed', 'parent', 'unconfirmed.admin@baserecruits.test', p_email_confirmed => false);

-- ----------------------------------------------------------- the approved list
select tests.ok(
  (select array_agg(email order by email) from private.admin_allowed_emails where note <> 'test fixture')
    = array['adamconcadoro@gmail.com', 'jcaceres120@gmail.com'],
  'only the two founder-approved addresses are on the list');
select tests.ok(
  not has_table_privilege('authenticated', 'private.admin_allowed_emails', 'select')
  and not has_table_privilege('anon', 'private.admin_allowed_emails', 'select')
  and not has_table_privilege('service_role', 'private.admin_allowed_emails', 'insert'),
  'no API role can read or change the list');

-- ----------------------------------------------------------- granting admin
select tests.authenticate_as('admin');
select tests.throws(format('select public.admin_grant_role(%L, %L)', tests.id('stranger'), 'admin'), 'BR002',
  'an administrator cannot make an account outside the list an administrator');
select tests.throws(format('select public.admin_grant_role(%L, %L)', tests.id('jonathan_twin'), 'admin'), 'BR002',
  'a look-alike address does not match');
select tests.lives(format('select public.admin_grant_role(%L, %L)', tests.id('jonathan'), 'admin'),
  'an approved address can be made an administrator, whatever its letter case');
select tests.clear_authentication();
select tests.ok(private.has_role(tests.id('jonathan'), 'admin'), 'the approved account now counts as an administrator');

select tests.throws(format('insert into public.user_roles (user_id, role) values (%L, ''admin'')', tests.id('stranger')),
  'BR002', 'even the database owner cannot add an administrator outside the list');

insert into private.admin_allowed_emails (email, note) values ('unconfirmed.admin@baserecruits.test', 'test fixture');
select tests.throws(format('insert into public.user_roles (user_id, role) values (%L, ''admin'')', tests.id('unconfirmed')),
  'BR002', 'an approved address must be confirmed first');

-- ----------------------------------------------------------- an existing admin row
delete from private.admin_allowed_emails where email = 'allow.admin@baserecruits.test';
select tests.ok(not private.has_role(tests.id('admin'), 'admin'),
  'an admin row stops counting once its address leaves the list');
select tests.authenticate_as('admin');
select tests.ok(not private.is_admin(), 'that account is no longer an administrator for the site');
select tests.throws(format('select public.admin_grant_role(%L, %L)', tests.id('stranger'), 'coach'), 'BR002',
  'and it can no longer use administrator actions');
select tests.clear_authentication();
select tests.ok(private.has_role(tests.id('jonathan'), 'parent'), 'other roles are unaffected by the list');
