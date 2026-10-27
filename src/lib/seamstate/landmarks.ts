/**
 * Mapping between hitter-relative body roles and the pose model's points.
 *
 * The pose model (MediaPipe Pose Landmarker, 33 points) names points by the
 * athlete's own left and right. A right-handed hitter's lead side is the
 * left side; a left-handed hitter's is the right. Batting side always comes
 * from the person's confirmation, never from the picture, so a mirrored
 * front-camera preview cannot flip it.
 */

import type { BodyRole, ClipBattingSide } from '@/lib/seamstate/types';

/** MediaPipe Pose Landmarker indices used by SeamState (the model has 33). */
export const POSE_POINTS = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_foot_index: 31,
  right_foot_index: 32,
} as const;
export type PosePoint = keyof typeof POSE_POINTS;

type Part = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'foot';

function pointFor(part: Part, side: 'left' | 'right'): PosePoint {
  return (part === 'foot' ? `${side}_foot_index` : `${side}_${part}`) as PosePoint;
}

/** The pose point for a hitter-relative role. */
export function posePointFor(role: BodyRole, battingSide: ClipBattingSide): PosePoint {
  if (role === 'head') return 'nose';
  const [which, part] = role.split('_') as ['lead' | 'rear', Part];
  const lead = battingSide === 'right' ? 'left' : 'right';
  const rear = lead === 'left' ? 'right' : 'left';
  return pointFor(part, which === 'lead' ? lead : rear);
}

/** Pose index for a role; what the worker reads from its landmark arrays. */
export function poseIndexFor(role: BodyRole, battingSide: ClipBattingSide): number {
  return POSE_POINTS[posePointFor(role, battingSide)];
}

/** Plain-language groups used in retake guidance. */
export const ROLE_GROUPS: Readonly<Record<'feet' | 'legs' | 'hands' | 'torso' | 'head', readonly BodyRole[]>> = {
  feet: ['lead_ankle', 'rear_ankle', 'lead_foot', 'rear_foot'],
  legs: ['lead_hip', 'rear_hip', 'lead_knee', 'rear_knee'],
  hands: ['lead_wrist', 'rear_wrist', 'lead_elbow', 'rear_elbow'],
  torso: ['lead_shoulder', 'rear_shoulder', 'lead_hip', 'rear_hip'],
  head: ['head'],
};

/** One specific retake instruction for each group of landmarks that went missing. */
export const RETAKE_TIPS: Readonly<Record<keyof typeof ROLE_GROUPS, string>> = {
  feet: 'Keep both feet visible from setup through the finish.',
  legs: 'Keep the hitter’s legs in the frame and clear of the screen or net.',
  hands: 'Keep both hands in the frame through contact; step back or zoom out a little.',
  torso: 'Keep the hitter’s whole upper body in the frame through the finish.',
  head: 'Keep the hitter’s head in the frame, with nothing in front of it.',
};
