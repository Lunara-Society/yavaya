import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { media } from './media';
import { animalsApplicationStatusEnum, animalsListingStatusEnum, animalsRescuerStatusEnum } from './enums';

/**
 * Animales: welfare first, adoption earned.
 *
 * Three gates stand between an animal and a new home, on purpose:
 *  1. the adopter passes the welfare guide's quiz (a certificate);
 *  2. the animal is published by a rescuer a Yavaya reviewer approved —
 *     never by anyone at all, which is how breeders pose as rescuers;
 *  3. the rescuer reads a full application and chooses the home.
 * No animal has a price here.
 */

/** "Certificado de cuidado responsable": passed the guide's quiz. */
export const animalsCertificates = pgTable('animals_certificates', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  score: integer('score').notNull(),
  passedAt: timestamp('passed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animalsRescuers = pgTable(
  'animals_rescuers',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `person` or `organisation`. */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    about: text('about').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    whatsappE164: text('whatsapp_e164').notNull(),
    status: animalsRescuerStatusEnum('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('animals_rescuers_status_idx').on(table.status)],
);

export const animalsListings = pgTable(
  'animals_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rescuerUserId: uuid('rescuer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    species: text('species').notNull(),
    name: text('name').notNull(),
    sex: text('sex').notNull(),
    size: text('size').notNull(),
    /** Approximate age in months, as the rescuer estimates it. */
    ageMonths: integer('age_months'),
    sterilised: boolean('sterilised').notNull(),
    vaccinated: boolean('vaccinated').notNull(),
    dewormed: boolean('dewormed').notNull(),
    healthNotes: text('health_notes'),
    temperament: text('temperament'),
    description: text('description').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    status: animalsListingStatusEnum('status').notNull().default('available'),
    adoptedBy: uuid('adopted_by').references(() => users.id, { onDelete: 'set null' }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('animals_listings_browse_idx').on(table.status, table.species, table.createdAt),
    index('animals_listings_rescuer_idx').on(table.rescuerUserId, table.status),
  ],
);

export const animalsListingPhotos = pgTable(
  'animals_listing_photos',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalsListings.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.mediaId] })],
);

export type ApplicationAnswers = {
  homeType: string;
  tenure: string;
  landlordAllows: string;
  fencedYard: string;
  household: string;
  allAgree: boolean;
  otherAnimals: string;
  otherAnimalsSterilised: string;
  experience: string;
  hoursAlone: number;
  sleepsWhere: string;
  vetPlan: string;
  whyAdopt: string;
};

export const animalsApplications = pgTable(
  'animals_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalsListings.id, { onDelete: 'cascade' }),
    applicantUserId: uuid('applicant_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').$type<ApplicationAnswers>().notNull(),
    /** Every commitment accepted, as keys from config/animals.ts. */
    commitments: text('commitments').array().notNull(),
    status: animalsApplicationStatusEnum('status').notNull().default('submitted'),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    followUpSentAt: timestamp('follow_up_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('animals_applications_one_per_person').on(table.listingId, table.applicantUserId),
    index('animals_applications_applicant_idx').on(table.applicantUserId, table.createdAt),
    index('animals_applications_follow_up_idx').on(table.status, table.completedAt),
  ],
);
