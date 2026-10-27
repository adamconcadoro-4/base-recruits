import { assessmentSiteEnabled } from '@/config/assessment';
import { isUuid } from '@/lib/assessment/server/queries';
import { sessionCsv } from '@/lib/assessment/zones/export';
import { getZoneSession } from '@/lib/assessment/zones/server/queries';
import { getAccount } from '@/lib/auth/account';

/**
 * A session's entries as CSV, for the signed-in person if row-level security
 * lets them read the session. Never cached.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!assessmentSiteEnabled()) return new Response('Not found', { status: 404 });
  const account = await getAccount();
  if (!account.userId) return new Response('Sign in to download.', { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404 });
  const detail = await getZoneSession(id);
  if (!detail) return new Response('Not found', { status: 404 });
  const csv = sessionCsv(detail.items, detail.rounds, detail.assignments);
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="9-zone-session-${detail.session.session_date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
