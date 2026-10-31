/**
 * Power 4 baseball conferences and their member schools, so a D1 school in one
 * of them is compared with the Power 4 benchmarks instead of the "Other D1"
 * ones (founder decision F50, rulebook §4a).
 *
 * - Membership is for baseball, as each conference's own site listed it on the
 *   date checked. Members without a baseball team are not listed.
 * - Schools are keyed by their federal IPEDS unit ID, the same ID the school
 *   registry uses, so a renamed school still matches.
 * - The record of each conference page, and the monthly check that compares it
 *   with the live page, are in docs/benchmark-sources.md (section D). Keep the
 *   two in step.
 *
 * Pure data and functions, no imports.
 */

export const POWER4_CONFERENCES = ['acc', 'big_ten', 'big_12', 'sec'] as const;
export type Power4Conference = (typeof POWER4_CONFERENCES)[number];

export const POWER4_CONFERENCE_NAMES: Readonly<Record<Power4Conference, string>> = {
  acc: 'ACC',
  big_ten: 'Big Ten',
  big_12: 'Big 12',
  sec: 'SEC',
};

export interface Power4Source {
  readonly title: string;
  readonly url: string;
  /** The baseball season the page lists. */
  readonly season: string;
}

/**
 * The official page each conference's baseball members were read from, checked 2026-10-31.
 * The SEC's standings load by script, so its 16 members were confirmed on their team pages
 * (https://www.secsports.com/schedule/baseball/<school>), and the page below gives the count.
 */
export const POWER4_SOURCES: Readonly<Record<Power4Conference, Power4Source>> = {
  acc: { title: '2026 Baseball Standings', url: 'https://theacc.com/standings.aspx?path=baseball&year=2026', season: '2026' },
  big_ten: { title: 'Big Ten Announces 2026 Baseball Television Schedule', url: 'https://bigten.org/base/article/59374/', season: '2026' },
  big_12: { title: '2026 Baseball Standings', url: 'https://www.big12sports.com/standings.aspx?path=baseball&year=2026', season: '2026' },
  sec: { title: '2027 SEC baseball schedule announced', url: 'https://www.secsports.com/news/2026/09/2027-sec-baseball-schedule-announced', season: '2027' },
};

export const POWER4_CHECKED_ON = '2026-10-31';

export interface Power4Member {
  readonly unitid: number;
  /** The school's name in the federal data, for reading the list; matching uses the unit ID. */
  readonly name: string;
  readonly conference: Power4Conference;
}

export const POWER4_MEMBERS: readonly Power4Member[] = [
  // ACC
  { unitid: 164924, name: 'Boston College', conference: 'acc' },
  { unitid: 110635, name: 'University of California-Berkeley', conference: 'acc' },
  { unitid: 217882, name: 'Clemson University', conference: 'acc' },
  { unitid: 198419, name: 'Duke University', conference: 'acc' },
  { unitid: 134097, name: 'Florida State University', conference: 'acc' },
  { unitid: 139755, name: 'Georgia Institute of Technology-Main Campus', conference: 'acc' },
  { unitid: 157289, name: 'University of Louisville', conference: 'acc' },
  { unitid: 135726, name: 'University of Miami', conference: 'acc' },
  { unitid: 199193, name: 'North Carolina State University at Raleigh', conference: 'acc' },
  { unitid: 199120, name: 'University of North Carolina at Chapel Hill', conference: 'acc' },
  { unitid: 152080, name: 'University of Notre Dame', conference: 'acc' },
  { unitid: 215293, name: 'University of Pittsburgh-Pittsburgh Campus', conference: 'acc' },
  { unitid: 243744, name: 'Stanford University', conference: 'acc' },
  { unitid: 234076, name: 'University of Virginia-Main Campus', conference: 'acc' },
  { unitid: 233921, name: 'Virginia Polytechnic Institute and State University', conference: 'acc' },
  { unitid: 199847, name: 'Wake Forest University', conference: 'acc' },
  // Big Ten
  { unitid: 145637, name: 'University of Illinois Urbana-Champaign', conference: 'big_ten' },
  { unitid: 151351, name: 'Indiana University-Bloomington', conference: 'big_ten' },
  { unitid: 153658, name: 'University of Iowa', conference: 'big_ten' },
  { unitid: 163286, name: 'University of Maryland-College Park', conference: 'big_ten' },
  { unitid: 170976, name: 'University of Michigan-Ann Arbor', conference: 'big_ten' },
  { unitid: 171100, name: 'Michigan State University', conference: 'big_ten' },
  { unitid: 174066, name: 'University of Minnesota-Twin Cities', conference: 'big_ten' },
  { unitid: 181464, name: 'University of Nebraska-Lincoln', conference: 'big_ten' },
  { unitid: 147767, name: 'Northwestern University', conference: 'big_ten' },
  { unitid: 204796, name: 'Ohio State University-Main Campus', conference: 'big_ten' },
  { unitid: 209551, name: 'University of Oregon', conference: 'big_ten' },
  { unitid: 214777, name: 'Pennsylvania State University-Main Campus', conference: 'big_ten' },
  { unitid: 243780, name: 'Purdue University-Main Campus', conference: 'big_ten' },
  { unitid: 186380, name: 'Rutgers University-New Brunswick', conference: 'big_ten' },
  { unitid: 110662, name: 'University of California-Los Angeles', conference: 'big_ten' },
  { unitid: 123961, name: 'University of Southern California', conference: 'big_ten' },
  { unitid: 236948, name: 'University of Washington-Seattle Campus', conference: 'big_ten' },
  // Big 12
  { unitid: 104179, name: 'University of Arizona', conference: 'big_12' },
  { unitid: 104151, name: 'Arizona State University Campus Immersion', conference: 'big_12' },
  { unitid: 223232, name: 'Baylor University', conference: 'big_12' },
  { unitid: 230038, name: 'Brigham Young University', conference: 'big_12' },
  { unitid: 201885, name: 'University of Cincinnati-Main Campus', conference: 'big_12' },
  { unitid: 225511, name: 'University of Houston', conference: 'big_12' },
  { unitid: 155317, name: 'University of Kansas', conference: 'big_12' },
  { unitid: 155399, name: 'Kansas State University', conference: 'big_12' },
  { unitid: 207388, name: 'Oklahoma State University-Main Campus', conference: 'big_12' },
  { unitid: 228875, name: 'Texas Christian University', conference: 'big_12' },
  { unitid: 229115, name: 'Texas Tech University', conference: 'big_12' },
  { unitid: 132903, name: 'University of Central Florida', conference: 'big_12' },
  { unitid: 230764, name: 'University of Utah', conference: 'big_12' },
  { unitid: 238032, name: 'West Virginia University', conference: 'big_12' },
  // SEC
  { unitid: 100751, name: 'The University of Alabama', conference: 'sec' },
  { unitid: 106397, name: 'University of Arkansas', conference: 'sec' },
  { unitid: 100858, name: 'Auburn University', conference: 'sec' },
  { unitid: 134130, name: 'University of Florida', conference: 'sec' },
  { unitid: 139959, name: 'University of Georgia', conference: 'sec' },
  { unitid: 157085, name: 'University of Kentucky', conference: 'sec' },
  { unitid: 159391, name: 'Louisiana State University and Agricultural & Mechanical College', conference: 'sec' },
  { unitid: 176017, name: 'University of Mississippi', conference: 'sec' },
  { unitid: 176080, name: 'Mississippi State University', conference: 'sec' },
  { unitid: 178396, name: 'University of Missouri-Columbia', conference: 'sec' },
  { unitid: 207500, name: 'University of Oklahoma-Norman Campus', conference: 'sec' },
  { unitid: 218663, name: 'University of South Carolina-Columbia', conference: 'sec' },
  { unitid: 221759, name: 'The University of Tennessee-Knoxville', conference: 'sec' },
  { unitid: 228778, name: 'The University of Texas at Austin', conference: 'sec' },
  { unitid: 228723, name: 'Texas A&M University-College Station', conference: 'sec' },
  { unitid: 221999, name: 'Vanderbilt University', conference: 'sec' },
];

const BY_UNITID: ReadonlyMap<number, Power4Conference> = new Map(POWER4_MEMBERS.map((m) => [m.unitid, m.conference]));

/** The school's Power 4 conference, or null when it isn't in one. */
export function power4Conference(unitid: number): Power4Conference | null {
  return BY_UNITID.get(unitid) ?? null;
}

export function isPower4(unitid: number): boolean {
  return BY_UNITID.has(unitid);
}
