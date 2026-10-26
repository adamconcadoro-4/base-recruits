import type { Discipline, PillarKey } from '@/lib/assessment/types';

export interface PillarDefinition {
  readonly key: PillarKey;
  readonly discipline: Discipline;
  readonly name: string;
  /** One sentence on what the pillar looks at. */
  readonly summary: string;
  /** What this pillar cannot tell you with the evidence the MVP collects. */
  readonly limits: string;
}

export const PILLARS: Readonly<Record<PillarKey, PillarDefinition>> = {
  load_timing: {
    key: 'load_timing',
    discipline: 'hitting',
    name: 'Load & Timing',
    summary: 'How the hitter gets ready to swing and how consistently that preparation is timed for the drill.',
    limits: 'Timing values are video estimates for one drill. There is no single correct timing across drills.',
  },
  barrel_delivery: {
    key: 'barrel_delivery',
    discipline: 'hitting',
    name: 'Barrel Delivery',
    summary: 'How consistently the barrel reaches the hitting zone and the intended contact point.',
    limits: 'Single-camera video cannot measure the bat’s full three-dimensional path. Bat speed and attack angle need a compatible sensor.',
  },
  lower_body_contribution: {
    key: 'lower_body_contribution',
    discipline: 'hitting',
    name: 'Lower-Body Contribution',
    summary: 'How repeatably the stride, balance and lower-body movement show up from swing to swing.',
    limits: 'These are visual judgments. They do not measure ground force, pressure or pelvis rotation.',
  },
  impact_output: {
    key: 'impact_output',
    discipline: 'hitting',
    name: 'Impact & Output',
    summary: 'What happens at contact: measured ball speed and angle, charted solid contact, and how repeatable the output is.',
    limits: 'Exit velocity and launch angle need a radar or ball-tracking device. Values depend on the drill, ball and bat.',
  },
  lower_body_delivery: {
    key: 'lower_body_delivery',
    discipline: 'pitching',
    name: 'Lower-Body Delivery',
    summary: 'How repeatably the pitcher strides, lands and stays balanced through the delivery.',
    limits: 'These are visual judgments. They do not measure ground force or three-dimensional joint motion.',
  },
  movement_timing: {
    key: 'movement_timing',
    discipline: 'pitching',
    name: 'Movement Timing',
    summary: 'How consistently the delivery moves through its visible checkpoints and how its timing repeats.',
    limits: 'Event timing from video is not a measurement of energy transfer or rotation speed.',
  },
  arm_delivery: {
    key: 'arm_delivery',
    discipline: 'pitching',
    name: 'Arm Delivery',
    summary: 'How consistently the throwing arm follows its route and reaches release, judged visually.',
    limits: 'Ordinary video cannot measure arm stress, elbow or shoulder load, or injury risk, and Base Recruits never estimates them.',
  },
  pitch_performance: {
    key: 'pitch_performance',
    discipline: 'pitching',
    name: 'Pitch Performance',
    summary: 'What the ball does, kept separate for each pitch type: velocity, charted strikes and targets, and measured spin and movement.',
    limits: 'Velocity, spin and movement need a radar or pitch-tracking device, and each device defines its numbers in its own way.',
  },
};

export function pillar(key: PillarKey): PillarDefinition {
  return PILLARS[key];
}
