/**
 * Plain words for SeamState codes shown to people: clip results, retake
 * reasons, evidence grades and why there are no AI findings. Framework-free.
 */

import { RETAKE_TIPS, ROLE_GROUPS } from '@/lib/seamstate/landmarks';
import type { InterpretationStatus } from '@/lib/seamstate/record';
import type { ClipVerdict, EvidenceGrade } from '@/lib/seamstate/types';
import { FOOTAGE_FAILURES } from '@/lib/seamstate/worker-messages';

export const VERDICT_LABELS: Readonly<Record<ClipVerdict, string>> = {
  suitable: 'Clear enough to review',
  limited: 'Reviewed, with parts of the body hard to see',
  retake_recommended: 'Please film this again',
  no_swing_detected: 'No swing found',
  subject_selection_required: 'More than one person in the video',
};

const REASON_LABELS: Readonly<Record<string, string>> = {
  several_people: 'More than one person is in the video, so we could not tell which one is the hitter. Film with only the hitter in the frame.',
  hitter_not_found: 'We could not find a hitter in the video. Film the whole body from a steady position.',
  no_swing_found: 'We could not find a full swing. Include the setup, the swing and the finish in one clip.',
  hitter_too_small: 'The hitter is too small in the frame. Move closer, so the hitter fills most of the frame’s height.',
  hitter_not_tracked: 'We could not follow the hitter through the swing. Film from a steady position with good light.',
};

/** A plain-language reason (and how to film it again) for a clip result code. */
export function verdictReason(code: string): string {
  if (code.startsWith('missing_')) {
    const group = code.slice('missing_'.length);
    if (group in ROLE_GROUPS) return RETAKE_TIPS[group as keyof typeof ROLE_GROUPS];
  }
  return REASON_LABELS[code] ?? 'Part of the clip could not be reviewed.';
}

export const EVIDENCE_GRADE_LABELS: Readonly<Record<EvidenceGrade, string>> = {
  strong: 'Strong support from this video',
  moderate: 'Some support from this video',
  limited: 'Limited support from this video',
  insufficient: 'Not enough support',
};

/** Why a report has no AI findings, when it has none. Null when it has them or none were needed. */
export function interpretationNotice(status: InterpretationStatus | string | undefined): string | null {
  switch (status) {
    case 'interpreted':
    case 'not_needed':
      return null;
    case 'not_configured':
      return 'The AI review step is not set up yet, so this report shows only what the video check found.';
    case 'declined':
    case 'malformed':
    case 'provider_error':
      return 'The AI review step did not finish for this clip. This has nothing to do with your swing. The video check results are below.';
    default:
      return 'The AI review step did not run for this clip.';
  }
}

const SERVICE_FAILURES: Readonly<Record<string, string>> = {
  switched_off: 'Swing analysis was switched off before this clip was finished.',
  too_many_attempts: 'The analysis service did not finish after three tries.',
  stalled: 'The analysis service stopped responding after three tries.',
};

/** What went wrong with a failed analysis, in plain words. */
export function failureReason(kind: 'service' | 'footage' | null, code: string | null): string | null {
  if (!code) return null;
  if (code === 'clip_unavailable') return 'The video is no longer available.';
  if (kind === 'footage') return FOOTAGE_FAILURES[code] ?? 'We could not read this video. Try exporting it again from your phone.';
  return SERVICE_FAILURES[code] ?? null;
}

/** Why a reviewed swing was not counted (decision F37: only swings where the bat hits the ball count). */
export function swingNotCounted(swing: number, contact: string): string {
  if (contact === 'no_contact') return `Swing ${swing} was not counted: it looked like a practice swing or a miss.`;
  return `Swing ${swing} was not counted: the stills did not clearly show the bat hitting the ball.`;
}

export const ASSIGNMENT_LABELS: Readonly<Record<string, string>> = {
  swing_all: 'Swing at everything',
  selective: 'Swing at strikes only',
  take_all: 'Take every pitch',
  none: 'No assignment',
};

export const RELATION_LABELS: Readonly<Record<string, string>> = {
  athlete: 'Athlete',
  guardian: 'Parent or guardian',
  development_coach: 'Development coach',
};

export const EVENT_LABELS: Readonly<Record<string, string>> = {
  setup: 'Setup',
  stride_start: 'Stride starts',
  load_start: 'Load starts',
  foot_contact: 'Front foot lands',
  swing_start: 'Swing starts',
  contact: 'Contact',
  finish: 'Finish',
};
