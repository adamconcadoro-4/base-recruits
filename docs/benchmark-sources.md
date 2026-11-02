# Benchmark Sources — Record and Change Log

Every outside number the school-suggestion engine uses, recorded **exactly as each source published it** on the date it
was checked. A scheduled task re-reads these sources every month and compares them with this page (see "How changes are
tracked" below). When a source changes, this page and the code change together in one pull request that the founder
approves; nothing changes on the site by itself.

Code that uses these numbers:

- Athletic benchmarks: `PUBLIC_BENCHMARKS` in `src/lib/matching/athletic.ts` (rulebook §4a).
- Power 4 conference members (which D1 schools use the Power 4 benchmarks): `POWER4_MEMBERS` in
  `src/lib/matching/power4.ts` (section D, decision F50).
- Academic minimums to compete: `ELIGIBILITY_RULES` in `src/lib/matching/eligibility.ts` (rulebook §3).

## How changes are tracked

1. **Monthly check (the 1st of each month).** A scheduled task opens every source below, reads the numbers, and compares them with the
   "As published" tables on this page.
2. **No change.** It does nothing else, so a quiet month sends nothing.
3. **A change.** It opens a pull request that does three things:
   - updates the "As published" table;
   - adds a row to the change log at the bottom;
   - if a number the engine uses moved, updates `athletic.ts` or `eligibility.ts`, their version and check date, and the
     rulebook and tests to match.

   The founder reviews and merges it. The task never merges.
4. **A source fails.** If a source can't be opened that month, the task sends the founder a short message and tries
   again the next month. If the page opens but no longer gives the numbers (moved, paywalled, removed), it opens a pull request
   that adds a change-log row saying so. Either way, the numbers in use stay until the founder decides.

## A. BaseballPath — D1, D2, D3 athletic benchmarks

- **Page:** "What Numbers Do You Need to Play D1, D2, or D3 Baseball?", BaseballPath, by Ryan Kolodziejczyk.
  https://www.baseballpath.com/blog/velocity-exit-velo-by-division
- **Page dates:** published 2026-06-08, updated 2026-10-20. The page says its numbers were checked October 2026.
- **What the numbers are:**
  - each player's best recorded showcase number on their Prep Baseball Report profile, high school classes of 2024–26,
    grouped by the level they committed to;
  - one row per player, impossible entries removed;
  - arm and pop time counted only for players at that position;
  - averages and standard deviations per level.
- **Sample size:** not published.
- **Recorded:** 2026-10-31.

**As published**

| Metric | Power 4 | Other D1 | D2 | D3 |
| --- | --- | --- | --- | --- |
| Pitcher top fastball, average (mph) | 91 | 88 | 85 | 82 |
| Pitcher top fastball, typical range (mph) | 87–95 | 85–92 | 81–89 | 78–86 |
| Pitcher fastball, middle of range, average (mph) | 89 | 86 | 83 | 81 |
| Exit velocity, all positions, average (mph) | 97.25 | 94.66 | 92.39 | 90.17 |
| Exit velocity, typical range, average ± 1 SD (mph) | 91–103 | 89–100 | 87–98 | 85–96 |
| Exit velocity, outfield (mph) | 97 | 95 | 93 | 91 |
| Exit velocity, middle infield (mph) | 96 | 93 | 91 | 88 |
| Exit velocity, corner infield (mph) | 99 | 96 | 94 | 92 |
| Exit velocity, catcher (mph) | 97 | 95 | 92 | 90 |
| 60-yard, outfield (s) | 6.83 | 6.91 | 7.02 | 7.13 |
| 60-yard, middle infield (s) | 6.93 | 7.05 | 7.15 | 7.29 |
| 60-yard, corner infield (s) | 7.15 | not given | not given | 7.52 |
| Infield velocity, pooled (mph) | 86 | 84 | 81 | 78 |
| Outfield velocity (mph) | 88 | 86 | 84 | 82 |
| Catcher velocity (mph) | 80 | 78 | 76 | 74 |
| Pop time (s) | 1.97 | 1.99 | 2.04 | 2.09 |

NAIA and junior college are not covered by this page.

Base Recruits uses the Power 4 column for D1 schools in a Power 4 conference (section D), and the "Other D1" column for
every other D1 school.

## B. NCSA — NAIA and junior college athletic guidelines

- **Page:** "College Baseball Recruiting Guidelines and Measurables", NCSA.
  https://www.ncsasports.org/baseball/recruiting-guidelines
- **Page dates:** published 2018-08-17, last modified 2026-03-16.
- **What the numbers are:** guidelines for "what coaches generally look for". No data or method is published. NAIA is
  grouped with D3.
- **Recorded:** 2026-10-31.

**As published** (a dash means the page gives no value)

| Metric | D1 | D2 | D3 / NAIA | JUCO |
| --- | --- | --- | --- | --- |
| Pitcher fastball | 84 mph consistently; up to 95+ | 82 – 90+ mph | 77 – 82 mph | 80 mph consistently |
| 60-yard, middle infield | 6.5–6.8 (third-party verified) | 6.9 or below | 7.0 or below | 7.1 or below |
| 60-yard, center field | below 6.7 | below 6.9 | 6.9 or below | 7.0 or below |
| 60-yard, corner outfield | below 6.8 | below 7.0 | 6.9 or below | 7.0 or below |
| Infield velocity, middle infield | 85–95 mph | low 80s and above from SS | 78+ mph from SS | upper 70s from SS |
| Infield velocity, third base | 85–95 mph | at least 80 mph | – | – |
| Outfield velocity, center field | 87–95+ mph | – | 80+ mph | 78+ mph |
| Outfield velocity, corner outfield | 87+ mph (verified) | low 80s at least | 80+ mph | 78+ mph |
| Pop time | 1.95 and below consistently (verified) | 2.0 and below consistently (verified) | 2.0–2.1 | 2.1 or below |
| Catcher 60, catcher velocity, exit velocity | – | – | – | – |

Base Recruits uses only the D3/NAIA column (for NAIA) and the JUCO column.

## C. Academic minimums to compete (eligibility rules)

These are rules, not benchmarks, but they are outside numbers the engine uses, so they are tracked the same way.

| Rule in use | Source (URL) | Recorded |
| --- | --- | --- |
| NCAA Division I: 2.3 core-course GPA to compete as a freshman; 2.0 up to 2.3 is an academic redshirt; no test score | NCAA legislative database, Proposal 2022-34, adopted 2023-01-11, effective for students first enrolling on or after 2023-08-01. https://web3.ncaa.org/lsdbi/search/proposalView?id=106367 | 2026-10-30 |
| NCAA Division II: 2.2 core-course GPA, 16 core courses; no test score | NCAA, "DII 2023 Convention preview" (a proposal before the vote; adoption and effective date to be confirmed). https://www.ncaa.org/news/media-center-dii-2023-convention-preview-member-schools-to-vote-on-12-proposals/ | 2026-10-30 |
| NCAA Division III: no association-wide minimum | NCAA initial-eligibility requirements. https://www.ncaa.org/eligibility-center/initial-eligibility-requirements/ | 2026-10-30 |
| NAIA: final high school GPA 2.3 alone, or two of three: GPA 2.0, top half of the class, ACT 18 / SAT 970 | NAIA Legislative Interpretations, "Basics of Freshman Eligibility" (cites the 2025-26 NAIA Official Handbook). https://interpretations.naia.org/basics-of-freshman-eligibility/ | 2026-10-30 |
| Junior college: not checked; no confirmed current minimum. The NJCAA announced an academic eligibility clearinghouse with Honest Game in 2026 | https://honestgame.com/njcaa/ | 2026-10-30 |

The NCAA Eligibility Center pages could not be opened from the build environment on 2026-10-30; a person should open them
before launch (rulebook §3).

## D. Power 4 conference members (baseball)

Which D1 schools are compared with BaseballPath's Power 4 column. Membership is for **baseball**: conference members
without a baseball team are not listed. The monthly check opens each page below, counts the baseball teams and compares the
names with this list. A change updates `POWER4_MEMBERS` in `src/lib/matching/power4.ts` (matched by federal unit ID from the
school data) and `POWER4_CHECKED_ON`, in one pull request the founder approves.

| Conference | Teams | Season listed | Page (as read 2026-10-31) |
| --- | --- | --- | --- |
| ACC | 16 | 2026 | "2026 Baseball Standings", https://theacc.com/standings.aspx?path=baseball&year=2026 (the address without `&year=2026` showed 2025) |
| Big Ten | 17 | 2026 | "Big Ten Announces 2026 Baseball Television Schedule", https://bigten.org/base/article/59374/ ("all 17 Big Ten baseball programs", each named) |
| Big 12 | 14 | 2026 | "2026 Baseball Standings", https://www.big12sports.com/standings.aspx?path=baseball&year=2026 (the address without "www" fails) |
| SEC | 16 | 2027 | "2027 SEC baseball schedule announced" (2026-09-08), https://www.secsports.com/news/2026/09/2027-sec-baseball-schedule-announced, gives "all 16 SEC schools"; the standings load by script, so each school was confirmed on its team page, https://www.secsports.com/schedule/baseball/<school> |

**Members as listed**

- **ACC:** Boston College, California, Clemson, Duke, Florida State, Georgia Tech, Louisville, Miami, NC State, North
  Carolina, Notre Dame, Pittsburgh, Stanford, Virginia, Virginia Tech, Wake Forest.
- **Big Ten:** Illinois, Indiana, Iowa, Maryland, Michigan, Michigan State, Minnesota, Nebraska, Northwestern, Ohio State,
  Oregon, Penn State, Purdue, Rutgers, UCLA, USC, Washington.
- **Big 12:** Arizona, Arizona State, Baylor, BYU, Cincinnati, Houston, Kansas, Kansas State, Oklahoma State, TCU, Texas
  Tech, UCF, Utah, West Virginia.
- **SEC:** Alabama, Arkansas, Auburn, Florida, Georgia, Kentucky, LSU, Ole Miss, Mississippi State, Missouri, Oklahoma,
  South Carolina, Tennessee, Texas, Texas A&M, Vanderbilt.

**Not yet confirmed:** 2027 team lists for the ACC, Big Ten and Big 12 (not posted in full on 2026-10-31; the ACC's 2027
championship is set for a 16-team field). The monthly check should switch to the 2027 lists once they are posted.

## Change log

| Date | Source | What changed | Action |
| --- | --- | --- | --- |
| 2026-10-31 | All | First record | Baseline for the monthly check |
| 2026-10-31 | Power 4 members | First record: 63 baseball schools (ACC 16, Big Ten 17, Big 12 14, SEC 16) | BaseballPath's Power 4 column now used for these schools (F50) |
| 2026-10-31 | BaseballPath | Possible earlier revision, not confirmed: a WIN Reality article (2026-09-16) listed exit velocities of about 95 / 93 / 91 / 89 mph by level, below this page's current figures. Whether it quoted an earlier version of this page isn't known, and no earlier copy was saved | Recorded the current version above; monthly check started |
