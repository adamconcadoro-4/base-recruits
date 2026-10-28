/**
 * HMAC-SHA256 signatures between the app and the SeamState worker; the same
 * format as worker/seamstate_worker/signing.py ("t=<unix seconds>,v1=<hex>"
 * over "<t>.<raw body>", five-minute window).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-SeamState-Signature';
export const MAX_SIGNATURE_AGE_S = 300;

function digest(secret: string, stamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${stamp}.`).update(body).digest('hex');
}

export function signBody(secret: string, body: string, nowMs = Date.now()): string {
  const stamp = String(Math.floor(nowMs / 1000));
  return `t=${stamp},v1=${digest(secret, stamp, body)}`;
}

export function verifyBody(secret: string, body: string, header: string | null, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = new Map(header.split(',').map((part) => part.split('=', 2) as [string, string]));
  const stamp = parts.get('t') ?? '';
  const given = parts.get('v1') ?? '';
  if (!/^\d+$/.test(stamp) || !/^[0-9a-f]{64}$/.test(given)) return false;
  if (Math.abs(nowMs / 1000 - Number(stamp)) > MAX_SIGNATURE_AGE_S) return false;
  return timingSafeEqual(Buffer.from(digest(secret, stamp, body), 'hex'), Buffer.from(given, 'hex'));
}
