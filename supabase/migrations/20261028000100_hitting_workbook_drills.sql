-- Hitting Development Workbook drills (decision F38).
--
-- Adds the workbook's 40 hitting drills (H01-H40) and six of its rehearsals
-- (R01-R03, R05-R07) to the drill library, and switches off five starter
-- drills that workbook drills now replace. Nothing is deleted: plans that
-- already use a replaced drill keep it, and private.assignment_problem already
-- refuses inactive drills for new plans and changes.
--
-- Instructions live in src/lib/assessment/catalog/workbook-drills.ts, built
-- from src/lib/assessment/hitting-workbook/content-v1.json; these rows are
-- generated from that TypeScript catalog and a contract test keeps them equal.
-- Drill names were rewritten and outside organisations' names and links
-- removed from the workbook at the founder's request (2026-10-28).

update public.assessment_drills
   set active = false
 where (key, version) in (
   ('hit-rhythm-load-tee', 1),
   ('hit-front-toss-tempo', 1),
   ('hit-contact-point-map', 1),
   ('hit-stride-line', 1),
   ('hit-line-drive-rounds', 1)
 );

insert into public.assessment_drills (key, version, discipline, pillars, name)
values
  ('hit-h01', 1, 'hitting', array['barrel_delivery', 'impact_output'], 'Middle Tee Contact Baseline'),
  ('hit-h02', 1, 'hitting', array['load_timing', 'barrel_delivery', 'impact_output'], 'Inside Tee Contact Point'),
  ('hit-h03', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Outside Tee Opposite-Field Drive'),
  ('hit-h04', 1, 'hitting', array['barrel_delivery', 'impact_output'], 'Top-of-Zone Tee'),
  ('hit-h05', 1, 'hitting', array['barrel_delivery', 'impact_output'], 'Bottom-of-Zone Tee'),
  ('hit-h06', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Low-Middle-High Tee Sequence'),
  ('hit-h07', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Full Strike-Zone Tee Map'),
  ('hit-h08', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Inside-Outside Tee Switch'),
  ('hit-h09', 1, 'hitting', array['barrel_delivery', 'impact_output'], 'Coach-Called Location Tee'),
  ('hit-h10', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Reduced-Ball Tee Precision'),
  ('hit-h11', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Fixed-Base Tee Swings'),
  ('hit-h12', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution'], 'Loaded-Hands Start Tee'),
  ('hit-h13', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution'], 'Stride, Hold, Swing Tee'),
  ('hit-h14', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution'], 'Hold vs. Flow Tee Pairs'),
  ('hit-h15', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'Marked Landing Tee'),
  ('hit-h16', 1, 'hitting', array['lower_body_contribution'], 'Lift-and-Hold Stride Tee'),
  ('hit-h17', 1, 'hitting', array['lower_body_contribution'], 'Short-Tap Stride Tee'),
  ('hit-h18', 1, 'hitting', array['lower_body_contribution'], 'Step-In Momentum Tee'),
  ('hit-h19', 1, 'hitting', array['lower_body_contribution'], 'Open-Stance Start Tee'),
  ('hit-h20', 1, 'hitting', array['lower_body_contribution'], 'Closed-Stance Start Tee'),
  ('hit-h21', 1, 'hitting', array['load_timing'], 'Side-Angle Toss Contact'),
  ('hit-h22', 1, 'hitting', array['load_timing', 'impact_output'], 'Steady Middle Front Toss'),
  ('hit-h23', 1, 'hitting', array['load_timing'], 'Inside-Lane Front Toss'),
  ('hit-h24', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution', 'impact_output'], 'Outside-Lane Front Toss'),
  ('hit-h25', 1, 'hitting', array['load_timing', 'barrel_delivery', 'impact_output'], 'Up-Down Height Toss'),
  ('hit-h26', 1, 'hitting', array['load_timing', 'barrel_delivery', 'impact_output'], 'In-Out Location Toss'),
  ('hit-h27', 1, 'hitting', array['load_timing', 'impact_output'], 'Mixed-Location Read Toss'),
  ('hit-h28', 1, 'hitting', array['load_timing', 'lower_body_contribution'], 'Change-of-Speed Toss'),
  ('hit-h29', 1, 'hitting', array['load_timing'], 'Varied-Delivery Timing Toss'),
  ('hit-h30', 1, 'hitting', array['load_timing'], 'Open-Stance Front Toss'),
  ('hit-h31', 1, 'hitting', '{}'::text[], 'Track Two, Attack the Third'),
  ('hit-h32', 1, 'hitting', '{}'::text[], 'Single-Zone Hunt'),
  ('hit-h33', 1, 'hitting', '{}'::text[], 'Swing-or-Take Decisions'),
  ('hit-h34', 1, 'hitting', '{}'::text[], 'Edge-of-Zone Reads'),
  ('hit-h35', 1, 'hitting', '{}'::text[], 'First-Pitch Ready Round'),
  ('hit-h36', 1, 'hitting', '{}'::text[], 'Hitter''s-Count Hunt'),
  ('hit-h37', 1, 'hitting', '{}'::text[], 'Two-Strike Compete Round'),
  ('hit-h38', 1, 'hitting', '{}'::text[], 'Move-the-Runner At-Bats'),
  ('hit-h39', 1, 'hitting', '{}'::text[], 'Score-the-Runner At-Bats'),
  ('hit-h40', 1, 'hitting', '{}'::text[], 'Full-Count Live Battles'),
  ('hit-r01', 1, 'hitting', array['barrel_delivery', 'lower_body_contribution'], 'No-Bat Landing Rehearsal'),
  ('hit-r02', 1, 'hitting', array['lower_body_contribution'], 'Lift-and-Balance Rehearsal'),
  ('hit-r03', 1, 'hitting', array['load_timing', 'barrel_delivery', 'lower_body_contribution'], 'Hand-Position Freeze Check'),
  ('hit-r05', 1, 'hitting', array['impact_output'], 'Guess-Then-Check Round'),
  ('hit-r06', 1, 'hitting', '{}'::text[], 'Feel vs. Film Check'),
  ('hit-r07', 1, 'hitting', array['impact_output'], 'Rhythm Reset Round');
