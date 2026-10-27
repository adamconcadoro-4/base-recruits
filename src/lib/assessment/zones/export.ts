/**
 * A session's entries as CSV: what was observed, the assignment each entry
 * was judged against, and the workbook-style 1/0 flags derived from those
 * observations (blank when not scored, never filled in). Cells that a
 * spreadsheet would run as a formula are prefixed so they stay text.
 */

import { pitchOutcomes, type Outcome } from '@/lib/assessment/zones/metrics';
import type { ContextEvent, ZoneAssignmentRow, ZoneRoundRow } from '@/lib/assessment/zones/records';
import { ZONE_CALC_VERSION, classOf } from '@/lib/assessment/zones/types';

export const EXPORT_COLUMNS = [
  'session_date',
  'round',
  'entry',
  'kind',
  'batting_side',
  'stage',
  'delivery',
  'assignment_version',
  'assignment',
  'swing_zones',
  'recognition_required',
  'intended_zone',
  'actual_location',
  'pitch_type',
  'strike_ball',
  'swing_take',
  'contact',
  'hard_targeted',
  'depth_correct',
  'lane_correct',
  'posture_error',
  'recognition_call',
  'off_plan',
  'off_plan_reason',
  'forced_take',
  'left_out',
  'left_out_reason',
  'evidence_method',
  'clip_time_s',
  'note',
  'recorded_by',
  'decision_correct',
  'chase',
  'contact_on_strike',
  'recognition_correct',
  'calc_version',
] as const;

const flag = (value: boolean | null): string => (value === null ? '' : value ? '1' : '0');
const scored = (outcome: Outcome): string => (outcome.kind === 'scored' ? (outcome.hit ? '1' : '0') : '');

/** One CSV cell: quoted when needed, and never read as a formula. */
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function sessionCsv(
  items: readonly ContextEvent[],
  rounds: readonly Pick<ZoneRoundRow, 'id' | 'seq'>[],
  assignments: readonly Pick<ZoneAssignmentRow, 'id' | 'version' | 'kind' | 'swing_zones' | 'recognition_required'>[],
): string {
  const roundSeq = new Map(rounds.map((round) => [round.id, round.seq]));
  const assignmentMap = new Map(assignments.map((item) => [item.id, item]));
  const sorted = [...items].sort((a, b) => (roundSeq.get(a.row.round_id) ?? 0) - (roundSeq.get(b.row.round_id) ?? 0) || a.row.seq - b.row.seq);
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const item of sorted) {
    const { row, event } = item;
    const assignment = assignmentMap.get(row.assignment_id);
    const outcomes = pitchOutcomes(event);
    const pitchClass = event.kind === 'pitch' ? classOf(event.location, event.pitchClass) : null;
    const cells: Array<string | number | null> = [
      item.sessionDate,
      roundSeq.get(row.round_id) ?? null,
      row.seq,
      row.kind,
      row.batting_side,
      item.stage,
      item.deliverySource,
      assignment?.version ?? null,
      assignment?.kind ?? null,
      assignment ? assignment.swing_zones.join(' ') : null,
      assignment ? flag(assignment.recognition_required) : null,
      row.intended_zone,
      row.location,
      row.pitch_type,
      pitchClass,
      row.response,
      row.contact,
      flag(row.hard_targeted),
      flag(row.depth_correct),
      flag(row.lane_correct),
      flag(row.posture_error),
      row.recognition_call,
      flag(row.off_plan),
      row.off_plan_reason,
      flag(row.forced_take),
      flag(row.voided),
      row.void_reason,
      row.evidence_method,
      row.clip_time_ms === null ? null : (row.clip_time_ms / 1000).toFixed(1),
      row.note,
      row.source_kind === 'development_coach' ? 'development coach' : 'athlete side',
      scored(outcomes.decision),
      scored(outcomes.chase),
      scored(outcomes.strike_contact),
      scored(outcomes.recognition),
      ZONE_CALC_VERSION,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
