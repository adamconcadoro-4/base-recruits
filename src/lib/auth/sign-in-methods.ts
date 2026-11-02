/**
 * Reads how and when the current session proved who it is, from the access
 * token's `amr` claim (Supabase Auth: a list of { method, timestamp } entries,
 * timestamps in UNIX seconds; a passkey sign-in is recorded as "passkey").
 *
 * Framework-free so the rules can be unit tested. The database applies the
 * same administrator rule itself (private.admin_session_verified, migration
 * 20261102000500), so the page check here only decides what to show.
 */

/** How long a passkey check keeps the admin area open (12 hours; same value as the database). */
export const ADMIN_CHECK_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Adding a passkey needs a sign-in within the last 15 minutes. */
export const PASSKEY_SETUP_MAX_AGE_SECONDS = 15 * 60;

interface MethodEntry {
  readonly method: string;
  readonly timestamp: number;
}

function entries(amr: unknown): MethodEntry[] {
  if (!Array.isArray(amr)) return [];
  const result: MethodEntry[] = [];
  for (const entry of amr) {
    if (entry === null || typeof entry !== 'object') continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method === 'string' && typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      result.push({ method, timestamp });
    }
  }
  return result;
}

function latest(list: readonly MethodEntry[]): number | null {
  let best: number | null = null;
  for (const entry of list) if (best === null || entry.timestamp > best) best = entry.timestamp;
  return best;
}

/** When this session last used a passkey (UNIX seconds), or null. */
export function lastPasskeyCheckAt(amr: unknown): number | null {
  return latest(entries(amr).filter((entry) => entry.method === 'passkey'));
}

/** When this session last proved who it is by any method (UNIX seconds), or null. */
export function lastSignInAt(amr: unknown): number | null {
  return latest(entries(amr));
}

/**
 * The admin area needs a passkey check within the last 12 hours. A timestamp
 * from the future (clock skew of more than a minute) does not count.
 */
export function adminCheckSatisfied(amr: unknown, nowSeconds: number): boolean {
  const at = lastPasskeyCheckAt(amr);
  return at !== null && at <= nowSeconds + 60 && nowSeconds - at <= ADMIN_CHECK_MAX_AGE_SECONDS;
}

/** Whether the session signed in recently enough to add a passkey. */
export function recentEnoughToAddPasskey(amr: unknown, nowSeconds: number): boolean {
  const at = lastSignInAt(amr);
  return at !== null && at <= nowSeconds + 60 && nowSeconds - at <= PASSKEY_SETUP_MAX_AGE_SECONDS;
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
