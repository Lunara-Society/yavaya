import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { serverEnv } from '@/config/env';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters. N=2^15 keeps a single verification around 100ms on a
 * modern server, which is the intended cost. Raising N is a migration:
 * `needsRehash` detects stored hashes below the current parameters and the
 * login path upgrades them transparently.
 */
const SCRYPT = { N: 32_768, r: 8, p: 1, keyLength: 64, maxmem: 96 * 1024 * 1024 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join(
    '$',
  );
}

/**
 * Verifies a password against a stored hash in constant time.
 * Returns false for malformed input rather than throwing, so a corrupted row
 * cannot be distinguished from a wrong password by timing or by error text.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const derived = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: SCRYPT.maxmem,
    });
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a stored hash was produced with weaker parameters than current. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.N < SCRYPT.N || parsed.r < SCRYPT.r || parsed.p < SCRYPT.p;
}

function parseHash(
  stored: string,
): { N: number; r: number; p: number; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  try {
    return {
      N,
      r,
      p,
      salt: Buffer.from(parts[4] as string, 'base64'),
      hash: Buffer.from(parts[5] as string, 'base64'),
    };
  } catch {
    return null;
  }
}

/** Opaque, URL-safe secret for sessions, verification links and CSRF tokens. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric verification code, uniformly distributed, of the requested length. */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, '0');
}

/** Unkeyed digest — for session tokens, where the input is already random. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Keyed digest for anti-duplication signals.
 *
 * Signals (email, phone, IP prefix, device fingerprint) are compared for
 * equality but never need to be read back, so they are stored as HMACs under a
 * server-held pepper. A database leak therefore does not reveal the underlying
 * personal data, and the values are not brute-forceable without the pepper.
 */
export function signalHash(namespace: string, value: string): string {
  return createHmac('sha256', serverEnv().SIGNAL_PEPPER)
    .update(`${namespace}:${value}`, 'utf8')
    .digest('hex');
}

/** Constant-time string comparison for secrets of equal expected length. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
