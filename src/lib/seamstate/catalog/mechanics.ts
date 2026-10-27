/**
 * SeamState mechanic catalog, version 1 (docs/seamstate.md §6).
 *
 * Original Base Recruits definitions. Each entry says what a phone clip can
 * support for one movement feature: which views and landmarks it needs, which
 * events, how many swings, how it is calculated, and what must stay
 * unclaimed. The interpretation model may only report on these keys, and the
 * validator enforces each entry's limits. Every entry is `not_evaluated`
 * until the evaluation harness has results on coach-labelled clips, and the
 * whole catalog needs a qualified hitting coach's review (decision F26).
 *
 * Bat-barrel path is deliberately absent: the pose model tracks the body,
 * not the bat, and wrist points are not a barrel path.
 */

import type { CameraView } from '@/lib/assessment/catalog/context';
import type { BodyRole, CaptureSetting, HittingPillar, ProvenanceKind, SwingEvent } from '@/lib/seamstate/types';

export const EVALUATION_STATUSES = ['not_evaluated', 'evaluating', 'evaluated'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export interface MechanicDefinition {
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly pillar: HittingPillar;
  /** Views where this feature is visible in the image plane. The first is preferred. */
  readonly views: readonly CameraView[];
  /** Landmarks that must be tracked through the relevant window. */
  readonly landmarks: readonly BodyRole[];
  /** Events that must be located in a swing for it to count. */
  readonly events: readonly SwingEvent[];
  /** Assessable swings needed for a single-swing observation and for a repeated pattern. */
  readonly minSwings: { readonly observation: number; readonly pattern: number };
  readonly settings: readonly CaptureSetting[];
  readonly sources: readonly ProvenanceKind[];
  /**
   * Time-based claims need real-time footage at this measured frame rate or
   * higher; below it, only the order of events is reported. Null when the
   * feature makes no time claim.
   */
  readonly minFpsForTiming: number | null;
  /** How the feature is calculated or judged, in plain words. */
  readonly method: string;
  readonly failureConditions: readonly string[];
  /** What this feature must never be used to claim. */
  readonly unclaimed: readonly string[];
  /** Assessment metrics whose drills address an adjustment here (drills.ts `findings`). */
  readonly relatedMetrics: readonly string[];
  readonly evaluation: EvaluationStatus;
}

const ALL_SETTINGS: readonly CaptureSetting[] = ['tee', 'front_toss', 'overhand_bp', 'machine'];
const BODY_SOURCES: readonly ProvenanceKind[] = ['image_plane', 'video_estimate', 'coach_observed'];

const MECHANIC_LIST: readonly MechanicDefinition[] = [
  {
    key: 'setup_base',
    version: 1,
    name: 'Setup and base',
    pillar: 'lower_body_contribution',
    views: ['side_facing', 'front_on'],
    landmarks: ['lead_ankle', 'rear_ankle', 'lead_hip', 'rear_hip'],
    events: ['setup'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Stance width as a multiple of hip width at setup, in the image plane; repeatability is the spread across assessable swings.',
    failureConditions: ['Feet hidden by a screen, net or frame edge', 'Camera angled steeply from above or below'],
    unclaimed: ['Weight distribution or pressure', 'A single correct stance width'],
    relatedMetrics: ['hit_lower_body_consistency'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'load_pattern',
    version: 1,
    name: 'Load movement',
    pillar: 'load_timing',
    views: ['side_facing', 'front_on'],
    landmarks: ['lead_wrist', 'rear_wrist', 'rear_hip', 'rear_shoulder'],
    events: ['setup', 'load_start', 'swing_start'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'When and in which visible direction the hands and back hip move before the forward swing begins.',
    failureConditions: ['Hands leave the frame', 'No still setup before the load'],
    unclaimed: ['Timing against a pitch on tee work', 'That one load style is correct'],
    relatedMetrics: ['hit_load_repeatability'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'head_movement',
    version: 1,
    name: 'Head movement',
    pillar: 'load_timing',
    views: ['side_facing', 'front_on'],
    landmarks: ['head', 'lead_shoulder', 'rear_shoulder', 'lead_hip', 'rear_hip'],
    events: ['setup', 'contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Head displacement from setup to the contact window, divided by torso length, in the plane the camera sees (forward and back from the side, sideways from the front).',
    failureConditions: ['Head hidden by a helmet brim or screen', 'Contact window not located'],
    unclaimed: ['Eye tracking or where the hitter is looking', 'Pitch recognition'],
    relatedMetrics: ['hit_balance_through_swing'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'stride',
    version: 1,
    name: 'Stride',
    pillar: 'lower_body_contribution',
    views: ['side_facing', 'front_on', 'rear'],
    landmarks: ['lead_ankle', 'lead_foot', 'rear_ankle'],
    events: ['setup', 'foot_contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Whether the lead foot strides, its length as a multiple of stance width, and its direction in the visible plane (toward or across the plate only from a front or rear view).',
    failureConditions: ['Lead foot hidden at landing', 'Camera too close to see the full stride'],
    unclaimed: ['That a no-stride or toe-tap approach is a flaw', 'Stride direction from a side view'],
    relatedMetrics: ['hit_stride_direction_repeatability'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'foot_contact_to_swing',
    version: 1,
    name: 'Foot down to swing start',
    pillar: 'load_timing',
    views: ['side_facing', 'front_on'],
    landmarks: ['lead_ankle', 'lead_foot', 'lead_wrist', 'rear_wrist'],
    events: ['foot_contact', 'swing_start'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: ['video_estimate', 'coach_observed'],
    minFpsForTiming: 60,
    method: 'Frames between lead-foot contact and the start of the forward swing; reported in milliseconds only for real-time footage at 60 fps or more, otherwise as the order of the two events.',
    failureConditions: ['No stride (no foot-contact event)', 'Slow-motion file with an unknown slow-down factor'],
    unclaimed: ['Millisecond values from slow motion of unknown speed', 'Timing against the pitch on tee work'],
    relatedMetrics: ['hit_drill_preparation', 'hit_load_repeatability'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'posture_change',
    version: 1,
    name: 'Posture through the swing',
    pillar: 'lower_body_contribution',
    views: ['side_facing', 'side_behind'],
    landmarks: ['lead_shoulder', 'rear_shoulder', 'lead_hip', 'rear_hip'],
    events: ['setup', 'contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Change in the torso line’s angle in the camera plane from setup to the contact window; pitch height is noted when the person recorded it.',
    failureConditions: ['Torso partly hidden by the screen', 'Contact window not located'],
    unclaimed: ['True three-dimensional spine angle', 'That a lower posture on a low pitch is an error'],
    relatedMetrics: ['hit_balance_through_swing'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'lead_knee',
    version: 1,
    name: 'Lead leg through contact',
    pillar: 'lower_body_contribution',
    views: ['side_facing'],
    landmarks: ['lead_hip', 'lead_knee', 'lead_ankle'],
    events: ['foot_contact', 'contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Change in the lead knee’s angle in the image plane from foot contact to the contact window.',
    failureConditions: ['Lead leg hidden behind the back leg', 'No foot-contact event'],
    unclaimed: ['Ground force, bracing force or energy transfer'],
    relatedMetrics: ['hit_lower_body_consistency'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'hands_to_torso',
    version: 1,
    name: 'Hand path relative to the body',
    pillar: 'barrel_delivery',
    views: ['side_facing'],
    landmarks: ['lead_wrist', 'rear_wrist', 'lead_shoulder', 'rear_shoulder'],
    events: ['swing_start', 'contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Path of the hands relative to the shoulders from swing start to the contact window, in the image plane.',
    failureConditions: ['Hands blurred beyond tracking', 'Hands leave the frame'],
    unclaimed: ['Barrel path, bat speed or attack angle', 'Bat acceleration from a blurred image'],
    relatedMetrics: ['hit_barrel_delivery_consistency'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'contact_interval',
    version: 1,
    name: 'Contact position',
    pillar: 'impact_output',
    views: ['side_facing', 'front_on'],
    landmarks: ['lead_wrist', 'rear_wrist', 'lead_foot'],
    events: ['contact'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: ['video_estimate', 'coach_observed'],
    minFpsForTiming: null,
    method: 'Where the hands are relative to the lead foot during the estimated contact window; an interval or "unknown" when contact cannot be resolved.',
    failureConditions: ['Ball and contact region not visible', 'Too few frames around contact'],
    unclaimed: ['An exact contact frame when it cannot be resolved', 'Exit velocity, launch angle or batted-ball quality'],
    relatedMetrics: ['hit_contact_location_consistency'],
    evaluation: 'not_evaluated',
  },
  {
    key: 'finish_support',
    version: 1,
    name: 'Finish and balance',
    pillar: 'lower_body_contribution',
    views: ['side_facing', 'front_on', 'side_behind', 'rear'],
    landmarks: ['lead_ankle', 'rear_ankle', 'lead_hip', 'rear_hip', 'head'],
    events: ['contact', 'finish'],
    minSwings: { observation: 1, pattern: 3 },
    settings: ALL_SETTINGS,
    sources: BODY_SOURCES,
    minFpsForTiming: null,
    method: 'Whether the support base holds through the finish or the hitter steps or stumbles, in the visible sequence.',
    failureConditions: ['Clip ends before the finish', 'Feet leave the frame'],
    unclaimed: ['That a one-handed finish is a flaw', 'Balance or stability measurements'],
    relatedMetrics: ['hit_balance_through_swing'],
    evaluation: 'not_evaluated',
  },
];

export const MECHANICS: readonly MechanicDefinition[] = MECHANIC_LIST;

export function mechanic(key: string): MechanicDefinition | undefined {
  return MECHANIC_LIST.find((item) => item.key === key);
}

export function requireMechanic(key: string): MechanicDefinition {
  const found = mechanic(key);
  if (!found) throw new Error(`Unknown SeamState mechanic: ${key}`);
  return found;
}

/** Measurements a phone clip cannot provide; listed in every report's "What this video cannot tell us". */
export const PHONE_UNAVAILABLE = [
  { key: 'bat_speed', label: 'Bat speed', needs: 'A bat sensor or a separately validated, calibrated bat-tracking setup.' },
  { key: 'barrel_path', label: 'Barrel path and attack angle', needs: 'Bat tracking; body landmarks do not show where the barrel goes.' },
  { key: 'exit_velocity', label: 'Exit velocity', needs: 'A radar or ball-tracking device.' },
  { key: 'launch_spray', label: 'Launch angle, spray angle and ball flight', needs: 'Ball tracking with calibration.' },
  { key: 'ground_force', label: 'Ground forces and weight shift', needs: 'Force plates or pressure mats.' },
  { key: 'rotation_3d', label: 'True 3D rotation, joint loads and torque', needs: 'Calibrated multi-camera or lab motion capture.' },
  { key: 'pitch_data', label: 'Pitch speed and spin', needs: 'A radar or pitch-tracking device; a machine’s dial setting is not a measurement.' },
] as const;
