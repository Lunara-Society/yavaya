/**
 * Remote configuration for the Yavaya mobile app.
 *
 * Only booleans are passed through, and only for flag names that look like
 * flags; the app ignores names it does not know. Anything malformed yields an
 * empty flag set, so a typo in MOBILE_FLAGS can never break the app: it simply
 * keeps its built-in defaults.
 */
export type MobileConfig = { flags: Record<string, boolean>; minBuild: number; message: string | null };

const FLAG_NAME = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const MAX_FLAGS = 64;

export function mobileConfig(raw: string | undefined, minBuild: number, message: string | undefined): MobileConfig {
  return { flags: parseFlags(raw), minBuild, message: message ?? null };
}

export function parseFlags(raw: string | undefined): Record<string, boolean> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => FLAG_NAME.test(key) && typeof value === 'boolean')
      .slice(0, MAX_FLAGS),
  ) as Record<string, boolean>;
}
