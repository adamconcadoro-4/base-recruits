-- Saved grades and baseball numbers (F63, 2026-11-18): an athlete saves,
-- reads and deletes their own; a linked parent sees them only while the
-- athlete shares with them by name; nobody else ever does, coaches included;
-- the table itself is closed to clients and audit never holds the values.

select tests.create_user('kid', 'athlete', p_display_name => 'Kai Kid', p_date_of_birth => (current_date - interval '16 years')::date);
select tests.create_user('mom', 'parent', p_display_name => 'Mona Mom', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.create_user('dad', 'parent', p_display_name => 'Dan Dad', p_date_of_birth => (current_date - interval '47 years')::date);
select tests.create_user('stranger', 'parent', p_date_of_birth => (current_date - interval '40 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '17 years')::date);
select tests.create_user('coach', 'coach', p_date_of_birth => (current_date - interval '38 years')::date);
select tests.create_user('admin', 'parent', 'numbers.admin@baserecruits.test', p_date_of_birth => (current_date - interval '45 years')::date);
select tests.make_admin('admin');
select tests.verify_coach('coach', 'admin');
select tests.link_family('kid', 'mom');
select tests.link_family('kid', 'dad');

-- ================================================================ closed table
select tests.authenticate_as('kid');
select tests.throws($$select * from public.athlete_numbers$$, '42501', 'athletes cannot read the table directly');
select tests.throws(format($$insert into public.athlete_numbers (athlete_id, gpa) values (%L, 3.5)$$, tests.id('kid')),
  '42501', 'athletes cannot write the table directly');
select tests.authenticate_as_anon();
select tests.throws($$select * from public.my_numbers()$$, '42501', 'signed-out visitors cannot call the functions');
select tests.clear_authentication();

-- ================================================================ saving
select tests.authenticate_as('kid');
select tests.ok((select count(*) = 0 from public.my_numbers()), 'nothing is saved until the athlete saves');
select tests.lives($$select public.save_my_numbers('{"applicant_type": "first_year", "entry_year": 2027, "gpa": 3.4,
  "gpa_scale": 4, "gpa_type": "unweighted", "sat_total": 1200, "act_composite": null, "submit_scores": "yes",
  "core_gpa_division_i": 3.2, "main_position": "pitcher", "fastball_mph": 88}'::jsonb)$$, 'an athlete saves their numbers');
select tests.ok((select gpa = 3.4 and sat_total = 1200 and fastball_mph = 88 and core_gpa_division_i = 3.2
                        and verification = 'self_reported' from public.my_numbers()),
  'the athlete reads back what they saved, marked self-reported');
select tests.lives($$select public.save_my_numbers('{"gpa": 3.6, "sat_total": 1250}'::jsonb)$$, 'saving again replaces the numbers');
select tests.ok((select gpa = 3.6 and sat_total = 1250 and main_position is null and fastball_mph is null and entry_year is null
                   from public.my_numbers()),
  'a new save replaces every field, so cleared fields are cleared');

select tests.throws($$select public.save_my_numbers('{"sat_total": 1205}'::jsonb)$$, 'BR003', 'an SAT total must be a step of 10');
select tests.throws($$select public.save_my_numbers('{"sat_total": "1200"}'::jsonb)$$, 'BR003', 'numbers must be numbers');
select tests.throws($$select public.save_my_numbers('{"gpa": 4.5, "gpa_scale": 4}'::jsonb)$$, 'BR003', 'a GPA cannot be above its scale');
select tests.throws($$select public.save_my_numbers('{"fastball_mph": 88}'::jsonb)$$, 'BR003', 'baseball numbers need a position');
select tests.throws($$select public.save_my_numbers('{"main_position": "goalie"}'::jsonb)$$, 'BR003', 'only the seven positions');
select tests.throws($$select public.save_my_numbers('{"email": "x@example.test"}'::jsonb)$$, 'BR003', 'unknown fields are refused');
select tests.throws($$select public.save_my_numbers('[1, 2]'::jsonb)$$, 'BR003', 'the numbers must be an object');
select tests.ok((select gpa = 3.6 from public.my_numbers()), 'a refused save leaves the saved numbers as they were');

select tests.authenticate_as('mom');
select tests.throws($$select public.save_my_numbers('{"gpa": 3.0}'::jsonb)$$, 'BR002', 'a parent cannot save numbers for themselves');
select tests.ok((select count(*) = 0 from public.my_numbers()), 'my_numbers shows a parent nothing');

-- Audit records the change, never the grades.
select tests.clear_authentication();
select tests.ok((select count(*) >= 2 from public.audit_events
                  where entity_type = 'athlete_numbers' and subject_user_id = tests.id('kid')),
  'saves are audited');
select tests.ok((select bool_and(position('3.6' in metadata::text) = 0 and position('1250' in metadata::text) = 0
                                 and position('3.4' in metadata::text) = 0)
                   from public.audit_events where entity_type = 'athlete_numbers'),
  'audit never holds grade or score values');

-- ================================================================ nobody else sees them
select tests.authenticate_as('mom');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'a linked parent sees nothing until the athlete shares');
select tests.authenticate_as('stranger');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'an unlinked parent sees nothing');
select tests.authenticate_as('coach');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'a verified coach sees nothing');
select tests.ok((select count(*) = 0 from public.my_numbers()), 'a coach has no numbers of their own');
select tests.authenticate_as('other');
select tests.ok((select count(*) = 0 from public.my_numbers()), 'another athlete sees only their own (none)');

-- ================================================================ sharing with one parent
select tests.authenticate_as('kid');
select tests.ok((select count(*) = 2 and bool_and(not in_effect) from public.numbers_family_access()),
  'the athlete sees both linked parents, sharing off');
select tests.lives(format($$select public.share_numbers_with_family(%L)$$,
                          (select link_id from public.numbers_family_access() where guardian_name = 'Mona Mom')),
  'the athlete shares with Mona');
select tests.ok((select in_effect from public.numbers_family_access() where guardian_name = 'Mona Mom')
                and not (select in_effect from public.numbers_family_access() where guardian_name = 'Dan Dad'),
  'sharing is per parent, and in effect without anyone else approving');

select tests.authenticate_as('mom');
select tests.ok((select count(*) = 1 and bool_and(athlete_name = 'Kai Kid' and gpa = 3.6 and verification = 'self_reported')
                   from public.family_shared_numbers()),
  'Mona sees Kai''s numbers, marked self-reported');
select tests.throws($$select * from public.athlete_numbers$$, '42501', 'even a sharing parent cannot read the table');
select tests.authenticate_as('dad');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'Dan, not shared with, still sees nothing');
select tests.authenticate_as('coach');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'sharing with a parent shows a coach nothing');

select tests.authenticate_as('other');
select tests.throws(format($$select public.share_numbers_with_family(%L)$$, tests.id('mom')), 'BR003',
  'an athlete cannot share through someone else''s family link');

-- ================================================================ stopping
select tests.authenticate_as('kid');
select tests.lives(format($$select public.revoke_consent(%L)$$,
                          (select grant_id from public.numbers_family_access() where guardian_name = 'Mona Mom')),
  'the athlete turns sharing off');
select tests.authenticate_as('mom');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'turning sharing off applies on the next request');

select tests.authenticate_as('kid');
select tests.lives(format($$select public.share_numbers_with_family(%L)$$,
                          (select link_id from public.numbers_family_access() where guardian_name = 'Mona Mom')),
  'the athlete shares again');
select tests.lives(format($$select public.end_family_link(%L)$$,
                          (select link_id from public.numbers_family_access() where guardian_name = 'Mona Mom')),
  'the athlete removes Mona''s family access');
select tests.authenticate_as('mom');
select tests.ok((select count(*) = 0 from public.family_shared_numbers()), 'ending the family link ends sharing');

select tests.authenticate_as('kid');
select tests.ok(public.delete_my_numbers(), 'the athlete deletes their saved numbers');
select tests.ok((select count(*) = 0 from public.my_numbers()), 'nothing is left after deleting');
select tests.ok(not public.delete_my_numbers(), 'deleting again finds nothing');
select tests.clear_authentication();
select tests.ok((select count(*) = 0 from public.athlete_numbers where athlete_id = tests.id('kid')), 'the row is gone');
