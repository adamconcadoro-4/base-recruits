import Link from 'next/link';

import { MAP_PERSPECTIVE, SIDE_LABELS, outsideSide, screenColumn, zoneGrid, type ZoneColumn } from '@/lib/assessment/zones/geometry';
import type { OutsideLocation, ZoneId, ZoneSide } from '@/lib/assessment/zones/types';
import { cn } from '@/lib/utils/cn';

export type ZoneShade = 'none' | 'low' | 'mid' | 'high';

export interface ZoneCell {
  readonly primary: string;
  readonly secondary?: string;
  readonly corner?: string;
  readonly shade: ZoneShade;
  readonly href?: string;
  readonly selected?: boolean;
  /** Extra words for screen readers after the visible text (location, sample). */
  readonly srText: string;
}

const SHADES: Readonly<Record<ZoneShade, string>> = {
  none: 'bg-white border-dashed',
  low: 'bg-ice',
  mid: 'bg-royal-soft/50',
  high: 'bg-royal-soft',
};

const COLUMN_NAMES: Readonly<Record<ZoneColumn, string>> = { inside: 'Inside', middle: 'Middle', outside: 'Outside' };
const COLUMNS: readonly ZoneColumn[] = ['inside', 'middle', 'outside'];

/**
 * The nine zones drawn for one hitter, from the catcher's view. Zone ids stay
 * hitter-relative; only the drawing mirrors for a left-handed hitter. Balls
 * outside the zone are shown around it, never inside a cell.
 */
export function ZoneGrid({
  side,
  cells,
  outside,
  caption,
  testId,
}: {
  readonly side: ZoneSide;
  readonly cells: Readonly<Record<ZoneId, ZoneCell>>;
  readonly outside?: Readonly<Record<OutsideLocation | 'unknown', number>>;
  readonly caption: string;
  readonly testId?: string;
}) {
  const columnHeads = COLUMNS.slice().sort((a, b) => screenColumn(a, side) - screenColumn(b, side));
  const hitterOnLeft = side === 'right';
  const insideLeft = outsideSide('out_in', side) === 'left';
  const sideNote = (location: 'out_in' | 'out_away') => (outside ? `${location === 'out_in' ? 'Ball inside' : 'Ball away'}: ${outside[location]}` : null);
  return (
    <figure className="max-w-xl space-y-3" data-testid={testId}>
      <figcaption className="space-y-1">
        <span className="block font-semibold text-graphite">{caption}</span>
        <span className="block text-sm text-slate">
          {MAP_PERSPECTIVE} · {SIDE_LABELS[side]} — the hitter stands on the {hitterOnLeft ? 'left' : 'right'}, so their inside third is drawn on the{' '}
          {hitterOnLeft ? 'left' : 'right'}.
        </span>
      </figcaption>
      {outside ? <p className="text-center text-sm text-slate">Ball high: {outside.out_high}</p> : null}
      <div className="grid items-center gap-2 sm:grid-cols-[auto_1fr_auto]">
        <p className="hidden w-20 text-center text-sm text-slate sm:block">{insideLeft ? sideNote('out_in') : sideNote('out_away')}</p>
        <div>
          <div className="mb-1 grid grid-cols-3 gap-1.5 text-center text-xs font-semibold text-slate uppercase" aria-hidden="true">
            {columnHeads.map((column) => (
              <span key={column}>{COLUMN_NAMES[column]}</span>
            ))}
          </div>
          <ul className="grid grid-cols-3 gap-1.5" aria-label={`Zones as drawn for a ${SIDE_LABELS[side].toLowerCase()}`}>
            {zoneGrid(side)
              .flat()
              .map((zone) => {
                const cell = cells[zone];
                const body = (
                  <>
                    <span className="flex flex-wrap items-start justify-between gap-x-1 text-xs font-semibold text-graphite">
                      <span>Zone {zone}</span>
                      {cell.corner ? <span>{cell.corner}</span> : null}
                    </span>
                    <span className="mt-1 block text-base leading-tight font-semibold break-words text-navy sm:text-lg">{cell.primary}</span>
                    {cell.secondary ? <span className="block text-xs text-graphite">{cell.secondary}</span> : null}
                    <span className="sr-only">, {cell.srText}</span>
                  </>
                );
                const classes = cn(
                  'block min-h-24 rounded-md border-2 border-field p-2 text-left no-underline',
                  SHADES[cell.shade],
                  cell.selected && 'outline-4 outline-offset-2 outline-royal-ink',
                );
                return (
                  <li key={zone}>
                    {cell.href ? (
                      <Link href={cell.href} aria-current={cell.selected ? 'true' : undefined} className={cn(classes, 'hover:border-navy')}>
                        {body}
                      </Link>
                    ) : (
                      <div className={classes}>
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
        <p className="hidden w-20 text-center text-sm text-slate sm:block">{insideLeft ? sideNote('out_away') : sideNote('out_in')}</p>
      </div>
      {outside ? (
        <p className="text-center text-sm text-slate sm:hidden">
          {insideLeft ? `${sideNote('out_in')} (left) · ${sideNote('out_away')} (right)` : `${sideNote('out_away')} (left) · ${sideNote('out_in')} (right)`}
        </p>
      ) : null}
      {outside ? (
        <p className="text-center text-sm text-slate">
          Ball low: {outside.out_low} · Location unknown: {outside.unknown}
        </p>
      ) : null}
    </figure>
  );
}
