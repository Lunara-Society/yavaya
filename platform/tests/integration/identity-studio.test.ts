import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, identityPresets, media, notifications, tickets, userProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import {
  deletePreset,
  discardIdentityDraft,
  identityPhotoAccess,
  listPresets,
  publishIdentity,
  publishedIdentity,
  pruneIdentityPhotos,
  renamePreset,
  resetIdentityByModerator,
  roomForPhoto,
  saveIdentityDraft,
  savePreset,
  setFavorite,
  studioState,
} from '@/server/domains/identity/studio';
import { profileQueue, reportProfile, resolveProfileTicket } from '@/server/domains/identity/profile-reports';
import { defaultIdentity, visibleModules, type IdentityConfig } from '@/config/identity-studio';
import { PROFILE_STUDIO_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'identity-studio-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member(status: 'active' | 'pending_verification' | 'suspended' = 'active') {
  const { userId } = await register(
    db(),
    {
      email: `studio-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Lucía Martínez',
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  await db().update(users).set({ status }).where(eq(users.id, userId));
  return userId;
}

/** A stored photo row, as the upload route writes one. */
async function photo(ownerUserId: string, purpose = 'identity_avatar', options: { status?: 'active' | 'removed'; createdAt?: Date } = {}) {
  const [row] = await db()
    .insert(media)
    .values({
      ownerUserId,
      purpose,
      storageKey: `test/${crypto.randomUUID()}.webp`,
      contentType: 'image/webp',
      width: 800,
      height: 800,
      bytes: 1234,
      sourceSha256: crypto.randomUUID(),
      status: options.status ?? 'active',
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: media.id });
  return row!.id;
}

const edit = (patch: (c: IdentityConfig) => void) => {
  const c = defaultIdentity();
  patch(c);
  return c;
};
const longAgo = () => new Date(Date.now() - 2 * 60 * 60_000);

beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('drafts and publishing', () => {
  it('keeps a draft to its owner until they publish, and audits the publication', async () => {
    const userId = await member();
    const start = await studioState(db(), userId);
    expect(start.everPublished).toBe(false);
    expect(start.revision).toBe(0);

    const draft = edit((c) => {
      c.content.headline = 'Panadera en el barrio';
      c.content.about = 'Hago pan dulce los sábados.';
    });
    const saved = await db().transaction((tx) => saveIdentityDraft(tx, { userId, input: draft, baseRevision: 0 }));
    expect(saved.revision).toBe(1);
    // Visitors still see the profile as it was.
    expect((await publishedIdentity(db(), userId)).content.headline).toBe('');
    expect((await studioState(db(), userId)).draft.content.headline).toBe('Panadera en el barrio');

    const published = await db().transaction((tx) => publishIdentity(tx, { userId, input: draft, baseRevision: 1 }));
    expect(published.revision).toBe(2);
    const state = await studioState(db(), userId);
    expect(state.everPublished).toBe(true);
    expect(state.unpublished).toBe(false);
    expect(state.published.content.headline).toBe('Panadera en el barrio');
    const [profile] = await db().select({ bio: userProfiles.bio }).from(userProfiles).where(eq(userProfiles.userId, userId));
    expect(profile?.bio).toBe('Hago pan dulce los sábados.');

    const [audit] = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'identity.profile_published'), eq(auditEvents.subjectId, userId)));
    expect(audit?.actorUserId).toBe(userId);
    expect((audit?.metadata as { visibility: { modules: Record<string, string> } }).visibility.modules.about).toBe('public');
  });

  it('refuses a save based on an older version instead of overwriting it', async () => {
    const userId = await member();
    await db().transaction((tx) => saveIdentityDraft(tx, { userId, input: edit((c) => (c.content.headline = 'Primera ventana')), baseRevision: 0 }));
    await expect(db().transaction((tx) => saveIdentityDraft(tx, { userId, input: edit((c) => (c.content.headline = 'Segunda ventana')), baseRevision: 0 }))).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'studio.error.conflict',
      details: { revision: 1 },
    });
    expect((await studioState(db(), userId)).draft.content.headline).toBe('Primera ventana');
  });

  it('throws a draft away and goes back to what visitors see', async () => {
    const userId = await member();
    await db().transaction((tx) => publishIdentity(tx, { userId, input: edit((c) => (c.content.headline = 'Publicado')), baseRevision: 0 }));
    await db().transaction((tx) => saveIdentityDraft(tx, { userId, input: edit((c) => (c.content.headline = 'Borrador')), baseRevision: 1 }));
    await db().transaction((tx) => discardIdentityDraft(tx, { userId, baseRevision: 2 }));
    const state = await studioState(db(), userId);
    expect(state.unpublished).toBe(false);
    expect(state.draft.content.headline).toBe('Publicado');
  });

  it('lets a member who has not verified their email prepare a draft, but not publish', async () => {
    const pending = await member('pending_verification');
    await expect(db().transaction((tx) => saveIdentityDraft(tx, { userId: pending, input: defaultIdentity(), baseRevision: 0 }))).resolves.toMatchObject({ revision: 1 });
    await expect(db().transaction((tx) => publishIdentity(tx, { userId: pending, input: defaultIdentity(), baseRevision: 1 }))).rejects.toMatchObject({ messageKey: 'studio.error.verify_email' });
    const suspended = await member('suspended');
    await expect(db().transaction((tx) => saveIdentityDraft(tx, { userId: suspended, input: defaultIdentity(), baseRevision: 0 }))).rejects.toMatchObject({ messageKey: 'studio.error.account_restricted' });
  });
});

describe('a member’s own photos', () => {
  it('can only use their own, active photos, uploaded for the slot they fill', async () => {
    const userId = await member();
    const other = await member();
    const theirs = await photo(other);
    const listingPhoto = await photo(userId, 'listing_photo');
    const removed = await photo(userId, 'identity_avatar', { status: 'removed' });
    const cover = await photo(userId, 'identity_cover');
    const avatar = await photo(userId, 'identity_avatar');
    const withAvatar = (id: string) => edit((c) => (c.appearance.avatar = { ...c.appearance.avatar, media: id }));

    for (const id of [theirs, listingPhoto, removed, cover]) {
      await expect(db().transaction((tx) => saveIdentityDraft(tx, { userId, input: withAvatar(id), baseRevision: 0 })), id).rejects.toMatchObject({ messageKey: 'studio.error.media' });
    }
    await expect(db().transaction((tx) => saveIdentityDraft(tx, { userId, input: withAvatar(avatar), baseRevision: 0 }))).resolves.toMatchObject({ revision: 1 });
  });

  it('shows a photo only to whom its owner chose — never a draft photo to anyone else', async () => {
    const owner = await member();
    const other = await member();
    const avatar = await photo(owner, 'identity_avatar');
    const cover = await photo(owner, 'identity_cover');
    const input = (who: 'public' | 'members') =>
      edit((c) => {
        c.appearance.avatar = { ...c.appearance.avatar, media: avatar };
        c.appearance.cover = { kind: 'upload', media: cover };
        c.privacy = { avatar: who, cover: 'public' };
      });

    await db().transaction((tx) => saveIdentityDraft(tx, { userId: owner, input: input('public'), baseRevision: 0 }));
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: owner })).toBe('owner');
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: other })).toBeNull();
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: null })).toBeNull();

    await db().transaction((tx) => publishIdentity(tx, { userId: owner, input: input('members'), baseRevision: 1 }));
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: null })).toBeNull();
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: other })).toBe('members');
    expect(await identityPhotoAccess(db(), { mediaId: cover, viewerUserId: null })).toBe('public');
    // A members-only photo is not mirrored where the rest of the site shows photos to anyone.
    const [profile] = await db().select({ avatar: userProfiles.avatarMediaId }).from(userProfiles).where(eq(userProfiles.userId, owner));
    expect(profile?.avatar).toBeNull();

    await db().transaction((tx) => publishIdentity(tx, { userId: owner, input: input('public'), baseRevision: 2 }));
    expect(await identityPhotoAccess(db(), { mediaId: avatar, viewerUserId: null })).toBe('public');
  });

  it('removes photos nothing uses any more, but not new ones another window may be using', async () => {
    const userId = await member();
    const used = await photo(userId, 'identity_avatar', { createdAt: longAgo() });
    const abandoned = await photo(userId, 'identity_avatar', { createdAt: longAgo() });
    const fresh = await photo(userId, 'identity_cover');
    const inPreset = await photo(userId, 'identity_background', { createdAt: longAgo() });
    await db().transaction((tx) =>
      savePreset(tx, { userId, name: 'Mi fondo', appearance: { ...defaultIdentity().appearance, background: { kind: 'upload', media: inPreset } } }),
    );
    await db().transaction((tx) => publishIdentity(tx, { userId, input: edit((c) => (c.appearance.avatar = { ...c.appearance.avatar, media: used })), baseRevision: 0 }));

    const status = async (id: string) => (await db().select({ status: media.status }).from(media).where(eq(media.id, id)))[0]?.status;
    expect(await status(used)).toBe('active');
    expect(await status(abandoned)).toBe('removed');
    expect(await status(fresh)).toBe('active');
    expect(await status(inPreset)).toBe('active');
    expect(await db().transaction((tx) => pruneIdentityPhotos(tx, userId))).toBe(0);
  });

  it('keeps a member to a limit of stored profile photos', async () => {
    const userId = await member();
    for (let i = 0; i < PROFILE_STUDIO_RULES.maxOwnPhotos; i += 1) await photo(userId, 'identity_avatar');
    await expect(db().transaction((tx) => roomForPhoto(tx, userId))).rejects.toMatchObject({ messageKey: 'studio.error.photos_full', details: { max: PROFILE_STUDIO_RULES.maxOwnPhotos } });
  });
});

describe('favourites and saved looks', () => {
  it('keeps favourites to designs that exist', async () => {
    const userId = await member();
    expect(await db().transaction((tx) => setFavorite(tx, { userId, assetId: 'frame-ring-gold', on: true }))).toEqual(['frame-ring-gold']);
    await expect(db().transaction((tx) => setFavorite(tx, { userId, assetId: 'nope-not-real', on: true }))).rejects.toMatchObject({ messageKey: 'studio.error.asset' });
    expect(await db().transaction((tx) => setFavorite(tx, { userId, assetId: 'frame-ring-gold', on: false }))).toEqual([]);
  });

  it('keeps saved looks to their owner, with names unique to them', async () => {
    const userId = await member();
    const other = await member();
    const preset = await db().transaction((tx) => savePreset(tx, { userId, name: 'Noche', appearance: defaultIdentity().appearance }));
    await db().transaction((tx) => savePreset(tx, { userId, name: 'Día', appearance: { ...defaultIdentity().appearance, surface: 'ivory' } }));
    await expect(db().transaction((tx) => savePreset(tx, { userId, name: 'Noche', appearance: defaultIdentity().appearance }))).rejects.toMatchObject({ messageKey: 'studio.error.preset_exists' });
    await expect(db().transaction((tx) => renamePreset(tx, { userId, presetId: preset.id, name: 'Día' }))).rejects.toMatchObject({ messageKey: 'studio.error.preset_exists' });
    // Another member can neither rename nor delete it.
    await expect(db().transaction((tx) => renamePreset(tx, { userId: other, presetId: preset.id, name: 'Mío' }))).rejects.toMatchObject({ code: 'not_found' });
    await expect(db().transaction((tx) => deletePreset(tx, { userId: other, presetId: preset.id }))).rejects.toMatchObject({ code: 'not_found' });
    expect((await listPresets(db(), userId)).map((p) => p.name)).toEqual(['Noche', 'Día']);
    expect(await listPresets(db(), other)).toEqual([]);
  });
});

describe('moderation', () => {
  it('lets a moderator put a profile back to Yavaya’s own, with a note in the audit chain — and nobody else', async () => {
    const owner = await member();
    const stranger = await member();
    const moderator = await member();
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    const avatar = await photo(owner);
    await db().transaction((tx) =>
      publishIdentity(tx, {
        userId: owner,
        input: edit((c) => {
          c.content.headline = 'Algo que no debía estar';
          c.appearance.avatar = { ...c.appearance.avatar, media: avatar };
        }),
        baseRevision: 0,
      }),
    );
    await db().transaction((tx) => savePreset(tx, { userId: owner, name: 'Guardado', appearance: defaultIdentity().appearance }));

    await expect(db().transaction((tx) => resetIdentityByModerator(tx, { actor: { userId: stranger, status: 'active' }, userId: owner, note: 'No me gusta' }))).rejects.toMatchObject({ code: 'forbidden' });
    await db().transaction((tx) => resetIdentityByModerator(tx, { actor: { userId: moderator, status: 'active' }, userId: owner, note: 'Titular ofensivo' }));

    const published = await publishedIdentity(db(), owner);
    expect(published.content.headline).toBe('');
    expect(published.appearance.avatar.media).toBeNull();
    expect(await db().select().from(identityPresets).where(eq(identityPresets.userId, owner))).toEqual([]);
    const [row] = await db().select({ status: media.status }).from(media).where(eq(media.id, avatar));
    expect(row?.status).toBe('removed');
    const [audit] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'identity.profile_reset'));
    expect(audit?.actorUserId).toBe(moderator);
    expect(audit?.actorType).toBe('admin');
    expect((audit?.metadata as { note: string }).note).toBe('Titular ofensivo');
  });

  it('collects every report on a profile into one ticket a moderator decides — never one about themselves', async () => {
    const owner = await member();
    const [first, second, moderator] = [await member(), await member(), await member()];
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    await db().transaction((tx) => publishIdentity(tx, { userId: owner, input: edit((c) => (c.content.headline = 'Soy el banco oficial')), baseRevision: 0 }));
    const report = (reporterUserId: string, category: 'fraud' | 'spam' | 'harassment', profileUserId = owner) =>
      db().transaction((tx) => reportProfile(tx, { profileUserId, reporterUserId, category, description: null }));

    await expect(report(owner, 'spam')).rejects.toMatchObject({ messageKey: 'profile.report.error.own' });
    const one = await report(first, 'fraud');
    expect(one.duplicate).toBe(false);
    expect(await report(first, 'spam')).toEqual({ ticketCode: one.ticketCode, duplicate: true });
    expect((await report(second, 'harassment')).ticketCode).toBe(one.ticketCode);

    await expect(profileQueue(db(), { userId: first, status: 'active' })).rejects.toMatchObject({ code: 'forbidden' });
    const [item, ...rest] = await profileQueue(db(), { userId: moderator, status: 'active' });
    expect(rest).toEqual([]);
    expect(item?.reports.map((r) => r.category).sort()).toEqual(['fraud', 'harassment']);
    // Harassment raises the ticket's priority; nothing lowers it.
    expect(item?.priority).toBe('high');

    const decide = (actor: string, decision: 'dismiss' | 'reset', note: string | null, ticketId = item!.ticketId) =>
      db().transaction((tx) => resolveProfileTicket(tx, { actor: { userId: actor, status: 'active' }, ticketId, decision, note }));
    await expect(decide(first, 'reset', 'No')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(decide(moderator, 'reset', null)).rejects.toMatchObject({ messageKey: 'studio.error.moderation_note' });
    await decide(moderator, 'reset', 'Se hace pasar por un banco');

    expect((await publishedIdentity(db(), owner)).content.headline).toBe('');
    const [ticket] = await db().select({ status: tickets.status }).from(tickets).where(eq(tickets.id, item!.ticketId));
    expect(ticket?.status).toBe('resolved');
    const told = await db().select({ titleKey: notifications.titleKey }).from(notifications).where(eq(notifications.userId, owner));
    expect(told.map((n) => n.titleKey)).toContain('notify.moderation.profile_reset');
    expect(await profileQueue(db(), { userId: moderator, status: 'active' })).toEqual([]);
    await expect(decide(moderator, 'dismiss', null)).rejects.toMatchObject({ messageKey: 'moderation.error.closed' });

    // A report about the moderator goes to someone else.
    const about = await report(first, 'spam', moderator);
    const [own] = await profileQueue(db(), { userId: moderator, status: 'active' });
    expect(own?.ticketCode).toBe(about.ticketCode);
    await expect(decide(moderator, 'dismiss', null, own!.ticketId)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('closes a report without touching the profile when there is nothing to correct', async () => {
    const owner = await member();
    const [reporter, moderator] = [await member(), await member()];
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    await db().transaction((tx) => publishIdentity(tx, { userId: owner, input: edit((c) => (c.content.headline = 'Panadera')), baseRevision: 0 }));
    await db().transaction((tx) => reportProfile(tx, { profileUserId: owner, reporterUserId: reporter, category: 'spam', description: 'No me gusta' }));
    const [item] = await profileQueue(db(), { userId: moderator, status: 'active' });
    await db().transaction((tx) => resolveProfileTicket(tx, { actor: { userId: moderator, status: 'active' }, ticketId: item!.ticketId, decision: 'dismiss', note: null }));
    expect((await publishedIdentity(db(), owner)).content.headline).toBe('Panadera');
    const [ticket] = await db().select({ status: tickets.status }).from(tickets).where(eq(tickets.id, item!.ticketId));
    expect(ticket?.status).toBe('rejected');
    expect(await db().select().from(notifications).where(and(eq(notifications.userId, owner), eq(notifications.titleKey, 'notify.moderation.profile_reset')))).toEqual([]);
  });
});

describe('the public view', () => {
  it('never lists a members-only section for a visitor', async () => {
    const userId = await member();
    await db().transaction((tx) =>
      publishIdentity(tx, {
        userId,
        input: edit((c) => {
          c.content.about = 'Solo para miembros';
          c.layout.modules = c.layout.modules.map((m) => (m.id === 'about' ? { ...m, visibility: 'members' } : m));
        }),
        baseRevision: 0,
      }),
    );
    const config = await publishedIdentity(db(), userId);
    expect(visibleModules(config, 'visitor')).not.toContain('about');
    expect(visibleModules(config, 'member')).toContain('about');
  });
});
