import 'server-only';

import { captureContextSchema } from '@/lib/seamstate/capture';
import { evidencePacketSchema, type EvidencePacket } from '@/lib/seamstate/packet';
import { selectModelFrames } from '@/lib/seamstate/prompt';
import { analysisRecord } from '@/lib/seamstate/record';
import { interpretClip } from '@/lib/seamstate/server/interpret';
import { workerSecret, workerUrl } from '@/lib/seamstate/server/config';
import { SIGNATURE_HEADER, signBody } from '@/lib/seamstate/signing';
import type { WorkerMessage, WorkerResult } from '@/lib/seamstate/worker-messages';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The app's side of the worker connection. Every database call goes through
 * the six seamstate_worker_* functions, which refuse stale attempts, finished
 * or cancelled jobs, withdrawn permission and a switched-off service; this
 * module never writes SeamState tables any other way.
 */

export const ARTIFACT_BUCKET = 'seamstate-artifacts';
const MEDIA_BUCKET = 'assessment-media';
/** The worker build the dispatcher expects (worker/seamstate_worker/__init__.py). */
export const EXPECTED_WORKER_VERSION = 'seamstate-worker-1';
const STALL_SECONDS = 600;
const MEDIA_LINK_SECONDS = 900;

type Admin = ReturnType<typeof createAdminClient>;

async function report(
  admin: Admin,
  attemptId: string,
  stage: string,
  metrics: Record<string, unknown> = {},
  state: string | null = null,
  failure: { kind: string | null; code: string } | null = null,
): Promise<boolean> {
  const { data, error } = await admin.rpc('seamstate_worker_report', {
    p_attempt_id: attemptId,
    p_stage: stage,
    p_metrics: metrics,
    p_state: state,
    p_failure_kind: failure?.kind ?? null,
    p_failure_code: failure?.code ?? null,
  });
  if (error) {
    console.error('SeamState report refused', { code: error.code });
    return false;
  }
  return data === true;
}

async function artifactPath(admin: Admin, attemptId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('seamstate_worker_artifact_path', { p_attempt_id: attemptId });
  return error || typeof data !== 'string' ? null : data;
}

/** Starts queued jobs on the worker (and requeues stalled ones). Safe to run at any time. */
export async function dispatchDueJobs(limit = 2): Promise<{ dispatched: number; skipped?: 'worker_not_configured' }> {
  const url = workerUrl();
  const secret = workerSecret();
  if (!url || !secret) return { dispatched: 0, skipped: 'worker_not_configured' };
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc('seamstate_worker_due_jobs', { p_stall_seconds: STALL_SECONDS, p_limit: limit });
  if (error || !Array.isArray(due)) return { dispatched: 0 };
  let dispatched = 0;
  for (const { job_id: jobId } of due as { job_id: string }[]) {
    const { data: rows } = await admin.rpc('seamstate_worker_begin_attempt', { p_job_id: jobId, p_worker_version: EXPECTED_WORKER_VERSION });
    const attempt = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    if (!attempt) continue;
    const attemptId = String(attempt.attempt_id);
    const capture = captureContextSchema.safeParse(attempt.capture);
    const link = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(String(attempt.storage_path), MEDIA_LINK_SECONDS);
    if (!capture.success || link.error) {
      await report(admin, attemptId, 'failed', {}, 'failed', { kind: 'service', code: capture.success ? 'clip_link_unavailable' : 'bad_capture' });
      continue;
    }
    const body = JSON.stringify({
      jobId,
      attemptId,
      mediaId: attempt.media_id,
      mediaUrl: link.data.signedUrl,
      capture: capture.data,
      timing: attempt.timing,
    });
    let status = 0;
    try {
      const response = await fetch(`${url}/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signBody(secret, body) },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      status = response.status;
    } catch {
      status = 0;
    }
    if (status === 202) {
      dispatched += 1;
    } else {
      // Give the job back; the next sweep tries again (at most three attempts).
      await report(admin, attemptId, 'failed', { status }, 'queued', { kind: null, code: status === 503 || status === 429 ? 'worker_busy' : 'worker_unreachable' });
    }
  }
  return { dispatched };
}

export interface CallbackOutcome {
  readonly answer: { readonly continue: boolean; readonly urls?: Readonly<Record<string, string>> };
  /** Work to finish after answering the worker (the AI review can take a minute). */
  readonly background?: () => Promise<void>;
}

export async function handleWorkerMessage(message: WorkerMessage): Promise<CallbackOutcome> {
  const admin = createAdminClient();
  const stop: CallbackOutcome = { answer: { continue: false } };
  switch (message.type) {
    case 'stage':
      return { answer: { continue: await report(admin, message.attemptId, message.stage, message.metrics) } };
    case 'inspection': {
      const { data, error } = await admin.rpc('seamstate_worker_record_inspection', {
        p_attempt_id: message.attemptId,
        p_inspection: message.inspection,
      });
      return { answer: { continue: !error && data === true } };
    }
    case 'upload_urls': {
      const prefix = await artifactPath(admin, message.attemptId);
      if (!prefix) return stop;
      const urls: Record<string, string> = {};
      for (const file of new Set(message.files)) {
        const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).createSignedUploadUrl(`${prefix}/${file}`, { upsert: true });
        if (error) return stop;
        urls[file] = data.signedUrl;
      }
      return { answer: { continue: true, urls } };
    }
    case 'failed':
      await report(admin, message.attemptId, 'failed', {}, 'failed', { kind: message.failureKind, code: message.failureCode });
      return stop;
    case 'result':
      return acceptResult(admin, message);
  }
}

async function acceptResult(admin: Admin, message: WorkerResult): Promise<CallbackOutcome> {
  const stop: CallbackOutcome = { answer: { continue: false } };
  const prefix = await artifactPath(admin, message.attemptId);
  if (!prefix) return stop;
  const packet = evidencePacketSchema.safeParse(message.packet);
  if (!packet.success || packet.data.mediaId !== prefix.split('/')[1] || (packet.data.capture.setting.setting === 'tee' && packet.data.releaseVisible)) {
    await report(admin, message.attemptId, 'failed', {}, 'failed', { kind: 'service', code: 'bad_packet' });
    return stop;
  }
  if (message.verdict === 'subject_selection_required') {
    // The person picks the hitter; nothing is sent to the AI provider until then.
    await report(admin, message.attemptId, 'extracting', { people: message.reasons.length }, 'needs_input');
    return { answer: { continue: true } };
  }
  if (!(await report(admin, message.attemptId, 'interpreting', {}, 'analyzing'))) return stop;
  return { answer: { continue: true }, background: () => finishAnalysis(message, packet.data, prefix) };
}

async function finishAnalysis(message: WorkerResult, packet: EvidencePacket, prefix: string): Promise<void> {
  const admin = createAdminClient();
  const attemptId = message.attemptId;
  try {
    let frames = message.verdict === 'suitable' || message.verdict === 'limited' ? selectModelFrames(packet) : [];
    const stills = new Map<string, string>();
    for (const frame of frames) {
      const { data } = await admin.storage.from(ARTIFACT_BUCKET).download(`${prefix}/${frame.frameId}.jpg`);
      if (data) stills.set(frame.frameId, Buffer.from(await data.arrayBuffer()).toString('base64'));
    }
    frames = frames.filter((frame) => stills.has(frame.frameId));
    let interpretation: Awaited<ReturnType<typeof interpretClip>> = { status: 'not_needed', modelId: null, validation: null, usage: null };
    if (frames.length > 0) {
      // Checked again just before anything leaves for the provider: permission, switch, current attempt.
      if (!(await report(admin, attemptId, 'interpreting', { stills: frames.length }))) return;
      interpretation = await interpretClip(packet, frames, stills);
      await report(admin, attemptId, 'validating', {
        status: interpretation.status,
        input_tokens: interpretation.usage?.inputTokens ?? 0,
        output_tokens: interpretation.usage?.outputTokens ?? 0,
      });
    }
    const record = analysisRecord({
      packet,
      verdict: message.verdict,
      reasons: message.reasons,
      versions: message.versions,
      status: interpretation.status,
      modelId: interpretation.modelId,
      validation: interpretation.validation,
      framesShown: frames.map((frame) => frame.frameId),
    });
    if (!(await report(admin, attemptId, 'saving', { findings: record.findings.length }))) return;
    const { error } = await admin.rpc('seamstate_worker_save_analysis', {
      p_attempt_id: attemptId,
      p_state: record.state,
      p_analysis: record.analysis,
      p_findings: record.findings,
    });
    if (error) throw new Error(`save refused (${error.code})`);
  } catch (error) {
    console.error('SeamState analysis could not be finished', { reason: error instanceof Error ? error.message : 'unknown' });
    await report(admin, attemptId, 'failed', {}, 'failed', { kind: 'service', code: 'app_error' });
  }
}
