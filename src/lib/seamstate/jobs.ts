/**
 * Analysis job lifecycle. private.seamstate_can_transition in the database
 * enforces the same table; this module lets the app and its tests reason
 * about it without a database.
 */

import type { FailureKind, JobState } from '@/lib/seamstate/types';

export const TERMINAL_STATES: readonly JobState[] = ['complete', 'partial', 'failed', 'cancelled'];

const TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  queued: ['preprocessing', 'failed', 'cancelled'],
  // Back to queued: a stalled attempt is retried (up to ATTEMPT_POLICY.maxAttempts).
  preprocessing: ['queued', 'analyzing', 'needs_input', 'complete', 'partial', 'failed', 'cancelled'],
  needs_input: ['queued', 'cancelled'],
  analyzing: ['queued', 'complete', 'partial', 'failed', 'cancelled'],
  complete: [],
  partial: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Retry policy for a stalled or crashed worker attempt. Engineering limits, configurable. */
export const ATTEMPT_POLICY = {
  maxAttempts: 3,
  /** An attempt that has not reported within this time is treated as stalled. */
  stallAfterMs: 10 * 60 * 1000,
  /** Backoff before attempt n (1-based): base × 2^(n − 2) for n ≥ 2. */
  backoffBaseMs: 30 * 1000,
} as const;

export function backoffBeforeAttempt(attemptNumber: number): number {
  return attemptNumber <= 1 ? 0 : ATTEMPT_POLICY.backoffBaseMs * 2 ** (attemptNumber - 2);
}

export interface JobSnapshot {
  readonly state: JobState;
  readonly currentAttemptId: string | null;
  readonly cancelled: boolean;
  readonly deleted: boolean;
}

/**
 * Whether a worker callback may write results. Stale attempts, and any
 * callback after the job was cancelled, deleted or finished, are refused so
 * a late answer cannot overwrite newer results or recreate deleted ones.
 */
export function acceptsCallback(job: JobSnapshot, attemptId: string): boolean {
  if (job.cancelled || job.deleted || isTerminal(job.state)) return false;
  return job.currentAttemptId !== null && job.currentAttemptId === attemptId;
}

/** What the person sees for each state. Real stage names; never a made-up percentage. */
export const JOB_STATE_LABELS: Readonly<Record<JobState, string>> = {
  queued: 'Waiting to start',
  preprocessing: 'Checking the video and tracking the hitter',
  analyzing: 'Reviewing the swing',
  needs_input: 'We need your help: please choose the hitter',
  complete: 'Ready',
  partial: 'Ready, with some parts not assessable',
  failed: 'Not finished',
  cancelled: 'Cancelled',
};

/**
 * A failure explained without blaming the swing when the service failed.
 * Footage failures always come with a specific retake reason elsewhere.
 */
export function failureMessage(kind: FailureKind): string {
  return kind === 'service'
    ? 'Swing analysis is not available right now. This has nothing to do with your swing or your video; please try again later.'
    : 'We could not analyze this video. See the reason and how to film it again below.';
}
