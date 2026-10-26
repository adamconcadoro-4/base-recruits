import 'server-only';

import { chooseAthlete, listAthletes, type AthleteOption } from '@/lib/assessment/server/queries';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The athletes this person can work on and the one chosen by ?athlete=. */
export async function athleteContext(searchParams: SearchParams): Promise<{
  readonly options: readonly AthleteOption[];
  readonly selected: AthleteOption | null;
  readonly failed: boolean;
  readonly query: Record<string, string | string[] | undefined>;
}> {
  const query = await searchParams;
  const { data, failed } = await listAthletes();
  return { options: data, selected: chooseAthlete(data, single(query.athlete)), failed, query };
}

/** "?athlete=…" for links that keep the chosen athlete; empty for the person's own records. */
export function athleteQuery(selected: AthleteOption | null, prefix: '?' | '&' = '?'): string {
  if (!selected || selected.relation === 'athlete') return '';
  return `${prefix}athlete=${encodeURIComponent(selected.athlete_id)}`;
}
