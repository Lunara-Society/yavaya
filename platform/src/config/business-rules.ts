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
  // Stripe, which serves every country, accepts anything from $0.50.
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

/**
 * How the site looks. Each look is a switch the owner can turn back in
 * Admin → Diseño del sitio, without a deploy (a feature flag; see
 * server/domains/platform/looks.ts). These values only apply while nobody has
 * touched a switch: they are the owner's choice of 6 November 2026, and of
 * 12 November 2026 for the districts in depth.
 */
export const SITE_LOOK_RULES = {
  /** The First Light (ui/first-light) as the home page; off, the home page of 31 October 2026. */
  home: true,
  /** Each district opening with the world behind its door; off, the district pages as they were. */
  worlds: true,
  /** The owner's new Guardian (6 November 2026, wings spread) on the First Light; off, the first Guardian. */
  guardian: true,
  /** The owner's new logo (6 November 2026, the Guardian on the YAVAYA pedestal) in the header, icons and share card; off, the seal. */
  logo: true,
  /**
   * The district cards of the home page of 31 October 2026 in depth (ui/depth,
   * docs/DISTRICTS-3D.md): each card tilts, its picture has near and far, and
   * its mark is a gold medallion. Off, the cards exactly as they were: the
   * owner asked for the classic cards to stay one switch away. Only a device
   * that can afford it is given the depth; the rest see the classic cards.
   */
  depth: true,
  /**
   * Yavaya Play (app/play, docs/PLAY.md), a first playable: closed until the
   * owner has played it and opens it. While closed, only someone who may
   * change this switch can load the page.
   */
  play: false,
  /**
   * Pruebas de Maestría (docs/PLAY.md): open, the owner's decision of
   * 13 November 2026 ("publish it live"). Off, only someone who may change
   * this switch sees them.
   */
  trials: true,
  /**
   * The Vault's collectibles not usable yet (docs/PLAY.md, "The Vault"): not
   * sold until the owner has approved the refund terms the screens show
   * (play.vault.terms) and turns this on. The owner asked for exactly that.
   */
  vault_collectibles: false,
} as const;

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
  /**
   * Signed out after four hours without activity (the owner's decision of 6
   * November 2026; two hours from 18 October). Every visit extends it, so
   * someone using Yavaya is never thrown out mid-task; a phone left on a
   * table is.
   */
  idleTimeoutMinutes: 240,
  /** Activity is written at most this often, so a busy page is not a database write per request. */
  touchAfterMinutes: 5,
  absoluteTimeoutDays: 30,
  /**
   * "Mantener mi sesión iniciada" (a box the member ticks at sign-in, never
   * ticked for them): signed out after this many days without use instead of
   * four hours, still within the 30-day absolute lifetime. Requested by the
   * owner's stabilisation brief (October 2026); the figure is ours, chosen
   * as the common practice for an explicit opt-in, and documented in
   * CONFIGURATION.md.
   */
  rememberedIdleDays: 14,
  /** The short-lived cookie that carries the box's answer to whichever sign-in finishes (password, Google, two-step). */
  rememberCookie: 'yav_remember',
  /**
   * A remembered session older than this must sign in again before turning
   * on two-step: on a device someone else can pick up, the one thing a
   * stranger could do to lock the owner out needs a fresh sign-in.
   */
  freshSignInMinutes: 60,
  /** Sessions are re-issued this often to limit the value of a stolen cookie. */
  rotateAfterMinutes: 60,
  /**
   * How long the browser remembers which Google account last signed in here,
   * so "Continuar con Google" goes straight back in after a sign-out.
   */
  googleHintDays: 90,
  cookieName: 'yav_session',
} as const;

/**
 * Account sanctions — decided by Claude on the owner's delegation (20 October
 * 2026: "I'll let you make the best idea about suspension").
 *
 * A short ladder an operator picks from, so the same behaviour gets the same
 * answer: a day to cool off (a heated argument, a burst of spam), a week for a
 * repeat, a month for something serious short of a ban. "Until review"
 * (null) is for suspected fraud being checked: the account is frozen until an
 * admin decides. A ban is permanent and admin-only. Timed suspensions lift
 * themselves; the member is told at every step and may appeal once.
 */
export const SANCTION_RULES = {
  suspensionDays: [1, 7, 30] as const,
  /** One appeal per sanction, within this many days of the notice. */
  appealWindowDays: 14,
  appealMinLength: 20,
  appealMaxLength: 1500,
  /** What an admin may write back to the member on an appeal. */
  responseMaxLength: 1000,
} as const;

/**
 * Two-step sign-in with an authenticator app (TOTP, RFC 6238). Free to run —
 * nothing is sent to anyone — which is why it came before SMS (the owner's
 * decision, 20 October 2026: phone verification waits; free, strong methods
 * first).
 */
export const TWO_STEP_RULES = {
  issuer: 'Yavaya',
  digits: 6,
  periodSeconds: 30,
  /** Codes one step either side are accepted: phone clocks drift. */
  driftSteps: 1,
  recoveryCodeCount: 10,
  /** Between the password (or Google) and the code. */
  pendingMinutes: 5,
  /** To scan the code and type the first number. */
  setupMinutes: 15,
} as const;

export const VERIFICATION_RULES = {
  emailCodeTtlMinutes: 30,
  /** A reset link is single-use and short-lived: it is a key to the account. */
  passwordResetTtlMinutes: 30,
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
  /**
   * A photo brought in from a link: how long the other site has to answer,
   * how many redirects are followed, and how many links a member may bring
   * in an hour (each one is a download the server makes on their behalf).
   */
  linkTimeoutSeconds: 10,
  linkMaxRedirects: 3,
  linksPerHour: 30,
} as const;

/**
 * Identity Studio — "Personalizar mi perfil".
 *
 * Limits on what a member's profile may hold. Technical limits rather than
 * policy, like MEDIA_RULES: they bound storage and what a public page has to
 * render, and keep a profile from being used as free file hosting.
 */
export const PROFILE_STUDIO_RULES = {
  headlineMaxLength: 80,
  aboutMaxLength: 600,
  maxLinks: 5,
  linkLabelMaxLength: 40,
  linkUrlMaxLength: 300,
  maxLanguages: 6,
  /** Designs a member may keep under "Favoritos". */
  maxFavorites: 60,
  /** Looks a member may save under their own name. */
  maxPresets: 12,
  presetNameMaxLength: 40,
  /**
   * Their own photos (profile photo, cover, background) a member may keep for
   * the profile at once, across the draft, the published profile and saved
   * looks. Older unused ones are removed when the profile is published.
   */
  maxOwnPhotos: 12,
  uploadsPerHour: 30,
  draftSavesPerHour: 240,
  publishesPerHour: 30,
  /** Far above any real profile, low enough that nobody can use it as storage. */
  maxConfigBytes: 16_384,
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
  /**
   * Publishing is free for people. A member may have this many open listings
   * at once without paying; each one beyond costs the
   * `mercadito.publish_listing` price. Someone selling their own things never
   * reaches it; a reseller or a dealer does, and they are the ones earning.
   * The owner's decision (October 2026): free for people, paid by those who earn.
   */
  freeOpenListings: 5,
  /** Days a listing stays featured ("Destacado") after one purchase. */
  featureDays: 7,
  /**
   * Renewing ("Renovar") puts a listing back at the top of the newest, for the
   * `mercadito.renew_listing` price. At most once in this many hours per
   * listing, so renewing cannot be used to sit at the top for good: that is
   * what featuring is for, and featuring is labelled.
   * The owner's decision (October 2026): tokens renew and promote; publishing stays free.
   */
  renewCooldownHours: 24,
  /** After this many days without a renewal, "Mis publicaciones" suggests renewing or featuring. */
  renewSuggestAfterDays: 7,
} as const;

/**
 * Changing the display name. The owner's decision (October 2026): the first
 * change is free, each one after costs the `identity.change_name` price (a
 * token). A name stays tied to the same YAY ID and reputation, and every
 * change is audited with the old and new name, so renaming cannot shed a
 * history. The owner asked to prevent abuse (October 2026): changes are
 * spaced by `cooldownDays`, and the previous name stays visible on the
 * public profile for `showPreviousDays` (see CONFIGURATION.md).
 */
export const NAME_RULES = {
  freeNameChanges: 1,
  /**
   * Days between two changes, whichever they are and whatever is paid: a
   * token buys a change, never a faster one, so nobody can hop from name to
   * name to shake off buyers who know them.
   */
  cooldownDays: 30,
  /** Days the previous name is shown on the public profile after a change. */
  showPreviousDays: 30,
} as const;

/**
 * Invitations. A member who brings someone in is thanked in tokens once the
 * new account verifies its email, and so is the newcomer. The cap stops one
 * person from farming throwaway accounts: past it, invitations still work,
 * they just stop paying.
 */
export const REFERRAL_RULES = {
  inviterReward: 3,
  inviteeReward: 2,
  maxRewardedPerMonth: 10,
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
  /**
   * Open posts an employer may have at once without paying; each one beyond
   * costs the `work.publish_post` price. A family hiring help never reaches
   * it; a company hiring at scale does. Candidates never pay (no-fee promise).
   * Owner's decision (October 2026): free for people, paid by those who earn.
   */
  freeOpenPosts: 2,
  /** Days a post stays featured after one purchase. */
  featureDays: 7,
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
/**
 * The WhatsApp team inbox (domains/whatsapp). The reply window and the
 * message length are WhatsApp's own rules, not Yavaya's: a business may write
 * freely only within 24 hours of the person's last message, up to 4,096
 * characters. How long conversations are kept is NOT decided: until the owner
 * sets it (CONFIGURATION.md, "WhatsApp"), they stay until the team deletes
 * them, and the privacy page says exactly that.
 */
export const WHATSAPP_RULES = {
  replyWindowHours: 24,
  replyMaxLength: 4096,
  inboxListSize: 200,
  conversationSize: 300,
  /**
   * Roxi on WhatsApp. These are Yavaya's own defaults, chosen when the feature
   * was built (CONFIGURATION.md, "WhatsApp"), not rules from a specification:
   * - after the team writes in a conversation (from the phone or the inbox),
   *   Roxi stays quiet in it for this long, so she never talks over a person;
   * - she waits this long after a message before answering, so several
   *   messages sent in a row get one answer;
   * - she reads at most this many earlier messages for context;
   * - at most this many answers per conversation per hour, a brake against
   *   loops with another automated number;
   * - an answer is held this long before it is sent, in case she looks
   *   something up right after speaking, and she may look up at most this
   *   many times for one answer.
   */
  roxiPauseAfterTeamHours: 12,
  roxiWaitSeconds: 6,
  roxiContextMessages: 20,
  roxiMaxAnswersPerHour: 6,
  roxiSettleMs: 1500,
  roxiLookupsPerAnswer: 3,
  /**
   * The owner's own chat with Roxi (WHATSAPP_OWNER_WA_IDS): more answers an
   * hour than a stranger's, at most this many voice notes sent for them an
   * hour, each at most this many characters, made in this ElevenLabs voice
   * (Roxi's, as on her agents) and kept this long for WhatsApp to fetch.
   * Yavaya's own defaults (November 2026).
   */
  ownerMaxAnswersPerHour: 40,
  ownerVoiceNotesPerHour: 20,
  voiceNoteMaxLength: 600,
  roxiVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  voiceNoteKeepHours: 48,
} as const;

/**
 * The board districts (Hogar, Movilidad, Salud y Bienestar, Aprender,
 * Negocios, Campo). Yavaya's own defaults, chosen when they were built in
 * November 2026, not rules from a specification: a post stays open this many
 * days, and a member may hold this many open posts in one district at a time,
 * which is room for a small business and not for a flood.
 */
export const BOARD_RULES = {
  titleMinLength: 6,
  titleMaxLength: 90,
  bodyMinLength: 20,
  bodyMaxLength: 2000,
  priceMaxLength: 60,
  openDays: 60,
  maxOpenPerDistrict: 10,
  /** Photos are optional; this many at most. */
  maxPhotos: 4,
  /** "Avísame" alerts one member may keep per district. */
  maxAlertsPerDistrict: 5,
  pageSize: 20,
} as const;

/**
 * "Cerca de mí" (app/cerca): open posts of every board district around a
 * point, nearest first. Yavaya's own defaults (13 November 2026), not the
 * owner's: a post is placed at its town's centre, so a radius smaller than a
 * town says nothing, and these are the distances someone would travel for
 * what the boards hold.
 */
export const NEARBY_RULES = {
  /** The distances offered, in km; the middle one is used until the visitor picks. */
  radiiKm: [5, 15, 50],
  defaultRadiusKm: 15,
  /** Posts shown at most. */
  limit: 40,
} as const;

/**
 * Founders (13 November 2026, the owner's word on a proposal): the first
 * accounts ever opened on Yavaya wear "Fundador nº N" on their profile and
 * member card. How many count is Yavaya's own default, not the owner's.
 * The number is worked out from the order of registration every time it is
 * shown (trust/shield.ts), never stored, so nobody can be made a founder.
 */
export const FOUNDER_RULES = {
  firstMembers: 100,
} as const;

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
  /**
   * The daily light (a prayer, saying, quote or blessing for everyone, from
   * Yavaya itself): the day's text changes, and members hear of it, at this
   * local hour. The owner asked for 8 in the morning.
   */
  dailyLightLocalHour: 8,
  /**
   * For a member with no place, and for visitors, the day turns at this UTC
   * hour instead — 08:00 in the region's westernmost offset (UTC−6), so
   * nobody gets "tomorrow's" text in the evening.
   */
  dailyLightFallbackUtcHour: 14,
  /** Members notified per scheduler run; the rest follow on the next tick. */
  dailyLightBatchSize: 500,
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

/**
 * YavayaGo. Prices and delivery fees are the store's own; these are the
 * platform's limits around them, mirrored into `system_settings`.
 *
 * Several are operational guesses rather than specification, and flagged as
 * such in CONFIGURATION.md: the specification defines who may drive and what
 * the customer sees, not how long a store has to answer.
 */
export const GO_RULES = {
  /** A store that has not answered within this is presumed away; the order is cancelled and the customer told. */
  storeAnswerMinutes: 15,
  /** A ready order nobody picked up in this long is flagged to the store, which may cancel it. */
  pickupWaitMinutes: 45,
  maxLinesPerOrder: 30,
  maxQuantityPerLine: 20,
  /** Orders a customer may have open at once: a brake on prank orders paid in cash. */
  maxOpenOrdersPerCustomer: 2,
  /** Distance from the store, straight line, beyond which an order is refused. */
  maxDeliveryKm: 15,
  /**
   * A store's map pin this far (straight line) from the town it chose is refused as a mistake:
   * the pin was left where the map opened. A sanity bound, not a policy (CONFIGURATION.md).
   */
  storePinMaxKmFromPlace: 25,
  /** Driver position updates accepted at most this often. */
  trackingMinIntervalSeconds: 3,
  /** A position older than this is shown as "last seen", not as live. */
  trackingStaleSeconds: 90,
  /** How often the customer's map asks for the driver's position. */
  trackingPollSeconds: 5,
  /** A driver not heard from in this long is taken offline. */
  driverIdleMinutes: 20,
  menuMaxItems: 200,
  maxPhotos: 1,
  /** Days a store stays featured ("Destacado") after one purchase. */
  featureDays: 7,
  /**
   * The public map (/yavayago/mapa) shows how many drivers are online only
   * from this many up. Below it the count reads "fewer than" rather than a
   * number, so a lone driver in a small town is not pointed out to everyone.
   * A privacy floor chosen for the public map, not a business rule; see
   * CONFIGURATION.md.
   */
  publicMapMinCount: 3,
  /** How often the public map asks for the aggregated picture. Nothing personal is in it. */
  publicMapPollSeconds: 30,
} as const;

/**
 * How YavayaGo earns, decided by the owner's delegation (Oct 2026) after
 * weighing the commission model of the big delivery apps.
 *
 * No commission, ever: restaurants in the region already pay 30–35% to the
 * incumbents and say so publicly; "0% commission" is the one thing a new
 * app can promise that they cannot. Instead a store pays a flat monthly
 * plan once it gets real volume from Yavaya — easy to collect in a cash
 * economy, where a per-order commission would have to be chased store by
 * store. Stores approved before the founding cut-off use it free for their
 * first year, which is what the first restaurants were told.
 *
 * Billing the plan is not built (see the capability register); until it is,
 * nothing is charged and nothing is blocked — the store simply sees where it
 * stands.
 */
export const GO_PLAN_RULES = {
  /** Delivered orders per calendar month a store gets free, beyond its founding year. */
  freeOrdersPerMonth: 30,
  /** The Plan Negocio, in US cents a month, shown in dollars in every market. */
  planPriceUsdCents: 1900,
  /** Stores approved on or before this date are founding stores. */
  foundingCutoff: '2027-03-31',
  foundingMonths: 12,
} as const;

/**
 * Viajes y mandados: rides, parcels, errands and personal help, priced the
 * way people here already agree a fare — the customer proposes, drivers
 * accept or counter, the customer chooses. Drivers keep the whole fare.
 */
export const GO_TRIP_RULES = {
  /** An open request nobody was chosen for closes after this. */
  offerWindowMinutes: 20,
  /** Requests a customer may have going at once. */
  maxActivePerCustomer: 1,
  maxDistanceKm: 60,
  maxEtaMinutes: 120,
  /** Riders on a car trip; a motorcycle carries one. */
  maxPassengers: 4,
  descriptionMaxLength: 500,
  /** A counter-offer may not be more than this many times the customer's price — a brake on absurd bids. */
  maxCounterMultiple: 5,
  /** Drivers told of a new request at most. */
  alertDrivers: 50,
  /** Rough area shown before a driver is chosen: coordinates rounded to this many decimals (~1 km). */
  roughAreaDecimals: 2,
  /** The city where YavayaGo starts, as a location code; operations can move it. */
  launchPlaceCode: 'ca.ni.mn.managua',
} as const;

/**
 * Places and the live feed.
 *
 * Size tiers are a reading aid in the place picker ("ciudad grande",
 * "pueblo pequeño"), drawn from the GeoNames population figure. They decide
 * nothing: no price, limit or permission depends on how big a town is.
 *
 * The live-feed pacing is a judgement about attention, not a specification:
 * often enough that something new is seen, rarely enough that it never
 * becomes noise. It is flagged in CONFIGURATION.md.
 */
export const PLACE_RULES = {
  /** Lower population bound of each tier, largest first; a place takes the first it reaches. */
  sizeTiers: [
    { tier: 'city_big', level: 'city', minPopulation: 250_000 },
    { tier: 'city_medium', level: 'city', minPopulation: 75_000 },
    { tier: 'city_small', level: 'city', minPopulation: 0 },
    { tier: 'town_big', level: 'town', minPopulation: 10_000 },
    { tier: 'town_medium', level: 'town', minPopulation: 5_000 },
    { tier: 'town_small', level: 'town', minPopulation: 0 },
  ],
  searchMinChars: 2,
  searchMaxResults: 12,
  /** The place list changes only when operations add places; minutes it is held in memory. */
  indexCacheMinutes: 10,
  /** Seconds a stored location-bar choice lasts in the visitor's browser. */
  choiceCookieSeconds: 180 * 24 * 60 * 60,
} as const;

/**
 * Yavaya's own visit statistics (src/server/domains/stats): how many people
 * arrive, from where, on what kind of screen, and how fast the pages are for
 * them. Counts per day only — no cookies, no addresses, no identifiers.
 */
export const SITE_STATS_RULES = {
  /**
   * Days the daily counts are kept before the scheduler deletes them. Thirteen
   * months, so a month can be compared with the same month a year before.
   * NOT the owner's decision yet — see docs/CONFIGURATION.md, "Visit statistics".
   */
  keepDays: 395,
  /** Events one network may send per minute: a busy reader is a few; a script is hundreds. */
  eventsPerMinute: 120,
  /** New page addresses accepted per day; past this, unknown ones are counted together as "(other)". */
  newPathsPerDay: 300,
  /** Speed samples a page needs before the panel calls it slow or fast. */
  minSamplesForPage: 20,
  /**
   * The clock a "day" is counted on: the launch city's (Managua, chosen by the
   * owner in October 2026), so an evening visit lands on its own day rather
   * than the next one in UTC.
   */
  dayTimeZone: 'America/Managua',
} as const;

export const LIVE_FEED_RULES = {
  /** Events older than this are no longer "new". */
  windowHours: 24,
  /**
   * How long activity is kept at all (the owner's decision, 20 October 2026):
   * the account page and the panel list the last week, newest first, and the
   * scheduler deletes anything older. The audit log is not this — it is
   * permanent by design and only ever shown for the same week.
   */
  keepDays: 7,
  maxItems: 12,
  /** Seconds after a page opens before the first message. */
  firstDelaySeconds: 8,
  /** Seconds a message stays on screen. */
  showSeconds: 7,
  /** Gap between messages: short when there is a lot happening, long when there is little. */
  gapSecondsBusy: 25,
  gapSecondsQuiet: 50,
  /** A message already seen may come back after this long, if nothing newer has replaced it. */
  repeatAfterMinutes: 30,
  /** How often the browser asks for news while the page stays open. */
  refreshSeconds: 120,
  /** "Pausar" holds messages for this long; the "En vivo" pill turns them back on at any time. */
  snoozeMinutes: 45,
} as const;

/**
 * Roxi, the assistant: the welcome voice notes and the proactive help a
 * member can opt into (src/ui/roxi/presence.ts reads the second group in the
 * browser, so those values travel with the page, not from the database).
 */
export const ROXI_RULES = {
  /** Logins on which a welcome voice note plays for its one recipient (the owner's request, October 2026). */
  welcomePlays: 2,
  /** Seconds after signing in before Roxi speaks (the owner's request, October 2026). */
  welcomeDelaySeconds: 10,
  /**
   * Minutes after signing in during which a session still counts as "a
   * login". A session that began earlier — one that was already open when this
   * shipped, or yesterday's — never plays the note.
   */
  welcomeLoginWindowMinutes: 15,
  /** Available mode: minutes of browsing without opening Roxi before one small check-in appears. */
  checkInAfterMinutes: 6,
  /** Seconds the check-in stays before tucking itself away. */
  checkInVisibleSeconds: 20,
  /** Check-ins at most per day, whatever happens. */
  checkInsPerDay: 1,
  /**
   * Proactive mode only, which the member turns on themselves: the simulated
   * call comes after a random wait inside this range of browsing minutes —
   * 15 to 20 to begin with, as the owner asked, so it can be tested.
   */
  callAfterMinutes: { min: 15, max: 20 },
  /** Seconds the ringtone plays before the call counts as missed. */
  callRingSeconds: 20,
  /** Hours after a declined or missed call before Roxi rings again. */
  callCooldownHours: 24,
  /** Default quiet hours (local time, 24 h clock): no check-in and no call. The member can change them. */
  quietHours: { from: 21, to: 7 },
} as const;

/**
 * Roxi's three plans (the owner's request, 5 November 2026: "Free, what we
 * have now; Pro and Max — you figure out price and skills; both paid plans
 * have credit limits; extra credits can be bought"). The prices, allowances
 * and the skill-to-plan map below were chosen on that instruction from what
 * a conversation actually costs at ElevenLabs (docs/roxi/PLANS.md has the
 * arithmetic). They are business numbers the owner may retune.
 *
 * A credit is a fixed slice of what Roxi really costs to run, read back from
 * ElevenLabs after each conversation — not a count of messages — so a long
 * spoken conversation uses more than a short written one, and a change of
 * model or voice cannot silently make the plans lose money.
 */
export const ROXI_CREDIT_RULES = {
  /** US dollars of provider cost one credit stands for: 1 credit = $0.001. */
  usdPerCredit: 0.001,
  /**
   * Below this balance a new conversation does not open (about a minute of
   * voice). A conversation already open is never cut off mid-sentence: it may
   * take the balance below zero, and the next one waits for credits.
   */
  minimumToStart: 150,
  /** Credits each connector call uses (a Gmail search, an MCP tool call): the server work is small but not free. */
  connectorCall: 2,
  /** Months purchased credits stay usable. Plan credits reset each period and do not roll over. */
  purchasedCreditMonths: 12,
} as const;

export type RoxiPlanKey = 'free' | 'pro' | 'max';

export type RoxiPlan = {
  key: RoxiPlanKey;
  /** Monthly price in US cents; 0 for Free. */
  priceMinor: number;
  currency: 'USD';
  /** Credits granted each month (each billing period for paid plans, each calendar month for Free). */
  monthlyCredits: number;
  /** Active goals Roxi keeps (skill 1: the proposal caps it at three). */
  goals: number;
  /** Active reminders. */
  reminders: number;
  /** Whether reminders can repeat (every week, every month). */
  recurringReminders: boolean;
  /** Connected tools at once. */
  connections: number;
  /** Which kinds of connection the plan may add. */
  connectorKinds: ReadonlyArray<'google' | 'mcp' | 'api'>;
  /** People in a family circle, including the owner (0: none). */
  familyCircle: number;
  /** Things Roxi watches for (price memory, 26): new Mercadito listings or job offers that match. */
  watches: number;
  /** Multi-step missions at once (42): a goal with its steps and budget. */
  missions: number;
  /** Time capsules waiting to open (32). */
  capsules: number;
};

export const ROXI_PLANS: Readonly<Record<RoxiPlanKey, RoxiPlan>> = {
  // Prices: the owner's suggested starting point of 6 November 2026 ($4.99 / $12.99). They still cover
  // the most each plan's credits can cost after card fees (tests/integration/roxi-plans.test.ts).
  free: { key: 'free', priceMinor: 0, currency: 'USD', monthlyCredits: 1_500, goals: 1, reminders: 5, recurringReminders: false, connections: 0, connectorKinds: [], familyCircle: 0, watches: 2, missions: 0, capsules: 0 },
  pro: { key: 'pro', priceMinor: 499, currency: 'USD', monthlyCredits: 4_000, goals: 3, reminders: 30, recurringReminders: true, connections: 3, connectorKinds: ['google'], familyCircle: 0, watches: 10, missions: 5, capsules: 10 },
  max: { key: 'max', priceMinor: 1_299, currency: 'USD', monthlyCredits: 10_000, goals: 3, reminders: 100, recurringReminders: true, connections: 10, connectorKinds: ['google', 'mcp', 'api'], familyCircle: 6, watches: 25, missions: 20, capsules: 50 },
};

/** Extra credits, for any member on any plan. Usable for ROXI_CREDIT_RULES.purchasedCreditMonths. */
export const ROXI_CREDIT_PACKS: ReadonlyArray<{ key: string; credits: number; priceMinor: number; currency: 'USD' }> = [
  { key: 'roxi_credits_1000', credits: 1_000, priceMinor: 199, currency: 'USD' },
  { key: 'roxi_credits_3000', credits: 3_000, priceMinor: 499, currency: 'USD' },
  { key: 'roxi_credits_10000', credits: 10_000, priceMinor: 1_499, currency: 'USD' },
];

/**
 * Which plan each of Roxi's skills needs. The proposal's skills by number
 * (docs/roxi/PLANS.md). Help that people with little need — finding work
 * without money, a lost animal, community help — stays free on purpose.
 */
export const ROXI_SKILL_PLANS = {
  // Free: "Te ayudo." What Roxi already does, and help that must never sit behind a payment.
  search: 'free',
  drafts: 'free',
  front_door: 'free', // "¿Qué necesitas hoy?" and voice-to-everything (22)
  goals: 'free', // 1 (one goal on Free, three on Pro and Max)
  day_plan: 'free', // 3
  reminders: 'free', // 5 (five on Free, more and repeating on Pro and Max)
  promise_keeper: 'free', // 24 (a commitment is a reminder that asks how it went)
  surprise: 'free', // 6
  good_moments: 'free', // 7
  celebrations: 'free', // 8
  thank_you: 'free', // 10
  problem_solver: 'free', // 11
  lost_pet_guard: 'free', // 14
  start_with_nothing: 'free', // 16
  skill_discovery: 'free', // 17
  help_match: 'free', // 18
  life_map: 'free', // 19
  community_pulse: 'free', // 20
  business_ledger: 'free', // 21 (basic bookkeeping stays free, as the proposal asks)
  human_connection: 'free', // 23
  price_memory: 'free', // 26 (two watches on Free, more on Pro and Max)
  trusted_contact: 'free', // 28
  share: 'free', // 30
  real_world_memory: 'free', // 35
  camera_eyes: 'free', // 37 (from photos)
  second_chance: 'free', // 39
  personal_world: 'free', // 40 (three cards)
  // Pro: "Te acompaño."
  daily_opportunity: 'pro', // 2
  neighbourhood: 'pro', // 4
  budget_finder: 'pro', // 12
  sell_with_me: 'pro', // 15 (the follow-ups and price comparison; the draft itself stays free)
  connectors_google: 'pro',
  time_capsule: 'pro', // 32
  anticipation: 'pro', // 41
  missions: 'pro', // 42
  negotiation_coach: 'pro', // 43
  knowledge_vault: 'pro', // 44
  cross_district: 'pro', // 45
  store_rescue: 'pro', // 29
  // Max: "Lo hacemos realidad."
  family_circle: 'max', // 13
  business_insights: 'max', // 33 (restock, trends)
  connectors_custom: 'max', // MCP servers and APIs of the member's own
  connects_dots: 'max', // 31
  opportunity_radar: 'max', // 34
  chain_reaction: 'max', // 36
  storykeeper: 'max', // 38
  mission_agent: 'max', // 46
  live_world: 'max', // 47
  digital_twin: 'max', // 48
  multi_agent: 'max', // 49
  life_os: 'max', // 50
} as const satisfies Record<string, RoxiPlanKey>;

export type RoxiSkill = keyof typeof ROXI_SKILL_PLANS;

const PLAN_ORDER: Record<RoxiPlanKey, number> = { free: 0, pro: 1, max: 2 };

export function planAllows(plan: RoxiPlanKey, skill: RoxiSkill): boolean {
  return PLAN_ORDER[plan] >= PLAN_ORDER[ROXI_SKILL_PLANS[skill]];
}

/**
 * Yavaya Play's progression (docs/PLAY.md, "Progress"). Every number here is
 * Yavaya's own provisional default, not the owner's: to be retuned once real
 * players' numbers are measured (docs/CONFIGURATION.md). XP and Play Coins
 * are given only for a run the server played again and saw finish. Play
 * Coins are not money and not tokens: they are earned by playing, spent in
 * the game's shop on looks, and never bought.
 */
export const PLAY_RULES = {
  /** The first time a course is finished. */
  firstFinish: { xp: 100, coins: 20 },
  /** The first time each medal is reached on a course (a better medal pays its own, and those below it it skipped). */
  medal: {
    completado: { xp: 0, coins: 0 },
    bronce: { xp: 20, coins: 5 },
    plata: { xp: 40, coins: 10 },
    oro: { xp: 70, coins: 15 },
    obsidiana: { xp: 110, coins: 25 },
    guardian: { xp: 160, coins: 40 },
  },
  /** La Ruta del Día, finished, once a day. */
  dailyFinish: { xp: 60, coins: 15 },
  /** Level n (from 1) needs levelStep × n × (n − 1) / 2 XP in all: 0, 150, 450, 900, … */
  levelStep: 150,
  /** A day's route counts for its own day, and for this many hours after (a run begun before midnight UTC). */
  dailyGraceHours: 3,
  /** How many players a leaderboard shows. */
  boardSize: 20,
  /** A run longer than this is not checked (the replay is work for the server). */
  maxRunSeconds: 600,
  /** Each achievement, once. */
  achievement: { xp: 150, coins: 40 },
  /** The shop's prices in Play Coins, by `part:id` (config/play-looks.ts marks what is sold). */
  shop: {
    'hairColor:oro': 120,
    'hairColor:violeta': 120,
    'top:guayabera_oro': 300,
    'top:sudadera_volcan': 220,
    'shoes:tenis_dorados': 180,
  } as Record<string, number>,
  /**
   * Gems: the money currency of Yavaya Play's most exclusive looks, our
   * prices (the owner asked for $0.30–$1 an item). One gem is a cent. Sold
   * in packs, so one card fee covers many items (a card charge per $0.30
   * item would go mostly to fees). Looks only: nothing that helps win.
   */
  gemPacks: [
    { key: 'gemas_100', gems: 100, priceMinor: 100, currency: 'USD' },
    { key: 'gemas_320', gems: 320, priceMinor: 300, currency: 'USD' },
    { key: 'gemas_550', gems: 550, priceMinor: 500, currency: 'USD' },
    // For the Vault's collections ($9.99 to $14.99) and its biggest pieces.
    { key: 'gemas_1150', gems: 1150, priceMinor: 1000, currency: 'USD' },
    { key: 'gemas_2400', gems: 2400, priceMinor: 2000, currency: 'USD' },
  ] as ReadonlyArray<{ key: string; gems: number; priceMinor: number; currency: 'USD' }>,
  /** Gem prices by `part:id` (config/play-looks.ts marks which are sold for gems). */
  gems: {
    'face:guino': 30,
    'face:perilla': 40,
    'beard:charro': 50,
    'beard:pelirroja': 40,
    'paint:rayos': 40,
    'paint:leopardo': 40,
    'paint:cerezo': 50,
    'paint:gato': 30,
    'paint:fuego': 60,
    'glasses:arcoiris': 50,
    'glasses:persiana': 40,
    'glasses:neon': 70,
    'glasses:corazon': 40,
    'top:galaxia': 90,
    'top:cuadros': 90,
  } as Record<string, number>,
} as const;
