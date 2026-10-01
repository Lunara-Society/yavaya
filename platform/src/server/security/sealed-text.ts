import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Text sealed at rest with AES-256-GCM.
 *
 * Used where a database dump, a backup or a curious query must not reveal
 * what was written (Espacio Violeta). This is encryption at rest, not
 * end-to-end: the application holds the key, so it is honest to say "stored
 * encrypted", never "nobody can read it".
 *
 * Format: `v1.<base64url(iv | tag | ciphertext)>`. The purpose is bound into
 * the key, so text sealed for one purpose cannot be opened as another.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFor(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'yavaya.sealed-text', `v1:${purpose}`, 32));
}

export function seal(secret: string, purpose: string, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, purpose), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
}

/** Throws if the text was altered, sealed for another purpose or with another key. */
export function unseal(secret: string, purpose: string, sealed: string): string {
  if (!sealed.startsWith('v1.')) throw new Error('unknown sealed-text version');
  const raw = Buffer.from(sealed.slice(3), 'base64url');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret, purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}
