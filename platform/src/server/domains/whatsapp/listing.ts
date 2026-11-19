import 'server-only';
import { and, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiDrafts, users, whatsappContacts, whatsappMessages } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { MEDIA_RULES, MERCADITO_RULES, WHATSAPP_RULES } from '@/config/business-rules';
import { createTranslator } from '@/i18n';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { mediaStorage } from '@/server/domains/media/storage';
import { publishReceipt } from '@/server/domains/mercadito/service';
import { placeById, searchPlaces } from '@/server/domains/geography/places';
import { createListingDraft, LISTING_DRAFT_FORM, ROXI_DRAFT_PURPOSE, roxiReviewOn } from '@/server/domains/roxi/drafts';
import { formatPrice } from '@/ui/mercadito/format';
import { matchPlace, MAX_PLACE_OPTIONS } from '@/ui/roxi/places';
import { apiBase, sendSystemText } from './service';

/**
 * Selling from WhatsApp: the flagship's second slice (docs/roxi/FLAGSHIP.md).
 *
 * A member whose WhatsApp number is tied to their account (they verified
 * their phone by sending their code from it) sends Roxi photos and says what
 * it is, the price and the town. Roxi drafts the listing; the photos are
 * downloaded through Yavaya's own WhatsApp connection (Dualhook's Runtime
 * API, the Cloud API's media routes) into the same server draft the website
 * uses, and she answers with a link to it. The member opens the link, signed
 * in to their account, checks the filled-in form and publishes it there.
 * Once published, Roxi confirms it in the chat with the receipt's facts.
 *
 * Nothing is published from WhatsApp, and nothing is charged there: the
 * member's own tap on the website does both, as with any listing. A number
 * tied to no account gets no draft (Roxi tells them how to link it), and the
 * flagship switch decides who has this at all.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WaitingPhoto = { messageId: string; mediaId: string; mime: string };
export type DownloadedPhoto = { messageId: string; body: Buffer; mime: string };

/**
 * Whether this WhatsApp contact can sell through Roxi: a number tied to an
 * account, the flagship on for that account, and somewhere to keep photos.
 */
export async function whatsappSeller(executor: Executor, contact: { userId: string | null }): Promise<{ userId: string } | null> {
  if (!contact.userId || !mediaStorage()) return null;
  return (await roxiReviewOn(executor, contact.userId)) ? { userId: contact.userId } : null;
}

/**
 * The member's photos not yet in a draft, from the reply window: what Roxi
 * may draft from now. Oldest first, at most a listing's worth.
 */
export async function waitingPhotos(executor: Executor, waId: string, now = new Date()): Promise<WaitingPhoto[]> {
  const rows = await executor
    .select({ id: whatsappMessages.id, mediaId: whatsappMessages.mediaId, mime: whatsappMessages.mediaMime })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.waId, waId),
        eq(whatsappMessages.direction, 'in'),
        isNotNull(whatsappMessages.mediaId),
        isNull(whatsappMessages.mediaUsedAt),
        gte(whatsappMessages.sentAt, new Date(now.getTime() - WHATSAPP_RULES.replyWindowHours * 3_600_000)),
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(MERCADITO_RULES.maxPhotos);
  return rows.reverse().map((row) => ({ messageId: row.id, mediaId: row.mediaId!, mime: row.mime ?? 'image/jpeg' }));
}

/**
 * One photo's bytes, through the connection's media routes: its details
 * (GET /<media id>), then the file from the address they give, both with
 * Yavaya's own key. Anything that is not an image, or larger than a listing
 * photo may be, is refused. Null on any failure: a photo that cannot be
 * fetched is left out, never guessed at.
 */
export async function downloadPhoto(photo: WaitingPhoto, fetcher: typeof fetch = fetch): Promise<DownloadedPhoto | null> {
  const env = serverEnv();
  if (!env.WHATSAPP_ACCESS_TOKEN) return null;
  const auth = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetcher(`${apiBase()}/${encodeURIComponent(photo.mediaId)}`, { headers: auth, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!meta?.ok) return null;
  const details = (await meta.json().catch(() => null)) as { url?: unknown; mime_type?: unknown; file_size?: unknown } | null;
  const url = typeof details?.url === 'string' ? details.url : null;
  const mime = typeof details?.mime_type === 'string' ? details.mime_type : photo.mime;
  const size = typeof details?.file_size === 'number' ? details.file_size : 0;
  if (!url || !/^https:\/\//.test(url) || !mime.startsWith('image/') || size > MEDIA_RULES.maxUploadBytes) return null;
  const file = await fetcher(url, { headers: auth, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!file?.ok) return null;
  const body = Buffer.from(await file.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (body.length === 0 || body.length > MEDIA_RULES.maxUploadBytes) return null;
  return { messageId: photo.messageId, body, mime };
}

export async function downloadPhotos(photos: WaitingPhoto[], fetcher: typeof fetch = fetch): Promise<DownloadedPhoto[]> {
  const downloaded: DownloadedPhoto[] = [];
  for (const photo of photos) {
    const file = await downloadPhoto(photo, fetcher);
    if (file) downloaded.push(file);
  }
  return downloaded;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

type PlaceOutcome =
  | { kind: 'one'; id: string; label: string }
  | { kind: 'several'; options: Array<{ place_id: string; name: string; where: string }> }
  | { kind: 'unknown'; asked: string }
  | { kind: 'none' };

/** The town the member named, as the website's Roxi finds it: only an exact name, and she asks when several share it. */
async function findPlace(executor: Executor, asked: string, placeId: string): Promise<PlaceOutcome> {
  if (UUID.test(placeId)) {
    const place = await placeById(executor, placeId);
    if (place) return { kind: 'one', id: place.id, label: `${place.name}, ${place.context}` };
  }
  if (!asked) return { kind: 'none' };
  const name = asked.split(',')[0]!.trim();
  const candidates = (await searchPlaces(executor, name, { exact: true, settlementsOnly: true })).map((place) => ({ id: place.id, name: place.name, context: place.context, level: place.level }));
  const match = matchPlace(asked, candidates);
  if (match.kind === 'one') return { kind: 'one', id: match.place.id, label: `${match.place.name}, ${match.place.context}` };
  if (match.kind === 'several') return { kind: 'several', options: match.options.slice(0, MAX_PLACE_OPTIONS).map((option) => ({ place_id: option.id, name: option.name, where: option.context })) };
  return { kind: 'unknown', asked };
}

/**
 * Roxi's `draft_listing` tool on WhatsApp. Answers her in JSON, as every
 * WhatsApp tool does. `photos` are the ones already downloaded for this
 * answer (so she could see them); without them, the waiting photos are
 * downloaded here.
 */
export async function draftListingFromWhatsapp(
  executor: Executor,
  params: { userId: string; waId: string; parameters: Record<string, unknown>; photos?: DownloadedPhoto[]; fetcher?: typeof fetch; now?: Date },
): Promise<string> {
  const now = params.now ?? new Date();
  const p = params.parameters;
  const fields: Record<string, string> = {
    title: text(p.title, MERCADITO_RULES.titleMaxLength),
    description: text(p.description, MERCADITO_RULES.descriptionMaxLength),
    category: text(p.category, 30),
    condition: text(p.condition, 30),
    price: text(p.price, 20),
  };

  const place = await findPlace(executor, text(p.place, 80), text(p.place_id, 40));
  if (place.kind === 'several') {
    // Nothing is drafted yet and the photos keep waiting: she asks, then calls again with the chosen place_id.
    return JSON.stringify({ ok: false, error: 'ambiguous_place', options: place.options, ask_member: 'which of these places they mean' });
  }
  if (place.kind === 'one') fields.locationId = place.id;

  const photos = params.photos ?? (await downloadPhotos(await waitingPhotos(executor, params.waId, now), params.fetcher));

  // The member's draft from this chat, if one is still waiting: the same listing, worked on again.
  const [waiting] = await executor
    .select({ id: roxiDrafts.id })
    .from(roxiDrafts)
    .where(
      and(
        eq(roxiDrafts.userId, params.userId),
        eq(roxiDrafts.form, LISTING_DRAFT_FORM),
        eq(roxiDrafts.source, 'whatsapp'),
        gte(roxiDrafts.updatedAt, new Date(now.getTime() - WHATSAPP_RULES.replyWindowHours * 3_600_000)),
      ),
    )
    .limit(1);

  let stored: StoredImage[] = [];
  try {
    stored = photos.length ? await storeImages({ ownerUserId: params.userId, purpose: ROXI_DRAFT_PURPOSE, files: photos.map((photo) => photo.body) }) : [];
    const { draft, dropped } = await executor.transaction(async (tx) => {
      const made = await createListingDraft(tx, { userId: params.userId, fields, images: stored, source: 'whatsapp', continueId: waiting?.id, now });
      if (photos.length) {
        await tx
          .update(whatsappMessages)
          .set({ mediaUsedAt: now })
          .where(inArray(whatsappMessages.id, photos.map((photo) => photo.messageId)));
      }
      return made;
    });
    await discardStored(dropped.map((storageKey) => ({ storageKey })));
    const link = `${serverEnv().APP_URL.replace(/\/$/, '')}/mercadito/publish?draft=${draft.id}`;
    return JSON.stringify({
      ok: true,
      draft_id: draft.id,
      photos_attached: draft.photoIds.length,
      ...(place.kind === 'one' ? { place: place.label } : {}),
      ...(place.kind === 'unknown' ? { place_not_found: place.asked, member_must_choose_place: true } : {}),
      link,
      member_must:
        'open the link on their phone, signed in to their Yavaya account, check the filled-in form (price, place, photos), and tap Publicar there themselves. Nothing is published yet. Give them the link exactly as it is. Tell them you will confirm here once it is published.',
    });
  } catch (error) {
    await discardStored(stored);
    const code = (error as { code?: unknown })?.code;
    return JSON.stringify({ ok: false, error: code === 'validation_failed' ? 'too_many_photos' : 'failed' });
  }
}

/**
 * After a listing drafted on WhatsApp is published: the receipt's facts, in
 * the member's chat, from the record of the publish. Only inside WhatsApp's
 * reply window (they wrote to Roxi a moment ago); otherwise nothing is sent,
 * and the receipt on the website is the confirmation.
 */
export async function confirmPublishedOnWhatsapp(
  executor: Executor,
  params: { userId: string; listingId: string; fetcher?: typeof fetch; now?: Date },
): Promise<boolean> {
  const now = params.now ?? new Date();
  const [contact] = await executor
    .select({ waId: whatsappContacts.waId })
    .from(whatsappContacts)
    .where(and(eq(whatsappContacts.userId, params.userId), gte(whatsappContacts.lastInboundAt, new Date(now.getTime() - WHATSAPP_RULES.replyWindowHours * 3_600_000))))
    .orderBy(desc(whatsappContacts.lastInboundAt))
    .limit(1);
  if (!contact) return false;
  const receipt = await publishReceipt(executor, { sellerUserId: params.userId, listingId: params.listingId });
  if (!receipt) return false;
  const [member] = await executor.select({ locale: users.locale }).from(users).where(eq(users.id, params.userId)).limit(1);
  const locale = member?.locale === 'en' ? 'en' : 'es';
  const t = createTranslator(locale);
  const cost =
    receipt.cost === 0
      ? t('roxi.whatsapp.published_free', { left: Math.max(0, receipt.freeOpenListings - receipt.openNow) })
      : t('roxi.whatsapp.published_cost', { cost: receipt.cost });
  const message = t('roxi.whatsapp.published', {
    title: receipt.title,
    price: formatPrice(receipt.priceMinor, receipt.currencyCode, locale),
    cost,
    url: `${serverEnv().APP_URL.replace(/\/$/, '')}/mercadito/${receipt.id}`,
  });
  return sendSystemText(executor, contact.waId, message, params.fetcher);
}
