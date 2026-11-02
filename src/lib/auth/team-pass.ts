/**
 * The cookie that remembers a correct team code (private mode, see
 * src/config/site-access.ts). It holds an HMAC of a fixed label keyed by the
 * code, never the code itself, so changing SITE_TEAM_CODE invalidates every
 * saved pass. Web Crypto only, so the request proxy can check it too.
 */

export const TEAM_PASS_COOKIE = 'br_team_pass';

export const TEAM_PASS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const LABEL = 'base-recruits-team-pass-v1';

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function teamPassValue(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(LABEL)));
}

/** Compares without stopping at the first difference. */
export function sameText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function teamPassValid(cookieValue: string | undefined, code: string | null): Promise<boolean> {
  if (!code || !cookieValue) return false;
  return sameText(cookieValue, await teamPassValue(code));
}
