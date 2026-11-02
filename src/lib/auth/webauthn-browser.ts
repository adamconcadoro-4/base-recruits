/**
 * Browser side of a passkey ceremony. Supabase Auth sends WebAuthn options as
 * JSON (binary fields base64url-encoded); the browser API needs ArrayBuffers,
 * and its answer goes back to the server as JSON again. Only the conversion and
 * the browser prompt live here: challenges are issued and checked by Supabase
 * Auth, through server actions (src/lib/auth/passkey-actions.ts).
 */

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64Url(input: ArrayBuffer | ArrayBufferView): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Json = Record<string, unknown>;

interface CredentialDescriptorJson {
  readonly id: string;
  readonly type?: string;
  readonly transports?: readonly string[];
}

function descriptors(value: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return (value as CredentialDescriptorJson[]).map((descriptor) => ({
    id: base64UrlToBytes(descriptor.id),
    type: 'public-key',
    ...(descriptor.transports ? { transports: [...descriptor.transports] as AuthenticatorTransport[] } : {}),
  }));
}

/** JSON request options from Supabase Auth → options for navigator.credentials.get(). */
export function toRequestOptions(json: Json): PublicKeyCredentialRequestOptions {
  const { challenge, allowCredentials, ...rest } = json;
  if (typeof challenge !== 'string') throw new Error('Passkey options are missing a challenge.');
  const allow = descriptors(allowCredentials);
  return { ...(rest as Partial<PublicKeyCredentialRequestOptions>), challenge: base64UrlToBytes(challenge), ...(allow ? { allowCredentials: allow } : {}) };
}

/** JSON creation options from Supabase Auth → options for navigator.credentials.create(). */
export function toCreationOptions(json: Json): PublicKeyCredentialCreationOptions {
  const { challenge, user, excludeCredentials, ...rest } = json;
  const userJson = user as { id?: unknown; name?: unknown; displayName?: unknown } | undefined;
  if (typeof challenge !== 'string' || !userJson || typeof userJson.id !== 'string') {
    throw new Error('Passkey options are incomplete.');
  }
  const exclude = descriptors(excludeCredentials);
  return {
    ...(rest as unknown as PublicKeyCredentialCreationOptions),
    challenge: base64UrlToBytes(challenge),
    user: {
      id: base64UrlToBytes(userJson.id),
      name: typeof userJson.name === 'string' ? userJson.name : '',
      displayName: typeof userJson.displayName === 'string' ? userJson.displayName : '',
    },
    ...(exclude ? { excludeCredentials: exclude } : {}),
  };
}

/** A credential from navigator.credentials.get() or .create() → JSON for Supabase Auth. */
export function credentialToJson(credential: PublicKeyCredential): Json {
  const response = credential.response;
  const common = {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: 'public-key',
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}),
  };
  if ('attestationObject' in response) {
    const attestation = response as AuthenticatorAttestationResponse;
    const transports = typeof attestation.getTransports === 'function' ? attestation.getTransports() : undefined;
    return {
      ...common,
      response: {
        attestationObject: bytesToBase64Url(attestation.attestationObject),
        clientDataJSON: bytesToBase64Url(attestation.clientDataJSON),
        ...(transports ? { transports } : {}),
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    ...common,
    response: {
      authenticatorData: bytesToBase64Url(assertion.authenticatorData),
      clientDataJSON: bytesToBase64Url(assertion.clientDataJSON),
      signature: bytesToBase64Url(assertion.signature),
      ...(assertion.userHandle ? { userHandle: bytesToBase64Url(assertion.userHandle) } : {}),
    },
  };
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.get === 'function' &&
    window.isSecureContext
  );
}

export type CeremonyResult = { readonly ok: true; readonly credential: Json } | { readonly ok: false; readonly message: string };

function ceremonyFailure(error: unknown, action: 'sign-in' | 'setup'): CeremonyResult {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return { ok: false, message: action === 'sign-in' ? 'Sign-in was cancelled or timed out. Try again.' : 'Setup was cancelled or timed out. Try again.' };
  }
  if (name === 'InvalidStateError') return { ok: false, message: 'This device already has a passkey for your account.' };
  if (name === 'SecurityError') return { ok: false, message: 'Passkeys only work on the Base Recruits site itself.' };
  return { ok: false, message: 'Your device couldn’t use a passkey. Try again, or use an emailed code.' };
}

export async function getPasskeyCredential(options: Json): Promise<CeremonyResult> {
  try {
    const credential = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
    if (!(credential instanceof PublicKeyCredential)) return ceremonyFailure(null, 'sign-in');
    return { ok: true, credential: credentialToJson(credential) };
  } catch (error) {
    return ceremonyFailure(error, 'sign-in');
  }
}

export async function createPasskeyCredential(options: Json): Promise<CeremonyResult> {
  try {
    const credential = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
    if (!(credential instanceof PublicKeyCredential)) return ceremonyFailure(null, 'setup');
    return { ok: true, credential: credentialToJson(credential) };
  } catch (error) {
    return ceremonyFailure(error, 'setup');
  }
}
