# 9-Zone Hitting Development — Engineering Handoff

Branch `feature/zone-hitting`, draft pull request #17. **Not merged, not deployed, switched off.** Merging applies one
additive migration to production Supabase and deploys Vercel; the module stays hidden behind the existing Assessment
switches (`NEXT_PUBLIC_ASSESSMENT_ENABLED` unset in production, database switch off). Reference: `docs/assessment.md`
§10.

## Summary

The founder's workbook became a working system inside Assessment → Hitting: a clickable zone map, the drill library,
a session builder with a declared swing/take assignment, a phone-first pitch tracker, a session review with counts
behind every rate, and a development path by zone. It adds evidence to the hitting assessment and never changes a
score. The workbook itself is kept unchanged and offered as a download to signed-in users.

## Built vs. the brief

| Brief | Status |
| --- | --- |
| A. Inspect and import | Done. Counts verified (15 sheets, 9 zones, 39 drills, 9 stages, 5 pairings, 49 constraints, blank logs); versioned, idempotent, source rows kept; source limitations shown |
| B. Integration and navigation | Done. Six views under `/assessment/hitting/zones`; Film Room and Training Plan reused (clips link to Film Room at the moment; sessions link to a hitting assessment and plan) |
| C. Zones and handedness | Done. Stable hitter-relative ids, labelled catcher's view, mirrored drawing and pull/opposite fields, batting side per session and round, outside and unknown locations |
| D. Interactive map | Done. Metric selector, counts on every tile, Not assessed / Not recorded / Too few to judge, no strength/weakness labels from small samples |
| E. Versioned content | Done. Drill fields, source id, content version, sheet and row; content separate from coach choices |
| F. Session builder | Done, including Delivery Plan (not a pitching assessment or workload) and planned vs actual location |
| G. Records | Done. Session, rounds, versioned assignments, entries (pitch / tee swing / dry rep) with observer and evidence method |
| H. Fast logging | Done. Large controls, swing/take, contact, optional chips, undo, corrections, save status, round totals, review between rounds; nothing unrecorded is filled in |
| I–K. Calculations, assignments, off-plan | Done (`zone-calc-v1`); posture uses scored swings (documented change from the workbook) |
| L. Progression | Done. Per zone, advance/hold/simplify with reason and evidence; coach-chosen success criteria; one demand at a time |
| M. Recommendations and pillars | Done. Prompts with finding, sample, drill, stage, cue, reassessment; pillar links described; Decision & Recognition separate; no score changes |
| N. Reports and history | Done. Session review, generated daily log, compatible comparisons, tee and pitch never mixed |
| O. Spreadsheet import/export | Workbook used as content source; session CSV export and print. **Importing completed workbook copies is not built** |
| P. Tests | Done (see Evidence) |
| Q. Acceptance | Covered by the end-to-end spec (open, select, build with assignment, record, review with counts, video links, approve next plan, track progression, compare, privacy) |

## Evidence

- Unit: `tests/unit/zone-hitting.test.ts`, `tests/unit/zone-records.test.ts`.
- Database: `supabase/tests/database/019_zone_hitting.test.sql` (84 assertions) plus the updated allow-list in 007.
- Contract: `tests/contract/zone-hitting.test.ts`.
- End to end with WCAG 2.2 AA checks: `tests/e2e/zone-hitting.spec.ts` (tracker checked at phone size).
- CI results are on pull request #17.

## Before opening (founder)

1. F27: a qualified hitting coach reviews the 39 drills, zone cues and the Delivery Plan.
2. F28: confirm the prompt minimums for the pilot (8 scored strike swings; 50% / 30%).
3. F29: keep or remove the workbook download.
4. The Assessment opening steps in `docs/assessment.md` §7 apply unchanged (development coaches, legal review L9 for
   video, switches).

## Merging and deploying (only when authorized)

Merge pull request #17 → Supabase applies `20261027000100_zone_hitting.sql` (new tables and functions only; no
existing data changed) and Vercel deploys. Nothing becomes visible until the Assessment switches are turned on.

## Known gaps

- No import of completed workbook copies (section O); would need athlete/session mapping, duplicate detection and
  legacy-flag handling.
- The map and history read the latest 5,000 entries per athlete.
- Observed hard contact is a coach's judgment; no exit-velocity or sensor integration.
- Prompt thresholds are planning choices, not validated standards.
