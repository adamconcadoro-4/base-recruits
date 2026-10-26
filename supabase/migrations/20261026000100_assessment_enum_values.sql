-- =============================================================================
-- Base Recruits Assessment / Migration 1: new enumeration values
--
-- New values cannot be used in the transaction that adds them, so they get
-- their own migration (each migration runs in one transaction).
--
--   app_role         development_coach  a private hitting or pitching coach an
--                                       athlete invites to work on assessments
--                                       (not a college coach; never verified
--                                       through a staff directory)
--   consent_scope    development_coach_access  one named development coach may
--                                       see, add to and review assessments,
--                                       video and training plans
--                    family_assessments  a linked parent/guardian may see and
--                                       add to assessments, video and plans
--                    coach_assessment_reports  one named verified college coach
--                                       may see published assessment reports
--                                       (never video)
-- =============================================================================

alter type public.app_role add value if not exists 'development_coach';

alter type public.consent_scope add value if not exists 'development_coach_access';
alter type public.consent_scope add value if not exists 'family_assessments';
alter type public.consent_scope add value if not exists 'coach_assessment_reports';
