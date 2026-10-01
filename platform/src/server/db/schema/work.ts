import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, boolean } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { workApplicationStatusEnum, workEmployerStatusEnum, workPostKindEnum, workPostStatusEnum, workProfileStatusEnum } from './enums';

/**
 * Trabajo: jobs and professional projects, without auctions.
 *
 * The employer states the pay in the post; a candidate applies with a
 * profile and a message, never with a lower price. Members only to apply;
 * posts are public, because a job nobody sees fills nobody's table.
 */
export const workProfiles = pgTable(
  'work_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    headline: text('headline').notNull(),
    about: text('about').notNull(),
    fields: text('fields').array().notNull(),
    skills: text('skills'),
    experienceYears: integer('experience_years'),
    /** https links to a portfolio, a CV, published work. */
    portfolioLinks: text('portfolio_links').array().notNull().default([]),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    whatsappE164: text('whatsapp_e164').notNull(),
    openToWork: boolean('open_to_work').notNull().default(true),
    status: workProfileStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const workPosts = pgTable(
  'work_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employerUserId: uuid('employer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: workPostKindEnum('kind').notNull(),
    employment: text('employment').notNull(),
    field: text('field').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    requirements: text('requirements'),
    /** What it pays, in the employer's words. Required: no auctions. */
    payText: text('pay_text').notNull(),
    companyName: text('company_name'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    placeMode: text('place_mode').notNull(),
    whatsappE164: text('whatsapp_e164').notNull(),
    status: workPostStatusEnum('status').notNull().default('open'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('work_posts_board_idx').on(table.status, table.field, table.createdAt),
    index('work_posts_employer_idx').on(table.employerUserId, table.status),
    index('work_posts_expiry_idx').on(table.status, table.expiresAt),
  ],
);

export const workApplications = pgTable(
  'work_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => workPosts.id, { onDelete: 'cascade' }),
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    status: workApplicationStatusEnum('status').notNull().default('submitted'),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('work_applications_one_per_candidate').on(table.postId, table.candidateUserId),
    index('work_applications_candidate_idx').on(table.candidateUserId, table.createdAt),
  ],
);

/**
 * Who may post. Every employer is checked by a person before their first
 * post: the commonest job scams here are fake companies and real companies'
 * names borrowed by someone else. A business posts under the name a reviewer
 * verified, never a name typed into the post.
 */
export const workEmployers = pgTable(
  'work_employers',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `person` (hiring for themselves or their home) or `business`. */
    kind: text('kind').notNull(),
    /** The business name, or the person's name as on their ID. */
    name: text('name').notNull(),
    /** Businesses: the registration or tax number a reviewer can look up. */
    registration: text('registration'),
    about: text('about').notNull(),
    website: text('website'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    whatsappE164: text('whatsapp_e164').notNull(),
    status: workEmployerStatusEnum('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('work_employers_status_idx').on(table.status, table.updatedAt)],
);
