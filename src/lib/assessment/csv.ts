/**
 * Generic CSV measurement import (no vendor-specific formats).
 *
 * File format, one measurement per row (header names are matched without
 * regard to case, spaces or punctuation; the person can also map columns):
 *
 *   assessment_ref  optional  must match the assessment being imported into
 *   rep             required  repetition number in this assessment (1–500)
 *   discipline      optional  hitting or pitching; must match the assessment
 *   pitch_type      pitching  required for velocity, spin, movement, strikes and targets
 *   metric          required  a metric key from the catalog, e.g. hit_exit_velocity_mph
 *   value           required  a number, or yes/no for charted outcomes
 *   unit            required  e.g. mph, km/h, m/s, ms, s, deg, rpm, in, cm, yes_no
 *   acquisition     required  sensor_measurement, video_estimate or observation
 *   device_kind     sensor    radar, ball_tracking, bat_sensor, motion_capture, force_plate, other
 *   device          sensor    the device's name or model, e.g. "Pocket radar"
 *   recorded_at     optional  ISO 8601 date-time from the device
 *
 * Rubric ratings and derived values cannot be imported. The database checks
 * every row again (import_assessment_measurements); this module powers the
 * preview, column mapping, row-level errors and in-file duplicate detection.
 */

import { requireMetric, metric as findMetric } from '@/lib/assessment/catalog/metrics';
import { DEVICE_KINDS, EVIDENCE_CATEGORIES, PITCH_TYPES, isDiscipline, type DeviceKind, type Discipline, type EvidenceCategory, type PitchType } from '@/lib/assessment/types';
import { convertToCanonical, normalizeUnit } from '@/lib/assessment/units';

export const CSV_FIELDS = [
  'assessment_ref',
  'rep',
  'discipline',
  'pitch_type',
  'metric',
  'value',
  'unit',
  'acquisition',
  'device_kind',
  'device',
  'recorded_at',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export const REQUIRED_CSV_FIELDS: readonly CsvField[] = ['rep', 'metric', 'value', 'unit', 'acquisition'];

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_REPETITION_NUMBER = 500;

const HEADER_ALIASES: Readonly<Record<string, CsvField>> = {
  assessmentref: 'assessment_ref',
  assessment: 'assessment_ref',
  assessmentid: 'assessment_ref',
  session: 'assessment_ref',
  sessionid: 'assessment_ref',
  rep: 'rep',
  repetition: 'rep',
  repnumber: 'rep',
  swing: 'rep',
  pitch: 'rep',
  pitchnumber: 'rep',
  discipline: 'discipline',
  pitchtype: 'pitch_type',
  metric: 'metric',
  metrickey: 'metric',
  measure: 'metric',
  value: 'value',
  reading: 'value',
  unit: 'unit',
  units: 'unit',
  acquisition: 'acquisition',
  evidence: 'acquisition',
  method: 'acquisition',
  devicekind: 'device_kind',
  devicetype: 'device_kind',
  device: 'device',
  devicename: 'device',
  source: 'device',
  recordedat: 'recorded_at',
  timestamp: 'recorded_at',
  time: 'recorded_at',
  datetime: 'recorded_at',
};

/** Parses CSV text (RFC 4180 quoting, CRLF or LF line endings, optional byte-order mark) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] as string;
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/** Suggested mapping from the file's header row: field → column index. */
export function suggestMapping(header: readonly string[]): Partial<Record<CsvField, number>> {
  const mapping: Partial<Record<CsvField, number>> = {};
  header.forEach((name, index) => {
    const field = HEADER_ALIASES[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}

export function missingRequiredFields(mapping: Partial<Record<CsvField, number>>): CsvField[] {
  return REQUIRED_CSV_FIELDS.filter((field) => mapping[field] === undefined);
}

/** A validated row, ready to send to the database. */
export interface ImportRow {
  /** Row number in the file (the header is row 1). */
  readonly row: number;
  readonly rep: number;
  readonly pitch_type: PitchType | null;
  readonly metric_key: string;
  /** The value as written in the file (yes/no become 1/0). */
  readonly value: number;
  readonly unit: string;
  readonly acquisition: EvidenceCategory;
  readonly device_kind: DeviceKind | null;
  readonly device_label: string | null;
  readonly recorded_at: string | null;
  /** The value after conversion to the metric's stored unit (preview only; the database converts again). */
  readonly canonical_value: number;
}

export interface RejectedRow {
  readonly row: number;
  readonly reasons: readonly string[];
}

export interface ImportTarget {
  readonly assessmentId: string;
  readonly discipline: Discipline;
  /** Metric keys in the assessment's protocol. */
  readonly metricKeys: readonly string[];
}

export interface ValidationOutcome {
  readonly accepted: readonly ImportRow[];
  readonly rejected: readonly RejectedRow[];
  readonly duplicateRows: number;
}

function parseBooleanCell(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(value)) return 1;
  if (['no', 'n', 'false', '0'].includes(value)) return 0;
  return null;
}

/** Validates data rows (header excluded) against the catalog and the assessment. */
export function validateRows(
  dataRows: readonly (readonly string[])[],
  mapping: Partial<Record<CsvField, number>>,
  target: ImportTarget,
): ValidationOutcome {
  const accepted: ImportRow[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Map<string, number>();
  let duplicateRows = 0;
  const cell = (cells: readonly string[], field: CsvField) => {
    const index = mapping[field];
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const reasons: string[] = [];

    const reference = cell(cells, 'assessment_ref');
    if (reference && reference.toLowerCase() !== target.assessmentId.toLowerCase()) {
      reasons.push('The assessment reference does not match this assessment.');
    }
    const discipline = cell(cells, 'discipline').toLowerCase();
    if (discipline && (!isDiscipline(discipline) || discipline !== target.discipline)) {
      reasons.push(`The discipline must be ${target.discipline}.`);
    }

    const repText = cell(cells, 'rep');
    const rep = Number(repText);
    if (!/^\d+$/.test(repText) || rep < 1 || rep > MAX_REPETITION_NUMBER) {
      reasons.push(`The repetition must be a whole number from 1 to ${MAX_REPETITION_NUMBER}.`);
    }

    const metricKey = cell(cells, 'metric');
    const definition = findMetric(metricKey);
    if (!definition) {
      reasons.push(`“${metricKey || '(blank)'}” is not a metric Base Recruits recognizes.`);
    } else {
      if (!target.metricKeys.includes(definition.key)) reasons.push('That metric is not part of this assessment’s protocol.');
      if (definition.granularity !== 'repetition') reasons.push('Rubric ratings are entered in the app, not imported.');
      if (definition.derived) reasons.push('Derived values are calculated by Base Recruits and cannot be imported.');
    }

    const pitchText = cell(cells, 'pitch_type').toLowerCase().replace(/[\s-]+/g, '_');
    let pitchType: PitchType | null = null;
    if (pitchText) {
      if ((PITCH_TYPES as readonly string[]).includes(pitchText)) pitchType = pitchText as PitchType;
      else reasons.push(`“${cell(cells, 'pitch_type')}” is not a recognized pitch type.`);
    }
    if (definition?.perPitchType && !pitchType) reasons.push('This metric needs a pitch type.');

    const acquisition = cell(cells, 'acquisition').toLowerCase();
    let evidence: EvidenceCategory | null = null;
    if ((EVIDENCE_CATEGORIES as readonly string[]).includes(acquisition)) evidence = acquisition as EvidenceCategory;
    else reasons.push('Acquisition must be sensor_measurement, video_estimate or observation.');
    if (definition && evidence && !definition.evidence.includes(evidence)) {
      reasons.push('That kind of evidence is not accepted for this metric.');
    }

    const deviceKindText = cell(cells, 'device_kind').toLowerCase();
    let deviceKind: DeviceKind | null = null;
    if (deviceKindText) {
      if ((DEVICE_KINDS as readonly string[]).includes(deviceKindText)) deviceKind = deviceKindText as DeviceKind;
      else reasons.push(`“${cell(cells, 'device_kind')}” is not a recognized device kind.`);
    }
    const deviceLabel = cell(cells, 'device') || null;
    if (deviceLabel && deviceLabel.length > 80) reasons.push('The device name is longer than 80 characters.');
    if (definition?.requiresDevice && (!deviceKind || !deviceLabel)) {
      reasons.push('Sensor values need both a device kind and a device name.');
    }

    const unit = normalizeUnit(cell(cells, 'unit'));
    const rawValue = cell(cells, 'value');
    let value: number | null = null;
    let canonical: number | null = null;
    if (definition) {
      if (definition.valueKind === 'boolean') {
        value = parseBooleanCell(rawValue);
        if (value === null) reasons.push('Charted outcomes must be yes or no.');
        if (unit !== null && unit !== 'yes_no') reasons.push('Charted outcomes use the unit yes_no.');
        canonical = value;
      } else {
        value = rawValue !== '' && Number.isFinite(Number(rawValue)) ? Number(rawValue) : null;
        if (value === null) reasons.push('The value must be a number.');
        canonical = value === null || unit === null ? null : convertToCanonical(value, unit, definition.unit);
        if (unit === null) reasons.push('The unit is missing.');
        else if (value !== null && canonical === null) reasons.push(`“${cell(cells, 'unit')}” is not an accepted unit for this metric.`);
        if (canonical !== null && ((definition.min !== null && canonical < definition.min) || (definition.max !== null && canonical > definition.max))) {
          reasons.push(`The value is outside the valid range (${definition.min}–${definition.max} ${definition.unit}).`);
        }
      }
    }

    const recordedText = cell(cells, 'recorded_at');
    let recordedAt: string | null = null;
    if (recordedText) {
      const parsed = new Date(recordedText);
      if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(recordedText)) {
        reasons.push('recorded_at must be an ISO 8601 date and time.');
      } else {
        recordedAt = parsed.toISOString();
      }
    }

    if (reasons.length > 0 || !definition || value === null || canonical === null || !evidence) {
      rejected.push({ row: rowNumber, reasons: reasons.length > 0 ? reasons : ['This row could not be read.'] });
      return;
    }

    const key = [definition.key, rep, pitchType ?? '', canonical, (deviceLabel ?? '').toLowerCase(), recordedAt ?? ''].join('|');
    const first = seen.get(key);
    if (first !== undefined) {
      duplicateRows += 1;
      rejected.push({ row: rowNumber, reasons: [`Duplicate of row ${first}.`] });
      return;
    }
    seen.set(key, rowNumber);
    accepted.push({
      row: rowNumber,
      rep,
      pitch_type: pitchType,
      metric_key: definition.key,
      value,
      unit: definition.valueKind === 'boolean' ? 'yes_no' : (unit as string),
      acquisition: evidence,
      device_kind: deviceKind,
      device_label: deviceLabel,
      recorded_at: recordedAt,
      canonical_value: canonical,
    });
  });

  // One repetition carries one value per metric.
  const byRepMetric = new Map<string, number>();
  for (const row of accepted) {
    const key = `${row.metric_key}|${row.rep}`;
    byRepMetric.set(key, (byRepMetric.get(key) ?? 0) + 1);
  }
  const conflicted = accepted.filter((row) => (byRepMetric.get(`${row.metric_key}|${row.rep}`) ?? 0) > 1);
  for (const row of conflicted) {
    rejected.push({ row: row.row, reasons: [`Repetition ${row.rep} has more than one ${requireMetric(row.metric_key).name.toLowerCase()} value in this file.`] });
  }
  const kept = accepted.filter((row) => !conflicted.includes(row));
  return { accepted: kept, rejected: rejected.sort((a, b) => a.row - b.row), duplicateRows };
}

/** A small example file for the import page, built from the catalog. */
export function exampleCsv(discipline: Discipline): string {
  const header = CSV_FIELDS.join(',');
  if (discipline === 'hitting') {
    return [
      header,
      ',1,hitting,,hit_exit_velocity_mph,78.4,mph,sensor_measurement,radar,Example radar,2026-11-02T16:05:00Z',
      ',2,hitting,,hit_exit_velocity_mph,126.1,km/h,sensor_measurement,radar,Example radar,2026-11-02T16:05:40Z',
      ',1,hitting,,hit_solid_contact,yes,yes_no,observation,,,',
    ].join('\n');
  }
  return [
    header,
    ',1,pitching,four_seam,pit_velocity_mph,74.5,mph,sensor_measurement,radar,Example radar,2026-11-02T16:05:00Z',
    ',1,pitching,four_seam,pit_strike,yes,yes_no,observation,,,',
    ',2,pitching,changeup,pit_strike,no,yes_no,observation,,,',
  ].join('\n');
}
