import { after } from 'next/server';

import { workerSecret } from '@/lib/seamstate/server/config';
import { handleWorkerMessage } from '@/lib/seamstate/server/worker';
import { SIGNATURE_HEADER, signBody, verifyBody } from '@/lib/seamstate/signing';
import { workerMessageSchema } from '@/lib/seamstate/worker-messages';

/**
 * The SeamState worker's only way in. Every message must carry the shared
 * signature; the answer is signed too, so the worker can trust "stop".
 */
export const dynamic = 'force-dynamic';
// The AI review runs after the answer and can take a minute or two.
export const maxDuration = 300;

const MAX_BODY_BYTES = 1_000_000;

function signed(secret: string, status: number, payload: unknown): Response {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', [SIGNATURE_HEADER]: signBody(secret, body) },
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = workerSecret();
  if (!secret) return new Response('Not found', { status: 404 });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return new Response('Too large', { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new Response('Too large', { status: 413 });
  if (!verifyBody(secret, body, request.headers.get(SIGNATURE_HEADER))) return new Response('Unauthorized', { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return signed(secret, 400, { continue: false, error: 'not JSON' });
  }
  const message = workerMessageSchema.safeParse(json);
  if (!message.success) return signed(secret, 400, { continue: false, error: 'unexpected message' });
  const outcome = await handleWorkerMessage(message.data);
  if (outcome.background) after(outcome.background);
  return signed(secret, 200, outcome.answer);
}
