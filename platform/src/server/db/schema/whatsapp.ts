import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Yavaya's WhatsApp team inbox: what people write to Yavaya's own WhatsApp
 * number, delivered by Meta through the Dualhook connection to
 * /api/whatsapp/webhook, and what the team answers.
 *
 * These are not Yavaya accounts: a WhatsApp contact is a phone number, and
 * nothing here is linked to a member. Names and message texts are sealed at
 * rest with WHATSAPP_KEY; the number stays readable because the team must be
 * able to answer it.
 */

/** One person who wrote to Yavaya, by their WhatsApp id (the number, digits only). */
export const whatsappContacts = pgTable(
  'whatsapp_contacts',
  {
    waId: text('wa_id').primaryKey(),
    /** The profile name WhatsApp sends, sealed. */
    nameSealed: text('name_sealed'),
    /** Their last message to Yavaya: free-form replies are allowed for 24 hours after it. */
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    unread: integer('unread').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('whatsapp_contacts_last_idx').on(table.lastMessageAt)],
);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Meta's message id: a delivery Meta repeats is stored once. */
    waMessageId: text('wa_message_id').notNull().unique(),
    waId: text('wa_id')
      .notNull()
      .references(() => whatsappContacts.waId, { onDelete: 'cascade' }),
    /** 'in' (to Yavaya) | 'out' (from Yavaya: the inbox or the phone app). */
    direction: text('direction').notNull(),
    /** text, image, audio, video, document, sticker, location, contacts, reaction, other. */
    kind: text('kind').notNull(),
    /** The text, or a media caption, sealed. Media files themselves are not downloaded. */
    bodySealed: text('body_sealed'),
    /** For 'out': sent, delivered, read or failed, as Meta reports it. */
    status: text('status'),
    /** For 'out' from the inbox: the team member who sent it. Null for the phone app. */
    sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('whatsapp_messages_contact_idx').on(table.waId, table.sentAt)],
);
