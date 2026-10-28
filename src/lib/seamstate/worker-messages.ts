/**
 * Messages from the SeamState worker to the app's callback endpoint
 * (worker/seamstate_worker/server.py). Signed, but still checked strictly:
 * nothing unexpected reaches the database.
 */

import { z } from 'zod';

import { CLIP_VERDICTS } from '@/lib/seamstate/types';

const ids = { jobId: z.uuid(), attemptId: z.uuid() };
const code = z.string().regex(/^[a-z][a-z0-9_]{1,59}$/);

const stageMessage = z.strictObject({
  ...ids,
  type: z.literal('stage'),
  stage: z.enum(['inspecting', 'tracking', 'extracting']),
  metrics: z.record(z.string().max(40), z.union([z.number(), z.string().max(80)])).refine((value) => Object.keys(value).length <= 20),
});

export const inspectionSchema = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  container: z.enum(['mp4', 'mov', 'webm']),
  video_codec: z.string().min(1).max(40),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  measured_fps: z.number().positive().max(1000).nullable(),
  variable_frame_rate: z.boolean(),
  frame_count: z.number().int().min(0),
  duration_ms: z.number().int().min(0).max(3_600_000),
  inspector_version: z.string().min(1).max(40),
});

const inspectionMessage = z.strictObject({ ...ids, type: z.literal('inspection'), inspection: inspectionSchema });

export const STILL_FILE = /^f\d{6}\.jpg$/;
const uploadMessage = z.strictObject({
  ...ids,
  type: z.literal('upload_urls'),
  files: z.array(z.string().regex(STILL_FILE)).min(1).max(200),
});

const resultMessage = z.strictObject({
  ...ids,
  type: z.literal('result'),
  verdict: z.enum(CLIP_VERDICTS),
  reasons: z.array(code).max(10),
  // Checked against evidencePacketSchema separately, so a bad packet is reported precisely.
  packet: z.unknown(),
  versions: z.strictObject({ worker: z.string().max(40), pose_model: z.string().max(80) }),
});

const failedMessage = z.strictObject({
  ...ids,
  type: z.literal('failed'),
  failureKind: z.enum(['service', 'footage']),
  failureCode: code,
});

export const workerMessageSchema = z.discriminatedUnion('type', [stageMessage, inspectionMessage, uploadMessage, resultMessage, failedMessage]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;
export type WorkerResult = z.infer<typeof resultMessage>;

/** Footage reasons from the worker, in plain words for the person. */
export const FOOTAGE_FAILURES: Readonly<Record<string, string>> = {
  not_a_video: 'This file is not a video we can read. Record or upload an MP4, MOV or WebM clip.',
  unreadable_video: 'We could not read this video. Try exporting it again from your phone.',
  no_video_stream: 'This file has no video in it.',
  resolution_too_low: 'This video is too small to see the hitter. Record at 720p or higher.',
  clip_too_short: 'This clip is too short. Include the setup, the swing and the finish.',
  clip_too_long: 'This clip is longer than two minutes. Trim it to the swings you want reviewed.',
  clip_too_large: 'This clip is larger than 200 MB. Trim it before uploading.',
  decode_timeout: 'This video took too long to read. Trim it and try again.',
};
