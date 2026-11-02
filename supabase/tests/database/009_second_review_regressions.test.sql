-- Regression tests for the second (verification) security review of 2026-10-21.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('coach', 'coach', 'eval@state.edu', p_date_of_birth => date '1980-01-01');
select tests.verify_coach('coach', 'admin');
select tests.create_user('kid', 'athlete', p_date_of_birth => (private.today_utc() - interval '15 years')::date);
select tests.create_user('kid_parent', 'parent', 'kid.parent@example.test', p_date_of_birth => date '1977-07-07',
                         p_display_name => 'Robin Parent');
select tests.create_user('kid_aunt', 'parent', p_date_of_birth => date '1970-03-03');
select tests.create_user('grown', 'athlete', p_date_of_birth => date '2002-02-02');
create temporary table c (n text primary key, code text);
grant select, insert on c to authenticated;

select tests.authenticate_as('kid');
insert into c select 'parent', code from public.create_family_invite();
insert into c select 'aunt', code from public.create_family_invite();
select tests.authenticate_as('kid_parent');
select public.redeem_family_invite((select code from c where n = 'parent'), 'parent');
select tests.authenticate_as('kid_aunt');
select public.redeem_family_invite((select code from c where n = 'aunt'), 'other_family');
select tests.authenticate_as('kid');
select public.approve_family_link(link_id) from public.list_family_links();
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select public.grant_consent('coach_contact_info', 'coach-contact-info-v1');
select tests.authenticate_as('kid_parent');
select public.approve_consent_as_guardian(g.id) from public.consent_grants g where g.status = 'pending_guardian';
select tests.clear_authentication();

-- ---------------------------------------------------------------- N1: deleted approver
select tests.ok(private.coach_can_view(tests.id('coach'), tests.id('kid'), 'coach_contact_info'),
  'N1 precondition: the parent''s approval makes the minor visible to a verified coach');
delete from auth.users where id = tests.id('kid_parent');
select tests.ok(not private.coach_can_view(tests.id('coach'), tests.id('kid'), 'coach_contact_info'),
  'N1: deleting the approving parent''s account ends the minor''s coach visibility');
select tests.ok(
  (select count(*) from public.consent_grants
    where athlete_id = tests.id('kid') and status = 'active' and guardian_link_id is null) = 2
  and not private.has_active_grant(tests.id('kid'), 'coach_discovery', 'verified_coaches'),
  'N1: the grants now read as awaiting a guardian''s approval, not as approved');
select tests.ok(
  exists (select 1 from public.audit_events where action = 'row.family_links.delete' and subject_user_id = tests.id('kid'))
  and exists (select 1 from public.audit_events where action = 'row.consent_grants.update'
               and subject_user_id = tests.id('kid') and metadata -> 'fields' ? 'guardian_link_id'),
  'N1: the cascade (link deleted, approval cleared) is fully audited');

-- A grant made as an adult stops working if support corrects the age to a minor's.
select tests.authenticate_as('grown');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.clear_authentication();
select tests.ok(private.coach_can_view(tests.id('coach'), tests.id('grown'), 'coach_discovery'),
  'N1 precondition: an adult''s own grant is effective');
update public.profiles set date_of_birth = (private.today_utc() - interval '16 years')::date where id = tests.id('grown');
select tests.ok(not private.coach_can_view(tests.id('coach'), tests.id('grown'), 'coach_discovery'),
  'N1: after an age correction to a minor, the grant needs a guardian''s approval before it works again');

-- A rule tightened later applies to existing grants too.
select tests.authenticate_as('kid');
select public.grant_consent('family_academic', 'family-academic-v1', tests.id('kid_aunt'));
select tests.clear_authentication();
select tests.ok(private.guardian_can_view(tests.id('kid_aunt'), tests.id('kid'), 'family_academic'),
  'N1 precondition: a family scope shared with another family member works under the current rule');
update public.consent_scope_rules set requires_guardian_approval_for_minor = true where scope = 'family_academic';
select tests.ok(not private.guardian_can_view(tests.id('kid_aunt'), tests.id('kid'), 'family_academic'),
  'N1: when a rule starts requiring guardian approval, existing unapproved grants stop working');
update public.consent_scope_rules set requires_guardian_approval_for_minor = false where scope = 'family_academic';

-- ---------------------------------------------------------------- N2: admin-granted roles
select tests.create_user('staff', null, 'staff@example.test', p_date_of_birth => date '1990-01-01');
select tests.authenticate_as('admin');
select public.admin_grant_role(tests.id('staff'), 'parent');
select public.admin_revoke_role(tests.id('staff'), 'parent');
select tests.authenticate_as('staff');
select tests.throws('select public.complete_onboarding(''athlete'')', 'BR004',
  'N2: an admin-granted then removed role cannot be replaced through onboarding');

select tests.clear_authentication();
select tests.create_user('banned', 'athlete', p_date_of_birth => date '2001-01-01');
select tests.authenticate_as('banned');
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.authenticate_as('admin');
select public.admin_revoke_role(tests.id('banned'), 'athlete');
select public.admin_grant_role(tests.id('banned'), 'athlete');
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('coach'), tests.id('banned'), 'coach_discovery'),
  'N2: removing the athlete role revokes sharing, so a later re-grant does not restore visibility');

-- ---------------------------------------------------------------- N3: no revival through an ended link
select tests.create_user('teen', 'athlete', p_date_of_birth => (private.today_utc() - interval '16 years')::date);
select tests.create_user('teen_parent', 'parent', p_date_of_birth => date '1976-06-06');
select tests.authenticate_as('teen');
insert into c select 'teen1', code from public.create_family_invite();
insert into c select 'teen2', code from public.create_family_invite();
select tests.authenticate_as('teen_parent');
select public.redeem_family_invite((select code from c where n = 'teen1'), 'parent');
select tests.authenticate_as('teen');
select public.approve_family_link(link_id) from public.list_family_links();
select public.grant_consent('coach_discovery', 'coach-discovery-v1');
select tests.authenticate_as('teen_parent');
select public.approve_consent_as_guardian(g.id) from public.consent_grants g where g.status = 'pending_guardian';
select tests.clear_authentication();
-- Simulate the race outcome the reviewer produced: link ended, approval still marked active.
update public.family_links set status = 'ended', ended_at = now() where athlete_id = tests.id('teen');
select tests.authenticate_as('teen_parent');
select public.redeem_family_invite((select code from c where n = 'teen2'), 'parent');
select tests.authenticate_as('teen');
select public.approve_family_link(l.link_id) from public.list_family_links() l where l.status = 'pending_athlete_approval';
select tests.clear_authentication();
select tests.ok(not private.coach_can_view(tests.id('coach'), tests.id('teen'), 'coach_discovery'),
  'N3: an approval tied to an ended link does not come back when the same parent re-links');

-- ---------------------------------------------------------------- N4: soft-deleted coach
select tests.create_user('leaving_coach', 'coach', 'leaving@college.edu', p_date_of_birth => date '1975-05-05');
select tests.verify_coach('leaving_coach', 'admin');
select tests.lives(
  format('update auth.users set deleted_at = now(), email = %L where id = %L', 'a1b2c3d4e5', tests.id('leaving_coach')),
  'N4: soft-deleting a coach (email replaced with an opaque value) does not fail');
select tests.ok(not private.is_verified_coach(tests.id('leaving_coach')), 'N4: and leaves no coach access');

-- ---------------------------------------------------------------- N5: audit coverage
insert into public.user_roles (user_id, role) values (tests.id('teen_parent'), 'coach');
select tests.allow_admin_email('teen_parent');
update public.user_roles set role = 'admin' where user_id = tests.id('teen_parent') and role = 'coach';
select tests.ok(
  exists (select 1 from public.audit_events where action = 'row.user_roles.update'
           and subject_user_id = tests.id('teen_parent')
           and metadata -> 'fields' -> 'role' ->> 'new' = 'admin'),
  'N5: an owner''s direct role edit is audited');
delete from public.user_roles where user_id = tests.id('teen_parent') and role = 'admin';
select tests.ok(
  exists (select 1 from public.audit_events where action = 'row.profiles.update'
           and subject_user_id = tests.id('grown') and metadata -> 'fields' ->> 'date_of_birth' = 'changed'),
  'N5: date-of-birth changes are audited as "changed", never by value');

-- ---------------------------------------------------------------- N6: ended links reveal nothing current
select tests.authenticate_as('teen');
select tests.ok(
  (select count(*) from public.list_family_links()
    where status = 'ended' and (other_party_name is not null or other_party_email is not null)) = 0,
  'N6: ended links show neither side''s current name or email');

-- ---------------------------------------------------------------- N7: ages ignore the session time zone
select tests.clear_authentication();
select tests.create_user('birthday', 'athlete', p_date_of_birth => (private.today_utc() - interval '18 years')::date);
set local timezone = 'Etc/GMT+12';
select tests.ok(not private.is_minor(tests.id('birthday')), 'N7: an 18th birthday counts the same at UTC-12');
set local timezone = 'Etc/GMT-14';
select tests.ok(not private.is_minor(tests.id('birthday')), 'N7: and at UTC+14');
set local timezone = 'UTC';

-- ---------------------------------------------------------------- N8: blocked accounts are frozen
select tests.create_user('too_young', 'athlete');
select tests.authenticate_as('too_young');
select public.record_birthdate((private.today_utc() - interval '11 years')::date);
select tests.ok(
  tests.affected_rows(format('update public.athletes set graduation_year = 2034 where user_id = %L', tests.id('too_young'))) = 0
  and tests.affected_rows(format('update public.profiles set display_name = %L where id = %L', 'Kid', tests.id('too_young'))) = 0,
  'N8: an account blocked at the age screen cannot add any personal information');

-- ---------------------------------------------------------------- N10: sharing with one's own parent
select tests.clear_authentication();
select tests.create_user('junior', 'athlete', p_date_of_birth => (private.today_utc() - interval '14 years')::date);
select tests.create_user('junior_parent', 'parent', p_date_of_birth => date '1980-08-08');
select tests.authenticate_as('junior');
insert into c select 'junior', code from public.create_family_invite();
select tests.authenticate_as('junior_parent');
select public.redeem_family_invite((select code from c where n = 'junior'), 'parent');
select tests.authenticate_as('junior');
select public.approve_family_link(link_id) from public.list_family_links();
select tests.ok(
  (select status = 'active' from public.grant_consent('document_access', 'document-access-v1', tests.id('junior_parent'))),
  'N10: a minor can share documents with their own parent without waiting for approval');
select tests.clear_authentication();
select tests.ok(private.guardian_can_view(tests.id('junior_parent'), tests.id('junior'), 'document_access'),
  'N10: and the parent can see them');
