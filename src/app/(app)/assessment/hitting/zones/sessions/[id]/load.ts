import 'server-only';

import { notFound } from 'next/navigation';

import { athleteContext, type SearchParams } from '@/lib/assessment/server/page-context';
import { getSwitches, isUuid, type AthleteOption } from '@/lib/assessment/server/queries';
import { getZoneSession, type ZoneSessionDetail } from '@/lib/assessment/zones/server/queries';

export type SessionParams = Promise<{ id: string }>;

/** The session (as row-level security allows), whose it is, and whether recording is switched on. */
export async function loadSession(
  params: SessionParams,
  searchParams: SearchParams,
): Promise<{ readonly detail: ZoneSessionDetail; readonly athlete: AthleteOption; readonly editable: boolean }> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [detail, context, switches] = await Promise.all([getZoneSession(id), athleteContext(searchParams), getSwitches()]);
  if (!detail) notFound();
  const athlete = context.options.find((option) => option.athlete_id === detail.session.athlete_id);
  if (!athlete) notFound();
  return { detail, athlete, editable: Boolean(switches?.enabled) };
}
