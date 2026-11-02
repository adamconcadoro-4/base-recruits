/**
 * Showcase and event results (decision F53). Mirrors the CHECK constraints on
 * public.athlete_showcase_results; tests/contract/assessment-catalog.test.ts
 * keeps the lists in step.
 *
 * These are best marks from an event, measured by the event's own equipment
 * and entered by the athlete's side. They are shown apart from practice
 * measurements and are never mixed into Assessment results.
 */

export const SHOWCASE_SOURCES = ['pbr', 'other_event'] as const;
export type ShowcaseSource = (typeof SHOWCASE_SOURCES)[number];

/** "PBR" appears only here, in the event picker (F52). */
export const SHOWCASE_SOURCE_LABELS: Readonly<Record<ShowcaseSource, string>> = {
  pbr: 'PBR',
  other_event: 'Another showcase or event',
};

export interface ShowcaseMeasure {
  readonly key: string;
  readonly label: string;
  readonly unit: 'mph' | 's';
  readonly min: number;
  readonly max: number;
}

export const SHOWCASE_MEASURES: readonly ShowcaseMeasure[] = [
  { key: 'exit_velocity', label: 'Exit velocity', unit: 'mph', min: 30, max: 130 },
  { key: 'bat_speed', label: 'Bat speed', unit: 'mph', min: 20, max: 110 },
  { key: 'fastball_velocity', label: 'Fastball velocity', unit: 'mph', min: 30, max: 110 },
  { key: 'infield_velocity', label: 'Infield throwing velocity', unit: 'mph', min: 30, max: 110 },
  { key: 'outfield_velocity', label: 'Outfield throwing velocity', unit: 'mph', min: 30, max: 110 },
  { key: 'catcher_velocity', label: 'Catcher throwing velocity', unit: 'mph', min: 30, max: 110 },
  { key: 'sixty_yard', label: '60-yard dash', unit: 's', min: 5.5, max: 10 },
  { key: 'pop_time', label: 'Pop time', unit: 's', min: 1.5, max: 3.5 },
];

export function showcaseMeasure(key: string): ShowcaseMeasure | undefined {
  return SHOWCASE_MEASURES.find((measure) => measure.key === key);
}
