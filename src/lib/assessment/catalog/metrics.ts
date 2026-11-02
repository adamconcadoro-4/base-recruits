/**
 * Metric catalog, version 1.
 *
 * Mirrors public.assessment_metric_definitions (the structural columns; a
 * contract test keeps them identical). The wording here is Base Recruits'
 * own. No metric carries a universal ideal value: numeric metrics are scored
 * only against a target a development coach set for that athlete, rubric
 * metrics against the written anchors below, and everything else is shown as
 * a description with its evidence.
 */

import type {
  CanonicalUnit,
  Discipline,
  EvidenceCategory,
  PillarKey,
  TargetKind,
} from '@/lib/assessment/types';

export type ValueKind = 'rating' | 'number' | 'boolean';
export type Granularity = 'assessment' | 'repetition';
/** single = one rating per assessment; median/rate over repetitions; sd/cv derived from another metric. */
export type Aggregation = 'single' | 'median' | 'rate' | 'sd' | 'cv';
export type Directionality = 'higher' | 'lower' | 'target_range' | 'descriptive';
/** rubric = always scored from anchors; targetable = scored only when a coach target exists; descriptive = never scored. */
export type MetricScoring = 'rubric' | 'targetable' | 'descriptive';

export const HITTING_EVENTS = ['load_start', 'foot_contact', 'swing_start', 'contact', 'finish'] as const;
export const PITCHING_EVENTS = ['first_move', 'leg_lift_peak', 'foot_contact', 'release', 'finish'] as const;
export type HittingEvent = (typeof HITTING_EVENTS)[number];
export type PitchingEvent = (typeof PITCHING_EVENTS)[number];
export type EventType = HittingEvent | PitchingEvent;

export const EVENT_LABELS: Readonly<Record<EventType, string>> = {
  load_start: 'Load starts',
  foot_contact: 'Front foot lands',
  swing_start: 'Swing starts',
  contact: 'Ball contact',
  finish: 'Finish',
  first_move: 'First move',
  leg_lift_peak: 'Leg lift peak',
  release: 'Ball release',
};

export interface RubricAnchors {
  readonly 1: string;
  readonly 2: string;
  readonly 3: string;
  readonly 4: string;
  readonly 5: string;
  /** When the rater should choose "Unable to assess" instead of a rating. */
  readonly unableToAssess: string;
}

export interface MetricDefinition {
  readonly key: string;
  readonly version: number;
  readonly discipline: Discipline;
  readonly pillar: PillarKey;
  readonly name: string;
  /** Plain-language explanation shown next to the value. */
  readonly explanation: string;
  readonly valueKind: ValueKind;
  readonly granularity: Granularity;
  readonly unit: CanonicalUnit;
  /** Evidence categories a person may record for this metric. Empty for derived metrics. */
  readonly evidence: readonly EvidenceCategory[];
  readonly derived: { readonly from: string; readonly calculation: 'sd' | 'cv' } | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly integerOnly: boolean;
  readonly aggregation: Aggregation;
  /** Show the highest valid value separately (never substituted for the typical value). */
  readonly hasPeak: boolean;
  readonly minValidCount: number;
  readonly directionality: Directionality;
  readonly scoring: MetricScoring;
  readonly targetKinds: readonly TargetKind[];
  /** Summaries are kept separate for each pitch type. */
  readonly perPitchType: boolean;
  /** Sensor values must name the device that produced them. */
  readonly requiresDevice: boolean;
  /** Event markers that produce this video estimate in the Film Room. */
  readonly markers: { readonly start: EventType; readonly end: EventType } | null;
  readonly equipment: string;
  readonly protocolRequirement: string;
  readonly limitations: string;
  readonly rubric: RubricAnchors | null;
}

/** Shared text for every reference-percentile match (see benchmarks in the scoring docs). */
export const BENCHMARK_COMPATIBILITY =
  'A reference percentile is shown only from an approved dataset with the same metric definition and version, ' +
  'protocol, unit, summary statistic, pitch type, device kind, device model (for ball trackers and bat sensors) and cohort (age band and competition level). ' +
  'Rubric ratings are never compared with a population.';

const RUBRIC_COMMON = {
  valueKind: 'rating',
  granularity: 'assessment',
  unit: 'rating',
  evidence: ['observation'],
  derived: null,
  min: 1,
  max: 5,
  integerOnly: true,
  aggregation: 'single',
  hasPeak: false,
  minValidCount: 1,
  directionality: 'higher',
  scoring: 'rubric',
  targetKinds: [],
  perPitchType: false,
  requiresDevice: false,
  markers: null,
} as const;

const SWINGS = 'Rate the whole set of valid swings in this assessment, not a single swing.';
const PITCHES = 'Rate the whole set of valid pitches in this assessment, not a single pitch.';

const metricList: readonly MetricDefinition[] = [
  // ------------------------------------------------------------------ Hitting · Load & Timing
  {
    ...RUBRIC_COMMON,
    key: 'hit_load_repeatability',
    version: 1,
    discipline: 'hitting',
    pillar: 'load_timing',
    name: 'Load repeatability',
    explanation:
      'How consistently the hitter gets into the loaded position — hands, front side and weight shift — from swing to swing in this drill.',
    equipment: 'Video from the side or front with the hands and lower body in frame, or a coach watching live.',
    protocolRequirement: `${SWINGS} Needs at least 5 valid swings.`,
    limitations: 'A visual judgment. It does not say whether the load itself suits the hitter.',
    rubric: {
      1: 'The load looks different on most swings: the hands, front side or weight shift start and finish in clearly different places, or the load is skipped on some swings.',
      2: 'A recognizable load on most swings, but about a third or more of swings show a clear difference in depth, direction or rhythm.',
      3: 'The same basic load on most swings; one or two swings in ten differ noticeably in depth, direction or rhythm.',
      4: 'The load looks the same on nearly every swing; differences are small and only visible on slow-motion review.',
      5: 'The load is indistinguishable from swing to swing at normal speed and in slow motion, including after misses and changes in feed.',
      unableToAssess: 'The camera angle, lighting or framing does not show the hands and lower body through the load.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'hit_drill_preparation',
    version: 1,
    discipline: 'hitting',
    pillar: 'load_timing',
    name: 'Ready on time for the drill',
    explanation:
      'Whether the hitter has finished loading and is ready to start the swing when the ball arrives, judged against what the selected drill demands. A tee has no pitch to time; live pitching does.',
    equipment: 'Video or live viewing that shows both the hitter and the feed or pitch.',
    protocolRequirement: `${SWINGS} The drill type must be recorded with the assessment.`,
    limitations: 'Judged relative to the drill. A rating from tee work does not describe timing against live pitching.',
    rubric: {
      1: 'Late or rushed on most swings: still loading when the ball arrives, or on a tee, starting the swing before the load is complete.',
      2: 'On time on some swings but late or early on many; the hitter is visibly adjusting from swing to swing.',
      3: 'On time on most swings; occasional late or early starts, usually when the feed tempo or speed changes.',
      4: 'On time on nearly every swing, including when the feed tempo changes.',
      5: 'Consistently on time and unhurried on every swing, with a visible ready moment before the swing starts.',
      unableToAssess: 'The ball or feed is not visible, so timing relative to the ball cannot be judged.',
    },
  },
  {
    key: 'hit_fc_to_contact_ms',
    version: 1,
    discipline: 'hitting',
    pillar: 'load_timing',
    name: 'Foot landing to contact',
    explanation:
      'Time from the front foot landing to the bat meeting the ball, estimated from frames marked in the Film Room. It describes timing in this drill; there is no single correct value across tee work, front toss, batting practice and live pitching.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'ms',
    evidence: ['video_estimate'],
    derived: null,
    min: 20,
    max: 1500,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'target_range',
    scoring: 'targetable',
    targetKinds: ['target_range'],
    perPitchType: false,
    requiresDevice: false,
    markers: { start: 'foot_contact', end: 'contact' },
    equipment: 'Video with the front foot and the ball at contact both visible, recorded at real speed or with a known slow-motion factor.',
    protocolRequirement: 'At least 3 valid swings with both moments marked on the same clip.',
    limitations:
      'Precision depends on the clip’s frame rate and on how exactly a frame can be chosen in the browser. At 30 frames per second each frame is about 33 ms, so differences that small are not meaningful.',
    rubric: null,
  },
  {
    key: 'hit_timing_variation_ms',
    version: 1,
    discipline: 'hitting',
    pillar: 'load_timing',
    name: 'Swing-to-swing timing variation',
    explanation:
      'The standard deviation of the eligible foot-landing-to-contact times in this assessment. Lower means the hitter’s timing repeated more closely in this drill.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'ms',
    evidence: [],
    derived: { from: 'hit_fc_to_contact_ms', calculation: 'sd' },
    min: null,
    max: null,
    integerOnly: false,
    aggregation: 'sd',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'lower',
    scoring: 'targetable',
    targetKinds: ['lower_is_better'],
    perPitchType: false,
    requiresDevice: false,
    markers: null,
    equipment: 'Calculated from the foot-landing-to-contact estimates.',
    protocolRequirement: 'At least 3 eligible foot-landing-to-contact estimates.',
    limitations: 'Includes measurement noise as well as real variation. Compare it only within the same drill type and similar clips.',
    rubric: null,
  },
  // ------------------------------------------------------------------ Hitting · Barrel Delivery
  {
    ...RUBRIC_COMMON,
    key: 'hit_contact_location_consistency',
    version: 1,
    discipline: 'hitting',
    pillar: 'barrel_delivery',
    name: 'Contact-point consistency',
    explanation:
      'How consistently the hitter meets the ball at the contact point the drill intends — for example, out in front on an inside tee — using the drill’s stated target point as the criterion.',
    equipment: 'Video from the side showing the ball at contact, or a coach watching live from the side.',
    protocolRequirement: `${SWINGS} The drill’s intended contact point should be written in the assessment notes.`,
    limitations: 'Judged against the drill’s target point, not against a universal contact point.',
    rubric: {
      1: 'Contact happens at the intended point on fewer than about 3 of 10 swings; many are well behind or in front of it.',
      2: 'About 3 to 5 of 10 swings meet the ball at the intended point.',
      3: 'About 6 or 7 of 10 swings meet the ball at the intended point; misses tend to go one way (for example, consistently deep).',
      4: 'About 8 or 9 of 10 swings meet the ball at the intended point.',
      5: 'Every swing, or all but one, meets the ball at the intended point, including after changes in tee height or feed location.',
      unableToAssess: 'The contact point is not visible, or the drill has no defined target point.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'hit_barrel_delivery_consistency',
    version: 1,
    discipline: 'hitting',
    pillar: 'barrel_delivery',
    name: 'Barrel delivery consistency',
    explanation:
      'How consistently the barrel travels from the start of the swing into the hitting zone, as seen from the recorded camera view. A visual judgment, not a measurement of bat path.',
    equipment: 'Video with the bat in frame through the swing; slow-motion capture helps.',
    protocolRequirement: SWINGS,
    limitations: 'Ordinary single-camera video cannot measure the bat’s full three-dimensional path.',
    rubric: {
      1: 'The barrel’s route into the zone varies a lot from swing to swing — dropping steeply on some, looping wide on others — and mishits are frequent.',
      2: 'A recognizable route on most swings, but several swings in ten take a clearly different route into the zone.',
      3: 'The same general route on most swings; a few swings show a visible change, often under timing pressure.',
      4: 'The barrel enters the zone along nearly the same route on almost every swing.',
      5: 'The route into the zone looks the same on every swing at normal speed and in slow motion, across the pitch locations in the drill.',
      unableToAssess: 'The bat is out of frame or too blurred to follow through the swing.',
    },
  },
  {
    key: 'hit_bat_speed_mph',
    version: 1,
    discipline: 'hitting',
    pillar: 'barrel_delivery',
    name: 'Bat speed',
    explanation:
      'Speed of the bat as reported by a compatible bat sensor or tracking system, using that device’s own definition. Typical (median) and peak values are shown separately.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'mph',
    evidence: ['sensor_measurement'],
    derived: null,
    min: 10,
    max: 110,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: true,
    minValidCount: 3,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: false,
    requiresDevice: true,
    markers: null,
    equipment: 'A bat sensor or bat-tracking system. Ordinary video does not produce bat speed.',
    protocolRequirement: 'At least 3 valid swings measured with the same device.',
    limitations:
      'Manufacturers define bat speed differently (for example, at the sweet spot or the hands), so values from different devices are never combined or compared.',
    rubric: null,
  },
  {
    key: 'hit_attack_angle_deg',
    version: 1,
    discipline: 'hitting',
    pillar: 'barrel_delivery',
    name: 'Attack angle',
    explanation:
      'Vertical angle of the bat’s path at or near contact, as defined by the measuring device. Positive values mean the barrel is travelling upward.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'deg',
    evidence: ['sensor_measurement'],
    derived: null,
    min: -45,
    max: 60,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'target_range',
    scoring: 'targetable',
    targetKinds: ['target_range'],
    perPitchType: false,
    requiresDevice: true,
    markers: null,
    equipment: 'A bat sensor or tracking system that reports attack angle.',
    protocolRequirement: 'At least 3 valid swings measured with the same device.',
    limitations: 'There is no universal ideal attack angle; a coach may set a range for one player and drill.',
    rubric: null,
  },
  // ------------------------------------------------------------------ Hitting · Lower-Body Contribution
  {
    ...RUBRIC_COMMON,
    key: 'hit_stride_direction_repeatability',
    version: 1,
    discipline: 'hitting',
    pillar: 'lower_body_contribution',
    name: 'Stride-direction repeatability',
    explanation: 'How consistently the front foot lands in the same direction and place, relative to the plate or a line on the ground.',
    equipment: 'Video from the front or from behind with both feet in frame; a line on the ground makes this easier to judge.',
    protocolRequirement: SWINGS,
    limitations: 'A visual judgment of where the foot lands. It does not measure force or pressure.',
    rubric: {
      1: 'The front foot lands in clearly different directions or places on most swings — open on some, closed on others, or with very different stride lengths.',
      2: 'A recognizable landing on most swings, but about a third or more of strides land noticeably open, closed, short or long.',
      3: 'The foot lands in about the same place on most swings, with one or two clearly different strides in ten.',
      4: 'The foot lands within about a shoe’s width of the same spot on nearly every swing.',
      5: 'The foot lands in the same spot and direction on every swing, including on different pitch locations.',
      unableToAssess: 'The feet are out of frame or blocked from view.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'hit_balance_through_swing',
    version: 1,
    discipline: 'hitting',
    pillar: 'lower_body_contribution',
    name: 'Balance through the swing',
    explanation: 'Whether the hitter stays in control from load to finish without stumbling, falling off, or stepping to recover.',
    equipment: 'Video with the whole body in frame through the finish.',
    protocolRequirement: SWINGS,
    limitations: 'Describes visible control only.',
    rubric: {
      1: 'Loses balance on most swings: steps out, falls toward or away from the plate, or cannot hold the finish.',
      2: 'Holds balance on some swings; several in ten need a recovery step or show the head moving sharply.',
      3: 'Balanced on most swings; one or two in ten need a small recovery.',
      4: 'Balanced on nearly every swing and able to hold the finish briefly.',
      5: 'Holds a stable finish on every swing, with the head steady through contact.',
      unableToAssess: 'The lower body or the finish is out of frame.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'hit_lower_body_consistency',
    version: 1,
    discipline: 'hitting',
    pillar: 'lower_body_contribution',
    name: 'Lower-body movement consistency',
    explanation: 'How consistently the hips and legs move through the same sequence from swing to swing, judged visually.',
    equipment: 'Video with the hips and legs in frame; slow-motion capture helps.',
    protocolRequirement: SWINGS,
    limitations: 'Visible movement is not a measurement of ground force, pressure distribution or pelvis rotation speed.',
    rubric: {
      1: 'The lower body moves differently on most swings — for example, the back leg collapses on some swings and not others, or the hips open early on some.',
      2: 'A recognizable pattern on most swings, with frequent visible differences.',
      3: 'The same pattern on most swings, with occasional clear differences.',
      4: 'Nearly identical lower-body movement on almost every swing.',
      5: 'Lower-body movement looks the same on every swing at normal speed and in slow motion.',
      unableToAssess: 'The hips and legs are not visible through the swing.',
    },
  },
  // ------------------------------------------------------------------ Hitting · Impact & Output
  {
    key: 'hit_exit_velocity_mph',
    version: 1,
    discipline: 'hitting',
    pillar: 'impact_output',
    name: 'Exit velocity',
    explanation:
      'Speed of the ball off the bat from a radar or ball-tracking device. Typical (median) and peak are shown separately; a score, when a coach target exists, uses the median.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'mph',
    evidence: ['sensor_measurement'],
    derived: null,
    min: 10,
    max: 130,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: true,
    minValidCount: 3,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: false,
    requiresDevice: true,
    markers: null,
    equipment: 'A radar gun or ball-tracking system set up for batted balls. Video alone does not produce ball speed.',
    protocolRequirement: 'At least 3 valid swings measured with the same device.',
    limitations: 'Depends on the drill (tee or live pitching), the ball, the bat and how the device is set up.',
    rubric: null,
  },
  {
    key: 'hit_launch_angle_deg',
    version: 1,
    discipline: 'hitting',
    pillar: 'impact_output',
    name: 'Launch angle',
    explanation: 'Vertical angle of the ball leaving the bat, from a ball-tracking system.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'deg',
    evidence: ['sensor_measurement'],
    derived: null,
    min: -90,
    max: 90,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'target_range',
    scoring: 'targetable',
    targetKinds: ['target_range'],
    perPitchType: false,
    requiresDevice: true,
    markers: null,
    equipment: 'A ball-tracking system that reports launch angle.',
    protocolRequirement: 'At least 3 valid swings measured with the same device.',
    limitations: 'The useful range depends on the drill and the player; there is no universal ideal.',
    rubric: null,
  },
  {
    key: 'hit_solid_contact',
    version: 1,
    discipline: 'hitting',
    pillar: 'impact_output',
    name: 'Solid-contact rate',
    explanation:
      'Share of charted swings recorded as solid contact: a hard line drive or hard ground ball toward the middle of the field or the drill’s target, not topped, popped up, or hit off the end or handle.',
    valueKind: 'boolean',
    granularity: 'repetition',
    unit: 'yes_no',
    evidence: ['observation'],
    derived: null,
    min: 0,
    max: 1,
    integerOnly: true,
    aggregation: 'rate',
    hasPeak: false,
    minValidCount: 5,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: false,
    requiresDevice: false,
    markers: null,
    equipment: 'Live charting, or video that shows the ball after contact.',
    protocolRequirement: 'At least 5 valid swings charted yes or no using the definition above.',
    limitations: 'A charted judgment by the observer. Self-charted swings are labelled self-assessed.',
    rubric: null,
  },
  {
    key: 'hit_output_consistency_pct',
    version: 1,
    discipline: 'hitting',
    pillar: 'impact_output',
    name: 'Exit-velocity consistency',
    explanation:
      'Coefficient of variation of the eligible exit-velocity readings: the standard deviation divided by the average, as a percent. Lower means more repeatable ball speed.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'percent',
    evidence: [],
    derived: { from: 'hit_exit_velocity_mph', calculation: 'cv' },
    min: null,
    max: null,
    integerOnly: false,
    aggregation: 'cv',
    hasPeak: false,
    minValidCount: 5,
    directionality: 'lower',
    scoring: 'targetable',
    targetKinds: ['lower_is_better'],
    perPitchType: false,
    requiresDevice: false,
    markers: null,
    equipment: 'Calculated from exit-velocity measurements from one device.',
    protocolRequirement: 'At least 5 eligible exit-velocity readings from the same device.',
    limitations: 'Mishits and intentional changes of approach both raise the variation.',
    rubric: null,
  },
  // ------------------------------------------------------------------ Pitching · Lower-Body Delivery
  {
    ...RUBRIC_COMMON,
    key: 'pit_stride_direction_repeatability',
    version: 1,
    discipline: 'pitching',
    pillar: 'lower_body_delivery',
    name: 'Stride-direction repeatability',
    explanation: 'How consistently the landing foot lands in the same direction and spot from pitch to pitch.',
    equipment: 'Video from the front (home plate side) or from behind with the landing foot in frame; a line on the mound or floor helps.',
    protocolRequirement: PITCHES,
    limitations: 'A visual judgment. A stride-length number is not produced from ordinary video.',
    rubric: {
      1: 'The landing foot lands in clearly different directions or spots on most pitches — open on some, closed on others, or with very different stride lengths.',
      2: 'A recognizable landing on most pitches, but about a third or more land noticeably open, closed, short or long.',
      3: 'The same direction and spot on most pitches; one or two in ten differ noticeably.',
      4: 'Within about a shoe’s width of the same spot and direction on nearly every pitch.',
      5: 'The same spot and direction on every pitch, across pitch types.',
      unableToAssess: 'The landing foot is out of frame or blocked from view.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'pit_delivery_balance',
    version: 1,
    discipline: 'pitching',
    pillar: 'lower_body_delivery',
    name: 'Delivery balance',
    explanation: 'Whether the pitcher stays in control from leg lift through the finish without drifting off line, falling off early, or catching themselves.',
    equipment: 'Video with the whole body in frame from leg lift through the finish.',
    protocolRequirement: PITCHES,
    limitations: 'Describes visible control only.',
    rubric: {
      1: 'Loses balance on most pitches: wobbling at leg lift, falling hard to one side, or stumbling at the finish.',
      2: 'Balanced on some pitches; several in ten show a visible loss of control.',
      3: 'Balanced on most pitches; one or two in ten show a small loss of control.',
      4: 'Balanced on nearly every pitch, with a controlled finish.',
      5: 'Controlled, repeatable balance on every pitch, across pitch types.',
      unableToAssess: 'Leg lift or the finish is out of frame.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'pit_landing_consistency',
    version: 1,
    discipline: 'pitching',
    pillar: 'lower_body_delivery',
    name: 'Landing-position consistency',
    explanation:
      'How consistently the front leg and body arrive in the same position at foot landing — foot and knee direction and posture — judged at the foot-landing frame.',
    equipment: 'Video from the side or front with the landing visible; slow-motion capture helps.',
    protocolRequirement: PITCHES,
    limitations: 'A visual judgment at one moment. It does not measure joint angles.',
    rubric: {
      1: 'The body arrives at landing in clearly different positions on most pitches (for example, the front knee and torso vary a lot).',
      2: 'A recognizable landing position on most pitches, but frequent clear differences.',
      3: 'The same landing position on most pitches, with one or two clear differences in ten.',
      4: 'Nearly the same landing position on almost every pitch.',
      5: 'The landing position looks the same on every pitch at normal speed and in slow motion.',
      unableToAssess: 'The landing moment is not visible clearly enough.',
    },
  },
  // ------------------------------------------------------------------ Pitching · Movement Timing
  {
    key: 'pit_fc_to_release_ms',
    version: 1,
    discipline: 'pitching',
    pillar: 'movement_timing',
    name: 'Foot landing to release',
    explanation:
      'Time from the front foot landing to ball release, estimated from frames marked in the Film Room. It describes this delivery’s timing; it is not a measure of how efficiently energy moves through the body.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'ms',
    evidence: ['video_estimate'],
    derived: null,
    min: 20,
    max: 1500,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'target_range',
    scoring: 'targetable',
    targetKinds: ['target_range'],
    perPitchType: false,
    requiresDevice: false,
    markers: { start: 'foot_contact', end: 'release' },
    equipment: 'Video with the landing foot and the ball at release both visible, at real speed or a known slow-motion factor.',
    protocolRequirement: 'At least 3 valid pitches with both moments marked on the same clip.',
    limitations:
      'Precision depends on the clip’s frame rate and frame selection. At 30 frames per second each frame is about 33 ms. Rotation speeds are never reported from ordinary video.',
    rubric: null,
  },
  {
    key: 'pit_timing_consistency_ms',
    version: 1,
    discipline: 'pitching',
    pillar: 'movement_timing',
    name: 'Delivery timing variation',
    explanation: 'The standard deviation of the eligible foot-landing-to-release times. Lower means the delivery’s timing repeated more closely.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'ms',
    evidence: [],
    derived: { from: 'pit_fc_to_release_ms', calculation: 'sd' },
    min: null,
    max: null,
    integerOnly: false,
    aggregation: 'sd',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'lower',
    scoring: 'targetable',
    targetKinds: ['lower_is_better'],
    perPitchType: false,
    requiresDevice: false,
    markers: null,
    equipment: 'Calculated from the foot-landing-to-release estimates.',
    protocolRequirement: 'At least 3 eligible foot-landing-to-release estimates.',
    limitations: 'Includes measurement noise. Compare only within similar clips and delivery contexts.',
    rubric: null,
  },
  {
    ...RUBRIC_COMMON,
    key: 'pit_delivery_event_repeatability',
    version: 1,
    discipline: 'pitching',
    pillar: 'movement_timing',
    name: 'Delivery rhythm repeatability',
    explanation:
      'How consistently the delivery moves through the same visible checkpoints — first move, leg lift peak, foot landing and release — with the same rhythm.',
    equipment: 'Video of the full delivery from the side.',
    protocolRequirement: PITCHES,
    limitations: 'A visual judgment of rhythm and sequence; it does not measure energy transfer.',
    rubric: {
      1: 'The rhythm changes on most pitches: pauses, rushes or skipped checkpoints vary a lot.',
      2: 'A recognizable rhythm on most pitches, but frequent visible changes in tempo between checkpoints.',
      3: 'The same rhythm on most pitches; one or two in ten are noticeably rushed or slowed.',
      4: 'Nearly the same rhythm through every checkpoint on almost every pitch.',
      5: 'The delivery moves through its checkpoints with the same rhythm on every pitch, across pitch types and from the stretch.',
      unableToAssess: 'The full delivery is not visible from start to release.',
    },
  },
  // ------------------------------------------------------------------ Pitching · Arm Delivery
  {
    ...RUBRIC_COMMON,
    key: 'pit_arm_path_consistency',
    version: 1,
    discipline: 'pitching',
    pillar: 'arm_delivery',
    name: 'Arm-path consistency',
    explanation:
      'How consistently the throwing arm follows the same visible route from hand break to release. A visual judgment only; it does not measure arm stress or injury risk.',
    equipment: 'Video from the side or behind with the throwing arm in frame; slow-motion capture helps.',
    protocolRequirement: PITCHES,
    limitations: 'Ordinary video cannot measure elbow torque, shoulder load or injury risk, and this metric never estimates them.',
    rubric: {
      1: 'The arm takes a clearly different route on most pitches (for example, deeper, shorter or higher on some than others).',
      2: 'A recognizable route on most pitches, but several in ten look clearly different.',
      3: 'The same route on most pitches; one or two in ten differ noticeably, often on a particular pitch type.',
      4: 'Nearly the same route on almost every pitch.',
      5: 'The route looks the same on every pitch and across pitch types at normal speed and in slow motion.',
      unableToAssess: 'The arm is out of frame or too blurred to follow.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'pit_event_position_repeatability',
    version: 1,
    discipline: 'pitching',
    pillar: 'arm_delivery',
    name: 'Positions at landing and release',
    explanation:
      'How consistently the body and throwing arm are in the same position at two defined, visible moments: front-foot landing and ball release.',
    equipment: 'Video in which the landing and release frames can both be found; slow-motion capture helps.',
    protocolRequirement: `${PITCHES} Compare the landing frames with each other, and the release frames with each other.`,
    limitations: 'A visual comparison of frames, not a joint-angle measurement.',
    rubric: {
      1: 'Positions at landing or release differ clearly on most pitches.',
      2: 'Recognizable positions on most pitches, with frequent clear differences at one of the two moments.',
      3: 'The same positions on most pitches; one or two in ten differ noticeably.',
      4: 'Nearly the same positions at both moments on almost every pitch.',
      5: 'Positions at both moments look the same on every pitch, across pitch types.',
      unableToAssess: 'The landing or release frame cannot be found clearly.',
    },
  },
  {
    ...RUBRIC_COMMON,
    key: 'pit_release_consistency',
    version: 1,
    discipline: 'pitching',
    pillar: 'arm_delivery',
    name: 'Release consistency (visual)',
    explanation:
      'A visual judgment of how consistently the ball leaves the hand from the same place relative to the body and head. Physical release-point coordinates need calibrated tracking equipment.',
    equipment: 'Video from behind or from the front showing the release.',
    protocolRequirement: PITCHES,
    limitations: 'Qualitative only. No release height or extension number is produced from ordinary video.',
    rubric: {
      1: 'The ball leaves the hand from clearly different places on most pitches.',
      2: 'A recognizable release on most pitches, but several in ten come from a clearly different place.',
      3: 'The same release on most pitches; one or two in ten differ noticeably.',
      4: 'Nearly the same release on almost every pitch.',
      5: 'The release looks the same on every pitch, across pitch types.',
      unableToAssess: 'The release is not visible clearly enough.',
    },
  },
  // ------------------------------------------------------------------ Pitching · Pitch Performance
  {
    key: 'pit_velocity_mph',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Pitch velocity',
    explanation: 'Speed of the pitch from a radar or pitch-tracking device, kept separate for each pitch type. Typical (median) and peak are shown separately.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'mph',
    evidence: ['sensor_measurement'],
    derived: null,
    min: 20,
    max: 110,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: true,
    minValidCount: 3,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: true,
    requiresDevice: true,
    markers: null,
    equipment: 'A radar gun or pitch-tracking system.',
    protocolRequirement: 'At least 3 valid pitches of a pitch type measured with the same device.',
    limitations:
      'Radar placement and device type change readings. Throwing harder to chase a number is never suggested; volume and intensity are your coach’s decision.',
    rubric: null,
  },
  {
    key: 'pit_target_hit',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Target-hit rate',
    explanation:
      'Share of charted pitches that hit the intended target: within about a ball’s width of the catcher’s glove target, or inside the target box agreed before the session. Kept separate from strike rate.',
    valueKind: 'boolean',
    granularity: 'repetition',
    unit: 'yes_no',
    evidence: ['observation'],
    derived: null,
    min: 0,
    max: 1,
    integerOnly: true,
    aggregation: 'rate',
    hasPeak: false,
    minValidCount: 5,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: true,
    requiresDevice: false,
    markers: null,
    equipment: 'Live charting by a catcher or coach, or video from behind the pitcher showing the glove target.',
    protocolRequirement: 'At least 5 valid pitches charted yes or no against a target announced before each pitch.',
    limitations: 'A charted judgment. Self-charted pitches are labelled self-assessed.',
    rubric: null,
  },
  {
    key: 'pit_strike',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Strike rate',
    explanation:
      'Share of charted pitches judged in the strike zone (or swung at, when a hitter is present). Different from target-hit rate: a strike can miss its target.',
    valueKind: 'boolean',
    granularity: 'repetition',
    unit: 'yes_no',
    evidence: ['observation'],
    derived: null,
    min: 0,
    max: 1,
    integerOnly: true,
    aggregation: 'rate',
    hasPeak: false,
    minValidCount: 5,
    directionality: 'higher',
    scoring: 'targetable',
    targetKinds: ['higher_is_better'],
    perPitchType: true,
    requiresDevice: false,
    markers: null,
    equipment: 'Live charting by a catcher or coach, or video from behind the pitcher or behind home plate.',
    protocolRequirement: 'At least 5 valid pitches charted yes or no.',
    limitations: 'A charted judgment of the zone. Self-charted pitches are labelled self-assessed.',
    rubric: null,
  },
  {
    key: 'pit_spin_rate_rpm',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Spin rate',
    explanation: 'Rotations per minute of the pitch as reported by a pitch-tracking device, kept separate for each pitch type.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'rpm',
    evidence: ['sensor_measurement'],
    derived: null,
    min: 100,
    max: 4000,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'target_range',
    scoring: 'targetable',
    targetKinds: ['target_range'],
    perPitchType: true,
    requiresDevice: true,
    markers: null,
    equipment: 'A pitch-tracking system that measures spin.',
    protocolRequirement: 'At least 3 valid pitches of a pitch type measured with the same device.',
    limitations: 'More spin is not better for every pitch type; only a coach-set range for a specific pitch type is scored.',
    rubric: null,
  },
  {
    key: 'pit_horizontal_break_in',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Horizontal movement',
    explanation: 'Side-to-side movement of the pitch as defined and reported by the tracking device, kept separate for each pitch type.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'in',
    evidence: ['sensor_measurement'],
    derived: null,
    min: -40,
    max: 40,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'descriptive',
    scoring: 'descriptive',
    targetKinds: [],
    perPitchType: true,
    requiresDevice: true,
    markers: null,
    equipment: 'A pitch-tracking system that reports movement.',
    protocolRequirement: 'At least 3 valid pitches of a pitch type measured with the same device.',
    limitations: 'Devices differ in sign conventions and reference frames, so values are described, not scored.',
    rubric: null,
  },
  {
    key: 'pit_vertical_break_in',
    version: 1,
    discipline: 'pitching',
    pillar: 'pitch_performance',
    name: 'Vertical movement',
    explanation: 'Up-and-down movement of the pitch as defined and reported by the tracking device (for example, induced vertical break), kept separate for each pitch type.',
    valueKind: 'number',
    granularity: 'repetition',
    unit: 'in',
    evidence: ['sensor_measurement'],
    derived: null,
    min: -40,
    max: 40,
    integerOnly: false,
    aggregation: 'median',
    hasPeak: false,
    minValidCount: 3,
    directionality: 'descriptive',
    scoring: 'descriptive',
    targetKinds: [],
    perPitchType: true,
    requiresDevice: true,
    markers: null,
    equipment: 'A pitch-tracking system that reports movement.',
    protocolRequirement: 'At least 3 valid pitches of a pitch type measured with the same device.',
    limitations: 'Devices define vertical movement differently (with or without gravity), so values are described, not scored.',
    rubric: null,
  },
];

export const METRICS: ReadonlyMap<string, MetricDefinition> = new Map(metricList.map((metric) => [metric.key, metric]));
export const METRIC_LIST: readonly MetricDefinition[] = metricList;

export function metric(key: string): MetricDefinition | undefined {
  return METRICS.get(key);
}

export function requireMetric(key: string): MetricDefinition {
  const found = METRICS.get(key);
  if (!found) throw new Error(`Unknown assessment metric: ${key}`);
  return found;
}

export function metricsForPillar(pillarKey: PillarKey): readonly MetricDefinition[] {
  return metricList.filter((item) => item.pillar === pillarKey);
}

export function metricsForDiscipline(discipline: Discipline): readonly MetricDefinition[] {
  return metricList.filter((item) => item.discipline === discipline);
}

export function eventsFor(discipline: Discipline): readonly EventType[] {
  return discipline === 'hitting' ? HITTING_EVENTS : PITCHING_EVENTS;
}
