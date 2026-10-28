/**
 * Practice counts on hitting training logs (decision F39), from the
 * workbook's Practice Log: swings and solid contacts, swing/take decisions
 * judged and good ones, landings checked and on the intended spot.
 *
 * Every count is optional and blank is not zero. A rate is only ever shown as
 * "made of counted" for the rounds that counted it, and coach observations are
 * never added to the athlete's or family's own reports. Counts describe
 * practice; they are not measurements and never change an assessment score.
 */

import type { SourceKind } from '@/lib/assessment/types';

export interface PracticeCountFields {
  readonly swings: number | null;
  readonly solid_contacts: number | null;
  readonly decisions_assessed: number | null;
  readonly decisions_correct: number | null;
  readonly landings_assessed: number | null;
  readonly landings_intended: number | null;
}

export type PracticeCountField = keyof PracticeCountFields;

export interface PracticeCountMeasure {
  readonly key: 'contact' | 'decisions' | 'landings';
  readonly label: string;
  readonly made: PracticeCountField;
  readonly of: PracticeCountField;
  /** Form labels for the two fields. */
  readonly madeLabel: string;
  readonly ofLabel: string;
  /** "7 of 10 swings" */
  readonly unit: string;
}

export const PRACTICE_COUNT_MEASURES: readonly PracticeCountMeasure[] = [
  { key: 'contact', label: 'Solid contact', made: 'solid_contacts', of: 'swings', madeLabel: 'Solid contacts', ofLabel: 'Swings', unit: 'swings' },
  {
    key: 'decisions',
    label: 'Good swing/take decisions',
    made: 'decisions_correct',
    of: 'decisions_assessed',
    madeLabel: 'Good decisions',
    ofLabel: 'Pitches judged for swing or take',
    unit: 'pitches judged',
  },
  {
    key: 'landings',
    label: 'Landed on the intended spot',
    made: 'landings_intended',
    of: 'landings_assessed',
    madeLabel: 'On the intended spot',
    ofLabel: 'Landings checked',
    unit: 'landings checked',
  },
];

export const PRACTICE_COUNT_FIELDS: readonly PracticeCountField[] = PRACTICE_COUNT_MEASURES.flatMap((item) => [item.of, item.made]);

export const PRACTICE_COUNT_MAX = 300;

/** Who the counts come from: a coach's observation or the athlete's or family's own report. */
export const COUNT_SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  development_coach: 'observed by the development coach',
  self: 'reported by the athlete or family',
};

/** The same rules the database applies, in words, or null when the counts are fine. */
export function practiceCountsProblem(values: PracticeCountFields): string | null {
  for (const field of PRACTICE_COUNT_FIELDS) {
    const value = values[field];
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > PRACTICE_COUNT_MAX)) {
      return `Each practice count is a whole number from 0 to ${PRACTICE_COUNT_MAX}.`;
    }
  }
  for (const item of PRACTICE_COUNT_MEASURES) {
    const made = values[item.made];
    const of = values[item.of];
    if (made !== null && (of === null || made > of)) {
      return `${item.madeLabel} needs the number of ${item.unit}, and cannot be more than it.`;
    }
  }
  return null;
}

/** One log's counts in words: ["solid contact 7 of 10 swings", "3 landings checked"]. */
export function describeCounts(log: PracticeCountFields): string[] {
  const parts: string[] = [];
  for (const item of PRACTICE_COUNT_MEASURES) {
    const made = log[item.made];
    const of = log[item.of];
    if (of === null) continue;
    parts.push(made === null ? `${of} ${item.unit}` : `${item.label.toLowerCase()} ${made} of ${of} ${item.unit}`);
  }
  return parts;
}

export interface CountTotal {
  readonly made: number;
  readonly of: number;
  /** Logs that counted both numbers. */
  readonly rounds: number;
}

export interface CountSummary {
  readonly measure: PracticeCountMeasure;
  readonly bySource: Readonly<Partial<Record<SourceKind, CountTotal>>>;
}

/**
 * Totals per measure, kept apart by who counted. Only logs that counted both
 * numbers of a measure add to its rate, so a blank never reads as a miss.
 */
export function summarizeCounts(logs: ReadonlyArray<PracticeCountFields & { readonly logger_kind: SourceKind }>): CountSummary[] {
  return PRACTICE_COUNT_MEASURES.map((measure) => {
    const bySource: Partial<Record<SourceKind, CountTotal>> = {};
    for (const log of logs) {
      const made = log[measure.made];
      const of = log[measure.of];
      if (made === null || of === null) continue;
      const total = bySource[log.logger_kind] ?? { made: 0, of: 0, rounds: 0 };
      bySource[log.logger_kind] = { made: total.made + made, of: total.of + of, rounds: total.rounds + 1 };
    }
    return { measure, bySource };
  }).filter((item) => Object.keys(item.bySource).length > 0);
}

/** "31 of 45 swings (69%)" */
export function formatTotal(total: CountTotal, unit: string): string {
  const rate = total.of > 0 ? ` (${Math.round((100 * total.made) / total.of)}%)` : '';
  return `${total.made} of ${total.of} ${unit}${rate}`;
}
