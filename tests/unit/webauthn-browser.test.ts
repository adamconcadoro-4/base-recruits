import { describe, expect, it } from 'vitest';

import { base64UrlToBytes, bytesToBase64Url, toCreationOptions, toRequestOptions } from '@/lib/auth/webauthn-browser';

describe('passkey option conversion', () => {
  it('round-trips base64url without padding', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...base64UrlToBytes(encoded)]).toEqual([...bytes]);
    expect(bytesToBase64Url(base64UrlToBytes('AQID'))).toBe('AQID');
  });

  it('turns request options into browser options', () => {
    const options = toRequestOptions({
      challenge: 'AQIDBA',
      rpId: 'baserecruits.app',
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: [{ id: 'BQY', type: 'public-key', transports: ['internal'] }],
    });
    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([1, 2, 3, 4]);
    expect(options.rpId).toBe('baserecruits.app');
    expect(options.userVerification).toBe('required');
    expect([...new Uint8Array(options.allowCredentials?.[0]?.id as ArrayBuffer)]).toEqual([5, 6]);
    expect(toRequestOptions({ challenge: 'AQ', allowCredentials: [] }).allowCredentials).toBeUndefined();
  });

  it('turns creation options into browser options', () => {
    const options = toCreationOptions({
      challenge: 'AQID',
      rp: { id: 'baserecruits.app', name: 'Base Recruits' },
      user: { id: 'CQo', name: 'player@example.test', displayName: 'Player' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ id: 'Cw', type: 'public-key' }],
    });
    expect([...new Uint8Array(options.user.id as ArrayBuffer)]).toEqual([9, 10]);
    expect(options.user.name).toBe('player@example.test');
    expect(options.rp.name).toBe('Base Recruits');
    expect([...new Uint8Array(options.excludeCredentials?.[0]?.id as ArrayBuffer)]).toEqual([11]);
  });

  it('refuses incomplete options', () => {
    expect(() => toRequestOptions({})).toThrow();
    expect(() => toCreationOptions({ challenge: 'AQ' })).toThrow();
  });
});
