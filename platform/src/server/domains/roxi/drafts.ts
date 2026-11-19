import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { media, mercaditoListings, roxiDrafts } from '@/server/db/schema';
import { MERCADITO_RULES, ROXI_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { getSetting } from '@/server/domains/platform/settings';
import { insertMediaRows, readActiveImage, type StoredImage } from '@/server/domains/media/service';
import { LISTING_CATEGORIES, LISTING_CONDITIONS } from '@/server/domains/mercadito/rules';
import { PHOTO_PURPOSE } from '@/server/domains/mercadito/service';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookEnabled } from '@/server/domains/platform/looks';
import { countRoxiHelp } from './help-stats';

/**
 * Listings Roxi drafts with a member, kept on the server until they publish
 * one (docs/roxi/FLAGSHIP.md, the flagship's first slice).
 *
 * Roxi writes; the member decides. Nothing here publishes, charges or makes
 * anything public: a draft is shown back to its owner (the review card in
 * Roxi's panel, then the real form), and only the form's own publish button,
 * through the listing route and `publishListing`, turns it into a listing.
 *
 * Photos are stored as private media the moment the member sends them, so a
 * draft carries to another device and the form does not upload them again.
 * Publishing moves them to the listing (`claimDraftForPublish`); discarding
 * or expiring a draft deletes them.
 *
 * Every function that drops photos returns their storage keys rather than
 * deleting the objects: rows go inside the caller's transaction, objects
 * after it commits (`discardStored`), the media service's order.
 */

/** Never served by the public media route (PRIVATE_MEDIA_PURPOSES): a draft photo is its owner's alone until published. */
export const ROXI_DRAFT_PURPOSE = 'roxi_draft';

export const LISTING_DRAFT_FORM = 'mercadito_listing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DraftSource = 'web' | 'whatsapp';

/**
 * Whether this member has the flagship (the `roxi_review` switch): everyone
 * when it is on; while it is off, only someone who may change it, so the
 * owner tries it before anyone else. Checked by every route here, not only
 * by the panel that shows it.
 */
export async function roxiReviewOn(executor: Executor, userId: string): Promise<boolean> {
  return (await lookEnabled(executor, 'roxi_review')) || (await hasPermission(executor, userId, 'flags.manage'));
}

export type ListingDraft = {
  id: string;
  fields: Record<string, string>;
  photoIds: string[];
  source: DraftSource;
  openedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max * 2) : '';
}

/**
 * The fields a listing draft may hold, cut to what the form accepts. Loose on
 * purpose: a draft may be unfinished (no price yet, no place found), and the
 * listing route checks everything again, strictly, when the member publishes.
 * An empty value is no value, so an edit can clear a field.
 */
export function cleanListingFields(input: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  const title = str(input.title, MERCADITO_RULES.titleMaxLength).replace(/\s+/g, ' ').trim().slice(0, MERCADITO_RULES.titleMaxLength);
  const description = str(input.description, MERCADITO_RULES.descriptionMaxLength)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MERCADITO_RULES.descriptionMaxLength);
  const price = str(input.price, 20).replace(/[^\d.,]/g, '').slice(0, 20);
  const category = str(input.category, 30);
  const condition = str(input.condition, 30);
  const locationId = str(input.locationId, 40);
  if (title) fields.title = title;
  if (description) fields.description = description;
  if (price) fields.price = price;
  if ((LISTING_CATEGORIES as readonly string[]).includes(category)) fields.category = category;
  if ((LISTING_CONDITIONS as readonly string[]).includes(condition)) fields.condition = condition;
  if (UUID.test(locationId)) fields.locationId = locationId;
  return fields;
}

async function keepDays(executor: Executor): Promise<number> {
  return getSetting(executor, 'roxi.draft_keep_days', ROXI_RULES.draftKeepDays);
}

function toDraft(row: typeof roxiDrafts.$inferSelect): ListingDraft {
  return {
    id: row.id,
    fields: row.fields,
    photoIds: row.photoIds,
    source: row.source === 'whatsapp' ? 'whatsapp' : 'web',
    openedAt: row.openedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** Deletes draft photo rows of this member; returns their storage keys for deletion after commit. */
async function dropPhotos(tx: Executor, userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .delete(media)
    .where(and(inArray(media.id, ids), eq(media.ownerUserId, userId), eq(media.purpose, ROXI_DRAFT_PURPOSE)))
    .returning({ storageKey: media.storageKey });
  return rows.map((row) => row.storageKey);
}

/**
 * A new draft, replacing the member's previous one for the same form (its
 * photos go with it). `images` are already in storage (`storeImages` with
 * ROXI_DRAFT_PURPOSE); their rows are written here.
 *
 * With `continueId` naming the draft still waiting, it is the same listing
 * worked on again in the conversation (a new photo, a better title): Roxi's
 * new words replace the old, the new photos join the ones already there, and
 * the draft keeps its id.
 */
export async function createListingDraft(
  tx: Executor,
  params: { userId: string; fields: Record<string, unknown>; images: StoredImage[]; continueId?: string; source?: DraftSource; now?: Date },
): Promise<{ draft: ListingDraft; dropped: string[] }> {
  const now = params.now ?? new Date();
  const [previous] = await tx
    .select({ id: roxiDrafts.id, photoIds: roxiDrafts.photoIds })
    .from(roxiDrafts)
    .where(and(eq(roxiDrafts.userId, params.userId), eq(roxiDrafts.form, LISTING_DRAFT_FORM)))
    .for('update');
  const continuing = previous && params.continueId === previous.id ? previous : null;
  const photoIds = [...(continuing?.photoIds ?? []), ...params.images.map((image) => image.id)];
  if (photoIds.length > MERCADITO_RULES.maxPhotos) {
    throw errors.validation('mercadito.error.photo_count', { min: MERCADITO_RULES.minPhotos, max: MERCADITO_RULES.maxPhotos });
  }
  let dropped: string[] = [];
  if (previous && !continuing) dropped = await dropPhotos(tx, params.userId, previous.photoIds);
  if (previous) await tx.delete(roxiDrafts).where(eq(roxiDrafts.id, previous.id));

  await insertMediaRows(tx, { ownerUserId: params.userId, purpose: ROXI_DRAFT_PURPOSE, images: params.images });
  const days = await keepDays(tx);
  const [row] = await tx
    .insert(roxiDrafts)
    .values({
      id: continuing?.id ?? randomUUID(),
      userId: params.userId,
      form: LISTING_DRAFT_FORM,
      fields: cleanListingFields(params.fields),
      photoIds,
      source: params.source ?? 'web',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + days * 86_400_000),
    })
    .returning();
  // A draft worked on again is still one draft.
  if (!continuing) await countRoxiHelp(tx, 'listing_drafted', now);
  return { draft: toDraft(row!), dropped };
}

/** The member's draft, if it is still waiting. With `id`, only that one. */
export async function getListingDraft(executor: Executor, params: { userId: string; id?: string; now?: Date }): Promise<ListingDraft | null> {
  if (params.id !== undefined && !UUID.test(params.id)) return null;
  const [row] = await executor
    .select()
    .from(roxiDrafts)
    .where(
      and(
        eq(roxiDrafts.userId, params.userId),
        eq(roxiDrafts.form, LISTING_DRAFT_FORM),
        ...(params.id !== undefined ? [eq(roxiDrafts.id, params.id)] : []),
      ),
    )
    .limit(1);
  if (!row || row.expiresAt <= (params.now ?? new Date())) return null;
  return toDraft(row);
}

async function lockOwnDraft(tx: Executor, userId: string, id: string) {
  if (!UUID.test(id)) throw errors.notFound('roxi_draft');
  const [row] = await tx
    .select()
    .from(roxiDrafts)
    .where(and(eq(roxiDrafts.id, id), eq(roxiDrafts.userId, userId)))
    .for('update');
  if (!row) throw errors.notFound('roxi_draft');
  return row;
}

/**
 * The member's own edits on the review card: fields merged over the draft's
 * (an empty value clears one), photos taken out. Editing gives the draft its
 * full time again.
 */
export async function updateListingDraft(
  tx: Executor,
  params: { userId: string; id: string; fields?: Record<string, unknown>; removePhotoIds?: string[]; now?: Date },
): Promise<{ draft: ListingDraft; dropped: string[] }> {
  const row = await lockOwnDraft(tx, params.userId, params.id);
  const now = params.now ?? new Date();
  const removing = row.photoIds.filter((id) => params.removePhotoIds?.includes(id));
  const dropped = await dropPhotos(tx, params.userId, removing);
  const days = await keepDays(tx);
  const [updated] = await tx
    .update(roxiDrafts)
    .set({
      fields: params.fields ? cleanListingFields({ ...row.fields, ...params.fields }) : row.fields,
      photoIds: row.photoIds.filter((id) => !removing.includes(id)),
      updatedAt: now,
      expiresAt: new Date(now.getTime() + days * 86_400_000),
    })
    .where(eq(roxiDrafts.id, row.id))
    .returning();
  return { draft: toDraft(updated!), dropped };
}

/** The member threw the draft away. */
export async function discardListingDraft(tx: Executor, params: { userId: string; id: string }): Promise<string[]> {
  const row = await lockOwnDraft(tx, params.userId, params.id);
  const dropped = await dropPhotos(tx, params.userId, row.photoIds);
  await tx.delete(roxiDrafts).where(eq(roxiDrafts.id, row.id));
  return dropped;
}

/**
 * The member opened the filled-in form from this draft. Counted once per
 * draft, however often the page is reloaded: the funnel's third step.
 */
export async function markListingDraftOpened(tx: Executor, params: { userId: string; id: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const opened = await tx
    .update(roxiDrafts)
    .set({ openedAt: now })
    .where(and(eq(roxiDrafts.id, params.id), eq(roxiDrafts.userId, params.userId), isNull(roxiDrafts.openedAt)))
    .returning({ id: roxiDrafts.id });
  if (opened.length > 0) await countRoxiHelp(tx, 'listing_opened', now);
}

/**
 * Inside the publish transaction: hands the draft's photos the member kept
 * to the listing, drops the rest, and ends the draft. If the publish fails,
 * the transaction rolls all of it back and the draft is waiting as before.
 *
 * The draft's id is the listing's id. Gone, but published under that id by
 * this member: a second tap, another tab, another device — the publish
 * route reports the first success (`publishListing` deduplicates). Gone and
 * never published (discarded, expired): refused, with a message that says so.
 */
export async function claimDraftForPublish(
  tx: Executor,
  params: { userId: string; draftId: string; keepPhotoIds: string[]; now?: Date },
): Promise<{ images: StoredImage[]; dropped: string[] }> {
  const [row] = UUID.test(params.draftId)
    ? await tx
        .select()
        .from(roxiDrafts)
        .where(and(eq(roxiDrafts.id, params.draftId), eq(roxiDrafts.userId, params.userId)))
        .for('update')
    : [];
  if (!row) {
    const [listing] = await tx
      .select({ id: mercaditoListings.id })
      .from(mercaditoListings)
      .where(and(eq(mercaditoListings.id, params.draftId), eq(mercaditoListings.sellerUserId, params.userId)))
      .limit(1);
    if (listing) return { images: [], dropped: [] };
    throw errors.conflict('roxi.draft.error.gone');
  }

  const keep = row.photoIds.filter((id) => params.keepPhotoIds.includes(id));
  const rows = keep.length
    ? await tx
        .update(media)
        .set({ purpose: PHOTO_PURPOSE })
        .where(and(inArray(media.id, keep), eq(media.ownerUserId, params.userId), eq(media.purpose, ROXI_DRAFT_PURPOSE), eq(media.status, 'active')))
        .returning()
    : [];
  const byId = new Map(rows.map((image) => [image.id, image]));
  const images: StoredImage[] = keep.flatMap((id) => {
    const image = byId.get(id);
    return image
      ? [{ id: image.id, storageKey: image.storageKey, contentType: image.contentType, width: image.width, height: image.height, bytes: image.bytes, sourceSha256: image.sourceSha256 }]
      : [];
  });
  const dropped = await dropPhotos(tx, params.userId, row.photoIds.filter((id) => !keep.includes(id)));
  await tx.delete(roxiDrafts).where(eq(roxiDrafts.id, row.id));
  await countRoxiHelp(tx, 'listing_published', params.now ?? new Date());
  return { images, dropped };
}

/** A draft photo, for its owner only. */
export async function readDraftPhoto(executor: Executor, params: { userId: string; mediaId: string }): Promise<{ body: Buffer; contentType: string } | null> {
  if (!UUID.test(params.mediaId)) return null;
  const [row] = await executor
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, params.mediaId), eq(media.ownerUserId, params.userId), eq(media.purpose, ROXI_DRAFT_PURPOSE)))
    .limit(1);
  if (!row) return null;
  return readActiveImage(executor, row.id, { allowPrivate: true });
}

/**
 * Drafts whose time has passed, with their photos: at most `limit` a run,
 * the rest on the next. Returns the storage keys to delete once committed.
 */
export async function expireListingDrafts(tx: Executor, params: { now?: Date; limit?: number } = {}): Promise<{ expired: number; dropped: string[] }> {
  const rows = await tx
    .select({ id: roxiDrafts.id, userId: roxiDrafts.userId, photoIds: roxiDrafts.photoIds })
    .from(roxiDrafts)
    .where(lt(roxiDrafts.expiresAt, params.now ?? new Date()))
    .limit(params.limit ?? 200)
    .for('update', { skipLocked: true });
  const dropped: string[] = [];
  for (const row of rows) dropped.push(...(await dropPhotos(tx, row.userId, row.photoIds)));
  if (rows.length) await tx.delete(roxiDrafts).where(inArray(roxiDrafts.id, rows.map((row) => row.id)));
  return { expired: rows.length, dropped };
}
