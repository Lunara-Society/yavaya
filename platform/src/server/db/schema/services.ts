import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import {
  servicesLicenceStatusEnum,
  servicesProviderStatusEnum,
  servicesRequestStatusEnum,
  servicesResponseStatusEnum,
} from './enums';

/**
 * Servicios: someone does something for me.
 *
 * A member asks (a request); providers answer (responses); the member says
 * who did it and, once it is done, reviews them. No money moves through
 * Yavaya here: the price is something the two agree on, so a response's
 * price is free text ("Q300, materiales aparte"), never a charge.
 *
 * Seen by signed-in members only, like Community. Requests in a sensitive
 * category (mental health, health care) are seen only by the requester and
 * by providers of that category; see `config/services.ts`.
 */
export const servicesProviderProfiles = pgTable(
  'services_provider_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    headline: text('headline').notNull(),
    bio: text('bio').notNull(),
    /** Category keys from config/services.ts. */
    categories: text('categories').array().notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** E.164; shown to a member whose request this provider answers. */
    whatsappE164: text('whatsapp_e164').notNull(),
    /** "Disponible hoy": until when. Null, or in the past, means not today. */
    availableUntil: timestamp('available_until', { withTimezone: true }),
    /** The licence as the provider states it: profession, number, issuing body. */
    licenceClaim: text('licence_claim'),
    licenceStatus: servicesLicenceStatusEnum('licence_status').notNull().default('none'),
    licenceNote: text('licence_note'),
    licenceReviewedBy: uuid('licence_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    licenceReviewedAt: timestamp('licence_reviewed_at', { withTimezone: true }),
    status: servicesProviderStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('services_providers_available_idx').on(table.status, table.availableUntil),
    index('services_providers_licence_idx').on(table.licenceStatus),
  ],
);

export const servicesRequests = pgTable(
  'services_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** "Lo necesito hoy": shown first to providers available today. */
    urgent: boolean('urgent').notNull().default(false),
    /** Name hidden from providers. Only allowed in sensitive categories; never hidden from moderators. */
    anonymous: boolean('anonymous').notNull().default(false),
    status: servicesRequestStatusEnum('status').notNull().default('open'),
    acceptedResponseId: uuid('accepted_response_id'),
    responseCount: integer('response_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('services_requests_board_idx').on(table.status, table.category, table.createdAt),
    index('services_requests_requester_idx').on(table.requesterUserId, table.createdAt),
  ],
);

export const servicesResponses = pgTable(
  'services_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => servicesRequests.id, { onDelete: 'cascade' }),
    providerUserId: uuid('provider_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    /** What the provider expects to charge, in their words. Not a payment. */
    priceText: text('price_text'),
    status: servicesResponseStatusEnum('status').notNull().default('sent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('services_responses_one_per_provider').on(table.requestId, table.providerUserId),
    index('services_responses_provider_idx').on(table.providerUserId, table.createdAt),
  ],
);

/** One review per completed request, by its requester, of the provider who did it. */
export const servicesReviews = pgTable(
  'services_reviews',
  {
    requestId: uuid('request_id')
      .primaryKey()
      .references(() => servicesRequests.id, { onDelete: 'cascade' }),
    providerUserId: uuid('provider_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('services_reviews_provider_idx').on(table.providerUserId, table.createdAt)],
);
