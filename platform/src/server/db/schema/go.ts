import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { media } from './media';
import { goDriverStatusEnum, goOrderStatusEnum, goStoreStatusEnum } from './enums';

/**
 * YavayaGo: delivery from local stores, by drivers Yavaya has checked.
 *
 * Money does not pass through Yavaya at launch. The customer pays the driver
 * on delivery, in cash, the price the store set; the store and the driver
 * settle between them as they agree. Yavaya takes no commission (the
 * specification: restaurant plans come later, "build trust first"). What
 * Yavaya does provide is the part strangers cannot give each other: a store
 * someone reviewed, a driver whose face, phone and vehicle someone checked,
 * and a map that shows where the order is.
 */

export const goStores = pgTable(
  'go_stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** One store per member for now; a chain is several members. */
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Category key from config/go.ts. */
    category: text('category').notNull(),
    about: text('about').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** As people give directions here: landmarks, not only a street number. */
    address: text('address').notNull(),
    /** Where drivers pick up. Public: a store is a public place. */
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    whatsappE164: text('whatsapp_e164').notNull(),
    photoMediaId: uuid('photo_media_id').references(() => media.id, { onDelete: 'set null' }),
    /** Opening hours as the store writes them; `isOpen` is what decides. */
    hours: text('hours').notNull(),
    /** In the country's currency, minor units. Set by the store. */
    currency: text('currency').notNull(),
    deliveryFeeMinor: integer('delivery_fee_minor').notNull(),
    minimumOrderMinor: integer('minimum_order_minor').notNull().default(0),
    prepMinutes: integer('prep_minutes').notNull().default(20),
    /** Taking orders right now. Only an approved store can be open. */
    isOpen: boolean('is_open').notNull().default(false),
    /** Paid placement: listed first, labelled "Destacado", until this moment. */
    featuredUntil: timestamp('featured_until', { withTimezone: true }),
    status: goStoreStatusEnum('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('go_stores_owner_key').on(table.ownerUserId),
    index('go_stores_browse_idx').on(table.status, table.locationId, table.isOpen),
  ],
);

export const goMenuItems = pgTable(
  'go_menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => goStores.id, { onDelete: 'cascade' }),
    /** "Desayunos", "Bebidas": the store's own sections. */
    section: text('section').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceMinor: integer('price_minor').notNull(),
    photoMediaId: uuid('photo_media_id').references(() => media.id, { onDelete: 'set null' }),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('go_menu_items_store_idx').on(table.storeId, table.section, table.position)],
);

export const goDrivers = pgTable(
  'go_drivers',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Vehicle key from config/go.ts. */
    vehicleType: text('vehicle_type').notNull(),
    vehicleDescription: text('vehicle_description').notNull(),
    /** Null for a bicycle or on foot. */
    plate: text('plate'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    whatsappE164: text('whatsapp_e164').notNull(),
    /** A clear photo of the face. Shown to every customer the driver serves. */
    photoMediaId: uuid('photo_media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    /** The identity document. Private: only a reviewer can see it. */
    documentMediaId: uuid('document_media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    status: goDriverStatusEnum('status').notNull().default('pending'),
    /** What the reviewer checked, in their words — the phone call, the document, any record check. */
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Available for deliveries now. */
    online: boolean('online').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('go_drivers_status_idx').on(table.status, table.locationId, table.online)],
);

export type GoOrderLine = { itemId: string; name: string; priceMinor: number; quantity: number };

export const goOrders = pgTable(
  'go_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short, speakable: what the driver says at the door. */
    code: text('code').notNull(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => goStores.id, { onDelete: 'restrict' }),
    driverUserId: uuid('driver_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: goOrderStatusEnum('status').notNull().default('placed'),
    /** A copy of what was ordered at the price it had then. */
    lines: jsonb('lines').$type<GoOrderLine[]>().notNull(),
    currency: text('currency').notNull(),
    subtotalMinor: integer('subtotal_minor').notNull(),
    deliveryFeeMinor: integer('delivery_fee_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    /** Only `cash` for now: paid to the driver at the door. */
    paymentMethod: text('payment_method').notNull().default('cash'),
    /** For the cash: what the customer will pay with, so the driver brings change. */
    payingWithMinor: integer('paying_with_minor'),
    /**
     * Where to deliver. Exact, because a driver needs it — so it is shown to
     * the driver who took the order and to nobody else, and erased once the
     * order is over (see `purgeGoTracking`).
     */
    dropoffLatitude: doublePrecision('dropoff_latitude'),
    dropoffLongitude: doublePrecision('dropoff_longitude'),
    dropoffDirections: text('dropoff_directions'),
    customerWhatsappE164: text('customer_whatsapp_e164'),
    note: text('note'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedReason: text('closed_reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('go_orders_code_key').on(table.code),
    index('go_orders_customer_idx').on(table.customerUserId, table.placedAt),
    index('go_orders_store_idx').on(table.storeId, table.status, table.placedAt),
    index('go_orders_driver_idx').on(table.driverUserId, table.status),
    index('go_orders_open_idx').on(table.status, table.placedAt),
  ],
);

/**
 * Where the driver is, for an order on its way. One row per order, replaced
 * on every update — there is no trail of where a driver has been, only
 * where they are now — and deleted when the order ends.
 */
export const goTracking = pgTable('go_tracking', {
  orderId: uuid('order_id')
    .primaryKey()
    .references(() => goOrders.id, { onDelete: 'cascade' }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  /** Metres, as the phone reports it. */
  accuracy: integer('accuracy'),
  heading: integer('heading'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});
