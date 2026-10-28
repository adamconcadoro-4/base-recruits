-- =============================================================================
-- SeamState / Migration 3: lift the privacy-line lock (decision F36)
--
-- The founder approved replacement wording for the clip privacy line on
-- 2026-10-28. It ships in the same change, on the clips step and the public
-- Player Assessment page:
--
--   "Video is stored privately, and you can delete a clip at any time. Nothing
--    is sent to an outside analysis service unless you ask for a SeamState
--    swing analysis. Then our own video service reads that clip, and only
--    still frames, cropped to the hitter and without a name, go to our AI
--    provider."
--
-- This only allows an administrator to switch SeamState on. It stays off until
-- one does (with a monthly limit above 0), and it also needs the AI key and the
-- video worker. Clips of athletes under 18 stay closed (L12).
-- =============================================================================

update private.seamstate_settings set outside_analysis_disclosed = true, updated_at = now() where id;
