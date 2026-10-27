import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assessmentSiteEnabled } from '@/config/assessment';
import { getAccount } from '@/lib/auth/account';
import { ZONE_CONTENT } from '@/lib/assessment/zones/content';

/**
 * The original 9-Zone Hitting workbook, unchanged, as a planning download for
 * signed-in users while Assessment is on the site. It holds coaching content
 * and blank logs only; no athlete data is ever added to it.
 */
export const dynamic = 'force-dynamic';

const WORKBOOK = path.join(process.cwd(), 'data', 'zone-hitting', ZONE_CONTENT.source.file);

export async function GET(): Promise<Response> {
  if (!assessmentSiteEnabled()) return new Response('Not found', { status: 404 });
  const account = await getAccount();
  if (!account.userId) return new Response('Sign in to download the workbook.', { status: 401 });
  let file: Buffer;
  try {
    file = await readFile(WORKBOOK);
  } catch {
    return new Response('The workbook is not available right now.', { status: 503 });
  }
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ZONE_CONTENT.source.file}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
