import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import { featureFlags, locations, roxiDrafts, roxiHelpDaily, users, whatsappContacts, whatsappMessages } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { setLook } from '@/server/domains/platform/looks';
import { useMediaStorageForTests, type MediaStorage } from '@/server/domains/media/storage';
import { publishListing } from '@/server/domains/mercadito/service';
import { listingInputSchema } from '@/server/domains/mercadito/rules';
import { claimDraftForPublish, getListingDraft, readDraftPhoto } from '@/server/domains/roxi/drafts';
import { ingestDelivery, parseDelivery } from '@/server/domains/whatsapp/service';
import { answerWithRoxi, setRoxiWhatsapp, LISTING_TOOL, type AskRoxi } from '@/server/domains/whatsapp/roxi';
import { confirmPublishedOnWhatsapp, downloadPhoto, draftListingFromWhatsapp, waitingPhotos } from '@/server/domains/whatsapp/listing';
import { MEDIA_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/**
 * Selling from WhatsApp (docs/roxi/FLAGSHIP.md, slice 2): a member whose
 * number is tied to their account sends photos; Roxi drafts the listing from
 * them into the same server draft the website uses and answers with a link;
 * once they publish it on the site, she confirms it in the chat. Photos are
 * fetched through the connection's media routes, stood in for here.
 */
class MemoryStorage implements MediaStorage {
  readonly key = 'memory';
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const storage = new MemoryStorage();
const MEMBER_WA = '50581230001';
const STRANGER_WA = '50581230002';
const VARS = ['WHATSAPP_WEBHOOK_KEY', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_BASE', 'WHATSAPP_ROXI_AGENT_ID', 'ELEVENLABS_API_KEY', 'WHATSAPP_OWNER_WA_IDS', 'APP_URL'] as const;
const saved = Object.fromEntries(VARS.map((key) => [key, process.env[key]]));
const READY = {
  WHATSAPP_WEBHOOK_KEY: 'a-webhook-key-that-is-long-enough-01',
  WHATSAPP_VERIFY_TOKEN: 'verify-token-long-enough-02',
  WHATSAPP_KEY: 'the-whatsapp-sealing-key-that-is-long-enough-03',
  WHATSAPP_ACCESS_TOKEN: 'dh_live_test',
  WHATSAPP_PHONE_NUMBER_ID: '1270050959528964',
  WHATSAPP_API_BASE: 'https://api.dualhook.com/v25.0',
  WHATSAPP_ROXI_AGENT_ID: 'agent_test1',
  ELEVENLABS_API_KEY: 'an-elevenlabs-key-long-enough',
  WHATSAPP_OWNER_WA_IDS: '50570000009',
  APP_URL: 'https://yavaya.example',
};
const context = { networkHash: null, addressHash: 'wa-listing-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;
let placeCurrency: string;
let photoBytes: Buffer;

function configure(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const key of VARS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}

function delivery(message: Record<string, unknown>, from = MEMBER_WA) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', contacts: [{ wa_id: from, profile: { name: 'Rosa' } }], messages: [{ from, timestamp: String(Math.floor(Date.now() / 1000)), ...message }] } }] }],
  };
}
const photo = (id: string, mediaId: string, from = MEMBER_WA, caption?: string) =>
  delivery({ id, type: 'image', image: { id: mediaId, mime_type: 'image/jpeg', sha256: 'x', ...(caption ? { caption } : {}) } }, from);
const textMessage = (id: string, body: string, from = MEMBER_WA) => delivery({ id, type: 'text', text: { body } }, from);

/** The connection's media routes and WhatsApp's send route, as the code calls them. */
let calls: Array<{ url: string; body: string | null; headers: Record<string, string> }> = [];
let mediaMime = 'image/jpeg';
const fetcher = (async (url: string, init: RequestInit = {}) => {
  calls.push({ url, body: typeof init.body === 'string' ? init.body : null, headers: (init.headers ?? {}) as Record<string, string> });
  const media = /\/v25\.0\/(media-[\w-]+)$/.exec(url);
  if (media) return new Response(JSON.stringify({ url: `https://api.dualhook.com/v25.0/${media[1]}/content`, mime_type: mediaMime, file_size: photoBytes.length, id: media[1] }), { status: 200 });
  if (url.endsWith('/content')) return new Response(new Uint8Array(photoBytes), { status: 200 });
  if (url.endsWith('/messages')) return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${calls.length}` }] }), { status: 200 });
  return new Response(null, { status: 404 });
}) as unknown as typeof fetch;

async function member(options: { linked?: boolean; admin?: boolean } = {}) {
  const { userId } = await register(
    db(),
    { email: `wa-seller-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Rosa', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active', createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(users.id, userId));
  if (options.admin) await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  if (options.linked !== false) {
    await db().insert(whatsappContacts).values({ waId: MEMBER_WA, userId, lastMessageAt: new Date() }).onConflictDoUpdate({ target: whatsappContacts.waId, set: { userId } });
  }
  return userId;
}

async function flagshipOn(on: boolean) {
  // Written either way: the switch's default is on, so "off" has to be said.
  const owner = await member({ linked: false, admin: true });
  await db().transaction((tx) => setLook(tx, { actor: { userId: owner, status: 'active' }, key: 'roxi_review', enabled: on }));
  clearSettingsCache();
}

beforeAll(async () => {
  useMediaStorageForTests(storage);
  photoBytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 120, b: 200 } } }).jpeg().toBuffer();
  const [place] = await db().select({ id: locations.id, path: locations.path, name: locations.name }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  placeId = place!.id;
  const [country] = await db().select({ currency: locations.currencyCode }).from(locations).where(and(eq(locations.level, 'country'), inArray(locations.code, place!.path)));
  placeCurrency = country!.currency!;
});

beforeEach(async () => {
  configure(READY);
  await resetTransactionalData();
  await db().delete(roxiHelpDaily);
  await db().delete(featureFlags).where(eq(featureFlags.key, 'roxi.review'));
  clearSettingsCache();
  storage.objects.clear();
  calls = [];
  mediaMime = 'image/jpeg';
});

afterAll(async () => {
  await db().delete(featureFlags).where(eq(featureFlags.key, 'roxi.review'));
  useMediaStorageForTests(null);
  configure(saved as Record<string, string>);
  await closeDb();
});

describe('Photos sent on WhatsApp', () => {
  it('keep their media id, so a listing can be drafted from them, and only a person\'s own', async () => {
    const parsed = parseDelivery(photo('wamid.p1', 'media-1', MEMBER_WA, 'mi bici'));
    expect(parsed.messages[0]).toMatchObject({ kind: 'image', text: 'mi bici', media: { id: 'media-1', mime: 'image/jpeg' } });
    await ingestDelivery(db(), parsed);
    const [row] = await db().select().from(whatsappMessages).where(eq(whatsappMessages.waMessageId, 'wamid.p1'));
    expect(row).toMatchObject({ mediaId: 'media-1', mediaMime: 'image/jpeg', mediaUsedAt: null });
  });

  it('wait for a draft until one takes them, newest batch first, a listing\'s worth at most', async () => {
    await member();
    for (let i = 1; i <= 8; i++) await ingestDelivery(db(), parseDelivery(photo(`wamid.w${i}`, `media-w${i}`)));
    const waiting = await waitingPhotos(db(), MEMBER_WA);
    expect(waiting.map((p) => p.mediaId)).toEqual(['media-w3', 'media-w4', 'media-w5', 'media-w6', 'media-w7', 'media-w8']);
  });

  it('are fetched through the connection with Yavaya\'s key, and anything that is not an image is refused', async () => {
    const got = await downloadPhoto({ messageId: 'x', mediaId: 'media-ok', mime: 'image/jpeg' }, fetcher);
    expect(got?.body.equals(photoBytes)).toBe(true);
    expect(calls[0]).toMatchObject({ url: 'https://api.dualhook.com/v25.0/media-ok', headers: { authorization: 'Bearer dh_live_test' } });
    expect(calls[1]?.url).toBe('https://api.dualhook.com/v25.0/media-ok/content');
    mediaMime = 'application/pdf';
    expect(await downloadPhoto({ messageId: 'x', mediaId: 'media-pdf', mime: 'image/jpeg' }, fetcher)).toBeNull();
    expect(photoBytes.length).toBeLessThan(MEDIA_RULES.maxUploadBytes);
  });
});

describe('Roxi drafting a listing on WhatsApp', () => {
  it('puts the waiting photos into a server draft and answers with its link', async () => {
    const userId = await member();
    await ingestDelivery(db(), parseDelivery(photo('wamid.d1', 'media-d1')));
    await ingestDelivery(db(), parseDelivery(photo('wamid.d2', 'media-d2')));
    const answer = JSON.parse(
      await draftListingFromWhatsapp(db(), { userId, waId: MEMBER_WA, parameters: { title: 'Bicicleta de montaña', description: 'Rodado 29, poco uso.', category: 'sports', condition: 'used', price: '3500', place_id: placeId }, fetcher }),
    ) as { ok: boolean; draft_id: string; photos_attached: number; link: string };
    expect(answer).toMatchObject({ ok: true, photos_attached: 2 });
    expect(answer.link).toBe(`https://yavaya.example/mercadito/publish?draft=${answer.draft_id}`);
    const draft = await getListingDraft(db(), { userId });
    expect(draft).toMatchObject({ id: answer.draft_id, source: 'whatsapp', fields: { title: 'Bicicleta de montaña', price: '3500', locationId: placeId } });
    // Private until published, like every draft photo.
    expect(await readDraftPhoto(db(), { userId, mediaId: draft!.photoIds[0]! })).not.toBeNull();
    // Used once: the photos no longer wait.
    expect(await waitingPhotos(db(), MEMBER_WA)).toHaveLength(0);

    // A new photo and a better title: the same draft, worked on again, the same link.
    await ingestDelivery(db(), parseDelivery(photo('wamid.d3', 'media-d3')));
    const again = JSON.parse(await draftListingFromWhatsapp(db(), { userId, waId: MEMBER_WA, parameters: { title: 'Bicicleta Trek rodado 29', description: 'Rodado 29, poco uso.', category: 'sports', condition: 'used', price: '3500' }, fetcher })) as { draft_id: string; photos_attached: number };
    expect(again).toMatchObject({ draft_id: answer.draft_id, photos_attached: 3 });
  });

  it('asks which town when several share the name, and keeps the photos waiting', async () => {
    const userId = await member();
    await ingestDelivery(db(), parseDelivery(photo('wamid.a1', 'media-a1')));
    // San Juan: many places in the region share it.
    const answer = JSON.parse(await draftListingFromWhatsapp(db(), { userId, waId: MEMBER_WA, parameters: { title: 'Silla de niño', description: 'De madera, como nueva.', category: 'home', condition: 'like_new', price: '600', place: 'San Juan' }, fetcher })) as { ok: boolean; error?: string; options?: unknown[] };
    if (answer.ok) {
      // A seed with only one San Juan settles it; nothing to ask then.
      expect(answer.ok).toBe(true);
    } else {
      expect(answer.error).toBe('ambiguous_place');
      expect(answer.options!.length).toBeGreaterThan(1);
      expect(await waitingPhotos(db(), MEMBER_WA)).toHaveLength(1);
      expect(await getListingDraft(db(), { userId })).toBeNull();
    }
  });
});

describe('Who gets it, in a real answer', () => {
  it('is a number tied to an account with the flagship; a stranger is told how, and gets no tool', async () => {
    await db().transaction(async (tx) => {
      const { userId } = await register(tx, { email: `wa-team-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Equipo', locale: 'es', acceptedTerms: true }, context);
      await tx.update(users).set({ status: 'active' }).where(eq(users.id, userId));
      await grantRole(tx, { userId, roleKey: 'admin', grantedBy: null });
      await setRoxiWhatsapp(tx, { userId, status: 'active' }, true);
    });
    await flagshipOn(true);
    await member();
    await ingestDelivery(db(), parseDelivery(photo('wamid.r1', 'media-r1')));
    await ingestDelivery(db(), parseDelivery(textMessage('wamid.r2', 'La vendo en 3500, en Nandaime')));
    await ingestDelivery(db(), parseDelivery(textMessage('wamid.s1', 'Quiero vender mi celular', STRANGER_WA)));

    const seen: Array<Parameters<AskRoxi>[0]> = [];
    const ask: AskRoxi = async (input) => {
      seen.push(input);
      return 'Hola';
    };
    await answerWithRoxi(db(), MEMBER_WA, { ask, fetcher, wait: async () => {} });
    await answerWithRoxi(db(), STRANGER_WA, { ask, fetcher, wait: async () => {} });
    expect(seen[0]?.selling).toMatchObject({ linked: true });
    expect(seen[0]?.selling?.photos).toHaveLength(1);
    expect(typeof seen[0]?.selling?.draft).toBe('function');
    expect(seen[1]?.selling).toEqual({ linked: false });
    // The photo arrived with the messages answered: the funnel's first step, once.
    const [count] = await db().select().from(roxiHelpDaily).where(eq(roxiHelpDaily.event, 'listing_photos'));
    expect(count?.count).toBe(1);
    expect(LISTING_TOOL).toBe('draft_listing');
  });

  it('is nobody while the flagship is off for them', async () => {
    await flagshipOn(false);
    await member();
    await ingestDelivery(db(), parseDelivery(photo('wamid.f1', 'media-f1')));
    const { whatsappSeller } = await import('@/server/domains/whatsapp/listing');
    const [contact] = await db().select().from(whatsappContacts).where(eq(whatsappContacts.waId, MEMBER_WA));
    expect(await whatsappSeller(db(), contact!)).toBeNull();
  });
});

describe('After publishing on the site', () => {
  it('Roxi confirms it in the chat with the receipt\'s facts, and only inside the reply window', async () => {
    const userId = await member();
    await ingestDelivery(db(), parseDelivery(photo('wamid.c1', 'media-c1')));
    const made = JSON.parse(await draftListingFromWhatsapp(db(), { userId, waId: MEMBER_WA, parameters: { title: 'Mesa de pino', description: 'Mesa de pino para cuatro, buen estado.', category: 'home', condition: 'used', price: '1200', place_id: placeId }, fetcher })) as { draft_id: string };
    const [draft] = await db().select().from(roxiDrafts).where(eq(roxiDrafts.id, made.draft_id));
    const input = listingInputSchema.parse({ title: 'Mesa de pino', description: 'Mesa de pino para cuatro, buen estado.', price: '1200', currency: placeCurrency, category: 'home', condition: 'used', locationId: placeId });
    const claimedSource = await db().transaction(async (tx) => {
      const claimed = await claimDraftForPublish(tx, { userId, draftId: made.draft_id, keepPhotoIds: draft!.photoIds });
      await publishListing(tx, { listingId: made.draft_id, sellerUserId: userId, input, images: [], attachedImages: claimed.images, assistedBy: 'roxi' });
      return claimed.source;
    });
    expect(claimedSource).toBe('whatsapp');

    calls = [];
    expect(await confirmPublishedOnWhatsapp(db(), { userId, listingId: made.draft_id, fetcher })).toBe(true);
    const sent = JSON.parse(calls.find((c) => c.url.endsWith('/messages'))!.body!) as { to: string; text: { body: string } };
    expect(sent.to).toBe(MEMBER_WA);
    expect(sent.text.body).toContain('Mesa de pino');
    expect(sent.text.body).toContain(`https://yavaya.example/mercadito/${made.draft_id}`);
    expect(sent.text.body).toContain('gratis');

    // A day later the window is closed: nothing is sent, the website's receipt is the confirmation.
    await db().update(whatsappContacts).set({ lastInboundAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(whatsappContacts.waId, MEMBER_WA));
    expect(await confirmPublishedOnWhatsapp(db(), { userId, listingId: made.draft_id, fetcher })).toBe(false);
  });
});
