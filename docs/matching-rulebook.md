# School Suggestions — Rulebook

The written rules behind Base Recruits' school suggestions, approved by the founder on 2026-10-30 and 2026-10-31
(decisions F15, F43–F47 in `docs/decisions.md`). Every rule here is implemented in `src/lib/matching/` and covered by a test. Changing a
rule means changing this page, the code and its version number in the same pull request.

| Rule set | Code | Version |
| --- | --- | --- |
| Score comparison (unchanged) | `rules.ts` | `RULES_VERSION` 2026-10-23.1 |
| Academic fit labels | `fit.ts` | `FIT_RULES_VERSION` 2026-10-30.1 |
| Eligibility to compete | `eligibility.ts` | `ELIGIBILITY_RULES_VERSION` 2026-10-30.1 |
| Combined suggestions | `suggestions.ts` | `SUGGESTION_RULES_VERSION` 2026-10-30.1 |
| Athletic benchmarks and the in-range rule | `athletic.ts` | `PUBLIC_BENCHMARKS` public-2026-10-31 (Paul's standards replace it when loaded) |

## 1. What goes in

- **Academics the player enters:** SAT section scores or ACT composite, whether they plan to send scores, GPA with its
  scale and type (weighted or unweighted), first-year or transfer, entry year, and optionally their NCAA Division I and
  Division II core-course GPAs.
- **School data already in the registry:** each program's division, state, campus setting, published cost of attendance
  (with its year), the score ranges the school reported for a past entering class, and any current testing policy an
  administrator checked on the school's official page.
- **The player's filters:** a budget (published cost of attendance, never net price), states, campus settings and levels.
- **The athletic result per level:** in range, below, or not enough data, from the player's position and baseball
  numbers compared with per-level benchmarks (§4a). Today the benchmarks are public ones with their sources; Paul's
  per-level standards replace them when they are loaded (F44). Base Recruits does not invent athletic numbers.

Levels are NCAA Division I, NCAA Division II, NCAA Division III, NAIA and junior college (NJCAA, CCCAA, NWAC). Programs in
other associations (USCAA, NCCAA, independents, divisions still reported as "Other") are not suggested by level yet and
are counted as set aside.

## 2. Academic fit (per school)

Taken only from the existing score comparison; no new cut-offs.

| Label | When |
| --- | --- |
| Academic fit | Every score compared is within or above the school's reported range, and no checked requirement is unmet |
| Academic stretch | Some compared scores are below a reported range |
| Academic reach | Every compared score is below the reported ranges, or a checked current requirement is not met (a required test the player won't send), for first-year and transfer applicants alike |
| Academics not compared | Nothing could be compared: no scores entered or sent, test-blind, no reported ranges, or a transfer applicant (first-year ranges are never applied to transfers) |

Reported ranges are the middle 50% of a past entering class as a whole, not recruited athletes; that caveat is shown with
every comparison.

## 3. Eligibility to compete (per level)

Schools don't report GPA in the federal data, so GPA is checked against each level's published minimum **to compete as
an entering freshman**. This is never an admission check.

| Level | Rule checked | Source (checked 2026-10-30) |
| --- | --- | --- |
| NCAA Division I | Core-course GPA 2.3 to compete; 2.0 up to 2.3 is the academic-redshirt range (practice and aid, no competition in year one). No test score | NCAA legislative database, Proposal 2022-34 (adopted 2023-01-11, effective for students first enrolling on or after 2023-08-01) |
| NCAA Division II | Core-course GPA 2.2. No test score | NCAA news, DII 2023 Convention preview |
| NCAA Division III | No association-wide minimum; each school sets its own | NCAA initial-eligibility page |
| NAIA | Final high school GPA 2.3 alone, or two of three: GPA 2.0, top half of the graduating class, ACT 18 / SAT 970 (Reading and Writing + Math) | NAIA Legislative Interpretations, "Basics of Freshman Eligibility" (cites the 2025-26 NAIA Official Handbook) |
| Junior college | Not checked: a current academic minimum has not been confirmed | — |

How the check reads the player's numbers:

- **Scope:** only GPA (and, for the NAIA, test scores) is checked. Core-course counts, graduation and amateurism are
  confirmed by the NCAA or NAIA Eligibility Center, and every result says so.
- **NCAA:** the core-course GPA is calculated separately for Division I and Division II, so each is entered and used only
  for its own division. With it, the result is stated plainly (meets / below). With only an overall GPA, the result is
  "likely meets" or "may be below".
- Only **unweighted** GPAs on a 4.0 scale are compared. A weighted GPA, a GPA whose type wasn't stated, or another scale is
  "not checked", never converted.
- **NAIA:** test scores count only if the player says they will send them ("undecided" doesn't count yet). Class rank
  isn't asked, so a result that turns on it says "depends on your class rank or a test score". Without a comparable GPA
  the NAIA result is "not checked" whatever the test score, so a better score can never make a result worse. "Below"
  means not eligible in the first term; the NAIA's later route (meet one criterion, then pass 12 credit hours with a C
  or better in the first term) is explained in the wording.
- **Transfers:** freshman rules aren't applied, and transfer rules aren't checked: "not checked", never "no minimum".
- Results use the player's current numbers; eligibility is decided on the final high school record.

**Before launch:** the NCAA Eligibility Center pages could not be opened from the build environment on 2026-10-30.
A person should open the NCAA's Division I and Division II initial-eligibility pages and confirm:

- 2.3 and 2.2 are still current for students entering in fall 2027;
- the Division II proposal was adopted, and its effective date (the source used is a pre-vote preview);
- whether Division II still has a partial-qualifier range (believed to be 2.0 up to 2.2) that should be named the way
  Division I's academic redshirt is.

Re-check every rule each autumn.

## 4. Grouping (per school)

Schools at levels where the player is **below** the athletic standard are set aside. Schools at levels with **no
athletic result yet** are shown under Not enough data.

| Group | Rule |
| --- | --- |
| Strong fit | Athletically in range, and Academic fit |
| Possible fit | Athletically in range, and Academic stretch |
| Reach | Athletically in range, and Academic reach |
| Not enough data | No athletic result for the level, or academics not compared (with no known eligibility barrier). Always shown, never hidden |

Eligibility adjusts the group, in this order:

1. No athletic result for the level → **Not enough data**, whatever the academics; any eligibility barrier is still named.
2. Athletically in range and GPA below (or likely below) the level's academic minimum to compete → **Reach**, even when
   the scores weren't compared, with that reason shown.
3. Eligibility that depends on class rank or a test score → a Strong fit becomes a **Possible fit**, with that reason
   shown.
4. A level with no checked minimum, or no association minimum, changes nothing.

Filters remove only schools whose **reported** value is outside the player's choice. A school with no reported cost,
state or setting stays in the list and says so. Each set-aside school is counted once, under the first reason in this
order: level not suggested, level not chosen, outside chosen states, outside chosen settings, over budget, athletically
below the level. The player's own choices come first, so "athletically below" counts only schools the player would
otherwise have seen.

Within each group, schools are listed by name; the page may re-sort by published cost (unreported costs last). There is
no hidden score.

## 4a. Athletic level (per level)

**Inputs.** The player's main position and their best numbers, self-reported and labelled as such:

| Position | Compared on |
| --- | --- |
| Pitcher | Top fastball velocity |
| Catcher | Best exit velocity, pop time to second base, catcher throwing velocity |
| First base, third base | Best exit velocity, 60-yard dash (corner infield), infield throwing velocity |
| Second base, shortstop | Best exit velocity, 60-yard dash (middle infield), infield throwing velocity |
| Outfield | Best exit velocity, 60-yard dash (outfield), outfield throwing velocity |

**Benchmarks (public set, checked 2026-10-31).** Two sources, each labelled on the page:

- **D1, D2, D3:** BaseballPath, "What Numbers Do You Need to Play D1, D2, or D3 Baseball?" (published 2026-06-08, updated
  2026-10-20). Each player's best showcase number on their Prep Baseball Report profile, classes of 2024–26, grouped by
  the level they committed to. Measured, but sample sizes aren't published and it's a commercial site, so it is re-checked
  before launch and each autumn. D1 uses its "Other D1" (non–Power 4) figures, because the registry doesn't separate
  Power 4.
- **NAIA and junior college:** NCSA, "College Baseball Recruiting Guidelines and Measurables" (published 2018-08-17,
  modified 2026-03-16). Guidelines with no published data; NAIA shares NCSA's D3 column (decision F47). Shown as
  "guideline", with the wording as published.

**The typical-range rule (F46).** For each metric and level there is a floor the player must reach (at or above; at or
under for times):

| How the floor is set | When |
| --- | --- |
| Low end of the typical range (average − 1 standard deviation) | The source gives a range: fastball and exit velocity, D1–D3 |
| Average of the next level down | The source gives only an average (60-yard, throwing velocities, pop time) at D1 and D2 |
| The level's own average | D3 metrics with only an average, because no lower level is measured |
| The guideline itself (its minimum, or the slower/lower end of its range) | NAIA and junior college |

A level is **in range** when the player meets the floor on at least half of the metrics compared at that level, and
**below** otherwise. It is **not enough data** when fewer than the position's minimum are compared: one for pitchers, two
for everyone else. A metric is compared only when the player entered it and the level has a floor for it; nothing is
estimated. Known consequences:

- Catchers can't be placed at NAIA or junior college (only pop time has a guideline there).
- Corner infielders are compared on the 60 only at D3, the one level the source reports it for.
- NCSA's NAIA 60-yard guideline (6.9–7.0) is stricter than the measured D3 average (7.13–7.29); both are shown as published.

## 5. Guarantees

- **Same data, same list.** The engine has no plan, subscription or payment input. What a family pays never changes its
  suggestions, groups or order (no pay-to-win).
- **Missing is never zero.** Missing data never excludes a school or counts against a player, and a better score never
  moves a school to a lower group.
- **Explained.** Every suggestion carries its reasons and the versions of every rule set that produced it.
- **No outcome claims.** Wording never promises admission, a roster spot, a scholarship or a coach's interest.
- **No numeric fit score.** Results are named groups and labels (Strong fit, Possible fit, Reach; Academic fit, stretch,
  reach), never a number such as 87/100 or a percentage (founder decision, 2026-10-30).

## 6. On each school page ("Your fit")

Every active program's page has a **Your fit** section (`src/components/matching/school-fit-panel.tsx`, rules in
`src/lib/matching/school-fit.ts`). It applies exactly the rules above to that one school:

- The player enters their numbers once. They are compared in the browser and remembered **on this device only**
  (`src/lib/matching/player-store.ts`, decision F45): never sent to Base Recruits, never put in a link, and removed by
  "Forget my numbers". Stored values are validated again every time they are used.
- It shows the overall group, then the three parts: athletic level (each number against the level's floor, with the
  floor's basis, the source and its date), academics (with the school's reported ranges next to the player's scores) and
  the academic minimum to compete, each with its reasons.
- When the player hasn't entered a position and numbers, or not enough can be compared at this level, the page leads with
  the two results that can be worked out (the academic result and the academic minimum to compete) and says what's
  missing. The engine's group is still Not enough data; only the presentation leads with what is known.
- If the player is below the level's typical range, the page says the school isn't in their suggestions (the list sets it
  aside) and still shows every comparison.
- Schools outside the five levels show the academic comparison only.

## 7. Known gaps (next steps)

- **Paul's standards:** loaded as a "partner" benchmark set in the same shape as `PUBLIC_BENCHMARKS` once his sample,
  measurement setup and "in range" rule arrive; until then the public set is used.
- **Re-check the public sources** before launch and each autumn: BaseballPath's figures changed during 2026.
- **Coverage:** in the 2024-25 registry snapshot 739 of 1,670 programs report SAT ranges. Schools without ranges (many
  test-optional four-year schools and most junior colleges) fall under "academics not compared".
- **Open admission:** junior colleges usually report no admissions figures because admission is open. Loading the federal
  open-admissions flag from College Scorecard would let them be treated as an academic fit instead of "not compared".
- **Pages:** each school page shows "Your fit" (§6). The full suggestions list page, and the paywall and billing it
  sits behind, are the next build. "Your fit" is open to everyone until the paywall exists (F19).
