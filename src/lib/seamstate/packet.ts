/**
 * The evidence packet: what the worker measured in one clip, and the only
 * material the interpretation step and the validator may rely on.
 *
 * Built by the worker from decoded frames (never interpolated ones). Every
 * time is a presentation time in the source clip, in milliseconds of playback;
 * `timing` says how playback time relates to real time.
 */

import { z } from 'zod';

import { captureContextSchema } from '@/lib/seamstate/capture';
import { BODY_ROLES, EVENT_METHODS, SWING_EVENTS, type BodyRole, type SwingEvent } from '@/lib/seamstate/types';

const ms = z.number().int().min(0).max(3_600_000);

export const clipTimingSchema = z.object({
  /** Frame rate measured from decoded presentation timestamps, not the container's claim. */
  measuredFps: z.number().positive().max(1000).nullable(),
  timingBasis: z.enum(['real_time', 'slow_motion', 'unknown']),
  /** Known slow-down factor for slow-motion files; null otherwise. */
  slowdownFactor: z.number().min(2).max(32).nullable(),
  variableFrameRate: z.boolean(),
});
export type ClipTiming = z.infer<typeof clipTimingSchema>;

const eventSchema = z.object({
  frameIndex: z.number().int().min(0),
  timeMs: ms,
  /** Uncertainty interval where the method can defend one. */
  intervalMs: z.tuple([ms, ms]).nullable().default(null),
  method: z.enum(EVENT_METHODS),
});

const visibilitySchema = z.partialRecord(z.enum(BODY_ROLES), z.number().min(0).max(1));

export const swingSummarySchema = z.object({
  index: z.number().int().min(1).max(50),
  startMs: ms,
  endMs: ms,
  assessable: z.boolean(),
  /** Why a swing is not assessable (waggle, dry swing, athlete lost). */
  reason: z.string().max(200).nullable().default(null),
  events: z.partialRecord(z.enum(SWING_EVENTS), eventSchema),
  /** Mean landmark visibility (0–1) for the selected athlete inside the swing window. */
  visibility: visibilitySchema,
  /** Share of frames in the window where the selected athlete was tracked. */
  trackedFraction: z.number().min(0).max(1),
});
export type SwingSummary = z.infer<typeof swingSummarySchema>;

export const TRACKING_STATES = ['tracked', 'partial', 'lost'] as const;

export const evidenceFrameSchema = z.object({
  /** Stable id, e.g. "f000123", unique inside one analysis attempt. */
  frameId: z.string().regex(/^f\d{6}$/),
  frameIndex: z.number().int().min(0),
  timeMs: ms,
  swingIndex: z.number().int().min(1).nullable(),
  event: z.enum(SWING_EVENTS).nullable(),
  tracking: z.enum(TRACKING_STATES),
});
export type EvidenceFrame = z.infer<typeof evidenceFrameSchema>;

export const evidencePacketSchema = z.object({
  mediaId: z.uuid(),
  durationMs: ms,
  frameCount: z.number().int().min(0),
  timing: clipTimingSchema,
  capture: captureContextSchema,
  swings: z.array(swingSummarySchema).max(50),
  frames: z.array(evidenceFrameSchema).max(200),
  /** Whether the ball's release and flight are visible (front toss, BP, machine). Never true for tee. */
  releaseVisible: z.boolean(),
});
export type EvidencePacket = z.infer<typeof evidencePacketSchema>;

export function parseEvidencePacket(input: unknown): EvidencePacket {
  const packet = evidencePacketSchema.parse(input);
  if (packet.capture.setting.setting === 'tee' && packet.releaseVisible) {
    throw new Error('A tee clip has no release to see.');
  }
  return packet;
}

export function assessableSwings(packet: EvidencePacket): readonly SwingSummary[] {
  return packet.swings.filter((swing) => swing.assessable);
}

export function swingVisibility(swing: SwingSummary, role: BodyRole): number {
  return swing.visibility[role] ?? 0;
}

export function hasEvent(swing: SwingSummary, event: SwingEvent): boolean {
  return swing.events[event] !== undefined;
}

/**
 * Real capture rate in frames per second, or null when it is unknown: playback
 * rate for real-time footage, playback rate × factor for slow motion with a
 * known factor.
 */
export function captureFps(timing: ClipTiming): number | null {
  if (timing.measuredFps === null) return null;
  if (timing.timingBasis === 'real_time') return timing.measuredFps;
  if (timing.timingBasis === 'slow_motion' && timing.slowdownFactor !== null) return timing.measuredFps * timing.slowdownFactor;
  return null;
}
