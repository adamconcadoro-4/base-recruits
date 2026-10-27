/**
 * 9-Zone Hitting metric calculator, version zone-calc-v1.
 *
 * Every rate is computed from the underlying observations and returns its
 * numerator, denominator, the observations that were missing, and what was
 * excluded and why. Unknown is neither failure nor success: a missing
 * observation never counts as 0 or as 1, and a zero denominator gives no
 * value (N/A), never 0%. Rates over several sessions are computed from the
 * combined counts, never by averaging percentages.
 *
 * Workbook definitions (Session Dashboard sheet) are kept beside each metric.
 * Deliberate improvements over the workbook:
 *  - Posture-error swings per 10 divides by swings that were scored for
 *    posture (the workbook divides by all swings, so unscored swings would
 *    look like clean swings); coverage is shown.
 *  - Decisions are judged against the round's stored assignment, so a take on
 *    an unassigned strike can be correct and a swing at an unassigned strike is
 *    an assignment error, not a chase.
 *  - Off-plan deliveries stay visible; they are left out only of the targeting
 *    measures (hard targeted contact, depth, lane) that the plan made
 *    impossible to judge. Decisions, chase, contact, posture and recognition
 *    are still judged on the actual pitch.
 *  - Tee swings and dry rehearsals are repetitions, never pitches: they create
 *    no decision or chase opportunities and are reported separately.
 */

import { round1 } from '@/lib/assessment/units';
import {
  OUTSIDE_LOCATIONS,
  ZONE_CALC_VERSION,
  ZONE_IDS,
  classOf,
  zoneOf,
  type OutsideLocation,
  type PitchClass,
  type ZoneEvent,
  type ZoneId,
} from '@/lib/assessment/zones/types';

export const PITCH_METRICS = [
  'decision',
  'chase',
  'strike_contact',
  'hard_targeted',
  'depth',
  'lane',
  'posture_per10',
  'recognition',
  'off_plan',
] as const;
export type PitchMetric = (typeof PITCH_METRICS)[number];

export const REP_METRICS = ['contact', 'hard_targeted', 'depth', 'lane', 'posture_per10'] as const;
export type RepMetric = (typeof REP_METRICS)[number];

export type MetricUnit = 'percent' | 'per10';

export interface MetricInfo {
  readonly label: string;
  readonly unit: MetricUnit;
  /** What the website counts. */
  readonly definition: string;
  /** The workbook's own definition (Session Dashboard sheet), for reference. */
  readonly workbook: string | null;
}

export const PITCH_METRIC_INFO: Readonly<Record<PitchMetric, MetricInfo>> = {
  decision: {
    label: 'Decision rate',
    unit: 'percent',
    definition: 'Correct swing/take decisions ÷ scored decision opportunities, judged on the actual pitch and the round’s assignment. Mandatory-swing and forced-take rounds, and forced takes, are not scored.',
    workbook: 'Correct among scored decision opportunities',
  },
  chase: {
    label: 'Chase rate',
    unit: 'percent',
    definition: 'Swings at actual balls ÷ actual balls received in rounds where the hitter chose (forced takes and mandatory-swing or forced-take rounds left out).',
    workbook: 'Chases / actual balls received',
  },
  strike_contact: {
    label: 'Strike-contact rate',
    unit: 'percent',
    definition: 'Strike swings with bat contact, fouls included ÷ strike swings.',
    workbook: 'Contacts including fouls / strike swings',
  },
  hard_targeted: {
    label: 'Hard targeted contact rate',
    unit: 'percent',
    definition: 'Strike swings that met the round’s hard-contact-in-lane definition ÷ scored strike swings (a miss or foul counts as not met). A coach’s judgment, not a measured exit velocity.',
    workbook: 'Mean of eligible 1/0 entries',
  },
  depth: {
    label: 'Correct-depth rate',
    unit: 'percent',
    definition: 'Strike swings at the agreed individualized contact depth ÷ strike swings scored for depth.',
    workbook: 'Mean of eligible strike-swing entries',
  },
  lane: {
    label: 'Directional accuracy',
    unit: 'percent',
    definition: 'Fair balls in play on strikes in the assigned lane ÷ fair balls in play on strikes scored for lane.',
    workbook: 'Mean of eligible strike balls-in-play entries',
  },
  posture_per10: {
    label: 'Posture-error swings per 10',
    unit: 'per10',
    definition: 'Swings with an observed posture error ÷ swings scored for posture × 10 (the workbook divides by all swings; unscored swings are shown as missing instead).',
    workbook: 'Affected swings per 10 swings',
  },
  recognition: {
    label: 'Recognition rate',
    unit: 'percent',
    definition: 'Correct explicit ball/strike calls ÷ explicit calls recorded. Never inferred from swinging or taking.',
    workbook: 'Only explicitly called pitches',
  },
  off_plan: {
    label: 'Off-plan deliveries',
    unit: 'percent',
    definition: 'Pitches that missed the planned training condition ÷ pitches delivered. A delivery measure, not a hitter result.',
    workbook: 'Delivery quality count',
  },
};

export const REP_METRIC_INFO: Readonly<Record<RepMetric, MetricInfo>> = {
  contact: { label: 'Contact rate (tee)', unit: 'percent', definition: 'Tee swings with bat contact ÷ tee swings with contact recorded.', workbook: null },
  hard_targeted: {
    label: 'Hard targeted contact (tee)',
    unit: 'percent',
    definition: 'Tee swings that met the hard-contact-in-lane definition ÷ scored tee swings.',
    workbook: null,
  },
  depth: { label: 'Correct depth (tee)', unit: 'percent', definition: 'Tee swings at the agreed depth ÷ tee swings scored for depth.', workbook: null },
  lane: { label: 'Directional accuracy (tee)', unit: 'percent', definition: 'Fair tee contact in the assigned lane ÷ fair tee contact scored for lane.', workbook: null },
  posture_per10: {
    label: 'Posture-error swings per 10 (reps)',
    unit: 'per10',
    definition: 'Repetitions with an observed posture error ÷ repetitions scored for posture × 10.',
    workbook: null,
  },
};

/** How one event counts toward one metric. */
export type Outcome =
  | { readonly kind: 'scored'; readonly hit: boolean }
  | { readonly kind: 'missing'; readonly reason: string }
  | { readonly kind: 'excluded'; readonly reason: string }
  | { readonly kind: 'not_applicable' };

const SCORED = (hit: boolean): Outcome => ({ kind: 'scored', hit });
const MISSING = (reason: string): Outcome => ({ kind: 'missing', reason });
const EXCLUDED = (reason: string): Outcome => ({ kind: 'excluded', reason });
const NA: Outcome = { kind: 'not_applicable' };

function decisionRoundExclusion(event: ZoneEvent): Outcome | null {
  if (event.assignment.kind === 'mandatory_swing') return EXCLUDED('Mandatory-swing round (no decision)');
  if (event.assignment.kind === 'forced_take') return EXCLUDED('Forced-take round (no decision)');
  if (event.forcedTake) return EXCLUDED('Forced take');
  return null;
}

/** Whether the assignment called for a swing at this pitch, or null when that cannot be known. */
export function assignedToSwing(event: ZoneEvent, pitchClass: PitchClass): boolean | null {
  if (pitchClass === 'ball') return false;
  if (event.assignment.kind === 'free') return true;
  if (event.assignment.kind === 'selective') {
    const zone = zoneOf(event.location);
    if (zone === null) return null;
    return event.assignment.swingZones.includes(zone);
  }
  return null;
}

/** How a pitched ball counts toward each pitch metric, with the reason when it does not. */
export function pitchOutcomes(event: ZoneEvent): Readonly<Record<PitchMetric, Outcome>> {
  const all = (outcome: Outcome) => Object.fromEntries(PITCH_METRICS.map((key) => [key, outcome])) as Record<PitchMetric, Outcome>;
  if (event.kind !== 'pitch') return all(NA);
  if (event.voided) return all(EXCLUDED('Voided'));
  const pitchClass = classOf(event.location, event.pitchClass);
  const swung = event.response === 'swing';
  const strikeSwing = swung && pitchClass === 'strike';

  // Decisions.
  let decision: Outcome;
  const roundExclusion = decisionRoundExclusion(event);
  if (roundExclusion) decision = roundExclusion;
  else if (pitchClass === null) decision = MISSING('Ball or strike not known');
  else if (event.response === null) decision = MISSING('Swing or take not recorded');
  else {
    const shouldSwing = assignedToSwing(event, pitchClass);
    decision = shouldSwing === null ? MISSING('Location needed for the selective assignment') : SCORED(shouldSwing === swung);
  }

  // Chase: swings at actual balls.
  let chase: Outcome;
  if (pitchClass === 'strike') chase = NA;
  else if (roundExclusion) chase = pitchClass === 'ball' ? roundExclusion : NA;
  else if (pitchClass === null) chase = MISSING('Ball or strike not known');
  else if (event.response === null) chase = MISSING('Swing or take not recorded');
  else chase = SCORED(swung);

  // Contact on strike swings.
  let strikeContact: Outcome;
  if (!swung) strikeContact = event.response === null && pitchClass === 'strike' ? MISSING('Swing or take not recorded') : NA;
  else if (pitchClass === null) strikeContact = MISSING('Ball or strike not known');
  else if (pitchClass === 'ball') strikeContact = NA;
  else if (event.contact === null || event.contact === 'unknown') strikeContact = MISSING('Contact not recorded');
  else strikeContact = SCORED(event.contact === 'foul' || event.contact === 'fair');

  const targeting = (observed: boolean | null, label: string, onlyFair: boolean): Outcome => {
    if (!swung) return NA;
    if (pitchClass === null) return MISSING('Ball or strike not known');
    if (pitchClass === 'ball') return NA;
    if (onlyFair) {
      if (event.contact === 'miss' || event.contact === 'foul') return NA;
      if (event.contact !== 'fair') return MISSING('Contact not recorded');
    }
    if (event.offPlan) return EXCLUDED('Off-plan delivery');
    return observed === null ? MISSING(`${label} not scored`) : SCORED(observed);
  };

  let hardTargeted: Outcome;
  if (!strikeSwing) hardTargeted = swung && pitchClass === null ? MISSING('Ball or strike not known') : NA;
  else if (event.offPlan) hardTargeted = EXCLUDED('Off-plan delivery');
  else if (event.contact === 'miss' || event.contact === 'foul') hardTargeted = SCORED(false);
  else hardTargeted = event.hardTargeted === null ? MISSING('Contact quality not scored') : SCORED(event.hardTargeted);

  const posture: Outcome = !swung ? NA : event.postureError === null ? MISSING('Posture not scored') : SCORED(event.postureError);

  let recognition: Outcome;
  if (event.recognitionCall === null) recognition = event.assignment.recognitionRequired ? MISSING('Call not recorded') : NA;
  else if (pitchClass === null) recognition = MISSING('Ball or strike not known');
  else recognition = SCORED(event.recognitionCall === pitchClass);

  return {
    decision,
    chase,
    strike_contact: strikeContact,
    hard_targeted: hardTargeted,
    depth: targeting(event.depthCorrect, 'Depth', false),
    lane: targeting(event.laneCorrect, 'Lane', true),
    posture_per10: posture,
    recognition,
    off_plan: SCORED(event.offPlan),
  };
}

/** How a tee swing or dry rehearsal counts toward each repetition metric. */
export function repOutcomes(event: ZoneEvent): Readonly<Record<RepMetric, Outcome>> {
  const all = (outcome: Outcome) => Object.fromEntries(REP_METRICS.map((key) => [key, outcome])) as Record<RepMetric, Outcome>;
  if (event.kind === 'pitch') return all(NA);
  if (event.voided) return all(EXCLUDED('Voided'));
  const posture: Outcome = event.postureError === null ? MISSING('Posture not scored') : SCORED(event.postureError);
  if (event.kind === 'dry_rep') return { ...all(NA), posture_per10: posture };
  const contactKnown = event.contact !== null && event.contact !== 'unknown';
  return {
    contact: contactKnown ? SCORED(event.contact === 'foul' || event.contact === 'fair') : MISSING('Contact not recorded'),
    hard_targeted:
      event.contact === 'miss' || event.contact === 'foul'
        ? SCORED(false)
        : event.hardTargeted === null
          ? MISSING('Contact quality not scored')
          : SCORED(event.hardTargeted),
    depth: event.depthCorrect === null ? MISSING('Depth not scored') : SCORED(event.depthCorrect),
    lane:
      event.contact === 'fair'
        ? event.laneCorrect === null
          ? MISSING('Lane not scored')
          : SCORED(event.laneCorrect)
        : contactKnown
          ? NA
          : MISSING('Contact not recorded'),
    posture_per10: posture,
  };
}

export interface MetricResult {
  readonly key: string;
  readonly label: string;
  readonly unit: MetricUnit;
  readonly numerator: number;
  readonly denominator: number;
  /** Percent (0–100) or per-10 value, one decimal; null when the denominator is zero. */
  readonly value: number | null;
  /** Otherwise-eligible events whose observation was not recorded. */
  readonly missing: number;
  readonly excluded: ReadonlyArray<{ readonly reason: string; readonly count: number }>;
  readonly definition: string;
  readonly workbook: string | null;
}

function tally(key: string, info: MetricInfo, outcomes: readonly Outcome[]): MetricResult {
  let numerator = 0;
  let denominator = 0;
  let missing = 0;
  const excluded = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.kind === 'scored') {
      denominator += 1;
      if (outcome.hit) numerator += 1;
    } else if (outcome.kind === 'missing') missing += 1;
    else if (outcome.kind === 'excluded') excluded.set(outcome.reason, (excluded.get(outcome.reason) ?? 0) + 1);
  }
  const value = denominator === 0 ? null : round1(info.unit === 'per10' ? (10 * numerator) / denominator : (100 * numerator) / denominator);
  return {
    key,
    label: info.label,
    unit: info.unit,
    numerator,
    denominator,
    value,
    missing,
    excluded: [...excluded.entries()].map(([reason, count]) => ({ reason, count })),
    definition: info.definition,
    workbook: info.workbook,
  };
}

export interface ZoneBreakdown {
  readonly zone: ZoneId;
  readonly pitches: number;
  readonly strikeSwings: number;
  readonly teeSwings: number;
  readonly pitch: Readonly<Record<'strike_contact' | 'hard_targeted' | 'depth' | 'lane', MetricResult>>;
  readonly tee: Readonly<Record<'contact' | 'hard_targeted' | 'depth' | 'lane', MetricResult>>;
}

export interface ZoneSummary {
  readonly calcVersion: string;
  readonly counts: {
    readonly pitches: number;
    readonly teeSwings: number;
    readonly dryReps: number;
    readonly voided: number;
    readonly swings: number;
    readonly strikes: number;
    readonly balls: number;
    readonly unknownClass: number;
    readonly offPlan: number;
    /** Pitches with a planned zone, and how many arrived in it. */
    readonly planned: number;
    readonly onTarget: number;
  };
  readonly pitch: Readonly<Record<PitchMetric, MetricResult>>;
  readonly reps: Readonly<Record<RepMetric, MetricResult>>;
  readonly byZone: readonly ZoneBreakdown[];
  readonly outside: Readonly<Record<OutsideLocation | 'unknown', number>>;
}

function pitchMetrics(events: readonly ZoneEvent[]): Record<PitchMetric, MetricResult> {
  const outcomes = events.map(pitchOutcomes);
  return Object.fromEntries(
    PITCH_METRICS.map((key) => [key, tally(key, PITCH_METRIC_INFO[key], outcomes.map((item) => item[key]))]),
  ) as Record<PitchMetric, MetricResult>;
}

function repMetrics(events: readonly ZoneEvent[]): Record<RepMetric, MetricResult> {
  const outcomes = events.map(repOutcomes);
  return Object.fromEntries(
    REP_METRICS.map((key) => [key, tally(key, REP_METRIC_INFO[key], outcomes.map((item) => item[key]))]),
  ) as Record<RepMetric, MetricResult>;
}

/** Summarizes any set of events. Combine sessions by passing all of their events, never by averaging summaries. */
export function summarizeZoneEvents(events: readonly ZoneEvent[]): ZoneSummary {
  const live = events.filter((event) => !event.voided);
  const pitches = live.filter((event) => event.kind === 'pitch');
  const classes = pitches.map((event) => classOf(event.location, event.pitchClass));
  const pitch = pitchMetrics(events);
  const reps = repMetrics(events);
  const byZone = ZONE_IDS.map((zone): ZoneBreakdown => {
    const zonePitches = events.filter((event) => event.kind === 'pitch' && zoneOf(event.location) === zone);
    const zoneTee = events.filter((event) => event.kind === 'tee_swing' && zoneOf(event.location) === zone);
    const zp = pitchMetrics(zonePitches);
    const zt = repMetrics(zoneTee);
    return {
      zone,
      pitches: zonePitches.filter((event) => !event.voided).length,
      strikeSwings: zonePitches.filter((event) => !event.voided && event.response === 'swing').length,
      teeSwings: zoneTee.filter((event) => !event.voided).length,
      pitch: { strike_contact: zp.strike_contact, hard_targeted: zp.hard_targeted, depth: zp.depth, lane: zp.lane },
      tee: { contact: zt.contact, hard_targeted: zt.hard_targeted, depth: zt.depth, lane: zt.lane },
    };
  });
  const outside = Object.fromEntries([...OUTSIDE_LOCATIONS, 'unknown'].map((location) => [location, 0])) as Record<
    OutsideLocation | 'unknown',
    number
  >;
  for (const event of pitches) if (!event.location.startsWith('z')) outside[event.location as OutsideLocation | 'unknown'] += 1;
  const planned = pitches.filter((event) => event.intendedZone !== null);
  return {
    calcVersion: ZONE_CALC_VERSION,
    counts: {
      pitches: pitches.length,
      teeSwings: live.filter((event) => event.kind === 'tee_swing').length,
      dryReps: live.filter((event) => event.kind === 'dry_rep').length,
      voided: events.length - live.length,
      swings: pitches.filter((event) => event.response === 'swing').length,
      strikes: classes.filter((value) => value === 'strike').length,
      balls: classes.filter((value) => value === 'ball').length,
      unknownClass: classes.filter((value) => value === null).length,
      offPlan: pitches.filter((event) => event.offPlan).length,
      planned: planned.length,
      onTarget: planned.filter((event) => zoneOf(event.location) === event.intendedZone).length,
    },
    pitch,
    reps,
    byZone,
    outside,
  };
}

/** "6 of 10 (60%)", "N/A (0 eligible)", with per-10 values as "1.5 per 10 (3 of 20 swings)". */
export function metricText(result: MetricResult): string {
  if (result.value === null) return `N/A (0 eligible)`;
  if (result.unit === 'per10') return `${result.value} per 10 (${result.numerator} of ${result.denominator})`;
  return `${result.numerator} of ${result.denominator} (${result.value}%)`;
}
