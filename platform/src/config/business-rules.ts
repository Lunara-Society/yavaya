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
  /** 2 tokens per 24h for the 7 days after email verification, capped at 14. */
  starterGrantPerDay: 2,
  starterGrantDays: 7,
  starterGrantMaximum: 14,

  /** Treasury the primary administrator starts with. */
  adminTreasuryOpeningBalance: 50_000,

  /**
   * Maximum tokens a single purchase transaction may deliver.
   *
   * Launch had a 50-token ceiling (the specification listed a 100-token
   * package and a 50-token ceiling; the ceiling won). On 2 October 2026 the
   * owner set the catalogue to 2 / 10 / 25 / 50 / 100 / 500 when card
   * payments went live, so the ceiling is the largest package.
   */
  maxTokensPerPurchase: 500,

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

/**
 * The owner's prices (2 October 2026), anchored on 2 = $0.92, 10 = $4.50 and
 * 25 = $10, rounded to .99 and extended so each step costs less per token:
 * $0.50, $0.45, $0.40, $0.38, $0.35 and $0.30. A package that is not listed
 * here is disabled by the seed, never deleted: past purchases refer to it.
 */
export const TOKEN_PACKAGES: readonly TokenPackage[] = [
  // dLocal Go refused $0.99 as below its minimum (error 5016); Stripe, which
  // now serves every country, accepts anything from $0.50.
  { key: 'tokens_2', tokens: 2, priceMinor: 99, currency: 'USD', enabled: true, sortOrder: 1 },
  { key: 'tokens_10', tokens: 10, priceMinor: 449, currency: 'USD', enabled: true, sortOrder: 2 },
  { key: 'tokens_25', tokens: 25, priceMinor: 999, currency: 'USD', enabled: true, sortOrder: 3 },
  { key: 'tokens_50', tokens: 50, priceMinor: 1899, currency: 'USD', enabled: true, sortOrder: 4 },
  { key: 'tokens_100', tokens: 100, priceMinor: 3499, currency: 'USD', enabled: true, sortOrder: 5 },
  { key: 'tokens_500', tokens: 500, priceMinor: 14999, currency: 'USD', enabled: true, sortOrder: 6 },
] as const;

/** Percent saved per token against the smallest offered package, for display. */
export function packageSavingPercent(pkg: { tokens: number; priceMinor: number }, packages: ReadonlyArray<{ tokens: number; priceMinor: number }>): number {
  const base = [...packages].sort((a, b) => a.tokens - b.tokens)[0];
  if (!base || base.tokens === pkg.tokens) return 0;
  return Math.floor((1 - pkg.priceMinor / pkg.tokens / (base.priceMinor / base.tokens)) * 100);
}

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

/**
 * Trabajo. The Bible's principle is "no auctions": pay is stated by the
 * employer up front and candidates never bid. Professional subscriptions
 * (Bible prices on the pricing page) need payments, which are not
 * configured; until then the district is free and says so.
 * Lengths and limits are guardrails, listed in docs/CONFIGURATION.md.
 */
export const WORK_RULES = {
  titleMinLength: 5,
  titleMaxLength: 100,
  descriptionMinLength: 40,
  descriptionMaxLength: 4000,
  requirementsMaxLength: 2000,
  payMinLength: 3,
  payMaxLength: 80,
  companyMaxLength: 100,
  headlineMinLength: 5,
  headlineMaxLength: 100,
  aboutMinLength: 30,
  aboutMaxLength: 2000,
  skillsMaxLength: 500,
  messageMinLength: 20,
  messageMaxLength: 2000,
  maxFieldsPerProfile: 3,
  maxPortfolioLinks: 3,
  maxOpenPostsPerEmployer: 10,
  maxOpenApplicationsPerCandidate: 20,
  employerNameMinLength: 3,
  employerNameMaxLength: 100,
  registrationMaxLength: 40,
  employerAboutMinLength: 30,
  employerAboutMaxLength: 1000,
  /** A post stays open this long unless closed or filled sooner. */
  postOpenDays: 30,
  /** Members told about one new post, at most (once a day per field each). */
  newPostNotifyLimit: 200,
  pageSize: 20,
} as const;

/**
 * Animales. Chosen under the owner's direction that adoption must be earned,
 * like a licence: learn first, then apply, then be chosen by a rescuer.
 * Listed in docs/CONFIGURATION.md as open to change.
 */
/** Operations: when a wait for a person becomes too long. */
export const OPS_RULES = {
  /** A review waiting longer than this is late: red on /admin, and in the operations email. */
  reviewLateHours: 48,
  /** The operations email goes out once a day, at this hour UTC (09:00 = 03:00 in Nicaragua and Guatemala). */
  emailHourUtc: 14,
} as const;

/** Espacio Violeta: the protected space for women. See config/safe-space.ts. */
export const SAFE_SPACE_RULES = {
  messageMaxLength: 2000,
  reportNoteMaxLength: 1000,
  /** Messages shown in the shared room, newest last. */
  roomPageSize: 80,
  threadPageSize: 200,
  /** Seen within this long, and not hidden, reads "en línea". */
  onlineWindowSeconds: 180,
  /** How often an open page says "still here", and refreshes. */
  presencePingSeconds: 45,
  refreshSeconds: 8,
  /**
   * Conversations here are not meant to be kept. The shared room forgets
   * after a month; private conversations after three, so a woman and her
   * psychologist keep enough context. Decided reports go after three months.
   */
  roomRetentionDays: 30,
  threadRetentionDays: 90,
  reportRetentionDays: 90,
  /** A new name, at most this often: often enough to escape, not to evade. */
  handleChangeCooldownDays: 7,
  messagesPerHour: 120,
  newThreadsPerDay: 10,
  /** Where "Salir rápido" goes: an ordinary page that draws no attention. */
  quickExitUrl: 'https://www.google.com/',
} as const;

export const ANIMALS_RULES = {
  /** Correct answers out of the quiz's questions needed for the certificate. */
  quizPassMark: 8,
  /** Bump when the guide or quiz changes materially; older certificates still count. */
  certificateVersion: 1,
  nameMaxLength: 60,
  descriptionMinLength: 30,
  descriptionMaxLength: 3000,
  notesMaxLength: 1000,
  rescuerNameMinLength: 3,
  rescuerNameMaxLength: 120,
  rescuerAboutMinLength: 40,
  rescuerAboutMaxLength: 2000,
  answerMinLength: 2,
  answerMaxLength: 1000,
  minPhotos: 1,
  maxPhotos: 6,
  /** Open applications one person may have at once. */
  maxOpenApplicationsPerMember: 3,
  /** Animals one rescuer may have listed at once. */
  maxActiveListingsPerRescuer: 40,
  /** Days after an adoption when adopter and rescuer are asked how it is going. */
  followUpDays: 30,
  /** Lost and found: photos, length, open posts per member, and how long a post stays up. */
  lostMinPhotos: 1,
  lostMaxPhotos: 4,
  lostDescriptionMinLength: 20,
  lostDescriptionMaxLength: 1500,
  lostMaxOpenPerMember: 5,
  lostOpenDays: 60,
  /** How far back a post's "seen on" date may be. */
  lostSeenDaysBack: 90,
  pageSize: 24,
} as const;

/**
 * Servicios. Guardrails chosen under the owner's delegation, not rules from
 * the Bible; each is listed in docs/CONFIGURATION.md as open to change.
 */
export const SERVICES_RULES = {
  titleMinLength: 5,
  titleMaxLength: 100,
  bodyMinLength: 20,
  bodyMaxLength: 2000,
  messageMinLength: 10,
  messageMaxLength: 1000,
  priceMaxLength: 60,
  headlineMinLength: 5,
  headlineMaxLength: 80,
  bioMinLength: 20,
  bioMaxLength: 1000,
  licenceMinLength: 5,
  licenceMaxLength: 200,
  reviewMaxLength: 1000,
  /** Categories one provider may offer: enough for a real trade, not a catalogue. */
  maxCategoriesPerProvider: 3,
  /** Open requests one member may have at once. */
  maxOpenRequestsPerMember: 5,
  /** Responses a request takes before it stops accepting more. */
  maxResponsesPerRequest: 20,
  /** How long "Disponible hoy" lasts once switched on. */
  availableTodayHours: 12,
  /** Providers told about one urgent request. */
  urgentNotifyLimit: 30,
  /** Providers told about one ordinary request (once a day each). */
  newRequestNotifyLimit: 100,
  /** A review of this many stars or more earns the provider reputation. */
  positiveReviewStars: 4,
  pageSize: 20,
} as const;

/**
 * Sanctuary. Lengths and limits are guardrails chosen here, not rules from
 * the Bible; each is listed in docs/CONFIGURATION.md as open to change.
 */
export const SANCTUARY_RULES = {
  nameMinLength: 3,
  nameMaxLength: 120,
  denominationMaxLength: 80,
  descriptionMinLength: 20,
  descriptionMaxLength: 2000,
  addressMaxLength: 200,
  /** Churches one member may register (a pastor may serve more than one). */
  maxChurchesPerOwner: 3,
  maxServicesPerChurch: 20,
  serviceTitleMaxLength: 60,
  devotionalTitleMinLength: 3,
  devotionalTitleMaxLength: 120,
  scriptureMaxLength: 80,
  devotionalBodyMinLength: 20,
  devotionalBodyMaxLength: 4000,
  /** Words one church may publish for the same day. */
  maxDevotionalsPerChurchPerDay: 3,
  /** How far ahead a church may prepare words, and how far back it may date one. */
  devotionalDaysAhead: 14,
  devotionalDaysBack: 1,
  feedSize: 12,
  /**
   * Local hour (where the church is) from which a word prepared ahead reaches
   * followers on its day. Early, so it is there with the morning coffee;
   * not so early that a phone buzzes at night.
   */
  wordDeliveryLocalHour: 6,
} as const;

/**
 * The daily email summary of unread notifications.
 *
 * One email a day at most, only about things still unread, and only after
 * the member has had a chance to see them on the site. Chosen by the owner's
 * delegation ("best for all users"): a daily summary rather than one email per
 * event, on by default, with a one-click unsubscribe in every message.
 */
export const NOTIFICATION_RULES = {
  /** Local hour window in which the summary may be sent (start inclusive, end exclusive). */
  digestLocalHourStart: 7,
  digestLocalHourEnd: 12,
  /**
   * For members with no place set, the same window in UTC hours. 13:00 UTC is
   * 7:00 in UTC-6; a member who sets a place gets their own morning.
   */
  digestFallbackUtcHourStart: 13,
  digestFallbackUtcHourEnd: 18,
  /** A notification younger than this is left for the site to show first. */
  digestMinAgeMinutes: 60,
  /** Older unread news is stale; it is not mailed. */
  digestLookbackHours: 72,
  /** Minimum gap between two summaries to one member. */
  digestMinIntervalHours: 20,
  /** Items listed by name; the rest are counted. */
  digestMaxItems: 8,
  /** Members mailed per scheduler run, so one run never floods the provider. */
  digestBatchSize: 200,
} as const;
