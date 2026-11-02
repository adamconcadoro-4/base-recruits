/**
 * Groups library drills for browsing: the Development Workbook's sections and
 * rehearsals, the Master Workbook's body areas, and the remaining starter
 * drills, in that order.
 */

import type { DrillDefinition } from '@/lib/assessment/catalog/drills';
import { MASTER_CATEGORIES } from '@/lib/assessment/hitting-workbook/master';

export interface DrillGroup {
  readonly label: string;
  readonly description: string;
  readonly drills: readonly DrillDefinition[];
}

const DEVELOPMENT = 'Base Recruits hitting development workbook. Reviewed by Base Recruits hitting coaches.';

const MASTER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'Top hand / back arm': 'Top-hand and rear-arm control of the barrel.',
  'Front leg': 'Receiving the stride and supporting the turn.',
  'Rear leg': 'Loading, balance and moving out of the rear side.',
  Posture: 'Controlling the torso through the swing, adjusted to pitch height.',
  'Balance / head control': 'Balance, head movement, pitch tracking and swing/take reads.',
  'Medicine ball': 'Rotational throws with a coach-selected ball. Not scored in the assessment.',
};

function groupKey(item: DrillDefinition): string {
  const source = item.workbook;
  if (!source) return 'Other drills';
  if (source.book === 'master') return `Body area: ${source.section}`;
  if (source.kind === 'rehearsal') return 'Rehearsals and feedback tools';
  return source.section.replace(/^([A-D]) – /, '$1 · ');
}

function description(item: DrillDefinition): string {
  const source = item.workbook;
  if (!source) return 'Original Base Recruits drills.';
  if (source.book === 'master') {
    const reviewed = source.coachReviewed ? 'Reviewed by Base Recruits hitting coaches.' : 'Not yet reviewed by Base Recruits hitting coaches.';
    return `${MASTER_DESCRIPTIONS[source.section] ?? ''} From the Base Recruits hitting master workbook. ${reviewed}`.trim();
  }
  return `From the ${DEVELOPMENT}`;
}

function order(label: string): number {
  if (/^[A-D] · /.test(label)) return label.charCodeAt(0) - 65;
  if (label === 'Rehearsals and feedback tools') return 10;
  const area = label.replace(/^Body area: /, '');
  const index = (MASTER_CATEGORIES as readonly string[]).indexOf(area);
  if (index >= 0) return 20 + index;
  return 99;
}

/** Non-empty groups in browsing order; drills keep their library order inside each group. */
export function drillGroups(drills: readonly DrillDefinition[]): DrillGroup[] {
  const groups = new Map<string, { description: string; drills: DrillDefinition[] }>();
  for (const item of drills) {
    const key = groupKey(item);
    const found = groups.get(key) ?? { description: description(item), drills: [] };
    found.drills.push(item);
    groups.set(key, found);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([label, value]) => ({ label, description: value.description, drills: value.drills }));
}
