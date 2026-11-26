/**
 * Feature flags: every Synapse layer can be switched off without a new binary.
 *
 * Defaults ship in the app. The server can override known flags through
 * GET /api/mobile/v1/config (MOBILE_FLAGS on Railway). Overrides are cached and
 * applied on the next launch, so the interface never changes under a person's
 * finger. Unknown keys and non-boolean values are ignored.
 */
export const FLAG_DEFAULTS = {
  /** Native Synapse shell; off = the Chapter 00 bridge (the website in a frame). */
  synapseShell: true,
  /** Optional first-launch awakening. */
  awakening: true,
  /** Reconstruction effects on navigation; off = plain crossfades. */
  reconstruction: true,
  /** Device-tilt parallax on holographic panels. */
  parallax: true,
  /** Interface sounds (still subject to the person's own setting and silent mode). */
  sound: true,
  /** Haptics (still subject to the person's own setting). */
  haptics: true,
  /** The design and engine laboratory (on in development builds). */
  lab: false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;
export type Flags = { [K in FlagName]: boolean };

export function mergeFlags(defaults: Flags, ...overrides: unknown[]): Flags {
  const out: Flags = { ...defaults };
  for (const source of overrides) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (key in out && typeof value === 'boolean') out[key as FlagName] = value;
    }
  }
  return out;
}

export type RemoteConfig = { flags: Partial<Flags>; minBuild: number; message: string | null };

export function parseRemoteConfig(body: unknown): RemoteConfig | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const flags: Partial<Flags> = {};
  if (b.flags && typeof b.flags === 'object') {
    for (const [key, value] of Object.entries(b.flags as Record<string, unknown>)) {
      if (key in FLAG_DEFAULTS && typeof value === 'boolean') flags[key as FlagName] = value;
    }
  }
  const minBuild = typeof b.minBuild === 'number' && Number.isFinite(b.minBuild) ? Math.max(0, Math.floor(b.minBuild)) : 0;
  const message = typeof b.message === 'string' && b.message.length <= 280 ? b.message : null;
  return { flags, minBuild, message };
}
