/**
 * Yavaya business rules.
 *
 * These are the *defaults*. Every value here is mirrored into a database
 * settings row at seed time and read at runtime through
 * `src/server/domains/platform/settings.ts`, so operations can change a rule
 * without a deploy. Nothing in the application may hard-code these numbers.
 */

export const IDENTITY_RULES = {
  /** Public identity identifier: `YAY-` + 8 digits. Permanent, non-transferable. */
  yayIdDigits: 8,
  yayIdPrefix: 'YAY',
  /**
   * First digit is never 0, so the printed form is always 8 characters and
   * cannot be confused with a zero-padded internal counter.
   */
  yayIdMinimum: 10_000_000,
  yayIdMaximum: 99_999_999,
  yayIdAllocationAttempts: 8,
} as const;

export const NEW_USER_RULES = {
  /** Enhanced monitoring window applied to every new account. */
  monitoringWindowHours: 72,
  /** Actions per hour permitted during the monitoring window. */
  monitoredActionsPerHour: 10,
  /** Actions per hour permitted afterwards. */
  standardActionsPerHour: 60,
  /** Risk score at or above this during monitoring raises an admin alert. */
  monitoringAlertRiskScore: 45,
} as const;

export const RISK_RULES = {
  /**
   * Weights for the duplicate-account risk score. No single signal may ban an
   * account — the highest individual weight is deliberately below `blockAt`.
   */
  weights: {
    exactDeviceMatch: 30,
    similarDeviceMatch: 15,
    sameIpNetwork: 10,
    sameIpNetworkSharedRange: 3,
    emailAliasMatch: 25,
    emailDomainDisposable: 20,
    phoneMatch: 40,
    behaviorTimingMatch: 12,
    rapidRegistrationBurst: 18,
    verificationFailureStreak: 10,
  },
  /** Bands. `review` opens a manual queue entry; `block` halts the action. */
  reviewAt: 45,
  blockAt: 80,
  /**
   * Networks known to be shared (mobile carrier CGNAT, universities, cafés)
   * downgrade `sameIpNetwork` to `sameIpNetworkSharedRange`. Populated in the
   * `shared_networks` table; never used on its own to deny access.
   */
  ipAloneCanNeverBlock: true,
} as const;

export const TOKEN_RULES = {
  /** New accounts: 2 tokens per 24h for the first 7 days, capped at 14. */
  starterGrantPerDay: 2,
  starterGrantDays: 7,
  starterGrantMaximum: 14,

  /** Treasury the primary administrator starts with. */
  adminTreasuryOpeningBalance: 50_000,

  /**
   * Maximum tokens a single purchase transaction may deliver.
   *
   * The specification listed a 100-token package *and* a 50-token per-purchase
   * ceiling. That contradiction is resolved for launch in favour of the
   * ceiling: the 100-token package exists in the catalogue but is disabled, so
   * the purchase UI exposes 5 / 10 / 25 / 50 only. Raising this limit and
   * enabling the package is a deliberate business decision, not a code change.
   */
  maxTokensPerPurchase: 50,

  /** Standard cost of a qualifying publish action. */
  defaultPublishCost: 1,
} as const;

export type TokenPackage = {
  key: string;
  tokens: number;
  priceMinor: number;
  currency: 'USD';
  enabled: boolean;
  sortOrder: number;
};

export const TOKEN_PACKAGES: readonly TokenPackage[] = [
  { key: 'tokens_5', tokens: 5, priceMinor: 99, currency: 'USD', enabled: true, sortOrder: 1 },
  { key: 'tokens_10', tokens: 10, priceMinor: 179, currency: 'USD', enabled: true, sortOrder: 2 },
  { key: 'tokens_25', tokens: 25, priceMinor: 399, currency: 'USD', enabled: true, sortOrder: 3 },
  { key: 'tokens_50', tokens: 50, priceMinor: 699, currency: 'USD', enabled: true, sortOrder: 4 },
  // Disabled at launch: exceeds TOKEN_RULES.maxTokensPerPurchase.
  { key: 'tokens_100', tokens: 100, priceMinor: 1199, currency: 'USD', enabled: false, sortOrder: 5 },
] as const;

/**
 * Trust score scale: 0–1000, as the Master Bible specifies (ch. 3, "The
 * Reputation Engine"). The platform first shipped on 0–100; migration 0003
 * multiplied stored scores and rule deltas by ten, so every weight below keeps
 * its original meaning.
 */
export const REPUTATION_RULES = {
  initialScore: 500,
  minimumScore: 0,
  maximumScore: 1000,
} as const;

export type ReputationRule = {
  key: string;
  delta: number;
  /** Minimum seconds between two applications of this rule for one user. */
  cooldownSeconds: number;
  /** Maximum applications per rolling 24h, or null for unlimited. */
  maxPerDay: number | null;
  enabled: boolean;
};

export const REPUTATION_RULE_DEFAULTS: readonly ReputationRule[] = [
  { key: 'email_verified', delta: 20, cooldownSeconds: 0, maxPerDay: 1, enabled: true },
  { key: 'phone_verified', delta: 50, cooldownSeconds: 0, maxPerDay: 1, enabled: true },
  { key: 'identity_verified', delta: 100, cooldownSeconds: 0, maxPerDay: 1, enabled: true },
  { key: 'successful_transaction', delta: 20, cooldownSeconds: 0, maxPerDay: 20, enabled: true },
  { key: 'successful_delivery', delta: 20, cooldownSeconds: 0, maxPerDay: 30, enabled: true },
  { key: 'verified_positive_review', delta: 10, cooldownSeconds: 0, maxPerDay: 20, enabled: true },
  { key: 'approved_cause', delta: 30, cooldownSeconds: 0, maxPerDay: 5, enabled: true },
  { key: 'approved_animal_adoption', delta: 50, cooldownSeconds: 0, maxPerDay: 5, enabled: true },
  { key: 'warning_issued', delta: -100, cooldownSeconds: 0, maxPerDay: null, enabled: true },
  { key: 'confirmed_fraudulent_listing', delta: -250, cooldownSeconds: 0, maxPerDay: null, enabled: true },
] as const;

/** Trust Shield status bands, derived from score + verification, never set by hand. */
export const TRUST_BANDS = [
  { key: 'restricted', minScore: 0, label: 'restricted' },
  { key: 'new', minScore: 400, label: 'new' },
  { key: 'established', minScore: 600, label: 'established' },
  { key: 'trusted', minScore: 800, label: 'trusted' },
] as const;

export const DEMO_CONTENT_RULES = {
  /** Demo content is off unless an administrator turns it on. */
  defaultEnabled: false,
  /** Recommended launch window, in days, after which demo rows expire. */
  defaultLifetimeDays: 7,
  minimumLifetimeDays: 1,
  maximumLifetimeDays: 7,
  /**
   * When a district reaches this many real published items, its demo content
   * expires early.
   */
  realInventoryThreshold: 25,
} as const;

export const SESSION_RULES = {
  idleTimeoutMinutes: 60 * 24 * 7,
  absoluteTimeoutDays: 30,
  /** Sessions are re-issued this often to limit the value of a stolen cookie. */
  rotateAfterMinutes: 60,
  cookieName: 'yav_session',
} as const;

export const VERIFICATION_RULES = {
  emailCodeTtlMinutes: 30,
  phoneCodeTtlMinutes: 10,
  maxAttemptsPerChallenge: 5,
  resendCooldownSeconds: 60,
  maxChallengesPerDay: 10,
} as const;

export const LOCATION_PRIVACY = {
  /**
   * Precision levels a user may publish. `exact` is never the default and is
   * never inferred from a GPS permission grant.
   */
  levels: ['country', 'city', 'neighborhood', 'exact'] as const,
  defaultLevel: 'city' as const,
  /** Radius, in metres, that coordinates are fuzzed by at each level. */
  fuzzRadiusMeters: { country: 50_000, city: 5_000, neighborhood: 750, exact: 0 },
} as const;

export type LocationPrecision = (typeof LOCATION_PRIVACY.levels)[number];

/**
 * Image uploads. Technical limits rather than policy, but still retunable.
 */
export const MEDIA_RULES = {
  /** Largest single upload accepted, before re-encoding. */
  maxUploadBytes: 8 * 1024 * 1024,
  /** Decoder guard: refuses "decompression bomb" images before allocating. */
  maxInputPixels: 50_000_000,
  /** Longest edge of the stored image. Enough for a phone screen at 2x. */
  maxDimension: 1600,
  webpQuality: 80,
  uploadsPerHour: 60,
} as const;

/**
 * Mercadito.
 *
 * `newSellerWindowDays` and `newSellerMaxListings` are the Master Bible's
 * "Account <7 days: max 3 listings". What counts as a listing there is not
 * defined; Yavaya counts every listing the account created, whatever its
 * state, so withdrawing and republishing cannot get round it (see
 * CONFIGURATION.md).
 *
 * `restrictedCategoriesForUnverified` implements "Unverified account:
 * limited categories". The Bible does not say which, so it ships empty and
 * the decision is flagged in CONFIGURATION.md rather than guessed.
 */
export const MERCADITO_RULES = {
  newSellerWindowDays: 7,
  newSellerMaxListings: 3,
  restrictedCategoriesForUnverified: [] as readonly string[],
  minPhotos: 1,
  maxPhotos: 6,
  titleMinLength: 4,
  titleMaxLength: 90,
  descriptionMinLength: 10,
  descriptionMaxLength: 4000,
  /** 10 million in major units: a guard against typos, not a policy. */
  maxPriceMinor: 1_000_000_000,
  pageSize: 24,
  /** Saved searches per member: enough to follow what you want, not a scraper. */
  maxSavedSearches: 20,
} as const;

/**
 * Community. Length limits keep posts readable on a phone; none of these is
 * a policy about who may post — any active member may, free of charge.
 */
export const COMMUNITY_RULES = {
  titleMinLength: 4,
  titleMaxLength: 100,
  bodyMinLength: 10,
  bodyMaxLength: 3000,
  replyMinLength: 2,
  replyMaxLength: 1500,
  pageSize: 20,
} as const;
