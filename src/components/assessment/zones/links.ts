import type { AthleteOption } from '@/lib/assessment/server/queries';

/** A link inside 9-Zone Hitting that keeps the chosen athlete (unless it is the viewer) and the given query values. */
export function zoneHref(
  path: string,
  selected: AthleteOption | null,
  params: Readonly<Record<string, string | number | null | undefined>> = {},
  hash?: string,
): string {
  const query = new URLSearchParams();
  if (selected && selected.relation !== 'athlete') query.set('athlete', selected.athlete_id);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return `${path}${text ? `?${text}` : ''}${hash ? `#${hash}` : ''}`;
}

/** Film Room link for a clip, opened at a moment when one was recorded. */
export function clipHref(selected: AthleteOption | null, mediaId: string, timeMs: number | null): string {
  return zoneHref('/assessment/film', selected, { clip: mediaId, t: timeMs ?? undefined });
}
