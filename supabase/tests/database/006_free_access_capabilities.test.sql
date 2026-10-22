-- Free-access invariants: the core product can never be placed behind a paywall.

select tests.create_user('admin', 'parent', 'admin@baserecruits.test', p_date_of_birth => date '1985-01-01');
select tests.make_admin('admin');
select tests.create_user('athlete', 'athlete', p_date_of_birth => date '2007-07-07');
select tests.create_user('parent', 'parent', p_date_of_birth => date '1977-07-07');
select tests.create_user('coach_unverified', 'coach', 'u.coach@state.edu', p_date_of_birth => date '1980-01-01');
select tests.create_user('coach_verified', 'coach', 'v.coach@state.edu', p_date_of_birth => date '1981-01-01');
select tests.verify_coach('coach_verified', 'admin');

-- ---------------------------------------------------------------- the catalog
select tests.ok(
  (select array_agg(key order by key) from public.capabilities where tier = 'core_free') = array[
    'academic_match_basic', 'athlete_profile_basic', 'basic_recruiting_checklist', 'coach_athlete_evaluation',
    'coach_athlete_search', 'coach_discoverability', 'coach_messaging', 'coach_recruiting_boards',
    'family_link_basic', 'guest_shortlist', 'official_recruiting_links', 'privacy_controls',
    'school_compare_basic', 'school_profile_view', 'school_search', 'shortlist_unlimited'],
  'the 16 core capabilities are exactly the free-forever set');
select tests.ok(
  (select bool_and(audience = 'anyone') from public.capabilities
    where key in ('school_search', 'school_profile_view', 'academic_match_basic', 'school_compare_basic', 'guest_shortlist')),
  'discovery, matching, comparison and the guest shortlist need no account');
select tests.ok(
  not exists (select 1 from public.plan_capabilities pc join public.capabilities c on c.key = pc.capability_key
               where c.tier = 'core_free'),
  'no paid plan contains a core capability');

-- ---------------------------------------------------------------- guards
select tests.throws('update public.capabilities set tier = ''premium'' where key = ''academic_match_basic''',
  'BR020', 'core academic matching cannot be made premium');
select tests.throws('update public.capabilities set audience = ''registered'' where key = ''school_search''',
  'BR020', 'core school search cannot be moved behind a sign-up wall');
select tests.throws('update public.capabilities set key = ''school_search_v2'' where key = ''school_search''',
  'BR020', 'core capabilities cannot be renamed away');
select tests.throws('delete from public.capabilities where key = ''shortlist_unlimited''',
  'BR020', 'core capabilities cannot be deleted');
select tests.throws('truncate public.capabilities cascade', 'BR020', 'the capability catalog cannot be truncated');
select tests.throws('insert into public.plan_capabilities values (''base_elite'', ''coach_athlete_search'')',
  'BR020', 'core coach tools cannot be added to a paid plan');
select tests.throws('insert into public.plan_capabilities values (''base_recruit'', ''coach_discoverability'')',
  'BR020', 'athlete visibility to coaches cannot be sold');
select tests.throws('update public.plan_capabilities set capability_key = ''shortlist_unlimited'' where capability_key = ''outreach_templates''',
  'BR020', 'a plan row cannot be edited into a core capability');
select tests.throws('insert into public.plan_capabilities values (''base_free'', ''outreach_templates'')',
  '23514', 'the free tier is not a plan with its own capability list');
select tests.lives('insert into public.capabilities (key, tier, audience, description) values (''college_visit_planner'', ''premium'', ''registered'', ''Plan campus visits.'')',
  'new premium workflow capabilities can be added');
select tests.lives('insert into public.plan_capabilities values (''base_recruit'', ''college_visit_planner'')',
  'premium capabilities can be added to plans');
select tests.throws('insert into public.capabilities (key, tier, audience, description) values (''new_core'', ''core_free'', ''anyone'', ''x'')',
  '23514', 'a new core capability must cite the product invariant it serves');
select tests.throws('update public.capabilities set tier = ''core_free'', invariant_ref = 4 where key = ''outreach_templates''',
  'BR020', 'a premium capability that paid plans still sell cannot be re-labelled as core');
delete from public.plan_capabilities where capability_key = 'outreach_templates';
select tests.lives('update public.capabilities set tier = ''core_free'', invariant_ref = 4 where key = ''outreach_templates''',
  'once no plan sells it, a premium capability can be made free for everyone');

-- ---------------------------------------------------------------- answers never consult billing
select tests.ok(private.has_capability(null, 'academic_match_basic'), 'an anonymous visitor can run academic matches');
select tests.ok(private.has_capability(null, 'school_compare_basic'), 'an anonymous visitor can compare schools');
select tests.ok(not private.has_capability(null, 'shortlist_unlimited'), 'saving a synced shortlist needs a free account');
select tests.ok(private.has_capability(tests.id('parent'), 'shortlist_unlimited'), 'any free account can save unlimited schools');
select tests.ok(private.has_capability(tests.id('athlete'), 'coach_discoverability'), 'every athlete can choose coach discoverability for free');
select tests.ok(not private.has_capability(tests.id('coach_unverified'), 'coach_athlete_search'), 'coach tools wait for verification');
select tests.ok(private.has_capability(tests.id('coach_verified'), 'coach_recruiting_boards'), 'verified coaches get boards for free');
select tests.ok(private.has_capability(tests.id('coach_verified'), 'coach_messaging'), 'verified coaches get messaging for free');
select tests.ok(not private.has_capability(tests.id('athlete'), 'recruiting_pipeline_crm'),
  'premium workflows are not available before billing exists');
select tests.ok(not private.has_capability(tests.id('athlete'), 'no_such_capability'), 'unknown capabilities are denied');

-- ---------------------------------------------------------------- the catalog is public, read-only
select tests.authenticate_as_anon();
select tests.ok(tests.visible_count('select * from public.capabilities') >= 16, 'anyone can read what is free');
select tests.throws('update public.capabilities set description = ''x''', '42501', 'visitors cannot edit the catalog');
select tests.authenticate_as('admin');
select tests.throws('update public.capabilities set description = ''x''', '42501', 'not even admins edit the catalog through the API');
select tests.throws('insert into public.plan_capabilities values (''base_elite'', ''engagement_analytics'')', '42501',
  'plans are changed only by reviewed migrations');
