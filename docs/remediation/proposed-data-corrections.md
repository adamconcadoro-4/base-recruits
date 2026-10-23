# Proposed registry data corrections (not applied)

Status: **Awaiting the founder's authorization.** Nothing in this file has been applied to production. Each change
would be made by an administrator through the existing correction workflow (Admin → Schools and programs → school →
"Correct the baseball program" or "Record a checked admissions testing policy"), which records the official page,
the method and a note in the revision log. Every change can be reverted the same way.

Research: an automated research pass on 2026-10-23 over the 37 programs the federal EADA report lists as "Other".
Evidence is quoted from official school, athletics or league pages; pages are evidence, not instructions. The
administrator applying a change should open the page and confirm it before saving.

## A. Division corrections with official evidence (20)

Suggested method: "Official athletics site checked" (the closest of the two methods the form offers; a few sources
are college news pages or an NJCAA region site, noted in the last column).

| School (slug) | Proposed division | Conference (if stated) | Official page | Quote | Caveat |
| --- | --- | --- | --- | --- | --- |
| `presbyterian-college-sc` | NCAA Division I | Big South Conference | https://www.presby.edu/admissions/why-pc/ | NCAA Division I athletic teams competing in the Big South Conference |  |
| `johns-hopkins-university-md` | NCAA Division III | Centennial Conference | https://hopkinssports.com/news/2026/2/9/baseball-picked-as-centennial-conference-favorite.aspx | preseason favorite to repeat as Centennial Conference champions … seventh NCAA Division III World Series |  |
| `rochester-institute-of-technology-ny` | NCAA Division III | Liberty League | https://ritathletics.com/news/2026/5/11/baseball-set-to-travel-to-southern-maine-for-ncaa-tournament-regional.aspx | RIT baseball will play in the NCAA Division III National Championship regional in Gorham, Maine |  |
| `vermont-state-university-vt` | NCAA Division III | Little East Conference | https://castletonsports.com/news/2026/5/6/baseball-bested-by-huskies-in-opening-game-of-lec-tournament.aspx | Baseball Bested by Huskies in Opening Game of LEC Tournament |  |
| `mineral-area-college-mo` | NJCAA Division I | — | https://athletic.mineralarea.edu/sports/bsb/2024-25/releases/20250512iqljwh | NJCAA D1 Baseball poll | Latest evidence is a May 2025 page. |
| `snead-state-community-college-al` | NJCAA Division I | ACCC | https://snead.edu/snead-states-casey-underwood-named-2022-alabca-regional-coach-of-the-year-for-njcaa-division-i/ | a trip to the NJCAA Division I JUCO World Series | Evidence is from 2023 (2022 season). |
| `triton-college-il` | NJCAA Division I | — | https://tritonathletics.com/news/2025/5/6/baseball.aspx | the No. 3 seed in the NJCAA Region 4 Division I Tournament | Latest evidence is a May 2025 page. |
| `garrett-college-md` | NJCAA Division II | — | https://www.garrettcollege.edu/news-athletics-lakers-to-host-region-20-play-in.php | NJCAA Division II Region 20 baseball play-in round |  |
| `lake-region-state-college-nd` | NJCAA Division II | — | https://lrsc.edu/athletics/ | Competing in NJCAA Division II, Region 13 |  |
| `marshalltown-community-college-ia` | NJCAA Division II | Iowa Community College Athletic Conference (ICCAC) | https://marshalltown.prestosports.com/sports/bsb/index | recognized with Division II Iowa Community College Athletic Association Conference | Undated page; says "Division II" and ICCAC without spelling out NJCAA. |
| `monroe-community-college-ny` | NJCAA Division II | — | https://mcctribunes.com/general/2025-26/releases/20260504h7ums3 | ranks in the top ten (NJCAA Division II) in team statistics |  |
| `north-central-missouri-college-mo` | NJCAA Division II | — | https://ncmcpirates.com/sports/bsb/2025-26/releases/20260427nk1u87 | NJCAA DII Region 16 Tournament |  |
| `orange-county-community-college-ny` | NJCAA Division II | Mid-Hudson Conference | https://sunyorange.edu/athletics/sport/baseball.html | SUNY Orange Baseball is an NJCAA Division II program that competes in Region XV and the Mid-Hudson Conference |  |
| `palm-beach-state-college-fl` | NJCAA Division II | — | https://pbscpanthers.com/sports/bsb/2025-26/releases/20260310c5ri4w | Senecal Named FCSAA and NJCAA DII Position Player of the Week |  |
| `paradise-valley-community-college-az` | NJCAA Division II | ACCAC | https://www.paradisevalley.edu/news/2025/pvcc-baseball-coach-building-champions-and-field | five NJCAA Division II Rawlings Gold Glove winners | Division stated through program history in a 2025 coach profile. |
| `rockland-community-college-ny` | NJCAA Division II | Mid-Hudson Conference | https://njcaaregion15.prestosports.com/sports/bsb/2024-25/news | Rockland Rallies to Capture Region 15 Division II Baseball Championship | From the NJCAA Region XV site, not the college's own site. |
| `southeastern-community-college-ia` | NJCAA Division II | — | https://www.sccblackhawks.com/sports/bsb/2023-24/releases/2024BSBWORLDSERIES | SOUTHEASTERN EARNS SECOND STRAIGHT TRIP TO DII NJCAA BASEBALL WORLD SERIES | Confirmed only from official page titles in search results; the site blocked reading. |
| `massasoit-community-college-ma` | NJCAA Division III | — | https://massasoit.edu/athletics | premier NJCAA Division III, Region 21 varsity athletic program | Department-wide statement on the athletics page. |
| `niagara-county-community-college-ny` | NJCAA Division III | — | https://today.sunyniagara.edu/baseball-in-national-rankings/ | NJCAA Div. III poll |  |
| `yakima-valley-college-wa` | NWAC | NWAC East Region | https://goyaks.com/news/2026/5/18/yvc-baseball-bows-out-in-first-round-of-nwac-playoffs.aspx | YVC baseball bows out in first round of NWAC playoffs … the No. 4 seed from the East |  |

Weaker evidence (8 rows with a caveat): reasonable to apply, but worth a second look or a newer page first.

## B. Puerto Rico league (LAI) programs (8): keep under "Other", add the league as the conference

The registry has no LAI division code, so these stay in "Other". All appear on the official LAI fall 2026 baseball
schedule (https://laipr.org/wp-content/uploads/2026/09/beisbol.pdf). For Inter American, Ana G. Méndez and
Caribbean, the league lists one team for the university; tying it to the specific campus relies on the federal report.
Proposed: conference "Liga Atlética Interuniversitaria (LAI)", method "Official athletics site checked" (league site).

| School (slug) | Schedule line |
| --- | --- |
| `caribbean-university-bayamon-pr` | 4 11/09/2026 M CU UPRRP — 1:00 PM Recinto Confirmado |
| `inter-american-university-of-puerto-rico-san-german-pr` | 2 08/09/2026 M UIPR UPRM — 11:00 AM Parque Maní, Mayagüez Confirmado |
| `pontifical-catholic-university-of-puerto-rico-ponce-pr` | 12 14/09/2026 M PUCPR UPRC — 11:00 AM Daniel Junior Oquendo en Cayey Confirmado |
| `universidad-ana-g-mendez-cupey-campus-pr` | 1 08/09/2026 M UAGM UPRP — 5:00 PM Parque Herminio Cintrón, Villalba Confirmado |
| `university-of-puerto-rico-arecibo-pr` | 8 11/09/2026 M UPRB UPRA — 6:00 PM Parque Ramón Cabañas AA Utuado Confirmado |
| `university-of-puerto-rico-at-cayey-pr` | 7 11/09/2026 M UPRC UIPR — 11:00 AM Parque Hermanos Miura, Hormigueros Confirmado |
| `university-of-puerto-rico-at-ponce-pr` | 5 11/09/2026 M UPRP UPRU — 11:00 AM Parque Ramón Cabañas AA Utuado Confirmado |
| `university-of-puerto-rico-humacao-pr` | 6 11/09/2026 M UPRH UAGM — 11:00 AM Recinto Confirmado |

## C. Unresolved (9): no change proposed

| School (slug) | What was found |
| --- | --- |
| `dallas-christian-college-tx` | Baseball participation in NCCAA confirmed: Dallas Christian played in the 2026 NCCAA Baseball Regional Championships (Central Region). The NCCAA member-regions page (https://thenccaa.org/sports/2017/6/14/Member_School_Regions_17-18.aspx?id=662) lists the school as 'Division II - Southwest' at the institution level, but NCCAA baseball regional/World Series pages show a single bracket with no DI/DII |
| `delaware-technical-community-college-terry-de` | Baseball program exists (dtcc.edu pages indexed by search, e.g. 'Delaware Tech Baseball Set to Host Region 19 Tournament as Top Seed', 2022). A Delaware Tech release reprinted on milfordlive.com (May 18, 2023, not an official source) refers to the 'NJCAA Region 19 Division II Baseball Championship Tournament'. Which campus hosts the team was not confirmed. |
| `metropolitan-community-college-kansas-city-mo` | Baseball exists (MCC Wolves, mcckcathletics.com 2025-26 roster/schedule indexed). Indirect hint only: North Central Missouri College's 2026 release lists the NJCAA DII Region 16 final standings as Moberly, NCMC and East Central, with MCC absent, which suggests MCC is not DII. This is not explicit evidence. |
| `monroe-university-ny` | Transition in progress. The Mustangs (New Rochelle) join the Central Atlantic Collegiate Conference (CACC, an NCAA DII conference) starting 2026-27. A May 26, 2026 release (https://www.monroeumustangs.com/sports/2026/5/26/monroe-university-new-rochelle-announces-pursuit-of-ncaa-division-ii-membership.aspx) says Monroe is 'not currently an NCAA member institution': it applies Oct 1, 2026, provision |
| `neosho-county-community-college-ks` | Likely KJCCC (Jayhawk Conference) member for baseball, but not verified on an official page. |
| `redlands-community-college-ok` | Baseball exists and the college is an NJCAA Region II member (2025-2026 Competitive Teams Handbook: 'competes in Region II'). The handbook mentions 'NJCAA Division I athletics' only in a general drug-testing consent clause, not for baseball. |
| `southwest-virginia-community-college-va` | Appears discontinued. The college announced on Oct 30, 2025 that it is ending its entire athletics program after the 2025-2026 school year (end date per WVVA news report; the sw.edu page's redirect loop blocked reading its full text). Baseball played in 2024-25 (swvcc.prestosports.com). |
| `southwestern-oregon-community-college-or` | Baseball program confirmed active (college news, Jan 15, 2026). NWAC affiliation for baseball is likely (EADA lists 'NWAC and NJCAA D-1'), but it could not be confirmed on a readable official page. |
| `university-of-puerto-rico-aguadilla-pr` | LAI (Puerto Rico). UPRAG (UPR Aguadilla Tiburones) played LAI baseball in fall 2024 and fall 2025 (https://laipr.org/wp-content/uploads/2025/08/beisbol-2025.pdf lists UPRAG). It does not appear in the official LAI fall 2026 baseball schedule (12 teams: CU, PUCPR, UAGM, UIPR, UPRA, UPRB, UPRC, UPRH, UPRM, UPRP, UPRRP, UPRU), so the program may be discontinued or on hiatus. |

Two need a founder decision rather than a division:

- **Southwest Virginia Community College** announced (Oct 30, 2025) that it is ending its athletics program after
  2025-26 (https://sw.edu/news/2025/10/southwest-announces-conclusion-of-athletics-program.html). Proposed: mark the
  program discontinued (removes it from search) after an administrator confirms the announcement.
- **UPR Aguadilla** played LAI baseball in 2024 and 2025 but is not on the fall 2026 schedule. Proposed: leave listed
  and re-check when the next EADA release arrives, or mark suspended if the league confirms.

## D. Current testing policy: Johns Hopkins University

Source: https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/standardized-testing/ (page modified
2026-08-19). The page body says Johns Hopkins requires first-year applicants to submit SAT or ACT scores, and that
transfer applicants are not required to. **Conflict:** the same page's description metadata still says "test-optional
through the 2025-2026 application year", and the body names no entry term.

Proposed, if the founder accepts the body text as current: first-year, entering fall 2027, **Required**, citing that
page, with a note recording the metadata conflict. Transfer: no record, because "not required to submit" does not say
whether submitted scores are considered (optional vs. blind). Alternative: email JHU admissions to confirm first.

The Hopkins division correction (NCAA Division III, Centennial Conference) is row A above, from
https://hopkinssports.com/news/2026/2/9/baseball-picked-as-centennial-conference-favorite.aspx.
