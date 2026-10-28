import { timingSafeEqual } from 'node:crypto';

import { dispatchDueJobs } from '@/lib/seamstate/server/worker';

/**
 * Stall sweep and dispatcher for SeamState jobs, for a scheduled call
 * (Vercel Cron sends "Authorization: Bearer $CRON_SECRET"). Requests also
 * dispatch right away; this catches stalled attempts and retries.
 */
export const dynamic = 'force-dynamic';

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get('authorization'))) return new Response('Unauthorized', { status: 401 });
  const result = await dispatchDueJobs(2);
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
