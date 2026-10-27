# SeamState — Base Recruits Assessment engine (design, Milestone 1)

Status: **design only.** Nothing in this document is built yet unless a section says so. SeamState lives inside
Assessment (`docs/assessment.md`), uses the same accounts, athletes, relations, switches and private storage, and stays
off until the founder opens Assessment (decision F21). Founder decisions this design needs are listed in §11 and in
`docs/decisions.md` (F30–F35).

Promise inside Assessment: **"Record your swing. Understand what is working. Know what to practice next."**

## 1. Current implementation map (verified 2026-10-27, `main` at `71d26bb`)

| Area | What exists | Where |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, server components and server actions), React 19.3, TypeScript 6 strict, Tailwind 4, zod 4, npm, Node 22.12+ | `package.json` |
| Hosting | Vercel (Pro), production branch `main`, `https://baserecruits.app` | `docs/deployment.md` |
| Database, Auth | Supabase (Pro, us-east-2). Postgres with RLS everywhere; writes only through checked `SECURITY DEFINER` functions; migrations deploy on merge to `main` | `supabase/migrations/`, `CONTRIBUTING.md` |
| Accounts and relations | Athlete, parent, coach, admin, development coach; guardian approval for minors; scoped, revocable consent grants; verified college coaches (365 days) | `…000200`–`…000500`, `src/lib/auth/`, `src/lib/consent/` |
| Assessment | Built, **switched off** (site variable `NEXT_PUBLIC_ASSESSMENT_ENABLED` and a database switch). Hitting and pitching protocols, 30 metrics (14 anchored rubrics), the four hitting pillars SeamState uses (Load & Timing, Barrel Delivery, Lower-Body Contribution, Impact & Output), evidence categories, frozen report revisions, Film Room, rules-based training plans, progress, development coach connections, sharing published reports with a verified college coach | `docs/assessment.md`, `src/lib/assessment/`, `src/app/(app)/assessment/` |
| Capture context already modelled | Drill type (`tee`, `front_toss`, `overhand_bp`, `machine`, `live_bp`, `game`), batting side, camera view (`side_facing`, `side_behind`, `front_on`, `rear`, `overhead`), timing basis (real time, slow motion with factor, unknown), age band (never the date of birth) | `src/lib/assessment/catalog/context.ts`, `public.assessments`, `public.assessment_media` |
| Video | Private bucket `assessment-media`, signed one-time upload, ≤ 200 MB, mp4/mov/webm, signed 15-minute playback links, deletion checked by the database. Video switch **off** pending legal review (F23, L9). **Nothing is transcoded, analysed or sent to an outside service** (F23 as decided) | `src/app/(app)/assessment/media-actions.ts`, `src/lib/assessment/server/storage.ts` |
| Film Room | Frame stepping, playback speed, event markers (`load_start`, `foot_contact`, `swing_start`, `contact`, `finish`), notes, drawings, side-by-side comparison aligned on a marker | `src/app/(app)/assessment/film/` |
| 9-Zone Hitting | Built from the founder's workbook (SHA-256 recorded): 9 zones, 39 drills, 9 stages, 5 pairings, 49 constraints; session builder, live tracker with predeclared assignments, review, development path | `docs/assessment.md` §10, `src/lib/assessment/zones/`, `data/zone-hitting/` |
| Drills | 18 written Assessment drills + 39 workbook drills, **not yet reviewed by a qualified coach** (F26, F27) | `src/lib/assessment/catalog/drills.ts`, `src/lib/assessment/zones/content-v1.json` |
| Background jobs | None for media. Supabase `pg_cron` is used for daily maintenance only | README |
| Workers, media processing, pose models | **None** | — |
| Model providers | **None.** No API key, SDK or environment variable for any language or vision model | `.env.example` |
| Existing SeamState code | **None in this repository.** No other SeamState repository is connected to this project | — |
| Tests | Vitest unit and contract tests, plain-SQL database security suite (PostgreSQL 16/17 and a real Supabase stack), concurrency scenarios, Playwright end to end with axe, all in CI | `.github/workflows/ci.yml` |

Reference products (public pages read 2026-10-27; marketing claims, **not verified**, not inherited):

| Product | Public claims | Not stated publicly |
| --- | --- | --- |
| GameRun (gamerun.ai/baseball) | Phone or any camera; AI report "within 2 minutes"; 1–5 component ratings; overall "Mechanics Grade" on 80; strengths, areas to improve, three drills; PDF | Camera angle or frame-rate requirements, method, accuracy or validation, human review |
| Maven (mavenbaseball.com/science, /app) | 90-minute in-lab assessment with markerless motion capture (Theia3D), force plates, pressure mapping, high-speed cameras, HitTrax; four pillars; 0–80+ scale; benchmarks against "3,000+ players"; app with Film Room, drills, trends, 90-day check-ins, human coach messaging | Validation or accuracy, how scores are calculated; the app pages do not claim AI analysis |

What SeamState takes from them is the shape of a useful workflow (capture → evidence-linked findings → drill →
reassessment). It does not copy their code, wording, scales or formulas, and it does not adopt their claims. Maven's
lab measurements need lab equipment; a phone clip cannot reproduce them, and SeamState says so.

## 2. Reuse versus new build

| Need | Decision | Why |
| --- | --- | --- |
| Accounts, athletes, guardians, development coaches, college coach sharing | **Reuse** unchanged | One identity, one consent model. College coaches keep seeing only published reports an athlete shared, never clips or SeamState working data |
| Capture session | **Reuse** `assessments` (protocol `hitting-video`) as the session; **new** `seamstate_captures` row per clip for setting-specific context | Context fields already exist and are tested; setting-specific fields (tee location, toss announced, coach BP vs live, machine setting as entered) are new |
| Clip storage and upload | **Reuse** `assessment_media`, bucket, signed uploads and deletion; **add** content hash and decoded-media inspection | Already private, rate-limited and deletion-safe |
| Pillars and rubric conversion | **Reuse** the four hitting pillars, `25 × (rating − 1)`, missing ≠ zero, pillar coverage rule | Identical to what the brief asks for; one scoring system |
| Event types | **Reuse** Film Room's event names; AI-detected events are stored separately and can be accepted as markers | Film Room already seeks, aligns and compares on these |
| Film Room, "Show me" | **Extend** with deep links to a time, evidence thumbnails and an overlay drawn from stored landmarks | No second player |
| Training plans, logs, reassessment | **Reuse**; add rules that map a SeamState finding to drill IDs | Plans are already rule-based and auditable |
| 9-Zone Hitting | **Reuse**; findings can suggest a focused round; zone advice only when location is known (manual label) | Already task-aware |
| Media inspection, pose tracking, segmentation, features, evidence frames | **New:** small worker service (§4) | Cannot run inside a Vercel request or Supabase Edge Function reliably |
| Interpretation (multimodal model) | **New:** server-side call from the app, after the worker (§5) | Keeps prompts, catalog, validation and the API key in one TypeScript codebase with the existing domain rules |
| Analysis schema, mechanic catalog, eligibility, evidence grades, output validator, drill mapping | **New** framework-free modules in `src/lib/seamstate/` with unit tests | Same pattern as `src/lib/assessment/` |
| Analyses, findings, reviews | **New** tables (§3) | Immutable revisions with provenance |

## 3. Data model and job architecture

New migration(s), following every rule in `CONTRIBUTING.md` (RLS on, privileges revoked, writes only through checked
functions, audits that record a change and never the value, race tests for check-then-write).

| Table | Holds |
| --- | --- |
| `seamstate_captures` | One clip's context: assessment, media, athlete, setting (`tee`/`front_toss`/`overhand_bp`/`machine`), setting fields (validated by a versioned schema), batting side (confirmed by the user, never guessed from pixels), camera view, optional complementary-view link, capture protocol version |
| `seamstate_media_inspections` | Decoded facts about a clip: SHA-256, container, codec, width, height, rotation, display aspect, nominal and measured frame rate, variable-frame-rate flag, frame count, duration, timing basis and slow-motion factor as entered, inspector version |
| `seamstate_jobs` | One analysis request: capture, status (`queued`, `preprocessing`, `analyzing`, `needs_input`, `complete`, `partial`, `failed`, `cancelled`), idempotency key (unique per requester), pipeline version, current attempt, failure kind (`service` vs `footage`), cancelled/deleted flags, requested by |
| `seamstate_job_attempts` | Attempt number, worker version, stage reached, per-stage timings and frame counts (no media, no prompt text), error code |
| `seamstate_analyses` | Immutable revision: job, revision number, parent revision, cause (`initial`, `correction`, `reanalysis`), pipeline/model/catalog/policy versions, quality summary, unavailable items, scoring snapshot |
| `seamstate_subject_tracks` | Candidate people and the selected athlete track (who selected it: system or user) |
| `seamstate_swings` | Per-swing boundaries, assessable flag and reason |
| `seamstate_events` | Event type, frame index and time, uncertainty interval, method (`pose_rule`, `model`, `human`), evidence quality, review state |
| `seamstate_evidence_frames` | Decoded frame index, presentation time, storage path of the extracted still, swing, tracking state |
| `seamstate_features` | Feature key, value, unit, provenance category (`image_plane`, `video_estimate`), method version, swing, inputs and limits |
| `seamstate_findings` | Mechanic key, category (`strength`, `adjustment`, `neutral`, `unable_to_assess`), pillar, observation, interpretation, suggested experiment, reassessment evidence, evidence references, eligible and observed swing counts, evidence grade and reason, limitations and alternative explanations, cue, drill IDs, review status |
| `seamstate_reviews` | Append-only review and correction events (approve, reject, edit wording, correct an event, boundary or subject). Corrections that change calculations create a new analysis revision; the original AI result is never edited |

Large data (per-frame landmarks, stills) lives in a new private bucket `seamstate-artifacts`, path
`athlete/job/attempt/…`, readable only through the same relation checks as clips. Deleting a clip or a draft deletes its
artifacts; a cancelled or deleted job refuses late callbacks.

Consent: a new consent scope `seamstate_external_analysis` (athlete; a linked guardian's approval for under-18s), shown
before the first analysis with the provider named. It is separate from any permission to reuse footage for model
training, which SeamState does not request.

### Job flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as App (Vercel)
  participant D as Supabase (DB + Storage)
  participant W as Worker (container)
  participant M as Model provider
  B->>A: upload clip (signed link), confirm context
  A->>D: create job (idempotency key, consent and relation checked)
  A->>W: dispatch (HMAC-signed, job + attempt id, signed read link, signed artifact upload links)
  W->>W: inspect, prepare, track, segment, extract, pick evidence frames
  W->>D: upload landmarks and stills via the signed links (no database credentials)
  W->>A: callback (HMAC-signed, attempt id, features, events, frame index)
  A->>D: record stage results (stale attempt or cancelled job refused)
  A->>M: evidence packet (ordered stills, timestamps, context, visibility, features)
  M-->>A: structured observations
  A->>A: validate (schema, evidence exists, claim limits, catalog, contradictions)
  A->>D: save immutable analysis revision
  B->>A: poll status (real stage names, no timer)
```

The worker holds no database or provider credentials: it receives signed links for exactly one clip and its artifact
paths, and answers with a signed callback. A Vercel cron sweeper re-dispatches attempts that stopped reporting (at most
three attempts, with backoff) and marks the job `failed` with failure kind `service`, never as a footage problem.

## 4. Worker and inference pipeline

Python 3.12 container: `ffprobe`/`ffmpeg` for inspection and frame decoding, MediaPipe Pose Landmarker (Tasks API,
`mediapipe` on PyPI, Apache-2.0; model bundle licence and version to be pinned and recorded at build) on CPU, numpy.
No GPU.

| Stage | Worker does | Never |
| --- | --- | --- |
| Inspect | Read real metadata and presentation timestamps; measure actual frame rate and variable frame rate; rotation; check the file signature matches its type | Trust the filename or container claims over decoded data |
| Prepare | Decode analysis frames at source timing (no interpolation); keep a source-to-derivative time map; make a playback-friendly copy only if the browser cannot play the original | Use generated frames as evidence |
| Select athlete | Detect up to 4 people; track by position and size; propose the batter; ask the user to tap the athlete when more than one candidate is plausible (`needs_input`) | Silently switch to the pitcher or a coach |
| Segment | Find candidate swings from hand and hip motion in the image plane; mark waggles and pauses; user can correct boundaries | Invent a swing when none is found (`No swing detected`) |
| Track | Landmarks with per-point visibility; tracking gaps kept as gaps | Fill an occluded event and report it as certain |
| Extract | Only permitted image-plane and temporal features (§6), normalised by body size in the frame, documented smoothing | Bat speed, exit velocity, forces, torque, true 3D rotation |
| Evidence frames | Pick stills around each event (before, at, after) with exact frame index and time; crop to the athlete | Send the whole video or unrelated people |

Quality gates (per clip and per finding): athlete size in frame, feet/hands/torso visibility, blur, lighting, camera
motion, measured frame rate, movement coverage (setup through finish), number of people, swing detected, contact
locatable. Results: suitable, limited (lists what can and cannot be assessed), retake recommended (one specific reason,
e.g. "Keep both feet visible through the finish"), no swing detected, subject selection required. Capture quality,
tracking reliability, evidence strength and athlete performance are reported separately.

## 5. Interpretation, validation and cost

Provider: **Anthropic Claude API** (vision input, structured JSON output), called from the app server with a key held
only in Vercel's server environment. The Claude Max subscription used for development does not pay for the site's
analysis calls; the site needs its own API account, key and spend limit.

The model receives: capture setting and drill, view and batting side, which events are known, estimated or missing,
which landmarks are usable, the computed features, ordered stills with timestamps, what it is allowed to claim, what
counts as an unsupported inference, and that "no issue found" is a valid answer. It returns observations against the
mechanic catalog only. It does not produce numbers, benchmarks, confidence percentages or scores; scores and evidence
grades are computed by versioned code. Filenames, captions, scene text and the model's own output are treated as
untrusted data.

The validator rejects or downgrades (§17 of the brief): out-of-range or nonexistent frames and times; unknown metrics or
units; repeated patterns from one swing; pitch recognition on tee work; claims about untracked or occluded anatomy;
contradictory findings for the same event; any bat or ball speed; 2D-as-3D statements; drill IDs not in the catalog;
medical or recruiting predictions; numbers not reproducible from the rules. One bounded retry, then a partial result.

Model choice and cost (list prices verified in Anthropic's current model table, 2026-10-27; to be re-measured with real
token counts in Milestone 2):

| Model | Price per million tokens (input / output) | Estimated cost per analysed clip* |
| --- | --- | --- |
| Claude Opus 5.5 (`claude-opus-5-5`) | $4 / $20 | about $0.25–$0.45 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 / $10 | about $0.13–$0.23 |

\* Assumes about 24 cropped stills (~1,300 tokens each), ~6,000 tokens of context and features, and 4,000–8,000 output
tokens including reasoning. Recommendation: start the pilot on Opus 5.5 and let the evaluation harness (§9) decide
whether Sonnet 5.5 matches it on reviewed clips.

Worker compute on a pay-per-use container host is roughly a cent or less per clip (about a minute of 2 CPUs) and costs
nothing while idle. Spend controls: per-person daily analysis limit, a site-wide monthly cap counted in the database
(analysis pauses with an honest message when reached), and a hard monthly limit set in the provider's console.

Missing credentials: the job ends in `failed` with failure kind `service` and the page says "Swing analysis is not
available yet" with the exact configuration missing (for administrators). No synthetic output is ever produced.

## 6. Mechanic catalog v1 (proposed; every entry needs coach review before opening)

Start small and reliable. Bat-barrel path is **unavailable** in v1: the pose model tracks the body, not the bat.

| Key | Pillar | View | Needs | Min. swings | Method | Must stay unclaimed |
| --- | --- | --- | --- | --- | --- | --- |
| `setup_base` | Lower-Body | side_facing, front_on | both feet visible at setup | 1 (3 for repeatability) | Stance width ÷ hip width, image plane | Weight distribution |
| `load_pattern` | Load & Timing | side_facing | hands and back hip visible | 1 | Onset and direction of hand/hip movement before forward swing | Timing "against the pitch" on tee |
| `head_movement` | Load & Timing | side_facing (in-plane), front_on (lateral) | head and torso tracked through contact interval | 1 | Head displacement ÷ torso length, stated phase | Eye tracking, pitch recognition |
| `stride` | Lower-Body | side_facing (length), front_on/rear (direction) | lead foot visible | 1 | Presence, length ÷ stance, visible-plane direction | A no-stride swing is valid, not a flaw |
| `foot_contact_to_swing` | Load & Timing | side_facing | lead-foot contact and forward-swing onset events | 1 (3 for timing variation) | Frames between events; milliseconds only with measured real-time ≥ 60 fps | Millisecond values from slow-motion of unknown factor |
| `posture_change` | Lower-Body | side_facing | torso tracked setup → contact | 1 | Torso angle change in the camera plane; pitch height noted when known | Low-pitch posture is not automatically an error |
| `lead_knee` | Lower-Body | side_facing | lead hip, knee, ankle visible | 1 | Knee angle change in the image plane | Force or "energy transfer" |
| `hands_to_torso` | Barrel Delivery | side_facing | wrists and shoulders tracked | 1 | Hand path relative to torso in the image plane | Barrel path, bat speed, attack angle |
| `contact_interval` | Impact & Output | side_facing | visible contact region | 1 | Interval or unknown; visual estimate | Exact contact frame when unresolvable; exit velocity |
| `finish_support` | Lower-Body | any full-body view | feet and torso visible through finish | 1 | Base maintained, steps out, balance in the visible sequence | One-handed finish is not a flaw |
| `repeatability` | Across pillars | same view | ≥ 3 assessable comparable swings | 3 | "Observed in n of m assessable swings", calculated | Any pattern from one swing |

Each entry in code also records supported settings, known failure conditions, allowed source methods and evaluation
status (`not_evaluated` until §9 has results).

Capture settings change interpretation: tee (no pitch recognition, chase or timing against a ball), front toss (timing
only if release/flight/contact are visible; location announced or not), overhand (coach BP vs live, known vs mixed
pitches; no velocity inferred), machine (setting stored as entered, never as measured; not equivalent to live pitching).
Settings are never pooled into one longitudinal score.

## 7. First end-to-end deliverable (Milestone 2)

One authorized, uploaded side-view tee clip goes through real inspection, real pose tracking, swing segmentation,
features, evidence stills, a real Claude call, validation and a saved analysis, and shows a report: what looks
effective, what to work on next, your next practice (one cue), each finding with "Show me" that opens Film Room at the
supporting moment, and "What this video cannot tell us". Built behind the existing Assessment switches, on a branch,
run against the local Supabase stack and a development worker. Recording in the browser (Milestone 3) and the other
three settings (Milestone 4) follow.

## 8. Acceptance tests (mapped to the brief's scenarios)

| # | Scenario | Test |
| --- | --- | --- |
| A | Tee clip gets footage-specific feedback, no pitch-decision metrics | Real model run on an authorized tee clip; validator unit tests reject recognition/chase/timing-vs-pitch on tee |
| B | Front toss reports only what visible events support | Unit: eligibility by setting and visible events; real run on a front-toss clip |
| C | Overhand and machine keep their differences | Unit: setting-specific eligibility; machine setting stored as `athlete_reported`; comparisons refuse mixed settings |
| D | Poor clip gets specific retake guidance | Worker fixtures: cropped feet, dark, shaky → named retake reason, no mechanics findings |
| E | No swing → no swing findings | Worker fixture (person standing) and validator test |
| F | One swing is never "a pattern" | Validator unit test |
| G | "Show me" opens the supporting moment | Playwright: click a finding, Film Room seeks to the stored time |
| H | Correction creates an auditable revision | Database test: correction → new revision, original unchanged, audit row |
| I | Approved finding maps to a catalog drill | Unit: mapping rules; validator rejects unknown drill IDs |
| J | Follow-up compares compatible observations and names changed conditions | Unit: comparability rules (setting, view, fps class, catalog version) |
| K | Other athletes and unauthorized recruiters get nothing | Database tests for every table and artifact path; Playwright cross-athlete 404 |
| L | Missing model credentials → honest blocked state | Integration test with no key: job `failed`/`service`, no findings |

Engineering tests also cover malformed uploads, unsupported codecs, duplicate submissions (idempotency), worker crash
and bounded retry, provider timeout and malformed output, stale and late callbacks after cancel/delete, missing
landmarks, missing vs zero scores, historical model compatibility and regressions in existing features. Recorded
provider responses are used only as labelled test fixtures; real model-backed runs are also required. Desktop viewport
emulation is not mobile validation: iOS Safari and Android Chrome checks on real phones are listed as pending until done.

## 9. Evaluation (accuracy is not established by software tests)

An evaluation harness runs the pipeline on authorized, coach-annotated clips (both batting sides, all four settings,
different views and phones, no-stride hitters, poor light, occlusion, no swing, multiple people, missing contact,
variable frame rate and slow motion, single and multiple swings), split by athlete. Measures per feature: event-timing
error, tracking coverage, unsupported-finding rate, precision and recall per defined finding, agreement with reviewed
labels, appropriate abstention, repeatability across runs, evidence-link correctness, latency and cost. Release
thresholds are written down before the first run. Until then SeamState is labelled an operational prototype, not a
validated product.

## 10. Copy and identity

"SeamState" appears prominently inside Assessment with the descriptor "Base Recruits Assessment". Preferred phrases:
"What looks effective", "Possible adjustments", "See the evidence", "Your next practice", "Compare your progress". No
diagnoses, one-ideal-swing statements, guaranteed gains, invented credentials, outcomes, testimonials, accuracy figures,
partnerships or athlete counts. The brief also bans the pricing adjective spelled F-R-E-E in customer copy; the merged
site copy (pull request #18) uses it for built discovery features, so that conflict is a founder decision (F35), and
SeamState pages simply do not use the word.

## 11. Genuine missing dependencies

| # | Needed | From | Blocks |
| --- | --- | --- | --- |
| 1 | Reverse F23's "never sent to an analysis service" for SeamState, with consent wording and counsel's review of minors' footage going to the provider (L9, L12) | Founder + counsel | Any real analysis of a real athlete |
| 2 | Anthropic API account, key in Vercel, monthly spend limit | Founder | Milestone 2's real model run |
| 3 | Worker host account (recommended: Google Cloud Run; alternatives Railway or Fly.io) | Founder | Milestone 2 in a deployed environment (local development works without it) |
| 4 | Authorized swing clips: 3–5 to start (side view, tee), later about 40+ across settings for evaluation, with written permission | Founder | Milestone 2 real run; §9 |
| 5 | A qualified hitting coach to annotate evaluation clips and review the mechanic catalog and drills (F26, F27) | Founder | Opening; validated labels |
| 6 | Real phones (iPhone Safari, Android Chrome) for capture testing | Founder | Milestone 3 sign-off |
| 7 | Supabase Storage upload limit ≥ 200 MB | Founder | Large clips |
