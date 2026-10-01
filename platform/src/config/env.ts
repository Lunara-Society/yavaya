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
/**
 * The subset needed to open a database connection, and nothing else.
 *
 * This exists so the release scripts — migrate, seed, and the scheduled jobs —
 * can run without the web application's secrets. It is not a stylistic split:
 * cPanel cron runs in a bare shell that does *not* inherit the environment set
 * on the Node application, so demanding `SESSION_SECRET` here would force an
 * operator to paste the session secret and the signal pepper into a crontab
 * line in plaintext, readable by anything that can read the crontab. Narrowing
 * what the scripts require removes the reason to do that.
 */
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  DATABASE_TRANSACTION_POOLER: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/**
 * What an operational command needs: a database, and the bootstrap
 * administrator the seed grants the `admin` role to.
 */
const operationalSchema = databaseSchema.extend({
  PRIMARY_ADMIN_EMAIL: z.string().email().default('yavayago@gmail.com'),
});

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
  /**
   * Encrypts every message in Espacio Violeta at rest. Without it the space
   * stays closed: it never stores those conversations in plain text.
   * Rotating it makes existing messages unreadable — they are short-lived by
   * design, but rotate only on purpose.
   */
  // Checked where it is used, not here: a bad value must close the space,
  // never stop the whole site from starting.
  SAFE_SPACE_KEY: z.string().optional(),

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
  PRIMARY_ADMIN_EMAIL: z.string().email().default('yavayago@gmail.com'),

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
  // An empty value means "off", the same as unset: a hosting dashboard that
  // cannot delete a variable can still blank it without breaking every page.
  PREVIEW_ACCESS_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(16).optional()),

  // ---------------------------------------------------------------------------
  // Unconfigured integrations. Absent => the capability reports itself disabled.
  // ---------------------------------------------------------------------------
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'resend', 'unconfigured']).default('unconfigured'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_API_URL: z.string().url().default('https://api.resend.com'),

  /**
   * Phone verification. `twilio_verify` sends and checks the code through
   * Twilio Verify, which handles sender IDs and carrier rules per country;
   * `console` writes the code to the server log and sends nothing.
   */
  SMS_PROVIDER: z.enum(['twilio_verify', 'console', 'unconfigured']).default('unconfigured'),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1).optional(),
  /** Overridable only so the integration test can answer as Twilio does. */
  TWILIO_VERIFY_API_URL: z.string().url().default('https://verify.twilio.com'),

  PAYPAL_ENV: z.enum(['sandbox', 'live']).optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  /** Identity document verification (KYC) vendor. Unset => manual review only. */
  KYC_PROVIDER: z.enum(['manual', 'unconfigured']).default('unconfigured'),

  /**
   * Object storage for user media. Unset => uploads are rejected.
   *
   * `s3` is any S3-compatible store (a Railway bucket in production). There
   * is deliberately no local-disk option: container disks are wiped on every
   * deploy, so photos stored there would vanish while their listings stayed.
   */
  MEDIA_STORAGE_PROVIDER: z.enum(['s3', 'unconfigured']).default('unconfigured'),
  MEDIA_S3_ENDPOINT: z.string().url().optional(),
  MEDIA_S3_BUCKET: z.string().min(1).optional(),
  MEDIA_S3_REGION: z.string().min(1).default('auto'),
  MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Railway buckets use virtual-hosted URLs; a local MinIO needs path style. */
  MEDIA_S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),

  /** IP → coarse location. Unset => geolocation falls back to manual selection. */
  GEOIP_PROVIDER: z.enum(['none', 'unconfigured']).default('unconfigured'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type OperationalEnv = z.infer<typeof operationalSchema>;

let cached: ServerEnv | null = null;
let cachedDatabase: DatabaseEnv | null = null;
let cachedOperational: OperationalEnv | null = null;

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Database connection settings only.
 *
 * The web application reaches the same values through `serverEnv()`, which
 * validates everything; this narrower door is what lets a cron job connect
 * without being handed secrets it will never use.
 */
export function databaseEnv(): DatabaseEnv {
  if (cachedDatabase) return cachedDatabase;
  const parsed = databaseSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid database environment:\n${describe(parsed.error)}\n\nSee .env.example.`);
  }
  cachedDatabase = parsed.data;
  return cachedDatabase;
}

/** Database settings plus the bootstrap administrator. Used by the seed. */
export function operationalEnv(): OperationalEnv {
  if (cachedOperational) return cachedOperational;
  const parsed = operationalSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid operational environment:\n${describe(parsed.error)}\n\nSee .env.example.`,
    );
  }
  cachedOperational = parsed.data;
  return cachedOperational;
}

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment:\n${describe(parsed.error)}\n\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forces the next env accessor to re-read `process.env`. */
export function resetServerEnvCache(): void {
  cached = null;
  cachedDatabase = null;
  cachedOperational = null;
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
