import { z } from 'zod';

/**
 * Server environment.
 *
 * Nothing in this module may be imported from a client component. Every value
 * here is treated as a secret unless it is explicitly re-exported through
 * `publicEnv`.
 *
 * Integrations that are not configured resolve to `null` rather than to a
 * placeholder. Calling code must branch on `null` and surface an honest
 * "not configured" state — never a fake success. See docs/CONFIGURATION.md.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Connections per process. On a serverless platform each concurrent
   * invocation is its own process, so this multiplies — keep it at 1–3 there
   * and route through a connection pooler.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  /**
   * Forces transaction-pooler handling on or off. Normally detected from the
   * URL; set this only when a pooler is reached on a non-standard port.
   * Getting it wrong surfaces as "prepared statement does not exist" under
   * load, so it is explicit rather than guessed.
   */
  DATABASE_TRANSACTION_POOLER: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),

  /** 32+ byte random string. Rotating it invalidates every session. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  /** Used to keyed-hash IP addresses and device fingerprints before storage. */
  SIGNAL_PEPPER: z.string().min(32, 'SIGNAL_PEPPER must be at least 32 characters'),

  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),

  /**
   * Proxies in front of the application. One for a single platform edge; two
   * for Cloudflare in front of that edge. Too low and a client can spoof its
   * own address past rate limiting; too high and every visitor collapses into
   * one shared bucket. See docs/CONFIGURATION.md.
   */
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(10).default(1),

  /**
   * `cf-connecting-ip` when Cloudflare proxies the traffic — it is written by
   * Cloudflare on every request, so it does not depend on the hop count being
   * right.
   */
  CLIENT_IP_HEADER: z.enum(['forwarded', 'cf-connecting-ip']).default('forwarded'),

  /** Bootstrap administrator. The role is granted server-side at migration/seed time. */
  PRIMARY_ADMIN_EMAIL: z.string().email().default('Junoagattis@gmail.com'),

  /**
   * Private preview gate. When set, every route except the health check
   * requires this key (via `?key=` once, then a cookie). Unset means the site
   * is open.
   *
   * It is a curtain, not a security boundary — it keeps the unfinished product
   * away from the public and from search engines while email delivery is
   * unconfigured and a stranger who registered would be stranded. Member data
   * is protected by the session and permission system underneath, exactly as
   * it will be in production.
   *
   * Read directly from `process.env` in middleware, which runs in the edge
   * runtime and cannot import this module.
   */
  PREVIEW_ACCESS_KEY: z.string().min(16).optional(),

  // ---------------------------------------------------------------------------
  // Unconfigured integrations. Absent => the capability reports itself disabled.
  // ---------------------------------------------------------------------------
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'unconfigured']).default('unconfigured'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  SMS_PROVIDER: z.enum(['console', 'unconfigured']).default('unconfigured'),

  PAYPAL_ENV: z.enum(['sandbox', 'live']).optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  /** Identity document verification (KYC) vendor. Unset => manual review only. */
  KYC_PROVIDER: z.enum(['manual', 'unconfigured']).default('unconfigured'),

  /** Object storage for user media. Unset => uploads are rejected. */
  MEDIA_STORAGE_PROVIDER: z.enum(['local', 'unconfigured']).default('unconfigured'),
  MEDIA_LOCAL_PATH: z.string().optional(),

  /** IP → coarse location. Unset => geolocation falls back to manual selection. */
  GEOIP_PROVIDER: z.enum(['none', 'unconfigured']).default('unconfigured'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment:\n${issues}\n\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forces the next `serverEnv()` call to re-read `process.env`. */
export function resetServerEnvCache(): void {
  cached = null;
}

/**
 * The only environment-derived values that may cross to the browser.
 * Never add a secret here.
 */
export const publicEnv = {
  appName: 'Yavaya',
  defaultLocale: 'es' as const,
  supportedLocales: ['es', 'en'] as const,
};
