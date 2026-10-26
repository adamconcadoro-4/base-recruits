# School data check against the founder's spreadsheets and Airtable (2026-10-25)

Status: **approved by the founder on 2026-10-25 and applied the same evening** (dates in the app show 2026-10-26, UTC).

- Section A: 17 corrections, through the admin correction form.
- Section B: 25 testing policies, through the admin policy form.
- Section C: 13 schools, through the new "Add a school" tool (pull request #10).

Each change is in the revision log with its official page and a note, and can be reverted the same way. A database check
afterwards confirmed every row, and the public pages were spot-checked:

- Army: division, conference, "not in the federal report" note and evidence link.
- Search for "Air Force".
- Purdue Fort Wayne: shown as discontinued.
- Columbia and Cal State Fullerton: policies shown.
- La Salle: season 2025–26.

Active programs went from 1,669 to 1,679 (13 added, 3 discontinued).

## Inputs and method

The founder supplied three files:

- *Base Recruits — NCAA Division I Research Database 2026-27* (Excel)
- *Base Recruits — NCAA Division II Database 2026-27* (Excel)
- the *Base Recruits* Airtable base

The Airtable base holds 390 records: 374 NCAA Division III, 15 older Division I rows and 1 two-year college.

Every file was treated as **leads, not sources**. The spreadsheets cite Wikipedia and their own research queue; the
Airtable base cites a third-party directory. We matched them to the live registry (by federal school ID, or by name and
state for Airtable) and checked every difference against an official school, conference, NCAA or university-system page.

## What matched

- **Admissions and costs:** the spreadsheets' admission rates, SAT/ACT ranges and tuition come from the same College
  Scorecard data the site shows. A sample of 24 schools matched field for field, and the site has figures for more
  schools than the spreadsheets.
- **Divisions:** 544 of 556 Division I/II programs in the spreadsheets matched the site. The Airtable Division III list
  matched 370 site programs.
- **The Airtable base is out of date** and should not be used as a source. For example, it puts Stanford, Oregon and
  Arizona in the "Pac-12" and gives the wrong federal ID for Boston College.
- **Not used:** the spreadsheets' "Academic Fit Model" (Likely / Target / Reach). See decision F15.

## A. Program corrections (17)

| School | Change | Official page |
| --- | --- | --- |
| Florida International | Independent → NCAA D1, Conference USA | fiusports.com, 2026 CUSA opener |
| New Haven | NCAA D2 → D1 (reclassifying), Northeast Conference | newhaven.edu NEC release |
| Southern Indiana | NCAA D2 → D1, Ohio Valley | usi.edu, full D1 member 2025 |
| West Florida | NCAA D2 → D1 (reclassifying), ASUN | goargos.com, 2027 schedule (Oct 23 2026) |
| Dallas Baptist | NCAA D2 → D1 (baseball only), Pac-12 | pac-12.com release |
| Anderson (SC) | NCAA D3 → D2, South Atlantic | autrojans.com, 2026 SAC poll |
| Ferrum | NCAA D3 → D2, Conference Carolinas | ferrum.edu, final provisional year |
| Middle Georgia State | NAIA → NCAA D2, Peach Belt | mgaknights.com, provisional year two |
| Shawnee State | NAIA → NCAA D2, Mountain East | shawnee.edu release (Feb 2026) |
| Azusa Pacific | NCAA D2 → D3, SCIAC | 2026-27 university catalog |
| UW-Stout | NCCAA D2 → NCAA D3, WIAC | wiacsports.com, 2026 preview |
| Waynesburg | NCCAA D2 → NCAA D3, Presidents' Athletic | waynesburgsports.com, 2026 preview |
| Monroe University (New Rochelle) | Other → NJCAA D1 | monroeumustangs.com, 2026 Region 20 tournament |
| Columbia-Greene CC | NCAA D3 → NJCAA D3 (status still to re-check: no game found after April 2025) | columbiagreene.edu athletics page |
| Purdue Fort Wayne | Discontinued (May 23, 2025) | gomastodons.com announcement |
| Sonoma State | Discontinued (June 2025; not among the 10 sports returning in 2027-28) | advancement.sonoma.edu |
| Bloomfield College | Discontinued (2025, move to USCAA) | inside.montclair.edu release |

## B. Current testing policies (25)

| Schools | Policy | Official page |
| --- | --- | --- |
| 19 California State University campuses with baseball | Fall 2027 first-years: SAT/ACT not considered | calstate.edu first-time freshman FAQ ("fall 2022 or later … all CSU campuses") |
| Columbia | Fall 2027: optional; fall 2028: required (waiver possible) | Columbia news, June 12 2026 |
| Alabama-Huntsville | Fall 2027: optional; from spring 2028: required | uah.edu test-optional page |
| Commonwealth University (PA) | Fall 2027: optional (accelerated 3+2 PA program excepted) | commonwealthu.edu first-year page |
| Slippery Rock | Fall 2027: optional (LECOM pre-professional track excepted) | sru.edu admission requirements |

Held: Arizona State and Kutztown. Their pages are written for fall 2027 applicants but don't date the policy.

## C. Programs the federal report leaves out (13)

Federal IDs and addresses come from NCES College Navigator; teams come from each school's official athletics site.

| School | Division, conference | Season confirmed | Why it was missing |
| --- | --- | --- | --- |
| Army (US Military Academy, 197036) | NCAA D1, Patriot League | 2026-27 (2027 roster) | Service academy |
| Navy (US Naval Academy, 164155) | NCAA D1, Patriot League | 2026-27 (2027 roster) | Service academy |
| Air Force (US Air Force Academy, 128328) | NCAA D1, Mountain West | 2026-27 (2027 roster) | Service academy |
| La Salle (213367) | NCAA D1, Atlantic 10 | 2025-26 (2026 season) | Not in the 2024-25 report |
| Hillsdale (170286) | NCAA D2, G-MAC | 2026-27 (2027 roster) | No federal student aid |
| Morehouse (140553) | NCAA D2, SIAC | 2025-26 (2026 season) | Men's college |
| Coast Guard Academy (130624) | NCAA D3, NEWMAC | 2025-26 (2026 season) | Service academy |
| Grove City (212805) | NCAA D3, Presidents' Athletic | 2025-26 (2026 season) | No federal student aid |
| Hampden-Sydney (232256) | NCAA D3, ODAC | 2026-27 (2027 roster) | Men's college |
| Wabash (152673) | NCAA D3, North Coast | 2025-26 (2026 season) | Men's college |
| Saint John's, MN (174792) | NCAA D3, MIAC | 2025-26 (2026 season) | Men's college |
| Regent (231651) | NCAA D3 (provisional), Coast to Coast | 2026-27 (2026-27 roster) | New team (first season 2026) |
| Johnson & Wales–Charlotte (445708) | NCAA D3 (provisional), Coast to Coast | 2026-27 (2027 roster) | New program |

## D. Held, or left until after launch

- **Conferences:** the site shows a conference for almost no program. The spreadsheets and Airtable list about 1,000,
  from Wikipedia and a third-party directory. Filling them in means checking about 100 official conference pages and a
  bulk import. **After launch.**
- **Several teams under one federal ID:** each of these shows as one school.
  - Commonwealth (Bloomsburg, Lock Haven, Mansfield)
  - PennWest (California, Clarion)
  - Vermont State (Castleton, Lyndon, Randolph)
  - St. Joseph's NY (Long Island, Brooklyn)

  Showing the teams separately needs a data-model change. **After launch.**
- **University of Puerto Rico** (Mayagüez, Río Piedras, Bayamón): Division II members since 2003. No official page
  found for their baseball affiliation, so they are left as the federal report has them.
- **Lees–McRae:** baseball program announced June 2026; first season expected spring 2028. Add when it plays.
- **Already right on the site:** Texas A&M–Texarkana, Texas Wesleyan and Loyola New Orleans (NAIA in 2026-27) and
  Lackawanna (NJCAA). Each has announced a future NCAA Division II move.
