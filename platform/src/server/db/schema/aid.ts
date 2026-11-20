import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';

/**
 * Organisations that feed or shelter people (docs/mirador/README.md,
 * "Offers"): food banks, soup kitchens and shelters that are not churches.
 * Approved by a Yavaya reviewer (`causes.review`), like Animales' rescuers
 * and Santuario's churches, because "for soup kitchens" food and a call for
 * help must reach someone who will really share it — Yavaya cannot check a
 * stranger who says they will.
 *
 * One per member: the member who runs it applies and answers for it.
 */
export const aidOrganisations = pgTable(
  'aid_organisations',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `food_bank`, `soup_kitchen`, `shelter` or `other`. */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    about: text('about').notNull(),
    /** A registration or legal number, when it has one; shown to the reviewer only. */
    registration: text('registration'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    whatsappE164: text('whatsapp_e164').notNull(),
    /** `pending`, `approved`, `rejected` or `suspended`. */
    status: text('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('aid_organisations_status_idx').on(table.status)],
);
