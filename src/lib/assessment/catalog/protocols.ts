/**
 * Capture protocols, version 1. Mirrors public.assessment_protocols and
 * public.assessment_protocol_metrics (a contract test keeps them identical).
 *
 * A protocol fixes which metrics an assessment collects, which of them a
 * pillar needs before it can show a complete score, and the weights used to
 * combine scored metrics. Repetition goals are Base Recruits protocol
 * choices, not externally validated requirements.
 */

import { requireMetric } from '@/lib/assessment/catalog/metrics';
import type { AssessmentMode, Discipline, PillarKey } from '@/lib/assessment/types';

export interface ProtocolMetric {
  readonly key: string;
  readonly version: number;
  /** A pillar shows a complete score only when every required metric has enough valid evidence. */
  readonly required: boolean;
  /** Relative weight among the pillar's scored metrics. */
  readonly weight: number;
}

export interface ProtocolDefinition {
  readonly key: string;
  readonly version: number;
  readonly discipline: Discipline;
  readonly mode: AssessmentMode;
  readonly title: string;
  readonly summary: string;
  /** Suggested number of valid repetitions; the person can change it per assessment. */
  readonly defaultRepGoal: number;
  readonly metrics: readonly ProtocolMetric[];
}

const RUBRIC_HITTING = [
  'hit_load_repeatability',
  'hit_drill_preparation',
  'hit_contact_location_consistency',
  'hit_barrel_delivery_consistency',
  'hit_stride_direction_repeatability',
  'hit_balance_through_swing',
  'hit_lower_body_consistency',
];
const OTHER_HITTING = [
  'hit_fc_to_contact_ms',
  'hit_timing_variation_ms',
  'hit_bat_speed_mph',
  'hit_attack_angle_deg',
  'hit_exit_velocity_mph',
  'hit_launch_angle_deg',
  'hit_solid_contact',
  'hit_output_consistency_pct',
];
const RUBRIC_PITCHING = [
  'pit_stride_direction_repeatability',
  'pit_delivery_balance',
  'pit_landing_consistency',
  'pit_delivery_event_repeatability',
  'pit_arm_path_consistency',
  'pit_event_position_repeatability',
  'pit_release_consistency',
];
const OTHER_PITCHING = [
  'pit_fc_to_release_ms',
  'pit_timing_consistency_ms',
  'pit_velocity_mph',
  'pit_target_hit',
  'pit_strike',
  'pit_spin_rate_rpm',
  'pit_horizontal_break_in',
  'pit_vertical_break_in',
];

function protocolMetrics(keys: readonly string[], required: ReadonlySet<string>): ProtocolMetric[] {
  return keys.map((key) => ({ key, version: requireMetric(key).version, required: required.has(key), weight: 1 }));
}

const PROTOCOL_LIST: readonly ProtocolDefinition[] = [
  {
    key: 'hitting-video',
    version: 1,
    discipline: 'hitting',
    mode: 'video_coach',
    title: 'Hitting — video and coach review',
    summary:
      'Video of one drill, rubric ratings, charted solid contact and marked timing. Sensor readings can be added but are not required.',
    defaultRepGoal: 10,
    metrics: protocolMetrics([...RUBRIC_HITTING, ...OTHER_HITTING], new Set([...RUBRIC_HITTING, 'hit_solid_contact'])),
  },
  {
    key: 'hitting-instrumented',
    version: 1,
    discipline: 'hitting',
    mode: 'instrumented',
    title: 'Hitting — video plus measured ball data',
    summary: 'Everything in the video assessment, plus exit velocity from a radar or ball-tracking device (required).',
    defaultRepGoal: 10,
    metrics: protocolMetrics(
      [...RUBRIC_HITTING, ...OTHER_HITTING],
      new Set([...RUBRIC_HITTING, 'hit_solid_contact', 'hit_exit_velocity_mph']),
    ),
  },
  {
    key: 'pitching-video',
    version: 1,
    discipline: 'pitching',
    mode: 'video_coach',
    title: 'Pitching — video and coach review',
    summary: 'Video of the delivery, rubric ratings, charted strikes and targets, and marked timing. Velocity can be added but is not required.',
    defaultRepGoal: 15,
    metrics: protocolMetrics([...RUBRIC_PITCHING, ...OTHER_PITCHING], new Set([...RUBRIC_PITCHING, 'pit_strike'])),
  },
  {
    key: 'pitching-instrumented',
    version: 1,
    discipline: 'pitching',
    mode: 'instrumented',
    title: 'Pitching — video plus measured pitch data',
    summary: 'Everything in the video assessment, plus pitch velocity from a radar or tracking device (required).',
    defaultRepGoal: 15,
    metrics: protocolMetrics(
      [...RUBRIC_PITCHING, ...OTHER_PITCHING],
      new Set([...RUBRIC_PITCHING, 'pit_strike', 'pit_velocity_mph']),
    ),
  },
];

export const PROTOCOLS: readonly ProtocolDefinition[] = PROTOCOL_LIST;

export function protocol(key: string, version: number): ProtocolDefinition | undefined {
  return PROTOCOL_LIST.find((item) => item.key === key && item.version === version);
}

export function requireProtocol(key: string, version: number): ProtocolDefinition {
  const found = protocol(key, version);
  if (!found) throw new Error(`Unknown assessment protocol: ${key} v${version}`);
  return found;
}

/** The newest version of each protocol, for starting new assessments. */
export function currentProtocols(discipline?: Discipline): readonly ProtocolDefinition[] {
  const newest = new Map<string, ProtocolDefinition>();
  for (const item of PROTOCOL_LIST) {
    if (discipline && item.discipline !== discipline) continue;
    const existing = newest.get(item.key);
    if (!existing || existing.version < item.version) newest.set(item.key, item);
  }
  return [...newest.values()];
}

export function protocolMetricsForPillar(definition: ProtocolDefinition, pillarKey: PillarKey): readonly ProtocolMetric[] {
  return definition.metrics.filter((item) => requireMetric(item.key).pillar === pillarKey);
}

export const MODE_LABELS: Readonly<Record<AssessmentMode, string>> = {
  video_coach: 'Video and coach review',
  instrumented: 'Video plus measured data',
  lab: 'Lab (motion capture and force)',
};

export const MODE_EVIDENCE: Readonly<Record<AssessmentMode, string>> = {
  video_coach:
    'Uses video, rubric ratings, charted outcomes and timing marked on video. Measured values can be added by hand if you have a device.',
  instrumented:
    'Adds measured values from a radar, ball-tracking or bat-tracking device, entered by hand or imported from a CSV file. Each value records the device that produced it.',
  lab: 'Not available. Base Recruits does not import or validate motion-capture or force-plate data yet.',
};
