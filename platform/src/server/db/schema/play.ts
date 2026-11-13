import { sql } from 'drizzle-orm';
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Yavaya Play (docs/PLAY.md). Its own tables, apart from everything else:
 * nothing here touches tokens, reputation or the marketplace.
 *
 * A player's character. `look` is a set of ids from config/play-looks.ts,
 * checked by the server before it is stored (`parseLook`); it never holds a
 * colour or a shape of its own.
 */
export const playProfiles = pgTable('play_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  look: jsonb('look').$type<Record<string, string>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A run the server played again and saw finish (docs/PLAY.md, "Verified
 * runs"). `input` is the thumbs, step by step (ui/play/trials/run.ts);
 * `seconds` is the time the server's own replay took, never a number the
 * phone sent. A player keeps their best run on each course (`best`), and any
 * run they shared as a challenge (`shared`); the rest are not kept.
 */
export const playRuns = pgTable(
  'play_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A trial's id, a district course's, or `dia-YYYY-MM-DD` (ui/play/trials/courses.ts). */
    course: text('course').notNull(),
    seconds: doublePrecision('seconds').notNull(),
    medal: text('medal').notNull(),
    noCheckpoints: boolean('no_checkpoints').notNull().default(false),
    fails: integer('fails').notNull().default(0),
    input: text('input').notNull(),
    best: boolean('best').notNull().default(false),
    shared: boolean('shared').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('play_runs_best_idx').on(table.userId, table.course).where(sql`${table.best}`),
    index('play_runs_board_idx').on(table.course, table.seconds),
  ],
);

/** A player's totals, kept beside the rewards that make them (play_rewards) and changed only with them. */
export const playProgress = pgTable('play_progress', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  /** Play Coins: earned by playing, spent in the game's shop; never money, never tokens. */
  coins: integer('coins').notNull().default(0),
  /** Gems: bought with money (Stripe, in packs), spent only on looks. Never earned, never converted to coins or tokens. */
  gems: integer('gems').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every change to a player's XP and coins, with why. A reward is given once:
 * (`userId`, `reason`, `ref`) is unique, so a run sent twice, or a medal won
 * again, pays nothing the second time. Spending is a row with negative coins.
 */
export const playRewards = pgTable(
  'play_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    ref: text('ref').notNull(),
    xp: integer('xp').notNull().default(0),
    coins: integer('coins').notNull().default(0),
    /** A gem pack bought (reason `gems`, ref the payment's reference), or gems spent on a look (negative). */
    gems: integer('gems').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('play_rewards_once_idx').on(table.userId, table.reason, table.ref)],
);

export const playAchievements = pgTable(
  'play_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievement: text('achievement').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievement] })],
);

/** Look options a player owns beyond the free catalogue: bought with coins, or earned (config/play-looks.ts). */
export const playItems = pgTable(
  'play_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `part:id`, e.g. `top:guayabera_oro`. */
    item: text('item').notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.item] })],
);

/**
 * Anonymous counts, by day (docs/PLAY.md, "What players do"): how many
 * started a course, finished it, fell where. A key and a number; nothing
 * about who, no device, no address.
 */
export const playStats = pgTable(
  'play_stats',
  {
    day: date('day').notNull(),
    key: text('key').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.key] })],
);

/**
 * The Vault (docs/PLAY.md, "The Vault"): premium looks and collectibles,
 * paid in gems. Its catalogue lives here, not in code, so the owner manages
 * products, prices, collections, editions and availability from Admin.
 */
export const vaultCollections = pgTable('vault_collections', {
  key: text('key').primaryKey(),
  nameEs: text('name_es').notNull(),
  nameEn: text('name_en').notNull(),
  lineEs: text('line_es').notNull().default(''),
  lineEn: text('line_en').notNull().default(''),
  /** The whole collection at once, in gems; null when not sold as a bundle. */
  bundleGems: integer('bundle_gems'),
  sort: integer('sort').notNull().default(0),
  onSale: boolean('on_sale').notNull().default(true),
});

export const vaultProducts = pgTable(
  'vault_products',
  {
    key: text('key').primaryKey(),
    collectionKey: text('collection_key').references(() => vaultCollections.key, { onDelete: 'set null' }),
    category: text('category').notNull(),
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en').notNull(),
    lineEs: text('line_es').notNull().default(''),
    lineEn: text('line_en').notNull().default(''),
    /** Its picture, under /play/vault/. */
    image: text('image').notNull(),
    priceGems: integer('price_gems').notNull(),
    /**
     * `available`: can be worn or used now. `collectible`: owned, not yet usable
     * (its art for the character is not built). `future`: needs a game mode that
     * does not exist yet (`mode`).
     */
    status: text('status').notNull(),
    /** The game mode a `future` product waits for (its words are `play.vault.mode.<mode>`). */
    mode: text('mode'),
    /** For an `available` look: the option it unlocks, `part:id` (config/play-looks.ts). */
    lookItem: text('look_item'),
    /** A numbered edition: only this many will ever be sold. Null: not limited. */
    editionSize: integer('edition_size'),
    onSale: boolean('on_sale').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vault_products_collection_idx').on(table.collectionKey)],
);

/**
 * What a player owns from the Vault. A numbered edition's number is unique
 * per product, so two buyers can never hold the same one. A returned
 * collectible's row is deleted: its number goes back to the stock.
 */
export const vaultOwned = pgTable(
  'vault_owned',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productKey: text('product_key')
      .notNull()
      .references(() => vaultProducts.key, { onDelete: 'restrict' }),
    editionNumber: integer('edition_number'),
    priceGems: integer('price_gems').notNull(),
    /** `item` or `bundle:<collection>`. */
    via: text('via').notNull(),
    /** The buyer confirmed the not-yet-usable disclosure (always true for collectibles and future items). */
    acknowledged: boolean('acknowledged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productKey] }), uniqueIndex('vault_owned_edition_idx').on(table.productKey, table.editionNumber)],
);
