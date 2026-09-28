import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, locations, reputationScores, tokenLedger, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import {
  addReply,
  closePost,
  communityQueue,
  createPost,
  getPost,
  listPosts,
  postInputSchema,
  reportPost,
  resolveCommunityTicket,
  toggleSupport,
} from '@/server/domains/community/service';
import { REPUTATION_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'community-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function member(status: 'active' | 'pending_verification' = 'active') {
  const { userId } = await register(
    db(),
    {
      email: `member-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: `Vecina ${Math.floor(Math.random() * 1000)}`,
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  await db().update(users).set({ status }).where(eq(users.id, userId));
  return userId;
}

const input = (overrides: Record<string, unknown> = {}) =>
  postInputSchema.parse({
    kind: 'help_request',
    title: 'Necesito ayuda para mudarme',
    body: 'El sábado por la mañana, dos horas, tengo que bajar muebles de un segundo piso.',
    locationId: placeId,
    anonymous: false,
    ...overrides,
  });

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
  placeId = place!.id;
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('posting', () => {
  it('is free, audited, and seen by members', async () => {
    const author = await member();
    const reader = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: input() }));

    // New accounts receive starter tokens; the post itself must cost nothing.
    const charged = await db().select().from(tokenLedger).where(eq(tokenLedger.relatedId, postId));
    expect(charged).toHaveLength(0);
    const [audit] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'community.post_published'));
    expect(audit?.subjectId).toBe(postId);

    const feed = await listPosts(db(), { viewerId: reader, locale: 'es' });
    expect(feed.items.map((post) => post.id)).toEqual([postId]);
    expect(feed.items[0]?.author?.displayName).toBeDefined();
  });

  it('asks unverified accounts to verify first', async () => {
    const author = await member('pending_verification');
    await expect(db().transaction((tx) => createPost(tx, { authorUserId: author, input: input() }))).rejects.toMatchObject({
      messageKey: 'community.error.verify_email',
    });
  });

  it('hides a discreet author from others, but not from themselves', async () => {
    const author = await member();
    const reader = await member();
    const postId = await db().transaction((tx) =>
      createPost(tx, { authorUserId: author, input: input({ kind: 'prayer', locationId: null, anonymous: true }) }),
    );
    const forReader = await getPost(db(), { postId, viewerId: reader, viewerIsModerator: false, locale: 'es' });
    expect(forReader?.post.author).toBeNull();
    const forAuthor = await getPost(db(), { postId, viewerId: author, viewerIsModerator: false, locale: 'es' });
    expect(forAuthor?.post.author).not.toBeNull();
  });

  it("never hides the name on a request for a neighbour's hand", async () => {
    const author = await member();
    const reader = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: input({ anonymous: true }) }));
    const view = await getPost(db(), { postId, viewerId: reader, viewerIsModerator: false, locale: 'es' });
    expect(view?.post.anonymous).toBe(false);
    expect(view?.post.author).not.toBeNull();
  });
});

describe('responding', () => {
  it('counts replies and support, one support per member', async () => {
    const author = await member();
    const friend = await member();
    const postId = await db().transaction((tx) =>
      createPost(tx, { authorUserId: author, input: input({ kind: 'prayer', locationId: null }) }),
    );
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: friend, body: 'Te acompaño.' }));
    expect((await db().transaction((tx) => toggleSupport(tx, { postId, userId: friend }))).supported).toBe(true);
    let view = await getPost(db(), { postId, viewerId: friend, viewerIsModerator: false, locale: 'es' });
    expect(view?.post.supportCount).toBe(1);
    expect(view?.post.supportedByViewer).toBe(true);
    expect(view?.replies).toHaveLength(1);

    expect((await db().transaction((tx) => toggleSupport(tx, { postId, userId: friend }))).supported).toBe(false);
    view = await getPost(db(), { postId, viewerId: friend, viewerIsModerator: false, locale: 'es' });
    expect(view?.post.supportCount).toBe(0);
  });

  it('stops replies once the author marks it answered, and hides withdrawn posts', async () => {
    const author = await member();
    const friend = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: input() }));
    await db().transaction((tx) => closePost(tx, { postId, authorUserId: author, outcome: 'resolved' }));
    await expect(
      db().transaction((tx) => addReply(tx, { postId, authorUserId: friend, body: 'Puedo ir.' })),
    ).rejects.toMatchObject({ messageKey: 'community.error.closed' });

    await db().transaction((tx) => closePost(tx, { postId, authorUserId: author, outcome: 'withdrawn' }));
    expect(await getPost(db(), { postId, viewerId: friend, viewerIsModerator: false, locale: 'es' })).toBeNull();
    expect(await getPost(db(), { postId, viewerId: author, viewerIsModerator: false, locale: 'es' })).not.toBeNull();
    expect((await listPosts(db(), { viewerId: friend, locale: 'es' })).items).toHaveLength(0);
  });
});

describe('reports and moderation', () => {
  it('lets a moderator take a harassing post down and warn its author', async () => {
    const author = await member();
    const reader = await member();
    const moderator = await member();
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: input() }));

    const report = await db().transaction((tx) =>
      reportPost(tx, { postId, reporterUserId: reader, category: 'harassment', description: 'Insulta a una vecina' }),
    );
    expect(report.ticketCode).toMatch(/^TCK-/);
    await expect(communityQueue(db(), { userId: reader, status: 'active' })).rejects.toMatchObject({ code: 'forbidden' });

    const [item] = await communityQueue(db(), { userId: moderator, status: 'active' });
    expect(item?.priority).toBe('high');
    await db().transaction((tx) =>
      resolveCommunityTicket(tx, { actor: { userId: moderator, status: 'active' }, ticketId: item!.ticketId, decision: 'warn', note: null }),
    );

    expect(await getPost(db(), { postId, viewerId: reader, viewerIsModerator: false, locale: 'es' })).toBeNull();
    const [score] = await db().select().from(reputationScores).where(eq(reputationScores.userId, author));
    expect(score?.score).toBeLessThan(REPUTATION_RULES.initialScore);
    expect(await communityQueue(db(), { userId: moderator, status: 'active' })).toHaveLength(0);
  });

  it('can take down only the reported reply', async () => {
    const author = await member();
    const troll = await member();
    const moderator = await member();
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: input() }));
    const replyId = await db().transaction((tx) => addReply(tx, { postId, authorUserId: troll, body: 'Mensaje ofensivo' }));
    await db().transaction((tx) =>
      reportPost(tx, { postId, reporterUserId: author, category: 'harassment', description: null, replyId }),
    );
    const [item] = await communityQueue(db(), { userId: moderator, status: 'active' });
    expect(item?.reports[0]?.replyBody).toBe('Mensaje ofensivo');
    await db().transaction((tx) =>
      resolveCommunityTicket(tx, { actor: { userId: moderator, status: 'active' }, ticketId: item!.ticketId, decision: 'remove_replies', note: null }),
    );
    const view = await getPost(db(), { postId, viewerId: author, viewerIsModerator: false, locale: 'es' });
    expect(view?.post.status).toBe('open');
    expect(view?.replies).toHaveLength(0);
    expect(view?.post.replyCount).toBe(0);
  });
});
