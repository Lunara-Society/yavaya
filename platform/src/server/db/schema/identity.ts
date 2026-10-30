import {
  bigint,
  boolean,
  char,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { locations } from './geography';
import {
  accountStatusEnum,
  duplicateReviewStatusEnum,
  locationPrecisionEnum,
  riskBandEnum,
  signalKindEnum,
  trustStateEnum,
  verificationKindEnum,
  verificationStatusEnum,
} from './enums';

/**
 * Identity.
 *
 * `id` is the immutable internal primary key and the only value foreign keys
 * ever point at. `yayId` is the public, permanent, non-transferable human
 * identifier printed as `YAY-23678365`. It is never used as a join key and
 * never changes owner.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 8 digits, no prefix stored. Rendered as `YAY-########`. */
    yayId: char('yay_id', { length: 8 }).notNull(),

    /** Lower-cased address used for login and uniqueness. */
    email: text('email').notNull(),
    /**
     * Aggressively normalised address (dots and +tags stripped for providers
     * that ignore them) used only as an anti-duplication signal.
     */
    emailNormalized: text('email_normalized').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    /** E.164. Optional at registration, required before high-trust actions. */
    phoneE164: text('phone_e164'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),

    /** scrypt-derived; format is `scrypt$N$r$p$salt$hash`. Never reversible. */
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }).notNull().defaultNow(),

    displayName: text('display_name').notNull(),
    status: accountStatusEnum('status').notNull().default('pending_verification'),
    trustState: trustStateEnum('trust_state').notNull().default('monitored'),

    identityVerifiedAt: timestamp('identity_verified_at', { withTimezone: true }),

    /** End of the 72-hour enhanced monitoring window. */
    monitoredUntil: timestamp('monitored_until', { withTimezone: true }).notNull(),

    locale: text('locale').notNull().default('es'),
    themePreference: text('theme_preference').notNull().default('system'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Soft deletion. A YAY ID is never released back into the pool. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_yay_id_key').on(table.yayId),
    uniqueIndex('users_email_key').on(table.email),
    index('users_email_normalized_idx').on(table.emailNormalized),
    index('users_phone_idx').on(table.phoneE164),
    index('users_status_idx').on(table.status),
    index('users_monitored_until_idx').on(table.monitoredUntil),
  ],
);

/**
 * Reserves every YAY ID that has ever been allocated, including for accounts
 * that were later removed. Guarantees the identifier is never re-issued.
 */
export const yayIdRegistry = pgTable(
  'yay_id_registry',
  {
    yayId: char('yay_id', { length: 8 }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => [index('yay_id_registry_user_idx').on(table.userId)],
);

export const userProfiles = pgTable(
  'user_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    avatarMediaId: uuid('avatar_media_id'),
    /**
     * The number buyers reach this member on through WhatsApp, in E.164.
     * Declared by the member and NOT verified — SMS verification is not
     * configured — so every place that shows it says so.
     */
    whatsappE164: text('whatsapp_e164'),
    /** Declared home location; the deepest node the user chose to reveal. */
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    /**
     * How precisely this user's location may be shown to others. Granting GPS
     * permission never raises this — only an explicit user choice does.
     */
    locationPrecision: locationPrecisionEnum('location_precision').notNull().default('city'),
    /** Coordinates as supplied. Always fuzzed by precision before exposure. */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    /**
     * Identity Studio (domains/identity/studio.ts). The draft is the owner's
     * working copy and is never shown to anyone else; the published copy is
     * what visitors see. Both are validated configurations — ids and short
     * texts, never markup or styles. Null means "as Yavaya draws it".
     */
    identityDraft: jsonb('identity_draft'),
    identityPublished: jsonb('identity_published'),
    /**
     * Bumped by every save, publish or discard. A save names the revision it
     * was based on, so two open windows cannot silently overwrite each other.
     */
    identityRevision: integer('identity_revision').notNull().default(0),
    identityDraftSavedAt: timestamp('identity_draft_saved_at', { withTimezone: true }),
    identityPublishedAt: timestamp('identity_published_at', { withTimezone: true }),
    /** Design ids the member keeps under "Favoritos". */
    identityFavorites: text('identity_favorites').array().notNull().default([]),
    /** How the member arranged their own account page: which shortcuts and sections, in what order. */
    dashboardLayout: jsonb('dashboard_layout'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_profiles_location_idx').on(table.locationId)],
);

/**
 * Looks a member saved under their own name in the Identity Studio: the
 * appearance only, never their texts or who-sees-what.
 */
export const identityPresets = pgTable(
  'identity_presets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    appearance: jsonb('appearance').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('identity_presets_user_name_key').on(table.userId, table.name)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the session token. The raw token exists only in the cookie. */
    tokenHash: text('token_hash').notNull(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);

/**
 * Sign-in providers attached to an account (today: Google). The provider's own
 * stable subject identifies the person; the address is kept only as it was
 * when linked, for support. One provider identity belongs to one account.
 */
export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    emailAtLink: text('email_at_link').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_identities_provider_subject_key').on(table.provider, table.subject),
    index('external_identities_user_idx').on(table.userId),
  ],
);

/**
 * Two-step sign-in: the authenticator secret for an account that turned it
 * on. Sealed at rest under TWO_STEP_KEY — a database copy alone cannot mint
 * codes. `lastUsedStep` is the 30-second window of the last accepted code, so
 * the same code cannot be used twice, even within its own window.
 */
export const twoStepFactors = pgTable('two_step_factors', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretSealed: text('secret_sealed').notNull(),
  lastUsedStep: bigint('last_used_step', { mode: 'number' }).notNull().default(0),
  enabledAt: timestamp('enabled_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One-time codes for when the phone is lost. Only their hashes are kept. */
export const twoStepRecoveryCodes = pgTable(
  'two_step_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('two_step_recovery_codes_user_idx').on(table.userId), uniqueIndex('two_step_recovery_codes_hash_key').on(table.codeHash)],
);

/**
 * Password reset links. The token exists only in the email; this keeps its
 * hash, so a database copy cannot be used to reset anyone's password.
 */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('password_resets_token_hash_key').on(table.tokenHash), index('password_resets_user_idx').on(table.userId)],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Keyed hash of the client fingerprint. Raw fingerprints are not stored. */
    fingerprintHash: text('fingerprint_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** How many distinct accounts have authenticated from this device. */
    accountCount: integer('account_count').notNull().default(0),
  },
  (table) => [uniqueIndex('devices_fingerprint_key').on(table.fingerprintHash)],
);

export const userDevices = pgTable(
  'user_devices',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    isTrusted: boolean('is_trusted').notNull().default(false),
  },
  (table) => [
    uniqueIndex('user_devices_key').on(table.userId, table.deviceId),
    index('user_devices_device_idx').on(table.deviceId),
  ],
);

/**
 * Anti-duplication signals. Values are keyed hashes so that a database leak
 * does not reveal the underlying address, phone number or fingerprint.
 */
export const accountSignals = pgTable(
  'account_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: signalKindEnum('kind').notNull(),
    valueHash: text('value_hash').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    occurrences: integer('occurrences').notNull().default(1),
  },
  (table) => [
    uniqueIndex('account_signals_key').on(table.userId, table.kind, table.valueHash),
    index('account_signals_lookup_idx').on(table.kind, table.valueHash),
  ],
);

/**
 * The outcome of a risk evaluation. Stored so an enforcement decision can
 * always be explained, contested and reviewed after the fact.
 */
export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. `registration`, `publish_listing`, `driver_application`. */
    context: text('context').notNull(),
    score: integer('score').notNull(),
    band: riskBandEnum('band').notNull(),
    /** Every contributing factor with its weight, for human review. */
    factors: jsonb('factors').$type<Array<{ code: string; weight: number; detail?: string }>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('risk_assessments_user_idx').on(table.userId),
    index('risk_assessments_band_idx').on(table.band),
  ],
);

/**
 * A suspected same-person relationship between two accounts. Always reviewed
 * by a human before any permanent consequence.
 */
export const duplicateCandidates = pgTable(
  'duplicate_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    matchedUserId: uuid('matched_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    reasons: jsonb('reasons').$type<Array<{ code: string; weight: number }>>().notNull(),
    status: duplicateReviewStatusEnum('status').notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('duplicate_candidates_pair_key').on(table.userId, table.matchedUserId),
    index('duplicate_candidates_status_idx').on(table.status),
  ],
);

/**
 * Email / phone / document verification challenges. Codes are stored hashed
 * and are single-use.
 */
export const verificationChallenges = pgTable(
  'verification_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: verificationKindEnum('kind').notNull(),
    status: verificationStatusEnum('status').notNull().default('pending'),
    /** Address or number the challenge was sent to, normalised. */
    target: text('target').notNull(),
    codeHash: text('code_hash'),
    attempts: smallint('attempts').notNull().default(0),
    maxAttempts: smallint('max_attempts').notNull().default(5),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('verification_challenges_user_idx').on(table.userId, table.kind),
    index('verification_challenges_expires_idx').on(table.expiresAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
