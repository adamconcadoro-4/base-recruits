/**
 * One-line summaries of a player's numbers, for the My schools box, the
 * athlete home and what a sharing parent sees. Pure.
 */

import { METRIC_INFO, POSITION_METRICS, isPosition } from './athletic';
import type { PlayerNumbers } from './player-store';
import { METRIC_LABELS, POSITION_LABELS } from './suggestions-explain';

/** Grades and test scores, or '' when none were entered. */
export function academicsLine(numbers: PlayerNumbers): string {
  const parts: string[] = [];
  if (numbers.gpa.trim()) {
    const type = numbers.gpaType === 'unweighted' ? 'unweighted' : numbers.gpaType === 'weighted' ? 'weighted' : 'type not stated';
    parts.push(`GPA ${numbers.gpa} out of ${numbers.gpaScale === '100' ? '100' : `${numbers.gpaScale}.0`} (${type})`);
  }
  if (numbers.satTotal.trim()) parts.push(`SAT ${numbers.satTotal.trim()}`);
  if (numbers.act.trim()) parts.push(`ACT ${numbers.act}`);
  if (numbers.coreGpaDivisionI.trim()) parts.push(`Division I core-course GPA ${numbers.coreGpaDivisionI}`);
  if (numbers.coreGpaDivisionII.trim()) parts.push(`Division II core-course GPA ${numbers.coreGpaDivisionII}`);
  return parts.join('; ');
}

/** Position and that position's baseball numbers, or '' when no position was chosen. */
export function baseballLine(numbers: PlayerNumbers): string {
  if (!isPosition(numbers.position)) return '';
  const metrics = POSITION_METRICS[numbers.position]
    .filter((m) => numbers[m].trim() !== '')
    .map((m) => `${METRIC_LABELS[m].toLowerCase()} ${numbers[m].trim()} ${METRIC_INFO[m].unit === 's' ? 'seconds' : 'mph'}`);
  return [POSITION_LABELS[numbers.position], ...metrics].join('; ');
}
