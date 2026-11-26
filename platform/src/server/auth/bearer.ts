/**
 * The Yavaya app sends its session as `Authorization: Bearer <token>`, the
 * same token a browser keeps in its cookie (session.ts stores only its hash).
 *
 * A browser never attaches this header on its own, and another site cannot
 * add it to a request here without a CORS preflight this server never
 * answers, so a request that carries it is not a cross-site forgery. When it
 * is present it is the only credential read: a cookie riding along is ignored.
 */
/**
 * `Bearer ` and a base64url token of 20 to 128 characters.
 * Matches "Bearer Zx9_k2-Lm4Qr7Tv0Yb3Nc6"; rejects "Basic dXNlcjpwYXNz" and "Bearer abc".
 * Tester: https://regex101.com/?flavor=javascript&regex=%5EBearer%20%28%5BA-Za-z0-9_-%5D%7B20%2C128%7D%29%24&testString=Bearer%20Zx9_k2-Lm4Qr7Tv0Yb3Nc6%0ABasic%20dXNlcjpwYXNz%0ABearer%20abc
 */
const BEARER = /^Bearer ([A-Za-z0-9_-]{20,128})$/;

export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  return BEARER.exec(header.trim())?.[1] ?? null;
}
