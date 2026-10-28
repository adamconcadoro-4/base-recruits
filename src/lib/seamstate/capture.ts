/**
 * Capture context for one SeamState clip (protocol seamstate-capture-v1).
 *
 * Each setting asks only what changes interpretation. Everything beyond the
 * setting, batting side and camera view is optional: nobody has to give
 * height, weight or medical details to get feedback. Values the person types
 * (a machine's dial setting, an intended zone) are stored as athlete-reported
 * context, never as measurements.
 */

import { z } from 'zod';

import { CAMERA_VIEWS } from '@/lib/assessment/catalog/context';
import { PITCH_TYPES } from '@/lib/assessment/types';
import { CAPTURE_PROTOCOL_VERSION, CAPTURE_SETTINGS, CLIP_BATTING_SIDES, type CaptureSetting } from '@/lib/seamstate/types';

/** Hitter-relative zones 1–9 (1 high inside … 9 low outside), the same numbering as 9-Zone Hitting. */
const zone = z.number().int().min(1).max(9);
const SWING_ASSIGNMENTS = ['swing_all', 'selective', 'take_all', 'none'] as const;

const shortText = (max: number) => z.string().trim().min(1).max(max);

const teeContext = z.object({
  setting: z.literal('tee'),
  /** Where the tee was placed, if the person said. */
  teeZone: zone.nullable().default(null),
});

const frontTossContext = z.object({
  setting: z.literal('front_toss'),
  /** Was the location called before each toss? Unknown stays null. */
  locationAnnounced: z.boolean().nullable().default(null),
  intendedZone: zone.nullable().default(null),
  assignment: z.enum(SWING_ASSIGNMENTS).nullable().default(null),
});

const overhandContext = z.object({
  setting: z.literal('overhand_bp'),
  delivery: z.enum(['coach_bp', 'live_pitcher']),
  pitchMix: z.enum(['known', 'mixed', 'unknown']).default('unknown'),
  pitchType: z.enum(PITCH_TYPES).nullable().default(null),
  assignment: z.enum(SWING_ASSIGNMENTS).nullable().default(null),
});

const machineContext = z.object({
  setting: z.literal('machine'),
  /** The dial or app setting exactly as typed. Never treated as measured ball speed. */
  machineSettingAsEntered: shortText(40).nullable().default(null),
  placement: z.enum(['fixed', 'variable', 'unknown']).default('unknown'),
  pitchType: z.enum(PITCH_TYPES).nullable().default(null),
});

export const settingContextSchema = z.discriminatedUnion('setting', [teeContext, frontTossContext, overhandContext, machineContext]);
export type SettingContext = z.infer<typeof settingContextSchema>;

export const captureContextSchema = z.object({
  protocolVersion: z.literal(CAPTURE_PROTOCOL_VERSION).default(CAPTURE_PROTOCOL_VERSION),
  /** Confirmed by the person; never inferred from (possibly mirrored) pixels. */
  battingSide: z.enum(CLIP_BATTING_SIDES),
  cameraView: z.enum(CAMERA_VIEWS),
  setting: settingContextSchema,
  task: shortText(80).nullable().default(null),
  /** Devices running during the clip, as named by the person; nothing is imported from them here. */
  devices: z.array(shortText(40)).max(5).default([]),
  limitations: shortText(200).nullable().default(null),
});
export type CaptureContext = z.infer<typeof captureContextSchema>;

export function parseCaptureContext(input: unknown): CaptureContext {
  return captureContextSchema.parse(input);
}

/**
 * Whether two captures can be compared over time. Different settings or views
 * may be shown side by side but never become one longitudinal trend.
 */
export function comparableCaptures(a: CaptureContext, b: CaptureContext): { comparable: boolean; differences: string[] } {
  const differences: string[] = [];
  if (a.setting.setting !== b.setting.setting) differences.push('different setting');
  if (a.cameraView !== b.cameraView) differences.push('different camera view');
  if (a.battingSide !== b.battingSide) differences.push('different batting side');
  if (a.protocolVersion !== b.protocolVersion) differences.push('different capture protocol');
  if (a.setting.setting === 'overhand_bp' && b.setting.setting === 'overhand_bp' && a.setting.delivery !== b.setting.delivery) {
    differences.push('coach BP compared with a live pitcher');
  }
  if (a.setting.setting === 'machine' && b.setting.setting === 'machine' && a.setting.machineSettingAsEntered !== b.setting.machineSettingAsEntered) {
    differences.push('different machine setting (as entered)');
  }
  return { comparable: differences.length === 0, differences };
}

/** Whether the setting involves an incoming ball whose release can be judged. */
export function hasIncomingBall(setting: CaptureSetting): boolean {
  return setting !== 'tee';
}

export { CAPTURE_SETTINGS };
