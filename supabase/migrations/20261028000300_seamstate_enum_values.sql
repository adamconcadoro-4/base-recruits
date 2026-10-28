-- =============================================================================
-- SeamState / Migration 1: new enumeration values (docs/seamstate.md)
--
-- New values cannot be used in the transaction that adds them, so they get
-- their own migration.
--
--   consent_audience  outside_service      a named outside service Base
--                                          Recruits uses on the athlete's
--                                          behalf (no person receives access)
--   consent_scope     seamstate_analysis   send still frames from the
--                                          athlete's swing clips to the AI
--                                          analysis provider for SeamState
--                                          reports (decisions F30, L12)
-- =============================================================================

alter type public.consent_audience add value if not exists 'outside_service';
alter type public.consent_scope add value if not exists 'seamstate_analysis';
