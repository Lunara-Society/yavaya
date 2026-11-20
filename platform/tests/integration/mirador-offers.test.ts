import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import { locations, miradorOffers, miradorVideos, miradorVoiceJobs, notifications, sanctuaryChurches, userProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { useMediaStorageForTests } from '@/server/domains/media/storage';
import { MIRADOR_RULES } from '@/config/business-rules';
import { resetServerEnvCache } from '@/config/env';
import { startPhotoVideo } from '@/server/domains/mirador/upload';
import { processVideo, probe } from '@/server/domains/mirador/process';
import { saveDetails } from '@/server/domains/mirador/videos';
import { cancelRequest, decideRequest, expireOffers, incomingRequests, outgoingRequests, parsePrice, requestOffer, saveOffer } from '@/server/domains/mirador/offers';
import { feedPage, videosByIds } from '@/server/domains/mirador/feed';
import { captionsFrom, maxCharsFor, runVoiceover, startVoiceover } from '@/server/domains/mirador/voice';
import { getBalance, grantReward } from '@/server/domains/tokens/service';
import { resetTransactionalData } from '../helpers/database';
import { MemoryStorage } from '../helpers/memory-storage';

/**
 * Mirador's offers and voiceover (docs/mirador/README.md): photos turned into
 * a video with the end card, "Lo quiero" from request to pickup details, the
 * four kinds of offer, and a voiceover charged once and refunded once —
 * against real files, real ffmpeg and a stand-in for ElevenLabs.
 */

const context = { networkHash: null, addressHash: 'mirador-offers', deviceFingerprint: null, userAgent: 'vitest' };
let storage: MemoryStorage;
let dir = '';
let place = { id: '', code: '' };
let photos: Buffer[] = [];
let voiceMp3: Buffer;

async function person(name: string) {
  const { userId } = await register(db(), { email: `offers-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true }, context);
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

/** A dish photographed and published, ready for an offer. */
async function dish(creator: string) {
  const { videoId } = await db().transaction((tx) => startPhotoVideo(tx, { userId: creator, photos, language: 'es' }));
  await db().transaction((tx) => saveDetails(tx, { userId: creator, videoId, details: { caption: 'Nacatamales del día #comida', locationId: place.id, publish: true } }));
  const outcome = await processVideo(db(), videoId);
  return { videoId, outcome };
}

const food = { kind: 'sale', category: 'food', title: 'Nacatamales', price: '80', unit: 'unidad', quantity: 6, ingredients: 'Masa de maíz, cerdo, arroz, papa, chiltoma', foodRules: true, pickupDetails: 'Casa verde frente al parque, de 4 a 6 pm', hours: 6 };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mirador-offers-'));
  // Two phone photos, one carrying where it was taken (sharp keeps no metadata unless asked; this one asks).
  photos = [
    await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#c4762b' } }).jpeg().withMetadata({ exif: { IFD0: { Make: 'TestPhone' } } }).toBuffer(),
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3b6e3a' } }).jpeg().toBuffer(),
  ];
  const mp3 = join(dir, 'voice.mp3');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
  voiceMp3 = readFileSync(mp3);
  const [city] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  place = city!;
  process.env.ELEVENLABS_API_KEY = 'an-elevenlabs-key-long-enough-for-tests';
  resetServerEnvCache();
});

beforeEach(async () => {
  await resetTransactionalData();
  storage = new MemoryStorage();
  useMediaStorageForTests(storage);
});

afterAll(async () => {
  delete process.env.ELEVENLABS_API_KEY;
  resetServerEnvCache();
  useMediaStorageForTests(null);
  rmSync(dir, { recursive: true, force: true });
  await closeDb();
});

describe('Photos become a video, free', () => {
  it('stores the photos without their metadata, then makes a portrait video with the end card and a silent track', async () => {
    const creator = await person('Doña Tere');
    const { videoId } = await db().transaction((tx) => startPhotoVideo(tx, { userId: creator, photos, language: 'es' }));
    const stored = [...storage.objects.entries()].filter(([key]) => key.startsWith(`mirador/photos/${videoId}/`));
    expect(stored).toHaveLength(2);
    expect((await sharp(stored[0]![1].body).metadata()).exif).toBeUndefined();

    expect((await processVideo(db(), videoId)).status).toBe('ready');
    const [row] = await db().select().from(miradorVideos).where(eq(miradorVideos.id, videoId));
    expect(row).toMatchObject({ status: 'ready', inputKind: 'photos', width: 720, height: 1280, hasAudio: true, photoKeys: [] });
    // Two photos of 3 s crossfading (0.5 s) and the 2.6 s end card, crossfaded in.
    const expected = (2 * MIRADOR_RULES.photoSeconds - MIRADOR_RULES.photoFadeSeconds - MIRADOR_RULES.photoFadeSeconds + 2.6) * 1000;
    expect(Math.abs(row!.durationMs! - expected)).toBeLessThan(400);
    expect([...storage.objects.keys()].some((key) => key.startsWith(`mirador/photos/${videoId}/`))).toBe(false);
    await expect(db().transaction((tx) => startPhotoVideo(tx, { userId: creator, photos: [Buffer.from('not a photo')], language: 'es' }))).rejects.toMatchObject({ messageKey: 'mirador.error.not_photo' });
  });
});

describe('Offers: "Lo quiero"', () => {
  it('reads prices the way people type them', () => {
    expect([parsePrice('80'), parsePrice('C$ 1,250.50'), parsePrice('1.250,50'), parsePrice('0'), parsePrice('abc')]).toEqual([8000, 125050, 125050, null, null]);
  });

  it('needs the food rules, the ingredients, a place and a time within a day for food', async () => {
    const cook = await person('Cocinera');
    const { videoId } = await dish(cook);
    const save = (input: Record<string, unknown>) => db().transaction((tx) => saveOffer(tx, { userId: cook, videoId, input }));
    await expect(save({ ...food, ingredients: '' })).rejects.toMatchObject({ messageKey: 'mirador.offer.error.ingredients' });
    await expect(save({ ...food, foodRules: false })).rejects.toMatchObject({ messageKey: 'mirador.offer.error.food_rules' });
    await expect(save({ ...food, hours: 72 })).rejects.toMatchObject({ messageKey: 'mirador.offer.error.hours' });
    await expect(save({ ...food, price: '' })).rejects.toMatchObject({ messageKey: 'mirador.offer.error.price' });
    await save(food);
    const [offer] = await db().select().from(miradorOffers).where(eq(miradorOffers.videoId, videoId));
    expect(offer).toMatchObject({ kind: 'sale', priceMinor: 8000, quantity: 6, remaining: 6, status: 'open', pickupLocationId: place.id });
    expect(offer!.currency).toHaveLength(3);
    expect(offer!.foodRulesAt).not.toBeNull();
  });

  it('asks, tells the cook, takes the quantity only when accepted, and shows where only then', async () => {
    const cook = await person('Cocinera');
    const buyer = await person('Comprador');
    const other = await person('Otra');
    const { videoId } = await dish(cook);
    await db().transaction((tx) => saveOffer(tx, { userId: cook, videoId, input: food }));
    await db().insert(userProfiles).values({ userId: cook, whatsappE164: '+50588887777' }).onConflictDoUpdate({ target: userProfiles.userId, set: { whatsappE164: '+50588887777' } });

    await expect(db().transaction((tx) => requestOffer(tx, { userId: cook, videoId, quantity: 1 }))).rejects.toMatchObject({ messageKey: 'mirador.offer.error.own' });
    await expect(db().transaction((tx) => requestOffer(tx, { userId: buyer, videoId, quantity: 7 }))).rejects.toMatchObject({ messageKey: 'mirador.offer.error.not_enough' });
    const asked = await db().transaction((tx) => requestOffer(tx, { userId: buyer, videoId, quantity: 4, note: 'Paso a las 5' }));
    expect((await db().select({ type: notifications.type, userId: notifications.userId }).from(notifications)).some((n) => n.type === 'mirador.offer_request' && n.userId === cook)).toBe(true);
    expect((await outgoingRequests(db(), buyer))[0]).toMatchObject({ status: 'pending', pickupDetails: null });

    // Seen by the buyer: the cook's WhatsApp (signed in) and their own waiting request; a visitor sees no number.
    const [seen] = await videosByIds(db(), { ids: [videoId], viewerId: buyer, locale: 'es' });
    expect(seen!.offer).toMatchObject({ open: true, remaining: 6, food: true, whatsapp: '+50588887777', mine: { status: 'pending', quantity: 4 } });
    expect((await videosByIds(db(), { ids: [videoId], viewerId: null, locale: 'es' }))[0]!.offer?.whatsapp).toBeNull();

    await db().transaction((tx) => decideRequest(tx, { userId: cook, requestId: asked.id, accept: true }));
    expect((await db().select({ remaining: miradorOffers.remaining }).from(miradorOffers))[0]!.remaining).toBe(2);
    expect((await outgoingRequests(db(), buyer))[0]).toMatchObject({ status: 'accepted', pickupDetails: 'Casa verde frente al parque, de 4 a 6 pm' });
    const second = await db().transaction((tx) => requestOffer(tx, { userId: other, videoId, quantity: 2 }));
    await db().transaction((tx) => cancelRequest(tx, { userId: buyer, requestId: asked.id }));
    expect((await db().select({ remaining: miradorOffers.remaining }).from(miradorOffers))[0]!.remaining).toBe(6);
    expect((await incomingRequests(db(), cook)).map((request) => [request.name, request.status])).toEqual([['Otra', 'pending']]);
    await db().transaction((tx) => decideRequest(tx, { userId: cook, requestId: second.id, accept: false }));
    await expect(db().transaction((tx) => decideRequest(tx, { userId: cook, requestId: second.id, accept: true }))).rejects.toMatchObject({ messageKey: 'mirador.offer.error.decided' });
  });

  it('gives food for soup kitchens only to a verified church, and shows free offers in Se regala, ending soonest first', async () => {
    const cook = await person('Cocinera');
    const neighbour = await person('Vecino');
    const pastor = await person('Pastora');
    const { videoId } = await dish(cook);
    await db().transaction((tx) => saveOffer(tx, { userId: cook, videoId, input: { ...food, kind: 'donation', price: '', title: 'Arroz con pollo que sobró', hours: 3 } }));
    await expect(db().transaction((tx) => requestOffer(tx, { userId: neighbour, videoId, quantity: 1 }))).rejects.toMatchObject({ messageKey: 'mirador.offer.error.kitchens_only' });
    await db().insert(sanctuaryChurches).values({ ownerUserId: pastor, name: 'Iglesia El Buen Pastor', description: 'Comedor los sábados', locationId: place.id, status: 'approved' });
    expect((await db().transaction((tx) => requestOffer(tx, { userId: pastor, videoId, quantity: 3 }))).status).toBe('pending');

    const tab = await feedPage(db(), { tab: 'regalos', viewer: { userId: null, placeCode: null, language: 'es' } });
    expect(tab.items.map((item) => item.id)).toEqual([videoId]);
    expect((await feedPage(db(), { tab: 'mercadito', viewer: { userId: null, placeCode: null, language: 'es' } })).items).toHaveLength(0);
    // Past its time, it closes itself and leaves Se regala.
    expect(await expireOffers(db(), new Date(Date.now() + 4 * 3_600_000))).toBe(1);
    expect((await feedPage(db(), { tab: 'regalos', viewer: { userId: null, placeCode: null, language: 'es' } })).items).toHaveLength(0);
  });

  it('keeps a few offers open at once per member', async () => {
    const cook = await person('Cocinera');
    for (let i = 0; i < MIRADOR_RULES.openOffersPerMember; i++) {
      const { videoId } = await dish(cook);
      await db().transaction((tx) => saveOffer(tx, { userId: cook, videoId, input: { ...food, kind: 'free', price: '' } }));
    }
    const { videoId } = await dish(cook);
    await expect(db().transaction((tx) => saveOffer(tx, { userId: cook, videoId, input: { ...food, kind: 'free', price: '' } }))).rejects.toMatchObject({ messageKey: 'mirador.offer.error.too_many' });
  }, 120_000);
});

describe('Voiceover in Roxi’s voice', () => {
  const alignment = (text: string) => ({
    characters: [...text],
    character_start_times_seconds: [...text].map((_, i) => i * 0.06),
    character_end_times_seconds: [...text].map((_, i) => i * 0.06 + 0.05),
  });
  const elevenlabs = (status = 200) =>
    (async (_url: string | URL | Request, init?: RequestInit) => {
      const text = (JSON.parse(String(init?.body)) as { text: string }).text;
      return new Response(status === 200 ? JSON.stringify({ audio_base64: voiceMp3.toString('base64'), alignment: alignment(text) }) : JSON.stringify({ detail: 'quota_exceeded' }), { status });
    }) as typeof fetch;

  it('charges once, lays the voice over the video with captions, and changes the files’ version', async () => {
    const creator = await person('Creadora');
    const { videoId } = await dish(creator);
    await db().transaction((tx) => grantReward(tx, { userId: creator, ruleKey: 'test', amount: 3, dedupeKey: `test:${creator}` }));
    const [before] = await db().select().from(miradorVideos).where(eq(miradorVideos.id, videoId));
    await expect(db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'x'.repeat(maxCharsFor(before!.durationMs!) + 1), language: 'es', originalVolume: 20 }))).rejects.toMatchObject({ messageKey: 'mirador.voice.error.too_long' });
    expect(await getBalance(db(), creator)).toBe(3);

    const { jobId, tokens } = await db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'Nacatamales recién hechos. Pídelos hoy.', language: 'es', originalVolume: 20 }));
    expect(tokens).toBe(1);
    expect(await getBalance(db(), creator)).toBe(2);
    await expect(db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'Otra narración para el mismo video.', language: 'es', originalVolume: 20 }))).rejects.toMatchObject({ messageKey: 'mirador.voice.error.running' });

    expect(await runVoiceover(db(), jobId, elevenlabs())).toBe('done');
    const [after] = await db().select().from(miradorVideos).where(eq(miradorVideos.id, videoId));
    expect(after).toMatchObject({ version: 2, playbackKey: `mirador/v/${videoId}/720-2.mp4`, captionsKey: `mirador/v/${videoId}/captions-2.vtt` });
    expect(storage.objects.has(before!.playbackKey!)).toBe(false);
    const captions = storage.objects.get(after!.captionsKey!)!.body.toString();
    expect(captions).toMatch(/^WEBVTT/);
    expect(captions).toContain('Nacatamales recién hechos.');
    const out = join(dir, 'narrated.mp4');
    writeFileSync(out, storage.objects.get(after!.playbackKey!)!.body);
    expect(Math.abs((await probe(out)).durationMs - before!.durationMs!)).toBeLessThan(300);
    expect((await db().select({ status: miradorVoiceJobs.status, cost: miradorVoiceJobs.providerCostMicros }).from(miradorVoiceJobs))[0]).toMatchObject({ status: 'done', cost: 'Nacatamales recién hechos. Pídelos hoy.'.length * MIRADOR_RULES.voiceCostMicrosPerChar });
    const [video] = await videosByIds(db(), { ids: [videoId], viewerId: null, locale: 'es' });
    expect(video!.media.high).toContain('?v=2');
    expect(video!.captions).toContain('captions.vtt');
    // One narration per video: a second would be laid over the first one's voice. Refused before any charge.
    const balance = await getBalance(db(), creator);
    await expect(db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'Una segunda voz encima de la primera.', language: 'es', originalVolume: 20 }))).rejects.toMatchObject({ messageKey: 'mirador.voice.error.already' });
    expect(await getBalance(db(), creator)).toBe(balance);
  }, 60_000);

  it('refunds once and tells the member when ElevenLabs refuses, and charges nothing without the tokens', async () => {
    const creator = await person('Creador');
    const { videoId } = await dish(creator);
    await expect(db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'Sin fichas no hay voz.', language: 'es', originalVolume: 20 }))).rejects.toMatchObject({ code: 'insufficient_tokens' });
    expect(await db().select().from(miradorVoiceJobs)).toHaveLength(0);

    await db().transaction((tx) => grantReward(tx, { userId: creator, ruleKey: 'test', amount: 1, dedupeKey: `test:${creator}` }));
    const { jobId } = await db().transaction((tx) => startVoiceover(tx, { userId: creator, videoId, script: 'Esta voz no se podrá hacer.', language: 'es', originalVolume: 20 }));
    expect(await getBalance(db(), creator)).toBe(0);
    expect(await runVoiceover(db(), jobId, elevenlabs(401))).toBe('refunded');
    expect(await getBalance(db(), creator)).toBe(1);
    expect((await db().select({ status: miradorVoiceJobs.status }).from(miradorVoiceJobs))[0]!.status).toBe('refunded');
    expect(await runVoiceover(db(), jobId, elevenlabs(401))).toBe('skipped');
    expect(await getBalance(db(), creator)).toBe(1);
    expect((await db().select({ type: notifications.type }).from(notifications)).some((n) => n.type === 'mirador.voice_failed')).toBe(true);
  }, 60_000);

  it('cuts captions into short lines at the voice’s own timing', () => {
    const text = 'Hola vecinos. Hoy tengo nacatamales calientitos para todos los que pasen por la casa.';
    const vtt = captionsFrom(alignment(text), 0.3);
    const cues = vtt.split('\n\n').slice(1);
    expect(cues[0]).toMatch(/^00:00:00\.300 --> /);
    expect(cues[0]).toContain('Hola vecinos.');
    expect(cues.every((cue) => (cue.split('\n')[1] ?? '').length <= 42)).toBe(true);
  });
});
