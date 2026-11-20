import { bigint, boolean, char, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';

/**
 * Mirador: Yavaya's short videos (docs/mirador/README.md).
 *
 * Not a district of its own but a window over all of them: a video may point
 * at one real thing elsewhere on Yavaya (a Mercadito listing, a YavayaGo
 * store, a board post) and takes that thing's district, so a viewer can act
 * on what they saw without leaving the platform.
 *
 * A video is one row from the moment its upload starts: `uploading` (parts
 * arriving in the bucket), `processing` (checked and encoded by ffmpeg),
 * then `ready` or `failed`; `removed` by its creator or a moderator. Only a
 * ready video with `published_at` set appears in a feed.
 *
 * The counters are kept on the row, inside the same transaction as the
 * like, save or comment that changes them, so a feed never counts rows to
 * rank; `views` counts one view per viewer per day (mirador_views), never a
 * replay or a reload.
 */
export const miradorVideos = pgTable(
  'mirador_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorUserId: uuid('creator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('uploading'),
    caption: text('caption').notNull().default(''),
    hashtags: text('hashtags').array().notNull().default([]),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    language: text('language').notNull().default('es'),
    /** `upload` (filmed by the member) or `ai` (generated with Roxi): an AI video is always labelled as one. */
    source: text('source').notNull().default('upload'),
    /** The district of what it links to, or null for a video that links nowhere. */
    district: text('district'),
    /** What a viewer can open from it: `mercadito_listing`, `go_store` or `board_post`, owned by the creator. */
    linkType: text('link_type'),
    linkId: uuid('link_id'),

    /** `video` (filmed) or `photos` (up to four photos Yavaya turns into a short video, free). */
    inputKind: text('input_kind').notNull().default('video'),
    /** The photos, while `photos` waits to be turned into a video; deleted after. */
    photoKeys: text('photo_keys').array().notNull().default([]),
    /** Captions (WebVTT) of a narration, when it has one. */
    captionsKey: text('captions_key'),
    /** Bumped when its files change (a narration), so no phone plays a cached old one. */
    version: smallint('version').notNull().default(1),
    /** The member's file, until it is encoded; deleted then, the encodings kept. */
    originalKey: text('original_key'),
    originalBytes: integer('original_bytes'),
    /** The bucket's multipart upload and the parts it has, while `uploading`. */
    uploadId: text('upload_id'),
    uploadParts: jsonb('upload_parts').$type<Array<{ partNumber: number; etag: string; bytes: number }>>().notNull().default([]),
    /** 720p for most viewers, 360p for slow connections and data savers, and a still for the poster. */
    playbackKey: text('playback_key'),
    lowKey: text('low_key'),
    posterKey: text('poster_key'),
    playbackBytes: integer('playback_bytes'),
    lowBytes: integer('low_bytes'),
    durationMs: integer('duration_ms'),
    width: smallint('width'),
    height: smallint('height'),
    hasAudio: boolean('has_audio').notNull().default(false),
    processingAttempts: smallint('processing_attempts').notNull().default(0),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    /** An i18n key saying why it could not be used (too long, not a video…). */
    failureReason: text('failure_reason'),

    views: integer('views').notNull().default(0),
    completions: integer('completions').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    /** Taps on its link: the creator's "clics al producto". */
    linkOpens: integer('link_opens').notNull().default(0),
    /** Distinct members who reported it while it was up. */
    reports: integer('reports').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
    /** `creator`, `moderator` or `reports` (hidden for review after enough reports). */
    removedReason: text('removed_reason'),
  },
  (table) => [
    index('mirador_videos_feed_idx').on(table.status, table.publishedAt),
    index('mirador_videos_creator_idx').on(table.creatorUserId, table.createdAt),
    index('mirador_videos_link_idx').on(table.linkType, table.linkId),
    index('mirador_videos_location_idx').on(table.locationId),
  ],
);

export const miradorLikes = pgTable(
  'mirador_likes',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.videoId, table.userId] }), index('mirador_likes_user_idx').on(table.userId, table.createdAt)],
);

export const miradorSaves = pgTable(
  'mirador_saves',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.videoId, table.userId] }), index('mirador_saves_user_idx').on(table.userId, table.createdAt)],
);

/** One member following a creator, for the Siguiendo tab. */
export const miradorFollows = pgTable(
  'mirador_follows',
  {
    followerUserId: uuid('follower_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorUserId: uuid('creator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerUserId, table.creatorUserId] }), index('mirador_follows_creator_idx').on(table.creatorUserId, table.createdAt)],
);

/** Comments and one level of replies (`parent_id`). `removed` by its author or a moderator: gone from view, kept for the report trail. */
export const miradorComments = pgTable(
  'mirador_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    status: text('status').notNull().default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('mirador_comments_video_idx').on(table.videoId, table.status, table.createdAt), index('mirador_comments_parent_idx').on(table.parentId)],
);

/**
 * Who watched what, one row per viewer per video per day: the honest view
 * count, how much of it they watched, and whether they watched it to the end
 * (the ranking's completion signal). A visitor who is not signed in is a
 * daily hash, never an identity (`viewer_key`).
 */
export const miradorViews = pgTable(
  'mirador_views',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    viewerKey: text('viewer_key').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    watchedMs: integer('watched_ms').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    replays: smallint('replays').notNull().default(0),
    /** Shared it today: a share counts once per viewer per day, like the view. */
    shared: boolean('shared').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('mirador_views_key').on(table.videoId, table.viewerKey, table.day), index('mirador_views_user_idx').on(table.userId, table.updatedAt)],
);

/**
 * A member hiding another member's videos and comments from themselves, in
 * Mirador. Yavaya has no platform-wide block yet; this one is scoped to
 * Mirador on purpose rather than half-building that.
 */
export const miradorBlocks = pgTable(
  'mirador_blocks',
  {
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.blockerUserId, table.blockedUserId] })],
);

/** A member's own say over For You: the hashtags they chose, and the moment they last started it over. */
export const miradorPreferences = pgTable('mirador_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  interests: text('interests').array().notNull().default([]),
  /** Signals before this (likes, saves, views) no longer shape For You. */
  resetAt: timestamp('reset_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An offer on a video (docs/mirador/README.md, "Offers"): what the video
 * shows can be had — sold, given away, given for whatever the other person
 * wants to give, or given to a soup kitchen — and a viewer asks for it with
 * "Lo quiero". Yavaya takes no part in the money: buyer and seller settle at
 * the pickup, as in Mercadito.
 *
 * `remaining` falls only when the creator accepts a request, inside that
 * transaction; an offer past `available_until` closes itself. The pickup
 * details are shown only to someone whose request was accepted.
 */
export const miradorOffers = pgTable(
  'mirador_offers',
  {
    videoId: uuid('video_id')
      .primaryKey()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    creatorUserId: uuid('creator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `sale`, `free`, `contribution` (what the other person wants to give) or `donation` (for soup kitchens). */
    kind: text('kind').notNull(),
    /** `food`, `baked`, `crafts`, `clothes`, `plants` or `other`. */
    category: text('category').notNull(),
    title: text('title').notNull(),
    priceMinor: bigint('price_minor', { mode: 'number' }),
    currency: char('currency', { length: 3 }).notNull(),
    unit: text('unit'),
    quantity: smallint('quantity').notNull(),
    remaining: smallint('remaining').notNull(),
    /** Food only: what is in it and what someone allergic must know. */
    ingredients: text('ingredients'),
    /** Food only: the moment the creator confirmed the food rules (made today, kept safe, nothing on the not-allowed list). */
    foodRulesAt: timestamp('food_rules_at', { withTimezone: true }),
    pickupLocationId: uuid('pickup_location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** Where and when exactly: shown only to someone whose request was accepted. */
    pickupDetails: text('pickup_details').notNull().default(''),
    availableUntil: timestamp('available_until', { withTimezone: true }).notNull(),
    /** `open`, `closed` (by its creator) or `expired`. */
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [index('mirador_offers_open_idx').on(table.status, table.kind, table.availableUntil), index('mirador_offers_creator_idx').on(table.creatorUserId, table.status)],
);

/** "Lo quiero": one member asking for some of an offer. `pending` → `accepted` / `declined`, or `cancelled` by the one who asked. */
export const miradorOfferRequests = pgTable(
  'mirador_offer_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorOffers.videoId, { onDelete: 'cascade' }),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quantity: smallint('quantity').notNull(),
    note: text('note'),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [index('mirador_offer_requests_video_idx').on(table.videoId, table.status), index('mirador_offer_requests_requester_idx').on(table.requesterUserId, table.createdAt)],
);

/**
 * A narration in Roxi's voice (ElevenLabs), paid in tokens
 * (docs/mirador/README.md, "Voiceover"). Charged when it is asked for, in
 * the same transaction as this row; refunded, once, if it could not be made.
 * The provider's cost is kept so Admin sees the margin.
 */
export const miradorVoiceJobs = pgTable(
  'mirador_voice_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => miradorVideos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    script: text('script').notNull(),
    voice: text('voice').notNull(),
    /** How loud the video's own sound stays under the voice, 0–100. */
    originalVolume: smallint('original_volume').notNull(),
    characters: integer('characters').notNull(),
    actionKey: text('action_key').notNull(),
    tokens: integer('tokens').notNull(),
    /** The provider's price for these characters, in millionths of a dollar. */
    providerCostMicros: integer('provider_cost_micros').notNull(),
    /** `charged` → `done`, or `refunded` when it could not be made. */
    status: text('status').notNull().default('charged'),
    attempts: smallint('attempts').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    failure: text('failure'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('mirador_voice_jobs_status_idx').on(table.status, table.createdAt), index('mirador_voice_jobs_video_idx').on(table.videoId)],
);
