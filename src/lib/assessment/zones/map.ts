/**
 * What each tile on the zone map says. Missing evidence is never shown as
 * zero: no attempts reads "Not assessed", attempts without the chosen
 * observation read "Not recorded", and fewer than MIN_ZONE_SAMPLE scored
 * attempts show the counts with "Too few to judge" and no shading, so a zone
 * is never painted as a strength or weakness from a handful of swings.
 */

import type { MetricResult, ZoneBreakdown } from '@/lib/assessment/zones/metrics';
import { MIN_ZONE_SAMPLE } from '@/lib/assessment/zones/suggestions';

export const MAP_CONTEXTS = ['pitch', 'tee'] as const;
export type MapContext = (typeof MAP_CONTEXTS)[number];

export const MAP_METRICS = {
  pitch: ['strike_contact', 'depth', 'lane', 'hard_targeted'],
  tee: ['contact', 'depth', 'lane', 'hard_targeted'],
} as const satisfies Record<MapContext, readonly string[]>;

export type PitchMapMetric = (typeof MAP_METRICS.pitch)[number];
export type TeeMapMetric = (typeof MAP_METRICS.tee)[number];
export type MapMetric = PitchMapMetric | TeeMapMetric;

export const MAP_CONTEXT_LABELS: Readonly<Record<MapContext, string>> = {
  pitch: 'Pitched balls (toss, coach, machine, live)',
  tee: 'Tee swings',
};

export type TileStatus = 'not_assessed' | 'not_recorded' | 'too_few' | 'enough';
export type TileShade = 'none' | 'low' | 'mid' | 'high';

export interface MapTile {
  readonly status: TileStatus;
  readonly primary: string;
  readonly secondary: string;
  readonly shade: TileShade;
}

export function isMapMetric(context: MapContext, value: string | undefined): value is MapMetric {
  return value !== undefined && (MAP_METRICS[context] as readonly string[]).includes(value);
}

/** The result for one zone, context and metric. */
export function zoneResult(breakdown: ZoneBreakdown, context: MapContext, metric: MapMetric): MetricResult {
  if (context === 'tee') {
    const key = (isMapMetric('tee', metric) ? metric : 'contact') as TeeMapMetric;
    return breakdown.tee[key];
  }
  const key = (isMapMetric('pitch', metric) ? metric : 'strike_contact') as PitchMapMetric;
  return breakdown.pitch[key];
}

/** Attempts in a zone that could have been scored for the metric (pitches, or tee swings). */
export function zoneAttempts(breakdown: ZoneBreakdown, context: MapContext): number {
  return context === 'tee' ? breakdown.teeSwings : breakdown.strikeSwings;
}

function shade(value: number): TileShade {
  if (value < 40) return 'low';
  if (value < 70) return 'mid';
  return 'high';
}

export function mapTile(result: MetricResult, attempts: number): MapTile {
  if (result.denominator === 0) {
    if (attempts === 0) return { status: 'not_assessed', primary: 'Not assessed', secondary: 'No attempts yet', shade: 'none' };
    return { status: 'not_recorded', primary: 'Not recorded', secondary: `${attempts} attempt${attempts === 1 ? '' : 's'}, none scored for this`, shade: 'none' };
  }
  const counts = `${result.numerator} of ${result.denominator}`;
  if (result.denominator < MIN_ZONE_SAMPLE) {
    return { status: 'too_few', primary: counts, secondary: `Too few to judge (${result.value}%)`, shade: 'none' };
  }
  return { status: 'enough', primary: `${result.value}%`, secondary: counts, shade: shade(result.value ?? 0) };
}
