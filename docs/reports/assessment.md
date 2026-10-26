# Base Recruits Assessment — Engineering Handoff

Date: 2026-10-26 · Branch `feature/assessment`, draft pull request #15 · **Not merged, not deployed, switched off.**
Reference: `docs/assessment.md`. Decisions: `docs/decisions.md` F21–F26, L9–L11.

## Summary

A hitting and pitching assessment module inside Base Recruits, reached from a new **Assessment** tab, with the
promise "Understand your game, see the evidence, and know what to work on next."

- **Evidence first.** Every value says where it came from (sensor with device, video estimate, coach or self
  observation, derived calculation), how it was entered, and whether it was reviewed. Missing evidence is never a zero.
- **Transparent scoring.** Anchored 1–5 rubrics (`25 × (rating − 1)`), coach-set targets, and reference percentiles only
  from an approved matching dataset (none exist). Eight original pillars, four per discipline; no overall grade.
- **Frozen reports.** Publishing freezes a snapshot; corrections make a new revision with the history kept. Print or
  save as PDF.
- **Film Room.** Frame stepping, slow playback, event markers per repetition, notes, drawings, side-by-side comparison
  with alignment, and timing estimates from two markers.
- **What to work on next.** Rules-based findings (no language model) choose up to three focus areas and drills from an
  18-drill original library; plans can be edited, approved by a development coach, logged and reassessed.
- **People.** Athletes, linked parents or guardians (when the athlete shares), development coaches (athlete code +
  athlete approval + guardian approval under 18), and verified college coaches (shared published reports only).

## Built vs. the brief

| Brief item | Status |
| --- | --- |
| Assessment tab inside the existing app, one account system | Done (site and app headers, footer, onboarding/sign-up option for development coaches, all behind the switch) |
| Eight original pillars, metric catalog, protocols | Done: 30 metrics, 14 anchored rubrics, 4 protocols (video + coach review, video + measured data, per discipline). Lab mode listed as unavailable |
| Evidence labels, entry methods, quality states with reasons | Done |
| Scoring methods and pillar aggregation without zeros | Done in SQL (authoritative) and TypeScript (mirror), proven equal by a contract test |
| Frozen reports, revisions, baselines, coach targets | Done |
| No invented benchmarks | Done: none shipped; admin loading requires ≥ 30 distinct real athletes and an exact match |
| Film Room | Done (single-camera; no pose estimation) |
| Manual entry and generic CSV import | Done (unit conversion, row-level reasons, duplicate detection within and across files) |
| ≥ 12 original drills, rules-based recommendations, plans, logs | Done: 18 drills; pitching drills never add throws |
| Reassessment and progress comparison | Done; comparisons only between results captured the same way, differences flagged |
| Server-side permissions | Done: row-level security, checked functions, storage policies; tested per relation |
| Accessibility | Automated WCAG 2.2 AA checks on every Assessment page in the end-to-end run; keyboard alternatives except freehand drawing |
| Billing, public sharing, production deployment, AI video analysis | Not built, by instruction |

## Evidence

| Check | Result |
| --- | --- |
| CI run (commit, all jobs) | _filled in below after the final run_ |
| Database security suite (PostgreSQL 16 and 17, plain and on the real Supabase stack) | 715 assertions including Assessment suites 015–018 |
| Concurrency | 15 scenarios, 3 for Assessment |
| Unit and contract tests | Assessment unit suites and the catalog/engine contract test |
| End to end | `tests/e2e/assessment.spec.ts`: full hitting self-assessment (upload, measurements, Film Room timing and drawing, ratings, preview, publish, plan, log, reassessment), cross-athlete 404, development coach connect/approve/end, minor's guardian gate, public pages, WCAG checks |

Limits: CI uses the Supabase CLI's local stack (Storage included for the end-to-end job), not the hosted project; no
manual screen-reader session; video was tested with a 3-second synthetic test pattern, not real swing footage.

## Before opening (founder)

1. **Who the first development coaches are (F22).** The account type is open to any adult. For a pilot I recommend a
   short, named list (for example EA Baseball / ZT NY Westchester staff, confirmed with Jonathan) and deciding whether
   they are vetted like college coaches.
2. **Video legal review (L9, F23).** Keep uploads off until consent wording, retention and deletion are settled.
3. **Content review (F26).** A qualified hitting and pitching coach reviews every drill and rubric anchor.
4. **Wording review (L11)** of the public explainer and report language, and of sharing reports with college coaches (F25).
5. **Storage limit.** Raise the Supabase upload limit to 200 MB before turning video on.

## Merging and deploying (when authorized)

Merging to `main` applies six migrations to production automatically. They are additive except that three existing
functions are replaced: `complete_onboarding` (adds the development coach type, refused while the switch is off),
`grant_consent` (development coaches are eligible only with an open link) and `guardian_consent_requests` (now also
returns who receives access; the parent page reads it). Two enum types gain values. Everything stays off until
`NEXT_PUBLIC_ASSESSMENT_ENABLED=true` is set and the admin switch is turned on (`docs/assessment.md` § 7). Review the
pull request's database diff before merging; do not merge during launch week.

## Known gaps and risks

- Self-service account deletion is not built site-wide; when it is, it must also delete the athlete's clip files.
- Development coaches self-select; the guardian approval is the only check before an unknown adult sees a minor's
  clips (F22, L10).
- Drawings need a pointer (mouse, pen or touch); everything else works from the keyboard.
- Timing from video is only as precise as the clip's frame rate and needs the playback speed to be known.
- Recommendations depend on ratings; a self-assessment with optimistic ratings produces few priorities.

## Next steps

1. Founder decisions above, then a closed pilot with a handful of athletes and one or two development coaches.
2. Measure: assessments started vs. published, time to publish, plans created, sessions logged, reassessments done.
3. Only then: device integrations (radar/tracking exports by vendor), reference datasets from consented pilot data, and
   any paid packaging (F19 rules apply).
