/**
 * A software passkey for end-to-end tests: a P-256 key pair standing in for
 * Face ID or a fingerprint, used against the real local Supabase Auth.
 * Administrators need a passkey check (F57), so the test administrator signs
 * in with this. Test code only; the site itself never sees a private key.
 */

import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, type JsonWebKey } from 'node:crypto';

import type { BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Must match [auth.webauthn] in supabase/config.toml. */
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3000';

export interface SoftwarePasskey {
  readonly credentialId: string;
  readonly userHandle: string;
  readonly privateKey: JsonWebKey;
}

function b64url(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('base64url');
}

// ---------------------------------------------------------------- tiny CBOR
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;

function head(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  if (length < 0x10000) return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff]);
  throw new Error('CBOR value too long for this encoder');
}

function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), Buffer.from(value)]);
  const parts: Buffer[] = [head(5, value.size)];
  for (const [key, entry] of value) parts.push(cbor(key), cbor(entry));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- ceremonies
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED = 0x40;

function clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }), 'utf8');
}

function rpIdHash(): Buffer {
  return createHash('sha256').update(RP_ID).digest();
}

/** Registers a new software passkey for the account `client` is signed in as. */
export async function registerSoftwarePasskey(client: SupabaseClient): Promise<SoftwarePasskey> {
  const { data: start, error: startError } = await client.auth.passkey.startRegistration();
  if (startError || !start) throw new Error(`passkey registration options failed: ${startError?.message ?? 'no data'}`);
  const options = start.options as unknown as { challenge: string; user: { id: string } };

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(32);
  const coseKey = cbor(
    new Map<Cbor, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x ?? '', 'base64url')],
      [-3, Buffer.from(jwk.y ?? '', 'base64url')],
    ]),
  );
  const idLength = Buffer.from([credentialId.length >> 8, credentialId.length & 0xff]);
  const authData = Buffer.concat([
    rpIdHash(),
    Buffer.from([FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    idLength,
    credentialId,
    coseKey,
  ]);
  const attestationObject = cbor(
    new Map<Cbor, Cbor>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  );
  const { error } = await client.auth.passkey.verifyRegistration({
    challengeId: start.challenge_id,
    credential: {
      id: b64url(credentialId),
      rawId: b64url(credentialId),
      type: 'public-key',
      response: {
        attestationObject: b64url(attestationObject),
        clientDataJSON: b64url(clientData('webauthn.create', options.challenge)),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    } as never,
  });
  if (error) throw new Error(`passkey registration failed: ${error.message}`);
  return { credentialId: b64url(credentialId), userHandle: options.user.id, privateKey: privateKey.export({ format: 'jwk' }) };
}

/** Signs `client` in with the software passkey (a fresh "passkey" sign-in, as Face ID would give). */
export async function signInWithSoftwarePasskey(client: SupabaseClient, passkey: SoftwarePasskey): Promise<void> {
  const { data: start, error: startError } = await client.auth.passkey.startAuthentication();
  if (startError || !start) throw new Error(`passkey sign-in options failed: ${startError?.message ?? 'no data'}`);
  const options = start.options as unknown as { challenge: string };

  // A sign count of 0 tells the server this authenticator doesn't count uses.
  const authData = Buffer.concat([rpIdHash(), Buffer.from([FLAG_USER_PRESENT | FLAG_USER_VERIFIED]), Buffer.alloc(4)]);
  const clientDataJson = clientData('webauthn.get', options.challenge);
  const signature = sign(
    'sha256',
    Buffer.concat([authData, createHash('sha256').update(clientDataJson).digest()]),
    createPrivateKey({ key: passkey.privateKey, format: 'jwk' }),
  );
  const { data, error } = await client.auth.passkey.verifyAuthentication({
    challengeId: start.challenge_id,
    credential: {
      id: passkey.credentialId,
      rawId: passkey.credentialId,
      type: 'public-key',
      response: {
        authenticatorData: b64url(authData),
        clientDataJSON: b64url(clientDataJson),
        signature: b64url(signature),
        userHandle: passkey.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    } as never,
  });
  if (error || !data?.session) throw new Error(`passkey sign-in failed: ${error?.message ?? 'no session'}`);
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set for the end-to-end tests (see README).`);
  return value;
}

/** The test administrator's software passkey, saved by the global setup. */
export function adminPasskey(): SoftwarePasskey {
  return JSON.parse(env('E2E_ADMIN_PASSKEY')) as SoftwarePasskey;
}

/** An API client signed in as the test administrator with a passkey check. */
export async function adminApiClient(): Promise<SupabaseClient> {
  const client = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await signInWithSoftwarePasskey(client, adminPasskey());
  return client;
}

/**
 * Signs the browser in as the test administrator with a passkey check: the
 * session is made with the same cookie library the site uses, then handed to
 * the browser (the browser's own passkey prompt can't run on 127.0.0.1).
 */
export async function logInAsAdmin(context: BrowserContext, baseURL: string): Promise<void> {
  const jar = new Map<string, string>();
  const client = createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  await signInWithSoftwarePasskey(client as unknown as SupabaseClient, adminPasskey());
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL, httpOnly: true, sameSite: 'Lax' as const })));
}
