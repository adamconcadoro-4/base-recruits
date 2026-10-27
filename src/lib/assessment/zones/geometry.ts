/**
 * Where each hitter-relative zone sits on screen, and which field a lane
 * points to, for right- and left-handed hitters. Zone ids never change; only
 * the drawing mirrors.
 *
 * The map is drawn from the catcher's view (looking out at the pitcher). A
 * right-handed hitter stands on the left of the plate in that view, so their
 * inside third is on the left; a left-handed hitter's inside third is on the
 * right.
 */

import { ZONE_IDS, type OutsideLocation, type ZoneId, type ZoneSide } from '@/lib/assessment/zones/types';

export const MAP_PERSPECTIVE = 'Catcher’s view (looking out at the pitcher)';

export type ZoneRow = 'high' | 'middle' | 'low';
export type ZoneColumn = 'inside' | 'middle' | 'outside';

const ROWS: readonly ZoneRow[] = ['high', 'middle', 'low'];
const COLUMNS: readonly ZoneColumn[] = ['inside', 'middle', 'outside'];

/** Height and hitter-relative third of a zone. */
export function zonePosition(zone: ZoneId): { readonly row: ZoneRow; readonly column: ZoneColumn } {
  const index = zone - 1;
  return { row: ROWS[Math.floor(index / 3)] as ZoneRow, column: COLUMNS[index % 3] as ZoneColumn };
}

export function zoneAt(row: ZoneRow, column: ZoneColumn): ZoneId {
  return (ROWS.indexOf(row) * 3 + COLUMNS.indexOf(column) + 1) as ZoneId;
}

/** Screen column (0 = left) of a hitter-relative third, in the catcher's view. */
export function screenColumn(column: ZoneColumn, side: ZoneSide): number {
  const index = COLUMNS.indexOf(column);
  return side === 'right' ? index : 2 - index;
}

/** The nine zones laid out row by row, left to right as drawn for this hitter. */
export function zoneGrid(side: ZoneSide): readonly (readonly ZoneId[])[] {
  return ROWS.map((row) => {
    const cells: ZoneId[] = [0, 0, 0] as unknown as ZoneId[];
    for (const column of COLUMNS) cells[screenColumn(column, side)] = zoneAt(row, column);
    return cells;
  });
}

/** Which screen side (left/right) the hitter's inside and away balls are drawn on. */
export function outsideSide(location: Extract<OutsideLocation, 'out_in' | 'out_away'>, side: ZoneSide): 'left' | 'right' {
  const insideIsLeft = side === 'right';
  if (location === 'out_in') return insideIsLeft ? 'left' : 'right';
  return insideIsLeft ? 'right' : 'left';
}

export const OUTSIDE_LABELS: Readonly<Record<OutsideLocation, string>> = {
  out_high: 'Ball high',
  out_low: 'Ball low',
  out_in: 'Ball inside',
  out_away: 'Ball away',
};

export const SIDE_LABELS: Readonly<Record<ZoneSide, string>> = {
  right: 'Right-handed hitter',
  left: 'Left-handed hitter',
};

/** The field a lane points to for this hitter: pull goes to left field for a right-handed hitter. */
export function laneField(lane: string, side: ZoneSide): string {
  const text = lane.toLowerCase();
  if (text.includes('pull')) return side === 'right' ? 'left-center' : 'right-center';
  if (text.includes('opposite')) return side === 'right' ? 'right-center' : 'left-center';
  if (text.includes('center')) return 'center';
  return '';
}

/** The workbook's lane with the field it means for this hitter, e.g. "Pull-side gap (left-center)". */
export function laneLabel(lane: string, side: ZoneSide): string {
  const field = laneField(lane, side);
  return field && field !== 'center' ? `${lane} (${field})` : lane;
}

export function allZonesDrawn(side: ZoneSide): boolean {
  const drawn = zoneGrid(side).flat();
  return ZONE_IDS.every((zone) => drawn.filter((cell) => cell === zone).length === 1);
}
