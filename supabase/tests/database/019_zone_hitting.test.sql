-- 9-Zone Hitting Development: workbook content imported once and idempotently;
-- sessions, rounds, versioned assignments and pitch-level events written only
-- through checked functions, visible only to people who can work on the
-- athlete's assessments, paused with the Assessment switch; stage history kept
-- with reasons.

select tests.create_user('athlete', 'athlete', p_display_name => 'Avery Athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('other', 'athlete', p_date_of_birth => (current_date - interval '19 years')::date);
select tests.create_user('dev', 'development_coach', p_display_name => 'Dana Dev', p_date_of_birth => (current_date - interval '35 years')::date);
select tests.create_user('dev2', 'development_coach', p_date_of_birth => (current_date - interval '40 years')::date);

create temporary table t_values (name text primary key, value text) on commit drop;
grant all on t_values to public;

-- ================================================================ content
select tests.ok((select count(*) from public.zone_definitions) = 9
  and (select count(*) from public.zone_drills) = 39
  and (select count(*) from public.zone_stages) = 9
  and (select count(*) from public.zone_pairings) = 5
  and (select count(*) from public.zone_constraints) = 49,
  'the workbook''s 9 zones, 39 drills, 9 stages, 5 pairings and 49 live-BP constraints are imported');
select tests.ok((select source_sha256 from public.zone_content_releases where version = 'zone-v1')
  = '7e2d3e151a7213bdc39985a3f5e72bded643d0d5f7969c878eb5862bec9140cf',
  'the import records which workbook it came from');
select tests.ok((select source_id || '|' || source_sheet || '|' || zone from public.zone_drills where key = 'z4-01') = 'Z4-01|Zone Drill Library|4',
  'each drill keeps its workbook id, sheet and zone');
select tests.ok((select private.import_zone_content(payload) from private.zone_content_payloads where version = 'zone-v1')
  = '{"zones": 0, "drills": 0, "stages": 0, "pairings": 0, "constraints": 0}'::jsonb,
  'running the import again adds nothing');
select tests.ok((select count(*) from public.zone_drills) = 39 and (select count(*) from public.zone_constraints) = 49,
  'and leaves no duplicates');
update public.zone_drills set name = 'Changed' where key = 'z4-01';
select private.import_zone_content(payload) from private.zone_content_payloads where version = 'zone-v1';
select tests.ok((select name from public.zone_drills where key = 'z4-01') = 'Changed', 'a re-run never overwrites existing content');
select tests.throws($$select private.import_zone_content('{"version": "v1"}')$$, 'BR003', 'an import needs a zone-vN version');

select tests.authenticate_as_anon();
select tests.throws('select count(*) from public.zone_drills', '42501', 'visitors who are not signed in cannot read the content');
select tests.authenticate_as('other');
select tests.ok(tests.visible_count('select 1 from public.zone_drills') = 39, 'signed-in users can read the drill library');
select tests.throws($$update public.zone_drills set name = 'x'$$, '42501', 'nobody changes content through the API');

-- ================================================================ switched off
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L)$$,
  jsonb_build_object('session_date', current_date, 'focus_zones', array[4], 'batting_side', 'right', 'stage', 1, 'delivery_source', 'tee',
                     'assignment', jsonb_build_object('kind', 'free'))),
  'BR004', 'nothing is recorded while Assessment is switched off');

select tests.clear_authentication();
select tests.enable_assessment(false);
select tests.link_development_coach('athlete', 'dev');

-- ================================================================ sessions
select tests.authenticate_as('athlete');
select tests.remember_job('h', public.create_assessment(auth.uid(), 'hitting-video', 1, current_date - 3, '{"rep_goal": 5}'::jsonb));
insert into t_values values ('base', jsonb_build_object(
  'session_date', current_date, 'focus_zones', array[4, 5], 'batting_side', 'right', 'stage', 2, 'delivery_source', 'toss',
  'drill_key', 'z4-02', 'pairing_key', 'pair-4-6', 'constraint_key', 'location-inside-third', 'primary_cue', 'Catch it deep',
  'planned_reps', 20, 'assessment_id', tests.job('h'),
  'assignment', jsonb_build_object('kind', 'selective', 'swing_zones', array[4, 5]))::text);

select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb - 'focus_zones')$$, (select value from t_values where name = 'base')),
  'BR003', 'a session needs a focus zone');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"focus_zones": [1, 2, 3]}')$$, (select value from t_values where name = 'base')),
  'BR003', 'a session works on at most two zones');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"focus_zones": [10]}')$$, (select value from t_values where name = 'base')),
  'BR003', 'zones are 1 to 9');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"drill_key": "z4-99"}')$$, (select value from t_values where name = 'base')),
  'BR003', 'drills come from the 9-Zone library');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"constraint_key": "made-up"}')$$, (select value from t_values where name = 'base')),
  'BR003', 'constraints come from the workbook list');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"assignment": {"kind": "selective"}}')$$, (select value from t_values where name = 'base')),
  'BR003', 'a selective assignment names the zones the hitter may swing at');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"assessment_id": "not-an-id"}')$$, (select value from t_values where name = 'base')),
  'BR003', 'a linked assessment must be one of the athlete''s');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || jsonb_build_object('session_date', current_date + 5))$$, (select value from t_values where name = 'base')),
  'BR003', 'a session cannot be dated in the future');
select tests.throws(format($$select public.create_zone_session(auth.uid(), %L::jsonb || '{"planned_reps": 99999999999}')$$, (select value from t_values where name = 'base')),
  'BR003', 'planned repetitions are checked in plain language');

select tests.remember_job('s1', public.create_zone_session(auth.uid(), (select value from t_values where name = 'base')::jsonb));
select tests.ok((select source_kind || '|' || status || '|' || drill_version || '|' || array_to_string(focus_zones, ',')
                   from public.zone_sessions where id = tests.job('s1')) = 'self|active|1|4,5',
  'the athlete''s session is recorded as self-logged with the drill''s version');
select tests.remember_job('r1', (select id from public.zone_rounds where session_id = tests.job('s1') and seq = 1));
select tests.ok((select array_to_string(intended_zones, ',') || '|' || stage || '|' || delivery_source from public.zone_rounds where id = tests.job('r1'))
  = '4,5|2|toss', 'the first round starts with the session''s zones, stage and delivery');
select tests.ok((select version || '|' || kind || '|' || array_to_string(swing_zones, ',') from public.zone_assignments where round_id = tests.job('r1'))
  = '1|selective|4,5', 'and its first assignment');
select tests.clear_authentication();
select tests.ok((select count(*) from public.audit_events where action = 'zone.session_created' and entity_id = tests.job('s1')::text and metadata = '{}') = 1,
  'starting a session is audited without values');

-- ================================================================ events
select tests.authenticate_as('athlete');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"kind": "tee_swing", "location": "out_away"}')$$, tests.job('r1')),
  'BR003', 'a tee swing is placed in a zone');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"kind": "dry_rep", "location": "z4", "contact": "fair"}')$$, tests.job('r1')),
  'BR003', 'a dry rep has no ball, so no contact');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"kind": "tee_swing", "location": "z4", "pitch_class": "strike"}')$$, tests.job('r1')),
  'BR003', 'tee swings are not pitches');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "take", "contact": "fair"}')$$, tests.job('r1')),
  'BR003', 'contact is recorded on swings only');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "swing", "contact": "foul", "lane_correct": true}')$$, tests.job('r1')),
  'BR003', 'the lane is recorded on fair balls only');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "swing", "forced_take": true}')$$, tests.job('r1')),
  'BR003', 'a forced take is a take');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "swing", "voided": true}')$$, tests.job('r1')),
  'BR003', 'leaving a pitch out needs a reason');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z11"}')$$, tests.job('r1')),
  'BR003', 'locations come from the fixed list');

select tests.ok((select seq from public.log_zone_event(tests.job('r1'),
  '{"location": "z4", "response": "swing", "contact": "fair", "hard_targeted": true, "depth_correct": true, "lane_correct": true, "posture_error": false, "pitch_class": "ball"}')) = 1,
  'a pitch is logged as entry 1');
select tests.ok((select seq from public.log_zone_event(tests.job('r1'), '{"location": "out_away", "response": "take", "recognition_call": "ball"}')) = 2,
  'the next pitch is entry 2');
select tests.ok((select seq from public.log_zone_event(tests.job('r1'), '{"location": "unknown", "pitch_class": "strike", "response": "take"}')) = 3,
  'a pitch with an unknown location can carry an explicit strike/ball');
select tests.ok((select pitch_class is null from public.zone_events where round_id = tests.job('r1') and seq = 1)
  and (select pitch_class = 'strike' from public.zone_events where round_id = tests.job('r1') and seq = 3),
  'ball/strike is derived from a known location, never stored over it');
select tests.ok((select seq from public.log_zone_event(tests.job('r1'), '{"kind": "tee_swing", "location": "z5", "contact": "fair", "depth_correct": false}')) = 4,
  'tee swings are logged as repetitions');
select tests.ok((select response from public.zone_events where round_id = tests.job('r1') and seq = 4) = 'swing', 'a tee swing is always a swing');

-- A changed assignment adds a version; earlier pitches keep the one they were judged against.
select tests.remember_job('a2', public.set_zone_assignment(tests.job('r1'), '{"kind": "free"}'));
select tests.ok((select version from public.zone_assignments where id = tests.job('a2')) = 2, 'changing the assignment adds version 2');
select public.log_zone_event(tests.job('r1'), '{"location": "z6", "response": "swing", "contact": "miss"}');
select tests.ok((select a.version from public.zone_events e join public.zone_assignments a on a.id = e.assignment_id
                  where e.round_id = tests.job('r1') and e.seq = 1) = 1
  and (select a.version from public.zone_events e join public.zone_assignments a on a.id = e.assignment_id
        where e.round_id = tests.job('r1') and e.seq = 5) = 2,
  'earlier pitches keep assignment version 1; new pitches use version 2');

-- Corrections
select tests.throws(format($$select public.update_zone_event(%L, '{"location": "z4", "response": "swing", "contact": "foul", "lane_correct": true}')$$,
  (select id from public.zone_events where round_id = tests.job('r1') and seq = 1)), 'BR003', 'a correction is checked like a new entry');
select tests.lives(format($$select public.update_zone_event(%L, '{"kind": "dry_rep", "location": "z4", "response": "swing", "contact": "foul", "hard_targeted": false}')$$,
  (select id from public.zone_events where round_id = tests.job('r1') and seq = 1)), 'a pitch is corrected');
select tests.ok((select kind || '|' || contact || '|' || (lane_correct is null) from public.zone_events where round_id = tests.job('r1') and seq = 1)
  = 'pitch|foul|true', 'a correction cannot change what kind of entry it was');
select tests.ok((select a.version from public.zone_events e join public.zone_assignments a on a.id = e.assignment_id
                  where e.round_id = tests.job('r1') and e.seq = 1) = 1, 'and keeps the assignment it was judged against');

-- Clips: only the athlete's own uploaded clips can be linked.
select tests.clear_authentication();
insert into public.assessment_media (id, assessment_id, athlete_id, storage_path, mime_type, byte_size, status)
values ('00000000-0000-4000-8000-0000000000c1', tests.job('h'), tests.id('athlete'), 'zone-test/own.mp4', 'video/mp4', 1000, 'uploaded'),
       ('00000000-0000-4000-8000-0000000000c2', tests.job('h'), tests.id('athlete'), 'zone-test/pending.mp4', 'video/mp4', 1000, 'pending');
select tests.authenticate_as('athlete');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "take", "media_id": "00000000-0000-4000-8000-0000000000c2"}')$$, tests.job('r1')),
  'BR003', 'a clip that has not finished uploading cannot be linked');
select tests.lives(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "take", "media_id": "00000000-0000-4000-8000-0000000000c1", "clip_time_ms": 4200, "evidence_method": "video"}')$$, tests.job('r1')),
  'a pitch links to a moment in one of the athlete''s clips');
select tests.ok((select clip_time_ms from public.zone_events where round_id = tests.job('r1') and seq = 6) = 4200, 'the clip time is kept');

-- The coach's entries belong to the coach.
select tests.authenticate_as('dev');
select tests.ok(tests.visible_count(format('select 1 from public.zone_events where session_id = %L', tests.job('s1'))) = 6,
  'the development coach sees the athlete''s session');
select tests.remember_job('coach_event', (select event_id from public.log_zone_event(tests.job('r1'), '{"location": "z5", "response": "swing", "contact": "fair", "depth_correct": true}')));
select tests.ok((select source_kind from public.zone_events where id = tests.job('coach_event')) = 'development_coach', 'the coach''s entry is marked as coach-logged');
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.update_zone_event(%L, '{"location": "z5", "response": "take"}')$$, tests.job('coach_event')),
  'BR002', 'the athlete''s side cannot change what the coach recorded');
select tests.throws(format($$select public.delete_zone_event(%L)$$, tests.job('coach_event')),
  'BR002', 'or remove it');
select tests.lives(format($$select public.delete_zone_event(%L)$$, (select id from public.zone_events where round_id = tests.job('r1') and seq = 5)),
  'the athlete can undo their own entry');

-- Nobody else, and nothing directly.
select tests.authenticate_as('other');
select tests.ok(tests.visible_count('select 1 from public.zone_sessions') = 0 and tests.visible_count('select 1 from public.zone_events') = 0
  and tests.visible_count('select 1 from public.zone_assignments') = 0 and tests.visible_count('select 1 from public.zone_rounds') = 0,
  'another athlete sees none of it');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "take"}')$$, tests.job('r1')),
  'BR003', 'and cannot add to it');
select tests.throws(format($$select public.create_zone_session(%L, %L)$$, tests.id('athlete'), (select value from t_values where name = 'base')),
  'BR003', 'or start a session for them');
select tests.authenticate_as('dev2');
select tests.ok(tests.visible_count('select 1 from public.zone_sessions') = 0, 'a coach who is not linked sees nothing');
select tests.authenticate_as('athlete');
select tests.throws(format($$insert into public.zone_events (round_id, session_id, athlete_id, seq, kind, assignment_id, batting_side, location, source_kind)
  values (%L, %L, auth.uid(), 99, 'pitch', %L, 'right', 'z4', 'self')$$, tests.job('r1'), tests.job('s1'), tests.job('a2')),
  '42501', 'entries cannot be inserted directly');
select tests.throws($$update public.zone_sessions set decision = 'advance'$$, '42501', 'sessions cannot be changed directly');

-- ================================================================ rounds and review
select tests.remember_job('r2', public.add_zone_round(tests.job('s1'),
  '{"batting_side": "right", "stage": 3, "delivery_source": "coach", "intended_zones": [4], "assignment": {"kind": "forced_take"}}'));
select tests.ok((select seq from public.zone_rounds where id = tests.job('r2')) = 2
  and (select kind || '|' || version from public.zone_assignments where round_id = tests.job('r2')) = 'forced_take|1',
  'a second round starts with its own assignment');
select tests.throws(format($$select public.review_zone_round(%L, '{"response": "promote"}')$$, tests.job('r1')),
  'BR003', 'a round ends with advance, hold, simplify or stop');
select tests.lives(format($$select public.review_zone_round(%L, '{"response": "hold", "hitter_feedback": "Late on inside", "coach_notes": "Not mine"}')$$, tests.job('r1')),
  'a round is reviewed');
select tests.ok((select response || '|' || hitter_feedback || '|' || (coach_notes is null) from public.zone_rounds where id = tests.job('r1')) = 'hold|Late on inside|true',
  'the athlete''s side sets the next step of its own round but never writes coach notes');
select tests.authenticate_as('dev');
select tests.remember_job('r3', public.add_zone_round(tests.job('s1'),
  '{"batting_side": "right", "stage": 3, "delivery_source": "coach", "assignment": {"kind": "selective", "swing_zones": [4]}}'));
select public.review_zone_round(tests.job('r3'), '{"response": "simplify", "coach_notes": "Rushing the load"}');
select tests.ok((select source_kind || '|' || coach_notes from public.zone_rounds where id = tests.job('r3')) = 'development_coach|Rushing the load',
  'a round the coach starts is marked as the coach''s, with the coach''s notes');
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.set_zone_assignment(%L, '{"kind": "free"}')$$, tests.job('r3')),
  'BR002', 'the athlete''s side cannot change the assignment of a round the coach started');
select public.review_zone_round(tests.job('r3'), '{"response": "advance", "coach_notes": "", "hitter_feedback": "Felt on time"}');
select tests.ok((select response || '|' || coach_notes || '|' || hitter_feedback from public.zone_rounds where id = tests.job('r3')) = 'simplify|Rushing the load|Felt on time',
  'nor the coach''s notes or next step; it can add the hitter''s feedback');

select tests.lives(format($$select public.review_zone_session(%L, '{"decision": "hold", "hitter_self_assessment": "Better depth", "coach_assessment": "Not mine to write", "next_zones": [4], "next_cue": "Catch it deep"}')$$, tests.job('s1')),
  'the athlete completes the post-session evaluation');
select tests.ok((select status || '|' || decision || '|' || (coach_assessment is null) from public.zone_sessions where id = tests.job('s1')) = 'reviewed|hold|true',
  'the athlete''s side cannot write the coach''s assessment');
select tests.throws(format($$select public.approve_zone_next_plan(%L)$$, tests.job('s1')), 'BR002', 'an athlete cannot approve their own next plan');
select tests.authenticate_as('dev');
select tests.lives(format($$select public.review_zone_session(%L, '{"decision": "hold", "hitter_self_assessment": "Rewritten by the coach", "coach_assessment": "Depth improved on 4", "next_zones": [4]}')$$, tests.job('s1')),
  'the coach adds the coach''s assessment');
select tests.ok((select hitter_self_assessment from public.zone_sessions where id = tests.job('s1')) = 'Better depth',
  'the coach cannot rewrite the hitter''s own self-assessment');
select tests.lives(format($$select public.approve_zone_next_plan(%L)$$, tests.job('s1')), 'the coach approves the next-session plan');
select public.review_zone_session(tests.job('s1'), '{"decision": "hold", "coach_assessment": "Depth improved on 4; keep zone 4", "next_zones": [4]}');
select tests.ok((select next_plan_approved_by from public.zone_sessions where id = tests.job('s1')) = tests.id('dev'),
  'the approving coach''s own edit keeps the approval');
select tests.clear_authentication();
select tests.link_development_coach('athlete', 'dev2');
select tests.authenticate_as('dev2');
select public.review_zone_session(tests.job('s1'), '{"decision": "advance", "coach_assessment": "Ready to advance", "next_zones": [4]}');
select tests.ok((select next_plan_approved_at is null from public.zone_sessions where id = tests.job('s1')),
  'another coach''s edit withdraws the first coach''s approval');
select tests.authenticate_as('dev');
select public.approve_zone_next_plan(tests.job('s1'));
select tests.authenticate_as('athlete');
select public.review_zone_session(tests.job('s1'), '{"decision": "advance", "hitter_self_assessment": "Ready", "next_zones": [4, 6]}');
select tests.ok((select (next_plan_approved_at is null) || '|' || coach_assessment from public.zone_sessions where id = tests.job('s1'))
  = 'true|Ready to advance', 'a change by the athlete''s side withdraws the approval and keeps the coach''s assessment');

-- ================================================================ progression
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 4, 2, 'advance', 'Ready', 'Tee map 4 of 5')$$), 'BR004', 'a zone gets a starting stage first');
select tests.lives(format($$select public.set_zone_stage(auth.uid(), 4, 2, 'set', 'Baseline tee test', 'Tee map 4 of 5 at depth')$$), 'a starting stage is set');
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 4, 4, 'advance', 'Skipping ahead', 'Looked good')$$), 'BR003', 'advance moves up one stage');
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 4, 3, 'advance', 'ok', 'Depth 9 of 12')$$), 'BR003', 'a decision needs a reason');
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 4, 3, 'advance', 'Ready for moving balls', null)$$), 'BR003', 'and evidence');
select tests.lives(format($$select public.set_zone_stage(auth.uid(), 4, 3, 'advance', 'Ready for moving balls', 'Depth 9 of 12 on two comparable rounds', %L)$$, tests.job('s1')),
  'a zone advances with its reason and evidence');
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 4, 3, 'simplify', 'Too hard', 'Contact 2 of 10')$$), 'BR003', 'simplify moves to an earlier stage');
select tests.lives(format($$select public.set_zone_stage(auth.uid(), 4, 1, 'simplify', 'Posture breaking down at full speed', 'Posture errors 4 per 10')$$), 'a zone is simplified');
select tests.lives(format($$select public.set_zone_stage(auth.uid(), 4, 1, 'hold', 'Repeat before moving on', 'Depth 5 of 9')$$), 'and held');
select tests.lives(format($$select public.set_zone_stage(auth.uid(), 4, 5, 'set', 'Baseline retest placed the hitter at decisions', 'Retest: 11 of 12 strike contact')$$),
  'a deliberate reset to another stage is recorded as "set"');
select tests.ok((select array_agg(decision || ':' || stage order by created_at, id) from public.zone_progress where athlete_id = auth.uid() and zone = 4)
  = array['set:2', 'advance:3', 'simplify:1', 'hold:1', 'set:5'],
  'every stage decision is kept with its reason and evidence');
select tests.authenticate_as('dev');
select tests.lives(format($$select public.set_zone_stage(%L, 9, 3, 'set', 'Coach baseline', 'Toss round: 6 of 10')$$, tests.id('athlete')), 'the coach sets a stage');
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.set_zone_stage(auth.uid(), 9, 4, 'advance', 'I feel ready', 'Felt good today')$$),
  'BR002', 'the athlete''s side cannot override a stage the coach decided');
select tests.clear_authentication();
select tests.ok((select count(*) from public.audit_events where action = 'zone.stage_changed' and subject_user_id = tests.id('athlete') and metadata = '{}') = 6,
  'stage changes are audited without values');

-- ================================================================ paused
update private.assessment_settings set enabled = false, video_enabled = false where id;
select tests.authenticate_as('athlete');
select tests.throws(format($$select * from public.log_zone_event(%L, '{"location": "z4", "response": "take"}')$$, tests.job('r1')),
  'BR004', 'switched off, nothing new is recorded');
select tests.ok(tests.visible_count(format('select 1 from public.zone_events where session_id = %L', tests.job('s1'))) = 6,
  'but the record can still be read');
select tests.clear_authentication();
select tests.enable_assessment(false);

delete from public.assessment_media where id = '00000000-0000-4000-8000-0000000000c1';
select tests.ok((select media_id is null from public.zone_events where round_id = tests.job('r1') and seq = 6),
  'deleting a clip unlinks it from entries and keeps the entry');

-- ================================================================ tee rounds and deleting
select tests.authenticate_as('athlete');
select tests.remember_job('s3', public.create_zone_session(auth.uid(),
  (select value from t_values where name = 'base')::jsonb - 'assessment_id' - 'drill_key' || '{"delivery_source": "tee", "stage": 1, "focus_zones": [7], "assignment": {"kind": "mandatory_swing"}}'));
select tests.remember_job('r_tee', (select id from public.zone_rounds where session_id = tests.job('s3')));
select tests.throws(format($$select * from public.log_zone_event(%L, '{"kind": "pitch", "location": "z7", "response": "swing"}')$$, tests.job('r_tee')),
  'BR003', 'a tee round records tee swings and dry reps, never pitches');
select tests.lives(format($$select * from public.log_zone_event(%L, '{"kind": "tee_swing", "location": "z7", "contact": "fair"}')$$, tests.job('r_tee')),
  'a tee swing is logged in a tee round');
select tests.throws(format($$select public.delete_zone_session(%L)$$, tests.job('s1')),
  'BR002', 'the athlete''s side cannot delete a session holding the coach''s entries, rounds or assessment');
select tests.lives(format($$select public.delete_zone_session(%L)$$, tests.job('s3')), 'the athlete deletes a session that is only theirs');
select tests.clear_authentication();
select tests.ok((select count(*) from public.zone_events where session_id = tests.job('s3')) = 0
  and (select count(*) from public.zone_rounds where session_id = tests.job('s3')) = 0
  and (select count(*) from public.zone_assignments a where not exists (select 1 from public.zone_rounds r where r.id = a.round_id)) = 0,
  'its rounds, assignments and entries go with it');
select tests.authenticate_as('dev');
select tests.remember_job('s2', public.create_zone_session(tests.id('athlete'), (select value from t_values where name = 'base')::jsonb - 'assessment_id'));
select tests.authenticate_as('athlete');
select tests.throws(format($$select public.delete_zone_session(%L)$$, tests.job('s2')), 'BR002', 'nor a session the coach started');
select tests.authenticate_as('dev');
select tests.lives(format($$select public.delete_zone_session(%L)$$, tests.job('s1')), 'the development coach can delete it');
select tests.clear_authentication();
select tests.ok((select count(*) from public.zone_events where session_id = tests.job('s1')) = 0
  and (select count(*) from public.zone_progress where athlete_id = tests.id('athlete') and zone = 4) = 5
  and (select count(*) from public.zone_progress where session_id is not null and athlete_id = tests.id('athlete')) = 0,
  'stage history stays, unlinked from the deleted session');
