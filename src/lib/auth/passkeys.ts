import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PasskeySummary {
  readonly id: string;
  /** From the device or password manager that saved it, e.g. "iCloud Keychain". */
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

export type PasskeyListing =
  | { readonly available: true; readonly passkeys: readonly PasskeySummary[] }
  | { readonly available: false; readonly passkeys: readonly [] };

/** The signed-in person's passkeys. `available` is false when Supabase can't list them (for example, passkeys switched off). */
export async function listPasskeys(supabase: SupabaseServerClient): Promise<PasskeyListing> {
  try {
    const { data, error } = await supabase.auth.passkey.list();
    if (error || !Array.isArray(data)) return { available: false, passkeys: [] };
    return {
      available: true,
      passkeys: data.map((item) => ({
        id: item.id,
        name: item.friendly_name?.trim() || 'Passkey',
        createdAt: item.created_at,
        lastUsedAt: item.last_used_at ?? null,
      })),
    };
  } catch {
    return { available: false, passkeys: [] };
  }
}
