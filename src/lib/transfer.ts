// Profile transfer codes: JSON -> deflate -> (optional AES-GCM with a PBKDF2 key) -> base64url.
// Import is a trust boundary: size-capped at every step, strictly validated, no eval.
import { parseProfile, type Profile } from '../storage/profile';

export const MAX_CODE = 4000; // characters
const MAX_JSON = 16_384; // bytes after decompression
const ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const PLAIN = 'EATS1.P.';
const ENC = 'EATS1.E.';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('This code has characters that do not belong in it.');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(t).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error('This code unpacks to too much data.'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function key(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encodeProfile(p: Profile, passphrase?: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(p)), new CompressionStream('deflate-raw'));
  if (!passphrase) return PLAIN + b64url(packed);
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(passphrase, salt), packed as BufferSource));
  return ENC + b64url(Uint8Array.from([...salt, ...iv, ...ct]));
}

export const isEncrypted = (code: string) => code.trim().startsWith(ENC);

export async function decodeProfile(code: string, passphrase?: string): Promise<Profile> {
  const c = code.trim();
  if (c.length > MAX_CODE) throw new Error('This code is too long to be a BosaTek Eats profile.');
  let packed: Uint8Array;
  if (c.startsWith(PLAIN)) {
    packed = unb64url(c.slice(PLAIN.length));
  } else if (c.startsWith(ENC)) {
    if (!passphrase) throw new Error('This code is locked. Enter its passphrase.');
    const raw = unb64url(c.slice(ENC.length));
    if (raw.length < 16 + 12 + 16) throw new Error('This code is incomplete.');
    try {
      packed = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: raw.slice(16, 28) }, await key(passphrase, raw.slice(0, 16)), raw.slice(28) as BufferSource));
    } catch {
      throw new Error('Wrong passphrase, or the code was changed.');
    }
  } else {
    throw new Error('This is not a BosaTek Eats profile code.');
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(await pipe(packed, new DecompressionStream('deflate-raw'), MAX_JSON)));
  } catch (e) {
    throw new Error((e as Error).message.startsWith('This code') ? (e as Error).message : 'This code is damaged.');
  }
  const p = parseProfile(json);
  if (!p) throw new Error('This code has settings this version does not understand.');
  return { ...p, onboarded: true };
}
