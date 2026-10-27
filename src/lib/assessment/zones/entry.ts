/**
 * What the tracker sends for one entry, tidied so it never carries an
 * observation that does not apply (no contact on a take, no lane on a foul),
 * and checked in plain language before it is saved. The database checks the
 * same rules again. Nothing unrecorded is filled in: a missing observation
 * stays null.
 */

import { OUTSIDE_LABELS } from '@/lib/assessment/zones/geometry';
import {
  isZoneId,
  type ContactOutcome,
  type EventKind,
  type OutsideLocation,
  type PitchClass,
  type PitchLocation,
  type SwingResponse,
  type ZoneAssignment,
  type ZoneEvent,
  type ZoneSide,
} from '@/lib/assessment/zones/types';

export interface ZoneEntryInput {
  readonly kind: EventKind;
  readonly batting_side: ZoneSide;
  readonly intended_zone: number | null;
  readonly location: PitchLocation | null;
  readonly pitch_class: PitchClass | null;
  readonly pitch_type: string | null;
  readonly response: SwingResponse | null;
  readonly contact: ContactOutcome | null;
  readonly hard_targeted: boolean | null;
  readonly depth_correct: boolean | null;
  readonly lane_correct: boolean | null;
  readonly posture_error: boolean | null;
  readonly recognition_call: PitchClass | null;
  readonly off_plan: boolean;
  readonly off_plan_reason: string | null;
  readonly forced_take: boolean;
  readonly voided: boolean;
  readonly void_reason: string | null;
  readonly media_id: string | null;
  readonly clip_time_ms: number | null;
  readonly note: string | null;
  readonly evidence_method: 'live' | 'video';
}

export function emptyEntry(kind: EventKind, side: ZoneSide): ZoneEntryInput {
  return {
    kind,
    batting_side: side,
    intended_zone: null,
    location: null,
    pitch_class: null,
    pitch_type: null,
    response: kind === 'tee_swing' ? 'swing' : null,
    contact: null,
    hard_targeted: null,
    depth_correct: null,
    lane_correct: null,
    posture_error: null,
    recognition_call: null,
    off_plan: false,
    off_plan_reason: null,
    forced_take: false,
    voided: false,
    void_reason: null,
    media_id: null,
    clip_time_ms: null,
    note: null,
    evidence_method: 'live',
  };
}

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/** Drops observations that do not apply to this kind of entry or response. */
export function tidyEntry(input: ZoneEntryInput): ZoneEntryInput {
  const pitch = input.kind === 'pitch';
  const response: SwingResponse | null = input.kind === 'tee_swing' ? 'swing' : input.kind === 'dry_rep' ? null : input.response;
  const swing = response === 'swing';
  const contact = swing ? input.contact : null;
  const location = !pitch && input.location?.startsWith('out_') ? null : input.location;
  return {
    ...input,
    intended_zone: pitch ? input.intended_zone : null,
    location,
    pitch_class: pitch && location === 'unknown' ? input.pitch_class : null,
    pitch_type: pitch ? trimmed(input.pitch_type) : null,
    response,
    contact,
    hard_targeted: swing ? input.hard_targeted : null,
    depth_correct: swing ? input.depth_correct : null,
    lane_correct: contact === 'fair' ? input.lane_correct : null,
    posture_error: swing || input.kind === 'dry_rep' ? input.posture_error : null,
    recognition_call: pitch ? input.recognition_call : null,
    off_plan: pitch && input.off_plan,
    off_plan_reason: pitch && input.off_plan ? trimmed(input.off_plan_reason) : null,
    forced_take: pitch && response === 'take' && input.forced_take,
    void_reason: input.voided ? trimmed(input.void_reason) : null,
    clip_time_ms: input.media_id ? input.clip_time_ms : null,
    note: trimmed(input.note),
  };
}

/** The first thing stopping this entry from being saved, or null. */
export function entryProblem(input: ZoneEntryInput): string | null {
  if (!input.location) return input.kind === 'pitch' ? 'Choose where the pitch arrived (or “Location unknown”).' : 'Choose the zone.';
  if (input.kind === 'pitch' && !input.response) return 'Choose swing or take.';
  if (input.voided && (input.void_reason?.trim().length ?? 0) < 3) return 'Say why this entry is left out.';
  if (input.clip_time_ms !== null && (!Number.isInteger(input.clip_time_ms) || input.clip_time_ms < 0 || input.clip_time_ms > 3_600_000)) {
    return 'The clip time must be between 0 and 3,600 seconds.';
  }
  if ((input.note?.length ?? 0) > 300) return 'Keep the note to 300 characters.';
  return null;
}

/** Plain summary of a saved entry for lists and screen readers, e.g. "Pitch 4 · Zone 6 · swing · foul". */
export function entrySummary(entry: Pick<ZoneEntryInput, 'kind' | 'location' | 'response' | 'contact' | 'voided'>, seq: number | null): string {
  const kind = entry.kind === 'pitch' ? 'Pitch' : entry.kind === 'tee_swing' ? 'Tee swing' : 'Dry rep';
  const where = !entry.location
    ? 'no location'
    : entry.location === 'unknown'
      ? 'location unknown'
      : entry.location.startsWith('z')
        ? `Zone ${entry.location.slice(1)}`
        : OUTSIDE_LABELS[entry.location as OutsideLocation].toLowerCase();
  const parts = [seq === null ? kind : `${kind} ${seq}`, where];
  if (entry.kind === 'pitch' && entry.response) parts.push(entry.response);
  if (entry.contact) parts.push(entry.contact === 'fair' ? 'fair ball' : entry.contact === 'unknown' ? 'contact not seen' : entry.contact);
  if (entry.voided) parts.push('left out');
  return parts.join(' · ');
}

/** Calculator input for an entry not yet read back from the database (the tracker's running totals). */
export function entryToEvent(input: ZoneEntryInput, assignment: ZoneAssignment, id: string, seq: number): ZoneEvent {
  const tidy = tidyEntry(input);
  return {
    id,
    seq,
    kind: tidy.kind,
    assignment,
    battingSide: tidy.batting_side,
    intendedZone: tidy.intended_zone !== null && isZoneId(tidy.intended_zone) ? tidy.intended_zone : null,
    location: tidy.location ?? 'unknown',
    pitchClass: tidy.pitch_class,
    response: tidy.response,
    contact: tidy.contact,
    hardTargeted: tidy.hard_targeted,
    depthCorrect: tidy.depth_correct,
    laneCorrect: tidy.lane_correct,
    postureError: tidy.posture_error,
    recognitionCall: tidy.recognition_call,
    offPlan: tidy.off_plan,
    forcedTake: tidy.forced_take,
    voided: tidy.voided,
  };
}

/** The editable form of a saved entry (for corrections). */
export function eventToEntry(event: ZoneEvent, extra: Pick<ZoneEntryInput, 'pitch_type' | 'off_plan_reason' | 'void_reason' | 'media_id' | 'clip_time_ms' | 'note' | 'evidence_method'>): ZoneEntryInput {
  return {
    kind: event.kind,
    batting_side: event.battingSide,
    intended_zone: event.intendedZone,
    location: event.location,
    pitch_class: event.pitchClass,
    pitch_type: extra.pitch_type,
    response: event.response,
    contact: event.contact,
    hard_targeted: event.hardTargeted,
    depth_correct: event.depthCorrect,
    lane_correct: event.laneCorrect,
    posture_error: event.postureError,
    recognition_call: event.recognitionCall,
    off_plan: event.offPlan,
    off_plan_reason: extra.off_plan_reason,
    forced_take: event.forcedTake,
    voided: event.voided,
    void_reason: extra.void_reason,
    media_id: extra.media_id,
    clip_time_ms: extra.clip_time_ms,
    note: extra.note,
    evidence_method: extra.evidence_method,
  };
}

/** "1 swing", "3 swings". */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
