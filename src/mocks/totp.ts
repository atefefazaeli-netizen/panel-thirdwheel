// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the mock API and tests, on WebCrypto (browser and
// Node). The real API verifies codes server-side; this only lets the mocks and tests do the same.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export const TOTP_STEP_S = 30;
export const stepAt = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP_S);

/** HOTP (RFC 4226) for one counter value. */
export async function hotp(key: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg as BufferSource));
  const off = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[off]! & 0x7f) << 24) |
    ((mac[off + 1]! & 0xff) << 16) |
    ((mac[off + 2]! & 0xff) << 8) |
    (mac[off + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The current code for a base32 secret. */
export const totp = (secretB32: string, nowMs = Date.now()): Promise<string> =>
  hotp(base32Decode(secretB32), stepAt(nowMs));

/**
 * Checks a code with ±1 step of drift. Returns the matched step (so the caller can refuse a reuse
 * of the same step), or null.
 */
export async function verifyTotp(
  secretB32: string,
  code: string,
  nowMs = Date.now(),
  lastStep = -1,
): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const now = stepAt(nowMs);
  for (const s of [now - 1, now, now + 1]) {
    if (s <= lastStep) continue;
    if ((await hotp(key, s)) === code) return s;
  }
  return null;
}

export function randomSecret(bytes = 20): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return base32Encode(b);
}
