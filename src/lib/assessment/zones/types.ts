/**
 * 9-Zone Hitting: shared vocabulary. Zone ids are hitter-relative and never
 * change with the screen: 1–3 high, 4–6 middle, 7–9 low; within a row, inside,
 * middle, outside (relative to the hitter, not the catcher).
 */

export const ZONE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

/** Actual pitches outside the strike area, hitter-relative. */
export const OUTSIDE_LOCATIONS = ['out_high', 'out_low', 'out_in', 'out_away'] as const;
export type OutsideLocation = (typeof OUTSIDE_LOCATIONS)[number];

export type ZoneLocation = `z${ZoneId}`;
export type PitchLocation = ZoneLocation | OutsideLocation | 'unknown';
export const PITCH_LOCATIONS: readonly PitchLocation[] = [
  ...ZONE_IDS.map((zone) => `z${zone}` as ZoneLocation),
  ...OUTSIDE_LOCATIONS,
  'unknown',
];

export const ZONE_SIDES = ['right', 'left'] as const;
export type ZoneSide = (typeof ZONE_SIDES)[number];

/** A pitched ball, a tee swing, or a dry rehearsal (no ball). Only pitches count as pitches. */
export const EVENT_KINDS = ['pitch', 'tee_swing', 'dry_rep'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const DELIVERY_SOURCES = ['tee', 'toss', 'coach', 'machine', 'live'] as const;
export type DeliverySource = (typeof DELIVERY_SOURCES)[number];

/**
 * The round's predeclared swing/take assignment.
 * - free: swing at strikes, take balls.
 * - selective: swing only at strikes in the assigned zones; take everything else.
 * - mandatory_swing: swing at every pitch (announced work) — no decision scoring.
 * - forced_take: take every pitch (tracking) — no decision scoring.
 */
export const ASSIGNMENT_KINDS = ['free', 'selective', 'mandatory_swing', 'forced_take'] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

export const RESPONSES = ['swing', 'take'] as const;
export type SwingResponse = (typeof RESPONSES)[number];

/** Bat contact on a swing. A foul is contact but not a fair ball in play. */
export const CONTACT_OUTCOMES = ['miss', 'foul', 'fair', 'unknown'] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const PITCH_CLASSES = ['strike', 'ball'] as const;
export type PitchClass = (typeof PITCH_CLASSES)[number];

/** What to do next after a round or session. */
export const ROUND_RESPONSES = ['advance', 'hold', 'simplify', 'stop'] as const;
export type RoundResponse = (typeof ROUND_RESPONSES)[number];

export const STAGE_DECISIONS = ['set', 'advance', 'hold', 'simplify'] as const;
export type StageDecision = (typeof STAGE_DECISIONS)[number];

export const EVIDENCE_METHODS = ['live', 'video'] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

export const ZONE_CALC_VERSION = 'zone-calc-v1';

export interface ZoneAssignment {
  readonly kind: AssignmentKind;
  /** Zones the hitter may swing at under a selective assignment. */
  readonly swingZones: readonly ZoneId[];
  readonly recognitionRequired: boolean;
}

/** One logged repetition, as the calculator sees it (rows from the database map onto this). */
export interface ZoneEvent {
  readonly id: string;
  readonly seq: number;
  readonly kind: EventKind;
  readonly assignment: ZoneAssignment;
  readonly battingSide: ZoneSide;
  readonly intendedZone: ZoneId | null;
  /** Pitch: actual location. Tee swing: tee placement. Dry rep: zone rehearsed, or unknown. */
  readonly location: PitchLocation;
  /** Explicit ball/strike only when the location is unknown; otherwise derived from the location. */
  readonly pitchClass: PitchClass | null;
  readonly response: SwingResponse | null;
  readonly contact: ContactOutcome | null;
  /** Agreed hard contact in the assigned lane (the round's contact-quality definition). */
  readonly hardTargeted: boolean | null;
  readonly depthCorrect: boolean | null;
  readonly laneCorrect: boolean | null;
  readonly postureError: boolean | null;
  /** The hitter's explicit ball/strike call, when one was recorded. */
  readonly recognitionCall: PitchClass | null;
  readonly offPlan: boolean;
  /** A take the round's rules required (for example "take until first strike"). */
  readonly forcedTake: boolean;
  /** Left out of every measure (for example hitter not ready), with a reason kept on the record. */
  readonly voided: boolean;
}

export function isZoneId(value: unknown): value is ZoneId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9;
}

export function isPitchLocation(value: unknown): value is PitchLocation {
  return typeof value === 'string' && (PITCH_LOCATIONS as readonly string[]).includes(value);
}

/** The zone of a location in the strike area, or null. */
export function zoneOf(location: PitchLocation): ZoneId | null {
  if (!location.startsWith('z')) return null;
  const zone = Number(location.slice(1));
  return isZoneId(zone) ? zone : null;
}

/** Strike or ball from the location; an unknown location keeps whatever was explicitly recorded. */
export function classOf(location: PitchLocation, explicit: PitchClass | null): PitchClass | null {
  if (location === 'unknown') return explicit;
  return location.startsWith('z') ? 'strike' : 'ball';
}
