/**
 * The guest shortlist: schools saved in this browser without an account.
 *
 * - Stores only school identifiers (slugs) and when they were saved; never
 *   grades, scores or anything personal.
 * - No cap on the number of schools.
 * - Lives in this browser's localStorage, so it is specific to this device and
 *   browser and disappears if the visitor clears site data.
 * - If storage is unavailable (private browsing, blocked storage), callers get
 *   `available: false` and must say so; nothing is silently dropped.
 * - When the visitor signs in, the list is moved into their account by the
 *   idempotent public.save_schools and only then cleared here.
 */

export const GUEST_SAVES_KEY = 'br.saved.v1';
const CHANGE_EVENT = 'br-saved-change';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface StoredEntry {
  readonly slug: string;
  readonly at: string;
}

export interface GuestSaves {
  readonly available: boolean;
  /** Newest first. */
  readonly slugs: readonly string[];
}

const UNAVAILABLE: GuestSaves = { available: false, slugs: [] };
const SERVER: GuestSaves = { available: true, slugs: [] };

function parse(raw: string | null): StoredEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !Array.isArray((value as { schools?: unknown }).schools)) return [];
    const seen = new Set<string>();
    const out: StoredEntry[] = [];
    for (const item of (value as { schools: unknown[] }).schools) {
      if (typeof item !== 'object' || item === null) continue;
      const slug = (item as { slug?: unknown }).slug;
      const at = (item as { at?: unknown }).at;
      if (typeof slug !== 'string' || slug.length > 120 || !SLUG.test(slug) || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, at: typeof at === 'string' ? at : new Date(0).toISOString() });
    }
    return out;
  } catch {
    return [];
  }
}

function readEntries(): StoredEntry[] | null {
  try {
    return parse(window.localStorage.getItem(GUEST_SAVES_KEY));
  } catch {
    return null;
  }
}

function writeEntries(entries: readonly StoredEntry[]): boolean {
  try {
    if (entries.length === 0) window.localStorage.removeItem(GUEST_SAVES_KEY);
    else window.localStorage.setItem(GUEST_SAVES_KEY, JSON.stringify({ v: 1, schools: entries }));
    cached = null;
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

let cached: GuestSaves | null = null;

/** Snapshot for useSyncExternalStore (stable between changes). */
export function getGuestSaves(): GuestSaves {
  if (cached) return cached;
  const entries = readEntries();
  cached = entries === null ? UNAVAILABLE : { available: true, slugs: entries.map((e) => e.slug) };
  return cached;
}

export function getServerGuestSaves(): GuestSaves {
  return SERVER;
}

export function subscribeGuestSaves(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === GUEST_SAVES_KEY) {
      cached = null;
      listener();
    }
  };
  const onChange = () => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Adds (newest first) or removes a school. Returns false if storage failed. */
export function setGuestSaved(slug: string, saved: boolean): boolean {
  if (!SLUG.test(slug)) return false;
  const entries = readEntries();
  if (entries === null) return false;
  const rest = entries.filter((e) => e.slug !== slug);
  return writeEntries(saved ? [{ slug, at: new Date().toISOString() }, ...rest] : rest);
}

/** Removes the given schools (after they were moved into an account), or all of them. */
export function clearGuestSaves(slugs?: readonly string[]): boolean {
  const entries = readEntries();
  if (entries === null) return false;
  if (!slugs) return writeEntries([]);
  const remove = new Set(slugs);
  return writeEntries(entries.filter((e) => !remove.has(e.slug)));
}
