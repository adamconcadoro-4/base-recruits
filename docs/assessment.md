# Base Recruits Assessment

Status: merged (pull request #15), **switched off**. Nothing here is live until the founder turns on both switches
described in "Turning it on". Handoff and open decisions: `docs/reports/assessment.md`. 9-Zone Hitting Development
(section 10) is built on branch `feature/zone-hitting` and is covered by the same switches. The Hitting Development
Workbook drills and swing-flaw guide (section 11) join the drill library under the same switches.

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
| Domain (framework-free, unit tested) | `src/lib/assessment/` — `types.ts`, `catalog/` (pillars, 30 metrics with 14 anchored rubrics, 4 protocols, 64 drills of which 5 are replaced, the swing-flaw guide, workbook session templates, the home-practice guide, context lists), `hitting-workbook/`, `practice-counts.ts`, `units.ts`, `scoring.ts`, `engine.ts`, `results.ts`, `snapshot.ts`, `labels.ts`, `recommendations.ts`, `compatibility.ts`, `csv.ts`, `sample.ts` |
| Server reads and action plumbing | `src/lib/assessment/server/` (`server-only`; every query runs as the signed-in person) |
| Pages and server actions | `src/app/(app)/assessment/` (`actions.ts`, `media-actions.ts`, `plan-actions.ts`, `connection-actions.ts`) |
| Components | `src/components/assessment/` (report view, summaries, action form, context fields, drill details, session outline, practice counts) |
| Database | `supabase/migrations/20261026000100` … `000700`, `20261028000100_hitting_workbook_drills.sql`, `20261028000200_hitting_workbook_sessions_counts.sql` |
| Tests | `tests/unit/assessment-*.test.ts`, `tests/unit/hitting-workbook.test.ts`, `tests/contract/assessment-catalog.test.ts`, `supabase/tests/015`–`018`, `scripts/db/race-test.sh`, `tests/e2e/assessment.spec.ts` |
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
- Removing a clip (or deleting a draft) is checked by the database first (`remove_assessment_media`,
  `begin_assessment_deletion`), which also removes the clip's markers, notes, drawings and the timing measured from
  them, and returns the path; the server then deletes the file with its storage key
  (`src/lib/assessment/server/storage.ts`), because the storage read policy hides removed clips from users. Removing
  video never depends on the Assessment switch. Nothing is transcoded, analyzed or sent to any outside service, except
  still frames for a SeamState swing analysis the athlete asks for (`docs/seamstate.md`, F36).

## 7. Turning it on

1. Founder decisions in `docs/reports/assessment.md` (at least who reviews assessments, video legal review L9).
2. Merge the pull request (this applies the seven migrations to production; everything stays off).
3. Supabase → Storage settings: the project's upload size limit must be at least 200 MB, or lower
   `MAX_VIDEO_BYTES` and the database limit together.
4. Vercel: set `NEXT_PUBLIC_ASSESSMENT_ENABLED=true` (Config variable) and redeploy. The tab, public pages and
   development coach sign-up appear.
5. Admin → Assessment switches: turn on "Assessment is open". Turn on video only after legal review.

To pause: untick the database switch. Nothing new can be recorded, but people can still read published reports,
remove clips and end connections or sharing (the Connections page stays available). To hide Assessment entirely,
remove the variable and redeploy — do that only while nobody has connections or clips, because it also hides the
pages where people manage them. Data is kept either way.

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
- A signed upload link stays usable for about two hours after it is created; a development coach whose connection
  ends in that window could still finish an upload, which the database then refuses to confirm, leaving an orphan
  file. A scheduled clean-up of unconfirmed uploads should be added before video is switched on.
- Reference benchmarks: none, by design, until an approved dataset exists.

## 10. 9-Zone Hitting Development

Built from the founder's workbook `9_Zone_Hitting_Drills_and_Tracking.xlsx` (kept unchanged in
`data/zone-hitting/`, SHA-256 `7e2d3e15…40cf`). It connects a hitting finding to a drill, a recorded practice session
and a reassessment. It lives inside Assessment → Hitting, uses the same athletes, relations, switches, clips and
plans, and **never changes an assessment score**. There is no overall zone score and no fifth pillar.

### Where it lives

| View | Route | Workbook content used | What happens |
| --- | --- | --- | --- |
| Zone Map | `/assessment/hitting/zones` | 9-Zone Map | Clickable map drawn for a right- or left-handed hitter (catcher's view, labelled); choose the metric (strike contact, correct depth, directional accuracy, hard targeted contact) and pitched balls or tee swings (never combined). Each tile shows its counts; "Not assessed", "Not recorded" or "Too few to judge" instead of zero; shading only with ≥ 8 scored attempts. Selecting a zone shows location, depth cue, lane (with the field for this hitter), cue, common misses (coaching context, not a diagnosis), current stage, results, drills, clips and "Start a focused round". Decision & Recognition is a separate panel |
| Drill Library | `/assessment/hitting/zones/drills` | Zone Drill Library, Zone Pairings, Live BP Constraints, Progression, Baseline Tests, Session Plan, Pitcher Plan | 39 drills (filter by zone, level, word), 5 pairings, 49 constraints, 9 stages, baseline blocks, session template, Delivery Plan, source notes. Workbook download at `/assessment/hitting/zones/workbook` (signed in, site switch on; coaching content and blank logs only) |
| Session Builder | `/assessment/hitting/zones/sessions/new` | Session Plan, Live BP Constraints, Pitcher Plan | One or two focus zones, batting side, drill or pairing, stage, delivery (tee, toss, coach, machine, live), one cue, target lane, constraint, planned repetitions, planned locations, the **predeclared swing/take assignment** (free, selective with zones, mandatory swing, forced take) and whether the hitter calls ball/strike, contact-quality definition, equipment, capture conditions, links to a hitting assessment and plan |
| Live Tracker | `/assessment/hitting/zones/sessions/[id]` | Pitch Log, Log Coding Guide | Phone-first: entry kind (pitch, tee swing, dry rep), planned zone, where it actually arrived (nine zones, four outside locations, unknown), swing/take, contact (miss, foul, fair, not seen), optional observations (hard targeted, depth, lane, posture, call, off-plan with reason, required take, left out with reason, clip and time, note). Saves in order with announced status, retry, undo last, round totals with counts. Change the assignment mid-round (adds a version) and start the next round (one demand at a time) |
| Session Review | `/assessment/hitting/zones/sessions/[id]/review` | Session Dashboard, Round Review, Post Session Eval | Protocol, counts, every rate with numerator/denominator and missing/left-out counts, planned vs actual delivery, results by zone, rounds with every entry (corrections with the same pad), round reviews, clips, prompts, post-session evaluation, coach approval of the next plan, stage decisions, CSV download, print |
| Development Path | `/assessment/hitting/zones/path` | Progression, Daily Log | Stage per zone with history (reason and evidence required), the daily log generated from saved sessions, comparison only within compatible conditions |

### Content import

`scripts/zone-content/extract.py` reads the workbook (openpyxl, development only), checks the expected counts (15
sheets, 9 zones, 39 drills, 9 stages, 5 pairings, 49 constraints, blank logs) and writes
`src/lib/assessment/zones/content-v1.json` (content version `zone-v1`; every row keeps its sheet and row).
`scripts/zone-content/seed-sql.py` writes the same content into the migration, which calls
`private.import_zone_content`: idempotent (`on conflict do nothing`), never overwrites, records the workbook checksum.
Content tables are read-only; coach choices live on sessions and rounds. A later workbook revision gets a new content
version and its own migration. The workbook's numbered references have no source list, so nothing is presented as a
verified citation; suggested volumes are planning guidance; contact-depth references are individualized cues.

### Data model

| Table | Holds |
| --- | --- |
| `zone_content_releases`, `zone_definitions`, `zone_drills`, `zone_stages`, `zone_pairings`, `zone_constraints` | Imported workbook content (read-only) |
| `zone_sessions` | Session plan and post-session evaluation (decision, next zones, cue, constraint, volume, success criterion, coach approval) |
| `zone_rounds` | Rounds: side, stage, delivery, drill, constraint, cue, lane, planned reps and locations, round review |
| `zone_assignments` | Versioned swing/take assignments; each event keeps the version it was judged against |
| `zone_events` | Pitches, tee swings and dry reps with the observations above, who recorded them and how (live or video) |
| `zone_progress` | Stage history per athlete and zone: set, advance (+1), hold, simplify (back), reason and evidence |

Writes only through checked functions (`create_zone_session`, `add_zone_round`, `set_zone_assignment`,
`log_zone_event`, `update_zone_event`, `delete_zone_event`, `review_zone_round`, `review_zone_session`,
`approve_zone_next_plan`, `set_zone_stage`, `delete_zone_session`); all stop while the database switch is off. Who
may change what:

- The athlete's side (athlete or linked parent) cannot change or remove the coach's entries, write coach notes or the
  coach's assessment, change the assignment or next step of a round the coach started, override a stage the coach
  decided, or delete a session holding any of the coach's work.
- The coach cannot rewrite the hitter's self-assessment.
- Only the development coach approves a next-session plan; any later change by someone other than the approving coach
  withdraws the approval.
- A stage change always needs a reason and evidence. "Set" is a deliberate reset to any stage; advance is one stage
  up, hold keeps it, simplify moves back.
- Tee rounds accept tee swings and dry reps only, never pitches.

### Calculations (`zone-calc-v1`, `src/lib/assessment/zones/metrics.ts`)

| Metric | Website | Workbook |
| --- | --- | --- |
| Decision rate | Correct decisions ÷ scored opportunities, judged on the actual pitch and the event's assignment | Correct among scored decision opportunities |
| Chase rate | Swings at actual balls ÷ actual balls, in rounds where the hitter chose | Chases / actual balls received |
| Strike-contact rate | Strike swings with contact (fouls count) ÷ strike swings | Contacts including fouls / strike swings |
| Hard targeted contact | Met the round's definition ÷ scored strike swings (miss or foul = not met; off-plan left out) | Mean of eligible 1/0 entries |
| Correct depth | Correct ÷ strike swings scored for depth | Mean of eligible strike-swing entries |
| Directional accuracy | In lane ÷ fair balls in play on strikes scored for lane | Mean of eligible strike BIP entries |
| Posture-error swings per 10 | Errors ÷ swings **scored for posture** × 10 | Affected swings per 10 swings (all swings) |
| Recognition rate | Correct explicit calls ÷ explicit calls | Only explicitly called pitches |
| Off-plan deliveries | Off-plan ÷ pitches delivered (a delivery measure) | Delivery quality count |

Rules: zero eligible = N/A, never 0%; unknown is neither failure nor success (shown as "not recorded"); a swing at an
unassigned strike is an assignment error, not a chase; a taken strike is correct under a selective assignment that
does not include its zone; mandatory-swing and forced-take rounds and required takes give no decision or chase
opportunity; recognition is never inferred from swinging or taking; off-plan pitches stay visible, still count for
decisions, and are left out only of hard targeted, depth and lane; tee swings and dry reps are repetitions, never
pitches. Combined rates add counts; percentages are never averaged. Deliberate change from the workbook: posture uses
scored swings and shows the unscored ones, so missing observations cannot make a hitter look better.

Comparisons group only identical kind of repetition, stage, delivery source, assignment, active constraint, batting
side, evidence method (live or video), contact-quality definition and calculation version. The map and Decision &
Recognition panel can be narrowed to one stage and one assignment type. Prompts (`suggestions.ts`) name a zone only after ≥ 8 scored strike swings with a rate under 50% (one stage
simpler under 30%) and a decision prompt after ≥ 10 scored decisions; they are labelled planning prompts, change
nothing by themselves and give the finding, sample, drill, stage, one cue and how to reassess. Ball-flight
observations are not presented as biomechanical causes; observed hard contact is labelled as a coach's judgment, not
measured exit velocity.

### Tests

Unit (`tests/unit/zone-*.test.ts`): zone mapping, handedness mirror and lanes, switch hitters, N/A, missing vs zero,
foul vs fair, assignment error vs chase, selective takes, forced rounds, recognition, off-plan, posture denominator,
count-based aggregation, tee vs pitch, voided entries, prompts, assignment-version integrity, current stage,
comparable groups, daily log, map tiles, entry tidying, CSV (formula-safe). Database
(`supabase/tests/019_zone_hitting.test.sql`): content counts and idempotent re-import, switch off, validation, access
by relation, coach-data protection (entries, rounds, notes, assessment, approval, stages, deletion), assignment
versions, corrections, clips, tee rounds, approval rules, stage rules. Concurrency (`scripts/db/race-test.sh`): the
hourly session limit, two devices logging into one round, two people advancing one zone.
Contract (`tests/contract/zone-hitting.test.ts`): migration seed = app content, database = TypeScript content and value
lists. End to end (`tests/e2e/zone-hitting.spec.ts`): map, library, download, builder, phone-sized tracker with undo,
review with corrections, evaluation, stage, history, CSV, privacy and coach approval, WCAG 2.2 AA checks.

### Not built (yet)

- Importing completed workbook copies (section O of the brief): the workbook is used as a content source only.
- Measured exit velocity or sensor coordinates; a charted zone is a coach's chart, not a measurement.
- The map, history and comparisons read an athlete's latest 5,000 entries (read in pages past the API's 1,000-row
  limit; the page says when the 5,000 limit is reached).
- Demonstration videos: none are invented; clips come from the athlete's own uploads (video switch).

## 11. Hitting Development Workbook (drill library and swing-flaw guide)

Decision F38. Base Recruits' hitting workbook (`data/hitting-workbook/Baseball_Hitting_Development_Workbook.xlsx`,
SHA-256 `7f88703f…cc75`) is merged into the existing drill library rather than added as its own module. Before import
its 66 drills were given new generic names and every outside organisation's name and link was removed (founder's
request, 2026-10-28); the extraction script refuses a workbook that contains either again. Base Recruits wrote the
workbook, and Base Recruits hitting coaches reviewed the drills and targets (2026-10-28); drill pages say "Reviewed by
Base Recruits hitting coaches". Success targets still show as coach targets, not validated standards.

### What is imported

| Workbook | Where it goes | Notes |
| --- | --- | --- |
| Hitting drills H01–H40 | Drill library, keys `hit-h01` … `hit-h40` (`catalog/workbook-drills.ts`) | Suggested round → starting dose, easier version → regression, success criteria → completion (shown as a coach target, not a validated standard); common mistake, correction, safety, level and source row kept. Toss and live drills (sections C and D) need a partner |
| Rehearsals R01–R03, R05–R07 | Drill library, keys `hit-r01` … `hit-r07` | Short no-swing or between-round tools the flaw guide prescribes. R04 needs a resistance band and stays out until plans can check that an athlete has one |
| Swing-flaw guide T01–T18 | `catalog/flaws.ts` | What it looks like, checks to tell causes apart, possible contributors, drills in order, cue, what to avoid, progress marker, retest; plus the observe → hypothesis → test → retest → decide routine |
| Session templates S2, S3, S5, S6, S7 | `catalog/session-templates.ts`; "Start from" in the plan builder | Phase 2 (F39). Blocks, minutes and coach focus as written; the plan keeps the template (`session_template`) and shows the whole session. S1 (youth game), S4 and S8 (medicine ball) are left out |
| Warm-up routines WR1–WR6, activities WU01–WU14 | Shown inside a session's warm-up block | Phase 2. Only the routines the offered sessions use appear (WR1, WR4) |
| Practice Log counts | Optional counts on hitting training logs (`practice-counts.ts`) | Phase 2. Swings and solid contacts, decisions judged and good ones, landings checked and on the intended spot. Enjoyment is not imported; the pain flag never will be (founder, 2026-10-28: health data about minors) |
| Parents' guide | `/assessment/home-practice` (`catalog/home-practice.ts`) | Phase 2. Start-here steps, home safety checklist, home drill menu, sample home sessions, what to say; plus the athlete's current hitting plan |
| Everything else (medicine ball, youth games, coach-parent plan sheet, readiness, power and video logs, dashboard, parent report, macro) | Not imported | The readiness log is never imported (founder, 2026-10-28: health data about minors); medicine-ball work needs its own decision; the site's plans, logs and reports do the other sheets' jobs |

`scripts/hitting-workbook/extract.py` reads the workbook (openpyxl, development only), checks the expected counts (27
sheets, 40 drills, 7 rehearsals, 18 flaws, 5 routine steps, 8 sessions, 6 warm-up routines, 14 warm-up activities, the
parents' guide's 8 steps, 9 safety checks, 9 menu drills, 5 home sessions and 5 language rows, blank player and log
sheets) and writes
`src/lib/assessment/hitting-workbook/content-v1.json` (content version `hitting-wb-v1`; every record keeps its sheet
and row). Drill ids in the text are spelled out as names on the site ("H27" → "Mixed-Location Read Toss (H27)"), and
references to the workbook's own Video Log read "your video notes".

### Which measures a drill works on

`METRIC_FLAWS` links each hitting measure to the flaws that can produce a weak result on it, most direct first (for
example barrel delivery consistency → casting, hands dropping, looping). A workbook drill works on its section's
measures plus every measure whose flaws list it; its pillars follow from those measures. Bat speed and exit velocity
have no flaw (more output is not a flaw), so they keep the starter drills. Chasing (T15) and freezing (T16) are swing
decisions, which the assessment does not score: pitch-selection drills (H31–H40) carry no measure and point to 9-Zone
Hitting decision rounds instead.

### Suggestions

For a hitting finding, `suggestPlan` first takes drills from the possible flaws in turn (the first drill of the first
flaw, then the first of the second flaw, and so on), so two suggestions cover two possible causes where they can, then
falls back to drills linked to the measure directly. Each suggestion names the possible cause, the check that tells
causes apart and the flaw's retest; the plan builder adds what to avoid. One result can have several causes, so a flaw
is only ever offered as possible. Pitching suggestions are unchanged.

### Replaced starter drills

Five starter drills are switched off (`active = false`, `replacedBy` in the catalog) because a workbook drill does the
same job: rhythm-and-load tee series (H13, H14), front-toss tempo changes (H28), contact-point tee map (H07), stride
line (H15) and line-drive target rounds (H01). Nothing is deleted: plans already using them keep them and say what
replaced them, and the database refuses them for new plans and changes. Barrel gate, hold-the-finish, same-move video
sets and measured intent rounds stay.

### Sessions, practice counts and home practice (phase 2, F39)

**Starting from a session.** On a hitting report's plan builder, "Start from" offers the report's suggestions or one of
five workbook sessions. A session puts its drills first, each once and in session order, with its block's minutes as the
starting dosage ("Tee block, about 6 min: …") and the block's coach focus as the reason; drills that need a partner who
isn't available start unticked. The report's suggestions stay below, unticked. The plan stores the template
(`assessment_training_plans.session_template`, checked against the five ids and hitting only), and the plan card shows
the whole session: warm-up (its activities step by step), drill blocks, and retest or review blocks. The workbook's
"Readiness Log check" reads "Readiness check (no pain, not exhausted)", the same check the parents' guide states.

**Practice counts.** A log on a hitting plan can carry swings and solid contacts, pitches judged for swing or take and
good decisions, and landings checked and on the intended spot. Every count is optional and blank is not zero; a "made"
count needs its total and cannot exceed it (0–300; checked in the action and in `log_training`). The plan card totals
them per measure, only over logs that counted both numbers, and keeps coach observations apart from the athlete's or
family's reports. Counts are practice records, not measurements, and never change a score. Pitching logs refuse them.

**Home practice.** `/assessment/home-practice` shows the parents' guide with its references to the workbook's own
sheets rewritten for the site (the coach-approved plan for the Coach-Parent Plan, the Training Plan page for the
Practice Log), and the chosen athlete's active hitting plan: whether a development coach approved it, its focus, and
which of its drills are on the home menu.

### Not built (yet)

- A browsable page for the flaw guide; today it appears through plan suggestions.
- SeamState (pull request #19) picks drills by measure, so it will reach the workbook drills through their measures
  once merged; linking flaws to SeamState's mechanics directly belongs in that pull request.
