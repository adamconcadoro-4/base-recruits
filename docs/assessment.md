# Base Recruits Assessment

Status: built on branch `feature/assessment` (draft pull request #15), **switched off**. Nothing here is live until
the founder turns on both switches described in "Turning it on". Handoff and open decisions:
`docs/reports/assessment.md`.

Promise shown to users: **"Understand your game, see the evidence, and know what to work on next."** No recruiting,
admission, scholarship, injury-prevention or professional-level claims anywhere in the module.

## 1. What it does

Hitting and pitching assessments built from evidence an athlete or their development coach can actually collect:
video, charted outcomes, measured values from a radar or tracking device, and ratings against written anchors.

| Area | Where | What happens |
| --- | --- | --- |
| Overview | `/assessment` | Start an assessment, drafts in progress, reassessments due, latest reports, active plan, reports shared with a college coach |
| Hitting, Pitching | `/assessment/hitting`, `/assessment/pitching` | That discipline's assessments, latest report, what each pillar looks at |
| Workspace | `/assessment/[id]?step=…` | Details (autosave with a version check), Clips (private upload), Swings/Pitches and measurements, Ratings, Results preview, Review and publish |
| Import | `/assessment/[id]/import` | Generic CSV import: column mapping, row-by-row preview with reasons, duplicate detection |
| Report | `/assessment/[id]/report` | The frozen published report, its revisions, print or save as PDF |
| Film Room | `/assessment/film` | Frame stepping, playback speed, event markers tied to a repetition, notes, drawings, side-by-side comparison with alignment, timing from two markers |
| Training Plan | `/assessment/training` | Plans built from a report's findings (rules, no language model), drill instructions, editable dosages, session logs, change history, coach approval |
| Progress | `/assessment/progress` | Pillar scores over time (gaps, never zeros) and like-for-like comparison of two reports |
| Connections | `/assessment/coaches` | Development coach codes and approvals, family sharing, sharing published reports with a verified college coach |
| Shared report | `/assessment/shared/[revisionId]` | What a college coach sees: the current published report only |
| Public | `/player-assessment`, `/player-assessment/sample` | Explanation and a clearly labelled fictional sample report |
| Admin | `/admin#assessment` | The database switches |

## 2. Code map

| Layer | Files |
| --- | --- |
| Domain (framework-free, unit tested) | `src/lib/assessment/` — `types.ts`, `catalog/` (pillars, 30 metrics with 14 anchored rubrics, 4 protocols, 18 drills, context lists), `units.ts`, `scoring.ts`, `engine.ts`, `results.ts`, `snapshot.ts`, `labels.ts`, `recommendations.ts`, `compatibility.ts`, `csv.ts`, `sample.ts` |
| Server reads and action plumbing | `src/lib/assessment/server/` (`server-only`; every query runs as the signed-in person) |
| Pages and server actions | `src/app/(app)/assessment/` (`actions.ts`, `media-actions.ts`, `plan-actions.ts`, `connection-actions.ts`) |
| Components | `src/components/assessment/` (report view, summaries, action form, context fields, drill details) |
| Database | `supabase/migrations/20261026000100` … `000600` |
| Tests | `tests/unit/assessment-*.test.ts`, `tests/contract/assessment-catalog.test.ts`, `supabase/tests/015`–`018`, `scripts/db/race-test.sh`, `tests/e2e/assessment.spec.ts` |
| Switches | `src/config/assessment.ts` (site), `private.assessment_settings` (database) |

## 3. Data model

| Table | Holds | Who writes |
| --- | --- | --- |
| `assessment_metric_definitions`, `assessment_protocols`, `assessment_protocol_metrics`, `assessment_drills` | The versioned catalog (seeded from the TypeScript catalog; a contract test keeps them identical) | Migrations only |
| `assessments` | One session: athlete, protocol and version, mode, date, capture context, age band (never the date of birth), status, current revision | `create_assessment`, `update_assessment_context` (optimistic version), `set_assessment_status` |
| `assessment_repetitions` | Numbered swings or pitches, pitch type, valid or excluded with a reason | Repetition functions |
| `assessment_observations` | Every value: metric and version, canonical value and unit, source value and unit, evidence category, entry method, who (self or development coach), quality state and reason, device, clip and markers, import batch | `record_assessment_observation`, `record_interval_from_markers`, `import_assessment_measurements` |
| `assessment_targets` | Coach-set targets per athlete, metric and pitch type | Development coach only |
| `assessment_media`, `assessment_annotations` | Clip records (file in private Storage) and markers, notes, drawings (coordinates 0–1 of the frame) | Upload and annotation functions |
| `assessment_import_batches` | One row per imported file (checksum, counts) | Import function |
| `assessment_report_revisions` | Frozen published snapshots (`assessment-report-v1`), revision number, review kind, calculation version | `publish_assessment`; a trigger refuses any change except superseding |
| `assessment_benchmark_releases`, `assessment_benchmark_values` | Approved reference datasets (none shipped) | Administrators; approval needs ≥ 30 distinct non-synthetic athletes |
| `assessment_training_plans`, `assessment_plan_assignments`, `assessment_plan_revisions`, `assessment_training_logs` | Plans, drills in them, change history, logged sessions | Plan functions |
| `development_coach_invites`, `development_coach_links` | One-time coach codes and the athlete–coach connection | Coach connection functions |

Clients never insert or delete directly; every write goes through a checked `SECURITY DEFINER` function that locks
what it checks. Audit rows record that a value changed, never the value.

## 4. Evidence and scoring

Every result carries its evidence: **Sensor measurement** (with device, and "entered by hand" or "imported from a
file"), **Video estimate** (from Film Room markers, limited by frame rate), **Observation** (coach or self-assessed),
**Derived calculation** (lists the evidence it was calculated from) or **Unavailable**. Quality states: not reviewed,
usable, limited (counts, flagged), excluded (does not count), unable to assess (with a reason).

| Method | Formula | When |
| --- | --- | --- |
| Rubric | `25 × (rating − 1)` from written anchors 1–5 | Rubric metrics. A development coach's rating is used over a self-rating |
| Coach target | Linear between the coach's two values (higher or lower is better), or a range with a falloff distance | Only when the athlete's development coach set a target; the target is shown |
| Reference percentile | `100 × (below + 0.5 × equal) / count`, one value per athlete | Only from an approved dataset matching metric version, protocol, unit, statistic, pitch type, device kind and cohort. None exist |
| Descriptive | No score | Everything else, including measured values without a target |

Summaries: median for repeated measures (peak shown separately, never as the typical value), rate for yes/no charts
(per pitch type and all pitches), standard deviation and coefficient of variation for consistency. Values from
different devices are not combined.

A pillar shows a score only when every required metric has enough valid evidence: weighted mean of the scored
metrics. Missing evidence is never counted as zero; there is no overall grade. The authoritative calculation is
`private.assessment_results` in SQL (`calc-v1`); `computeAssessmentResults` in TypeScript mirrors it and the
contract test runs both on the same fixtures.

Published reports are frozen snapshots. Reopening keeps the published revision visible until a new one is published.

## 5. Who can do what

Relations come from `private.assessment_relation(viewer, athlete)` and are checked in row-level security and in every
function.

| Person | Can |
| --- | --- |
| Athlete (own records) | Everything: record, upload, rate (self-assessed), publish self-assessment reports, plans, share |
| Linked parent or guardian | The same as the athlete, once the athlete shares assessments with them (`family_assessments` consent) |
| Development coach | Work on a connected athlete's assessments: coach ratings, review quality of any value, set targets, mark reviewed, publish coach-reviewed reports, approve plans. Connection = athlete's one-time code + athlete approval + (for under-18s) guardian approval. Ends the moment either side ends it. Cannot see recruiting profiles or messages |
| Verified college coach | The current published report of athletes who shared reports with them (`coach_assessment_reports`, guardian approval for minors, 365 days). Never clips, drafts or working data |
| Administrator | The switches and reference datasets. No special read access to assessments |
| Anyone else | Nothing (404) |

Development coach accounts are adults only; a college coach account cannot also be a development coach.

## 6. Video

- Private bucket `assessment-media`; path `athlete/assessment/media.ext`. Storage policies call
  `private.assessment_object_access`: upload only to a pending clip you registered in the last two hours with video
  switched on; read pending or uploaded clips you can work on; delete only pending or removed clips.
- Upload: the server registers the clip (`begin_assessment_upload`: type, size ≤ 200 MB, 30 clips per assessment,
  hourly rate limit), creates a one-time signed upload link as the user, the browser sends the file with progress, and
  `complete_assessment_upload` checks the stored object's size and type.
- Playback: 15-minute signed links created as the viewer. The content security policy adds the Supabase origin to
  `connect-src` and `media-src` only when Assessment is on.
- Removing a clip (or deleting a draft) deletes the file. Nothing is transcoded, analyzed or sent to any outside service.

## 7. Turning it on

1. Founder decisions in `docs/reports/assessment.md` (at least who reviews assessments, video legal review L9).
2. Merge the pull request (this applies the six migrations to production; everything stays off).
3. Supabase → Storage settings: the project's upload size limit must be at least 200 MB, or lower
   `MAX_VIDEO_BYTES` and the database limit together.
4. Vercel: set `NEXT_PUBLIC_ASSESSMENT_ENABLED=true` (Config variable) and redeploy. The tab, public pages and
   development coach sign-up appear.
5. Admin → Assessment switches: turn on "Assessment is open". Turn on video only after legal review.

To turn it off: untick the database switch (stops all recording at once) and/or remove the variable and redeploy
(hides it). Data is kept.

## 8. Tests

| Suite | Covers |
| --- | --- |
| Unit (`tests/unit/assessment-*.test.ts`) | Units and rounding, rubric and target scoring, percentiles with ties, engine (missing ≠ zero, per-pitch rates, mixed devices, coach over self), recommendations, comparisons, CSV validation, catalog integrity |
| Contract (`tests/contract/assessment-catalog.test.ts`) | TypeScript catalog = database catalog; database CHECK lists; unit conversion and target scoring parity; SQL and TypeScript engines agree on fixtures |
| Database (`supabase/tests/015`–`018`) | Access by every relation and consent state, guardian gate, revocation, writes refused for others, published reports frozen, revisions, storage policies, imports, plans |
| Race (`scripts/db/race-test.sh`) | Concurrent coach-code creation (open-code limit), two sessions publishing one assessment, two plans started at once |
| End to end (`tests/e2e/assessment.spec.ts`) | Full hitting self-assessment including upload, Film Room timing and drawing, preview, publish, plan, log, reassessment; cross-athlete 404; development coach connect/approve/end; minor's guardian gate; public pages; WCAG 2.2 AA automated checks on every page visited |

## 9. Limits

- Video estimates come from a single camera and the clip's frame rate; the UI says so wherever they appear.
- No pose estimation, motion capture, force plate or device integrations; the lab mode is listed as unavailable.
- Drill instructions are written only (no demonstration video) and need a qualified coach's review before opening.
- Self-service account deletion is not built yet (site-wide); when it is, it must also delete the athlete's clip files.
- Reference benchmarks: none, by design, until an approved dataset exists.
