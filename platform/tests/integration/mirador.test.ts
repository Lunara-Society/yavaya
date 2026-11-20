import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import { featureFlags, locations, mercaditoListings, miradorVideos, notifications, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { useMediaStorageForTests } from '@/server/domains/media/storage';
import { MIRADOR_RULES } from '@/config/business-rules';
import { abandonUpload, completeUpload, expireUploads, putPart, startUpload } from '@/server/domains/mirador/upload';
import { processVideo, probe, playbackKeys } from '@/server/domains/mirador/process';
import { feedPage, videosByIds, creatorPage } from '@/server/domains/mirador/feed';
import { addComment, countShare, listComments, recordView, removeComment, setBlock, setFollow, setLike, setPreferences, setSave } from '@/server/domains/mirador/social';
import { creatorTotals, moderateVideo, myVideos, removeOwnVideo, reportVideo, saveDetails } from '@/server/domains/mirador/videos';
import { miradorOpen } from '@/server/domains/mirador/access';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { hashtagsOf } from '@/server/domains/mirador/text';
import { resetTransactionalData } from '../helpers/database';
import { MemoryStorage } from '../helpers/memory-storage';

/**
 * Mirador end to end against real files (docs/mirador/README.md): a video
 * made by ffmpeg is uploaded in parts, checked and encoded by the real
 * pipeline, published, ranked, liked, watched, commented, reported — and
 * every number it shows is the count of real rows behind it.
 */

const context = { networkHash: null, addressHash: 'mirador-test', deviceFingerprint: null, userAgent: 'vitest' };
let storage: MemoryStorage;
let dir = '';
const files = { good: '', long: '', image: '' };
let place = { id: '', code: '' };

async function person(name = 'Vecina') {
  const { userId } = await register(
    db(),
    { email: `mirador-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

/** Uploads a file the way the phone does, in parts, and runs the processing the route starts after answering. */
async function upload(userId: string, file: string, details: Parameters<typeof saveDetails>[1]['details'] = { caption: 'Pupusas recién hechas #comida #León', publish: true }) {
  const body = readFileSync(file);
  const started = await db().transaction((tx) => startUpload(tx, { userId, bytes: body.length, contentType: 'video/mp4', language: 'es' }));
  for (let n = 1; n <= started.parts; n++) {
    await putPart(db(), { userId, videoId: started.videoId, partNumber: n, body: body.subarray((n - 1) * started.partBytes, n * started.partBytes) });
  }
  await db().transaction((tx) => completeUpload(tx, { userId, videoId: started.videoId }));
  await db().transaction((tx) => saveDetails(tx, { userId, videoId: started.videoId, details }));
  const outcome = await processVideo(db(), started.videoId);
  return { id: started.videoId, outcome };
}

const viewer = (userId: string | null, placeCode: string | null = null) => ({ userId, placeCode, language: 'es' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mirador-test-'));
  files.good = join(dir, 'good.mp4');
  files.long = join(dir, 'long.mp4');
  files.image = join(dir, 'image.mp4');
  // A portrait phone video with sound, carrying the place it was filmed, as phones write it.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-metadata', 'location=+12.1364-086.2514/', '-metadata', 'make=TestPhone', files.good]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=64x112:rate=1:duration=${MIRADOR_RULES.maxDurationSeconds + 5}`, '-c:v', 'libx264', '-preset', 'ultrafast', files.long]);
  // A picture named like a video.
  writeFileSync(files.image, await sharp({ create: { width: 64, height: 64, channels: 3, background: '#c99b35' } }).png().toBuffer());
  const [city] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  place = city!;
});

beforeEach(async () => {
  await resetTransactionalData();
  storage = new MemoryStorage();
  useMediaStorageForTests(storage);
});

afterAll(async () => {
  useMediaStorageForTests(null);
  rmSync(dir, { recursive: true, force: true });
  await closeDb();
});

describe('Mirador: upload and processing', () => {
  it('turns an upload into two encodings and a poster, without the phone’s metadata, and publishes it', async () => {
    const creator = await person('Doña Carmen');
    const { id, outcome } = await upload(creator, files.good);
    expect(outcome.status).toBe('ready');

    const [row] = await db().select().from(miradorVideos).where(eq(miradorVideos.id, id));
    expect(row).toMatchObject({ status: 'ready', width: 360, height: 640, hasAudio: true, originalKey: null });
    expect(row!.durationMs).toBeGreaterThan(2500);
    expect(row!.publishedAt).not.toBeNull();
    expect(row!.hashtags).toEqual(['comida', 'león']);

    const keys = playbackKeys(id);
    expect(storage.objects.has(keys.high) && storage.objects.has(keys.low) && storage.objects.has(keys.poster)).toBe(true);
    expect(storage.objects.has(`mirador/original/${id}`)).toBe(false);
    expect(storage.objects.get(keys.poster)!.type).toBe('image/webp');

    // The place it was filmed and the phone are gone from what viewers get.
    const out = join(dir, 'out.mp4');
    writeFileSync(out, storage.objects.get(keys.high)!.body);
    const tags = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', out]).toString();
    expect(tags).not.toContain('12.1364');
    expect(tags).not.toContain('TestPhone');
    // The index is at the front, so a phone starts playing on the first bytes.
    const head = storage.objects.get(keys.high)!.body.subarray(0, 4096).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1);
    const low = join(dir, 'low.mp4');
    writeFileSync(low, storage.objects.get(keys.low)!.body);
    expect((await probe(low)).width).toBeLessThanOrEqual(360);

    const page = await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) });
    expect(page.items.map((video) => video.id)).toEqual([id]);
    expect(page.items[0]).toMatchObject({ caption: 'Pupusas recién hechas #comida #León', source: 'upload', creator: { name: 'Doña Carmen' } });
  });

  it('refuses a video longer than the limit, and a picture named like a video, with the reason', async () => {
    const creator = await person();
    const long = await upload(creator, files.long);
    expect(long.outcome).toMatchObject({ status: 'failed', reason: 'mirador.error.too_long' });
    const image = await upload(creator, files.image);
    expect(image.outcome).toMatchObject({ status: 'failed', reason: 'mirador.error.not_video' });
    expect([...storage.objects.keys()].some((key) => key.startsWith('mirador/original/'))).toBe(false);
    expect((await myVideos(db(), creator)).map((video) => video.failureReason).sort()).toEqual(['mirador.error.not_video', 'mirador.error.too_long']);
  });

  it('checks each part’s size, and an upload left unfinished is cleared with its parts', async () => {
    const creator = await person();
    const started = await db().transaction((tx) => startUpload(tx, { userId: creator, bytes: 1000, contentType: 'video/mp4', language: 'es' }));
    await expect(putPart(db(), { userId: creator, videoId: started.videoId, partNumber: 1, body: Buffer.alloc(999) })).rejects.toMatchObject({ messageKey: 'mirador.error.part' });
    await expect(db().transaction((tx) => completeUpload(tx, { userId: creator, videoId: started.videoId }))).rejects.toMatchObject({ messageKey: 'mirador.error.part' });
    expect(storage.openUploads).toBe(1);
    expect(await expireUploads(db(), { now: new Date(Date.now() + (MIRADOR_RULES.uploadKeepHours + 1) * 3_600_000) })).toBe(1);
    expect(storage.openUploads).toBe(0);

    const other = await db().transaction((tx) => startUpload(tx, { userId: creator, bytes: 10, contentType: 'video/mp4', language: 'es' }));
    await db().transaction((tx) => abandonUpload(tx, { userId: creator, videoId: other.videoId }));
    expect(await db().select().from(miradorVideos)).toHaveLength(0);
    await expect(db().transaction((tx) => startUpload(tx, { userId: creator, bytes: 10, contentType: 'image/png', language: 'es' }))).rejects.toMatchObject({ messageKey: 'mirador.error.not_video' });
  });

  it('keeps a video to its creator until they publish it', async () => {
    const creator = await person();
    const { id } = await upload(creator, files.good, { caption: 'Borrador', publish: false });
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items).toHaveLength(0);
    expect(await videosByIds(db(), { ids: [id], viewerId: null, locale: 'es' })).toHaveLength(0);
    await db().transaction((tx) => saveDetails(tx, { userId: creator, videoId: id, details: { publish: true } }));
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items.map((video) => video.id)).toEqual([id]);
  });
});

describe('Mirador: interactions count real rows only', () => {
  it('counts a like and a save once, never the creator’s own, and takes them back', async () => {
    const creator = await person();
    const fan = await person('Fan');
    const { id } = await upload(creator, files.good);
    await db().transaction((tx) => setLike(tx, { userId: fan, videoId: id, on: true }));
    await db().transaction((tx) => setLike(tx, { userId: fan, videoId: id, on: true }));
    await db().transaction((tx) => setLike(tx, { userId: creator, videoId: id, on: true }));
    await db().transaction((tx) => setSave(tx, { userId: fan, videoId: id, on: true }));
    let [video] = await videosByIds(db(), { ids: [id], viewerId: fan, locale: 'es' });
    expect(video).toMatchObject({ liked: true, saved: true, counts: { likes: 1, saves: 1 } });
    await db().transaction((tx) => setLike(tx, { userId: fan, videoId: id, on: false }));
    [video] = await videosByIds(db(), { ids: [id], viewerId: fan, locale: 'es' });
    expect(video).toMatchObject({ liked: false, counts: { likes: 0, saves: 1 } });
  });

  it('counts one view per viewer per day, a completion once, a share only from someone who watched — and none of the creator’s', async () => {
    const creator = await person();
    const { id } = await upload(creator, files.good);
    const [row] = await db().select({ durationMs: miradorVideos.durationMs }).from(miradorVideos).where(eq(miradorVideos.id, id));
    await db().transaction((tx) => countShare(tx, { viewerKey: 'a:stranger', userId: null, videoId: id }));
    await db().transaction((tx) => recordView(tx, { videoId: id, viewerKey: 'a:one', userId: null, watchedMs: 800 }));
    await db().transaction((tx) => recordView(tx, { videoId: id, viewerKey: 'a:one', userId: null, watchedMs: row!.durationMs!, replay: true }));
    await db().transaction((tx) => recordView(tx, { videoId: id, viewerKey: 'a:one', userId: null, watchedMs: row!.durationMs!, replay: true }));
    await db().transaction((tx) => recordView(tx, { videoId: id, viewerKey: `u:${creator}`, userId: creator, watchedMs: row!.durationMs! }));
    await db().transaction((tx) => countShare(tx, { viewerKey: 'a:one', userId: null, videoId: id }));
    await db().transaction((tx) => countShare(tx, { viewerKey: 'a:one', userId: null, videoId: id }));
    const [after] = await db().select().from(miradorVideos).where(eq(miradorVideos.id, id));
    expect(after).toMatchObject({ views: 1, completions: 1, shares: 1 });
    // Tomorrow is another view.
    await db().transaction((tx) => recordView(tx, { videoId: id, viewerKey: 'a:one', userId: null, watchedMs: 500, now: new Date(Date.now() + 86_400_000) }));
    expect((await db().select({ views: miradorVideos.views }).from(miradorVideos).where(eq(miradorVideos.id, id)))[0]!.views).toBe(2);
  });

  it('comments and replies tell the right people, and the creator may take a comment down', async () => {
    const creator = await person('Creadora');
    const first = await person('Primera');
    const second = await person('Segunda');
    const { id } = await upload(creator, files.good);
    const top = await db().transaction((tx) => addComment(tx, { userId: first, videoId: id, body: '  ¡Qué rico!  ' }));
    await db().transaction((tx) => addComment(tx, { userId: second, videoId: id, body: 'Coincido', parentId: top.id }));
    await expect(db().transaction((tx) => addComment(tx, { userId: second, videoId: id, body: '   ' }))).rejects.toMatchObject({ messageKey: 'mirador.error.comment_empty' });
    const comments = await listComments(db(), { videoId: id, viewerId: creator });
    expect(comments.map((comment) => [comment.body, comment.parentId === top.id, comment.canRemove])).toEqual([
      ['¡Qué rico!', false, true],
      ['Coincido', true, true],
    ]);
    const news = await db().select({ userId: notifications.userId, type: notifications.type }).from(notifications);
    expect(news).toEqual(expect.arrayContaining([{ userId: creator, type: 'mirador.comment' }, { userId: first, type: 'mirador.reply' }]));
    await db().transaction((tx) => removeComment(tx, { userId: creator, commentId: top.id }));
    expect((await listComments(db(), { videoId: id, viewerId: null })).map((comment) => comment.body)).toEqual(['Coincido']);
    expect((await db().select({ comments: miradorVideos.comments }).from(miradorVideos).where(eq(miradorVideos.id, id)))[0]!.comments).toBe(1);
  });

  it('following fills Siguiendo; blocking hides each from the other and ends the follow', async () => {
    const creator = await person('Creador');
    const fan = await person('Fan');
    const { id } = await upload(creator, files.good);
    await db().transaction((tx) => setFollow(tx, { userId: fan, creatorUserId: creator, on: true }));
    expect((await feedPage(db(), { tab: 'siguiendo', viewer: viewer(fan) })).items.map((video) => video.id)).toEqual([id]);
    const yayId = (await db().select({ yayId: users.yayId }).from(users).where(eq(users.id, creator)))[0]!.yayId;
    expect((await creatorPage(db(), { yayId, viewerId: fan, locale: 'es' }))?.counts.followers).toBe(1);

    await db().transaction((tx) => setBlock(tx, { userId: creator, otherUserId: fan, on: true }));
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(fan) })).items).toHaveLength(0);
    expect((await feedPage(db(), { tab: 'siguiendo', viewer: viewer(fan) })).items).toHaveLength(0);
    expect(await creatorPage(db(), { yayId, viewerId: fan, locale: 'es' })).toBeNull();
    await expect(db().transaction((tx) => setLike(tx, { userId: fan, videoId: id, on: true }))).rejects.toMatchObject({ code: 'not_found' });
    expect((await creatorPage(db(), { yayId, viewerId: null, locale: 'es' }))?.counts.followers).toBe(0);
  });
});

describe('Mirador: links to real things', () => {
  it('links only the creator’s own live listing, shows it in the Mercadito tab, and drops it once sold', async () => {
    const seller = await person('Vendedora');
    const other = await person('Otra');
    const listing = crypto.randomUUID();
    await db().insert(mercaditoListings).values({ id: listing, sellerUserId: seller, title: 'Moto Honda 2019', description: 'Moto en buen estado', priceMinor: 9_500_000, currencyCode: 'NIO', category: 'vehicles', condition: 'used', locationId: place.id });
    const { id } = await upload(seller, files.good, { caption: 'Mi moto', publish: true, link: { type: 'mercadito_listing', id: listing } });
    const theirs = await upload(other, files.good, { caption: 'Sin enlace', publish: true });
    await expect(db().transaction((tx) => saveDetails(tx, { userId: other, videoId: theirs.id, details: { link: { type: 'mercadito_listing', id: listing } } }))).rejects.toMatchObject({ messageKey: 'mirador.error.link' });

    const tab = await feedPage(db(), { tab: 'mercadito', viewer: viewer(null) });
    expect(tab.items.map((video) => video.id)).toEqual([id]);
    expect(tab.items[0]!.link).toMatchObject({ type: 'mercadito_listing', url: `/mercadito/${listing}`, action: 'view_listing', price: { minor: 9_500_000, currency: 'NIO' }, district: 'mercadito' });

    await db().update(mercaditoListings).set({ status: 'sold' }).where(eq(mercaditoListings.id, listing));
    expect((await feedPage(db(), { tab: 'mercadito', viewer: viewer(null) })).items).toHaveLength(0);
    expect((await videosByIds(db(), { ids: [id], viewerId: null, locale: 'es' }))[0]!.link).toBeNull();
  });
});

describe('Mirador: discovery', () => {
  it('ranks what earned more per view first, lifts what is near, and puts what the viewer saw after', async () => {
    const creator = await person();
    const fans = await Promise.all([person('Ana Fan'), person('Beto Fan'), person('Cris Fan')]);
    const plain = await upload(creator, files.good, { caption: 'uno', publish: true });
    const loved = await upload(creator, files.good, { caption: 'dos', publish: true });
    const near = await upload(creator, files.good, { caption: 'tres', publish: true, locationId: place.id });
    for (const fan of fans) await db().transaction((tx) => setLike(tx, { userId: fan, videoId: loved.id, on: true }));

    const anywhere = (await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items.map((video) => video.id);
    expect(anywhere[0]).toBe(loved.id);
    const here = await feedPage(db(), { tab: 'cerca', viewer: viewer(null, place.code) });
    expect(here.items.map((video) => video.id)).toEqual([near.id]);
    expect((await feedPage(db(), { tab: 'cerca', viewer: viewer(null) })).needsPlace).toBe(true);

    const watcher = await person('Mirona');
    await db().transaction((tx) => recordView(tx, { videoId: loved.id, viewerKey: `u:${watcher}`, userId: watcher, watchedMs: 1000 }));
    const forWatcher = (await feedPage(db(), { tab: 'para_ti', viewer: viewer(watcher, place.code) })).items;
    expect(forWatcher.at(-1)!.id).toBe(loved.id);
    expect(forWatcher[0]!.id).toBe(near.id);
    expect(forWatcher[0]!.why).toContain('near');

    // Starting over: what they saw before no longer pushes it down.
    await db().transaction((tx) => setPreferences(tx, { userId: watcher, reset: true, now: new Date(Date.now() + 1000) }));
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(watcher, place.code) })).items[0]!.id).toBe(loved.id);
    expect(plain.outcome.status).toBe('ready');
  });

  it('turns a caption’s hashtags into topics, the same however they are written', () => {
    expect(hashtagsOf('Hoy #Comida en #León, #comida otra vez', ['#FUTBOL', 'león'])).toEqual(['comida', 'león', 'futbol']);
  });
});

describe('Mirador: safety', () => {
  it('hides a video after enough different reporters, and a moderator can put it back', async () => {
    const creator = await person();
    const { id } = await upload(creator, files.good);
    await expect(db().transaction((tx) => reportVideo(tx, { userId: creator, videoId: id, category: 'scam', description: null }))).rejects.toMatchObject({ messageKey: 'mirador.error.report_own' });
    const reporters = await Promise.all(Array.from({ length: MIRADOR_RULES.reportsToHide }, (_, i) => person(`Reportante ${i}`)));
    const first = await db().transaction((tx) => reportVideo(tx, { userId: reporters[0]!, videoId: id, category: 'copyright', description: 'Es mi video' }));
    const again = await db().transaction((tx) => reportVideo(tx, { userId: reporters[0]!, videoId: id, category: 'scam', description: null }));
    expect(again).toMatchObject({ duplicate: true, ticketCode: first.ticketCode });
    for (const reporter of reporters.slice(1)) await db().transaction((tx) => reportVideo(tx, { userId: reporter, videoId: id, category: 'scam', description: null }));
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items).toHaveLength(0);

    const moderator = await person('Moderadora');
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'admin', grantedBy: null }));
    await expect(db().transaction((tx) => moderateVideo(tx, { actor: { userId: creator, status: 'active' }, videoId: id, action: 'restore' }))).rejects.toMatchObject({ code: 'forbidden' });
    await db().transaction((tx) => moderateVideo(tx, { actor: { userId: moderator, status: 'active' }, videoId: id, action: 'restore' }));
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items.map((video) => video.id)).toEqual([id]);
  });

  it('lets the creator take a video down, handing back its files to delete', async () => {
    const creator = await person();
    const { id } = await upload(creator, files.good);
    const keys = await db().transaction((tx) => removeOwnVideo(tx, { userId: creator, videoId: id }));
    expect(keys.sort()).toEqual(Object.values(playbackKeys(id)).sort());
    expect((await feedPage(db(), { tab: 'para_ti', viewer: viewer(null) })).items).toHaveLength(0);
    expect(await myVideos(db(), creator)).toHaveLength(0);
    expect((await creatorTotals(db(), creator)).videos).toBe(0);
  });

  it('is open to the owner only until its switch is turned on', async () => {
    const member = await person();
    const owner = await person('Dueña');
    await db().transaction((tx) => grantRole(tx, { userId: owner, roleKey: 'admin', grantedBy: null }));
    expect(await miradorOpen(db(), null)).toBe(false);
    expect(await miradorOpen(db(), member)).toBe(false);
    expect(await miradorOpen(db(), owner)).toBe(true);
    await db().insert(featureFlags).values({ key: 'mirador.open', enabled: true }).onConflictDoUpdate({ target: featureFlags.key, set: { enabled: true } });
    clearSettingsCache();
    expect(await miradorOpen(db(), null)).toBe(true);
    await db().delete(featureFlags).where(and(eq(featureFlags.key, 'mirador.open')));
    clearSettingsCache();
  });
});
