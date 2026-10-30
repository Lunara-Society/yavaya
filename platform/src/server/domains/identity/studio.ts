import 'server-only';
import { z } from 'zod';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { identityPresets, media, userProfiles, users } from '@/server/db/schema';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { markRemoved } from '@/server/domains/media/service';
import { notify } from '@/server/domains/notifications/service';
import { PROFILE_STUDIO_RULES } from '@/config/business-rules';
import { identityAsset } from '@/config/identity-assets';
import {
  defaultIdentity,
  DEFAULT_APPEARANCE,
  PROFILE_LANGUAGES,
  PROFILE_MODES,
  PROFILE_MODULES,
  STUDIO_ACCENT_IDS,
  STUDIO_AVATAR_SHAPES,
  STUDIO_BANNER_MIN_DIM,
  STUDIO_BORDERS,
  STUDIO_CARD_STYLES,
  STUDIO_DECORATION_PLACEMENTS,
  STUDIO_DENSITIES,
  STUDIO_DIM,
  STUDIO_DIVIDERS,
  STUDIO_GRADIENT_IDS,
  STUDIO_HEADERS,
  STUDIO_INTENSITY,
  STUDIO_OPACITY,
  STUDIO_RADII,
  STUDIO_SOLID_IDS,
  STUDIO_SURFACE_IDS,
  STUDIO_TYPOGRAPHY,
  STUDIO_ZOOM,
  VISIBILITIES,
  type IdentityAppearance,
  type IdentityConfig,
} from '@/config/identity-studio';

/**
 * Identity Studio — a member's profile, as they choose to show it.
 *
 * Two copies live on the member's profile row: the draft, which only they
 * ever see, and the published profile, which visitors see. Nothing reaches
 * visitors until the member publishes, and publishing is recorded in the
 * audit chain together with what it changed about who can see what.
 *
 * Everything stored is a validated configuration: ids from the design
 * vocabulary (config/identity-studio.ts), designs from the library
 * (config/identity-assets.ts), the member's own photos by id, and a few short
 * texts. There is no field a style, a URL scheme other than https, or markup
 * can travel in, so a profile cannot break the page or reach a visitor's
 * browser with anything but text and images Yavaya serves itself.
 *
 * Every write names the revision it was based on: a second window open on
 * the same profile gets a clear conflict instead of silently erasing the
 * first window's work.
 */

const SUBJECT = 'user_profile';

/** What each of a member's own photos is for; the serving route keeps all three to itself. */
export const IDENTITY_MEDIA_PURPOSES = {
  avatar: 'identity_avatar',
  cover: 'identity_cover',
  background: 'identity_background',
} as const;
export type IdentityPhotoSlot = keyof typeof IDENTITY_MEDIA_PURPOSES;
const PURPOSES = Object.values(IDENTITY_MEDIA_PURPOSES) as string[];

/** An upload this new is never pruned: another window may be about to use it. */
const PRUNE_GRACE_MINUTES = 30;

const R = PROFILE_STUDIO_RULES;

// --- Validation ------------------------------------------------------------------

const tuple = <T extends string>(values: readonly T[]) => values as unknown as [T, ...T[]];

/** Characters that never belong in a name or a sentence on a profile: controls, and the ones that reverse text to disguise it. */
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

const line = (max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(HIDDEN, '').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, { message: key }));

const paragraph = (max: number, key: string) =>
  z
    .string()
    .transform((value) =>
      value
        .replace(/\r\n?/g, '\n')
        .replace(HIDDEN, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().max(max, { message: key }));

const percent = z.number().int().min(0).max(100);
const focus = z.object({ x: percent, y: percent }).strict();
const designId = z.string().regex(/^[a-z0-9-]{3,80}$/, { message: 'studio.error.asset' });
const mediaId = z.string().uuid({ message: 'studio.error.media' });

/** https only, a real host name, no credentials: what a visitor clicks must go where it says. */
const link = z
  .object({
    label: line(R.linkLabelMaxLength, 'studio.error.link_label').pipe(z.string().min(1, { message: 'studio.error.link_label' })),
    url: z
      .string()
      .trim()
      .max(R.linkUrlMaxLength, { message: 'studio.error.link' })
      .transform((value, ctx) => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          ctx.addIssue({ code: 'custom', message: 'studio.error.link' });
          return z.NEVER;
        }
        const host = url.hostname;
        const literalIp = /^[\d.]+$/.test(host) || host.startsWith('[');
        if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || literalIp) {
          ctx.addIssue({ code: 'custom', message: 'studio.error.link' });
          return z.NEVER;
        }
        return url.toString();
      }),
  })
  .strict();

const backgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default') }).strict(),
  z.object({ kind: z.literal('asset'), asset: designId }).strict(),
  z.object({ kind: z.literal('solid'), solid: z.enum(tuple(STUDIO_SOLID_IDS)) }).strict(),
  z.object({ kind: z.literal('gradient'), gradient: z.enum(tuple(STUDIO_GRADIENT_IDS)) }).strict(),
  z.object({ kind: z.literal('upload'), media: mediaId }).strict(),
]);

const coverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default') }).strict(),
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('asset'), asset: designId }).strict(),
  z.object({ kind: z.literal('upload'), media: mediaId }).strict(),
]);

const ranged = (range: { min: number; max: number }) => z.number().int().min(range.min).max(range.max);

export const appearanceSchema = z
  .object({
    theme: designId.nullable(),
    surface: z.enum(tuple(STUDIO_SURFACE_IDS)),
    accent: z.enum(tuple(STUDIO_ACCENT_IDS)),
    card: z.enum(STUDIO_CARD_STYLES),
    opacity: ranged(STUDIO_OPACITY),
    border: z.enum(STUDIO_BORDERS),
    radius: z.enum(STUDIO_RADII),
    divider: z.enum(STUDIO_DIVIDERS),
    typography: z.enum(STUDIO_TYPOGRAPHY),
    header: z.enum(STUDIO_HEADERS),
    density: z.enum(STUDIO_DENSITIES),
    background: backgroundSchema,
    backgroundFocus: focus,
    backgroundDim: ranged(STUDIO_DIM),
    cover: coverSchema,
    coverFocus: focus,
    coverDim: ranged(STUDIO_DIM),
    avatar: z
      .object({
        media: mediaId.nullable(),
        zoom: ranged(STUDIO_ZOOM),
        focus,
        shape: z.enum(STUDIO_AVATAR_SHAPES),
        frame: designId.nullable(),
      })
      .strict(),
    decoration: z
      .object({
        asset: designId.nullable(),
        placement: z.enum(STUDIO_DECORATION_PLACEMENTS),
        intensity: ranged(STUDIO_INTENSITY),
      })
      .strict(),
  })
  .strict();

const moduleSchema = z
  .object({ id: z.enum(PROFILE_MODULES), visibility: z.enum(VISIBILITIES), collapsed: z.boolean() })
  .strict();

export const identitySchema = z
  .object({
    v: z.literal(1),
    appearance: appearanceSchema,
    content: z
      .object({
        headline: line(R.headlineMaxLength, 'studio.error.headline'),
        about: paragraph(R.aboutMaxLength, 'studio.error.about'),
        links: z.array(link).max(R.maxLinks, { message: 'studio.error.links' }),
        languages: z
          .array(z.enum(PROFILE_LANGUAGES))
          .max(R.maxLanguages, { message: 'studio.error.languages' })
          .refine((list) => new Set(list).size === list.length, { message: 'studio.error.languages' }),
      })
      .strict(),
    layout: z
      .object({
        mode: z.enum(PROFILE_MODES),
        featured: z.enum(PROFILE_MODULES).nullable(),
        modules: z
          .array(moduleSchema)
          .length(PROFILE_MODULES.length)
          // Every module exactly once: the order is the member's, the set is not.
          .refine((list) => new Set(list.map((m) => m.id)).size === PROFILE_MODULES.length, { message: 'studio.error.config' }),
      })
      .strict(),
    privacy: z
      .object({
        avatar: z.enum(['public', 'members']),
        cover: z.enum(['public', 'members']),
      })
      .strict(),
  })
  .strict();

/**
 * Rules between fields, applied after the shape is right. They correct
 * rather than refuse where the member's intent is plain: a banner header
 * always keeps enough shade under its words to read them, and a frame drawn
 * for a round photo makes the photo round.
 */
function harmonise(config: IdentityConfig): IdentityConfig {
  const appearance = { ...config.appearance };
  if (appearance.header === 'banner' && appearance.coverDim < STUDIO_BANNER_MIN_DIM) appearance.coverDim = STUDIO_BANNER_MIN_DIM;
  const frame = identityAsset(appearance.avatar.frame, 'frame');
  if (appearance.avatar.frame && !frame) throw errors.validation('studio.error.asset');
  if (frame?.frameShape === 'circle' && appearance.avatar.shape !== 'circle') appearance.avatar = { ...appearance.avatar, shape: 'circle' };
  if (frame?.frameShape === 'rounded' && appearance.avatar.shape !== 'rounded') appearance.avatar = { ...appearance.avatar, shape: 'rounded' };
  return { ...config, appearance };
}

/** Designs must exist in the library, be published, and be the kind the slot takes. */
function checkDesigns(appearance: IdentityAppearance): void {
  const picture = (id: string) => identityAsset(id, 'background') ?? identityAsset(id, 'cover');
  if (appearance.background.kind === 'asset' && !picture(appearance.background.asset)) throw errors.validation('studio.error.asset');
  if (appearance.cover.kind === 'asset' && !picture(appearance.cover.asset)) throw errors.validation('studio.error.asset');
  if (appearance.decoration.asset && !identityAsset(appearance.decoration.asset, 'decoration')) throw errors.validation('studio.error.asset');
}

/** The member's own photos named in a configuration, by what they are used as. */
export function photosIn(appearance: IdentityAppearance): Array<{ id: string; slot: IdentityPhotoSlot }> {
  const found: Array<{ id: string; slot: IdentityPhotoSlot }> = [];
  if (appearance.avatar.media) found.push({ id: appearance.avatar.media, slot: 'avatar' });
  if (appearance.cover.kind === 'upload') found.push({ id: appearance.cover.media, slot: 'cover' });
  if (appearance.background.kind === 'upload') found.push({ id: appearance.background.media, slot: 'background' });
  return found;
}

/** Each photo must be the member's own, still active, and uploaded for the slot it is used in. */
async function checkPhotos(executor: Executor, userId: string, appearance: IdentityAppearance): Promise<void> {
  const wanted = photosIn(appearance);
  if (wanted.length === 0) return;
  const rows = await executor
    .select({ id: media.id, purpose: media.purpose })
    .from(media)
    .where(and(inArray(media.id, wanted.map((p) => p.id)), eq(media.ownerUserId, userId), eq(media.status, 'active')));
  const purposeOf = new Map(rows.map((row) => [row.id, row.purpose]));
  for (const photo of wanted) {
    if (purposeOf.get(photo.id) !== IDENTITY_MEDIA_PURPOSES[photo.slot]) throw errors.validation('studio.error.media');
  }
}

/** The limit each message names, so the words always match the rule. */
const LIMIT_OF: Record<string, number> = {
  'studio.error.headline': R.headlineMaxLength,
  'studio.error.about': R.aboutMaxLength,
  'studio.error.links': R.maxLinks,
  'studio.error.languages': R.maxLanguages,
};

/** Parses what a member sent. Throws a DomainError naming the first thing wrong. */
export function parseIdentity(input: unknown): IdentityConfig {
  if (JSON.stringify(input ?? null).length > R.maxConfigBytes) throw errors.validation('studio.error.too_large');
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message;
    if (!key || !key.startsWith('studio.error.')) throw errors.validation('studio.error.config');
    throw errors.validation(key, LIMIT_OF[key] !== undefined ? { max: LIMIT_OF[key] } : {});
  }
  const config = harmonise(parsed.data as IdentityConfig);
  checkDesigns(config.appearance);
  return config;
}

/**
 * Reads a stored configuration for display. Stored copies were valid when
 * saved, but a design can be retired since: anything that no longer parses
 * falls back, section by section, to the default, so a profile always draws.
 */
export function readStoredIdentity(raw: unknown): IdentityConfig {
  if (!raw || typeof raw !== 'object') return defaultIdentity();
  try {
    return parseIdentity(raw);
  } catch {
    const fallback = defaultIdentity();
    const value = raw as Partial<IdentityConfig>;
    const section = <K extends keyof IdentityConfig>(key: K): IdentityConfig[K] => {
      try {
        return parseIdentity({ ...fallback, [key]: value[key] })[key];
      } catch {
        return fallback[key];
      }
    };
    const appearance = (() => {
      // Keep every look setting that still holds; drop only the design that went away.
      const merged: IdentityAppearance = { ...DEFAULT_APPEARANCE };
      const stored = (value.appearance ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_APPEARANCE) as Array<keyof IdentityAppearance>) {
        const candidates = [stored[key]];
        // A retired frame must not cost the member their photo: try the photo without it.
        if (key === 'avatar' && stored.avatar && typeof stored.avatar === 'object') candidates.push({ ...(stored.avatar as object), frame: null });
        for (const candidate of candidates) {
          try {
            parseIdentity({ ...fallback, appearance: { ...merged, [key]: candidate } });
            (merged as Record<string, unknown>)[key] = candidate;
            break;
          } catch {
            // keep the default for this setting
          }
        }
      }
      return merged;
    })();
    return { v: 1, appearance, content: section('content'), layout: section('layout'), privacy: section('privacy') };
  }
}

// --- Reading -------------------------------------------------------------------------

export type StudioState = {
  draft: IdentityConfig;
  published: IdentityConfig;
  /** True once the member has published at least once. */
  everPublished: boolean;
  /** True when the draft differs from what visitors see. */
  unpublished: boolean;
  revision: number;
  draftSavedAt: Date | null;
  publishedAt: Date | null;
  favorites: string[];
};

export async function studioState(executor: Executor, userId: string): Promise<StudioState> {
  const [row] = await executor
    .select({
      draft: userProfiles.identityDraft,
      published: userProfiles.identityPublished,
      revision: userProfiles.identityRevision,
      draftSavedAt: userProfiles.identityDraftSavedAt,
      publishedAt: userProfiles.identityPublishedAt,
      favorites: userProfiles.identityFavorites,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const published = readStoredIdentity(row?.published);
  const draft = row?.draft ? readStoredIdentity(row.draft) : published;
  return {
    draft,
    published,
    everPublished: Boolean(row?.published),
    unpublished: Boolean(row?.draft),
    revision: row?.revision ?? 0,
    draftSavedAt: row?.draftSavedAt ?? null,
    publishedAt: row?.publishedAt ?? null,
    favorites: (row?.favorites ?? []).filter((id) => identityAsset(id) !== null),
  };
}

/** What visitors see, with any photo that has since gone replaced by the default. */
export async function publishedIdentity(executor: Executor, userId: string): Promise<IdentityConfig> {
  const [row] = await executor.select({ published: userProfiles.identityPublished }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const config = readStoredIdentity(row?.published);
  const photos = photosIn(config.appearance);
  if (photos.length === 0) return config;
  const alive = await executor
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, photos.map((p) => p.id)), eq(media.ownerUserId, userId), eq(media.status, 'active')));
  const ok = new Set(alive.map((row) => row.id));
  const appearance = { ...config.appearance };
  if (appearance.avatar.media && !ok.has(appearance.avatar.media)) appearance.avatar = { ...appearance.avatar, media: null };
  if (appearance.cover.kind === 'upload' && !ok.has(appearance.cover.media)) appearance.cover = { kind: 'default' };
  if (appearance.background.kind === 'upload' && !ok.has(appearance.background.media)) appearance.background = { kind: 'default' };
  return { ...config, appearance };
}

// --- Writing ---------------------------------------------------------------------------

async function memberStatus(executor: Executor, userId: string): Promise<string> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  return user.status;
}

/** Drafts are the member's own business; anything visitors will see needs a member in good standing. */
async function requireStanding(executor: Executor, userId: string, purpose: 'draft' | 'publish'): Promise<void> {
  const status = await memberStatus(executor, userId);
  if (status === 'active') return;
  if (status === 'pending_verification') {
    if (purpose === 'draft') return;
    throw new DomainError('forbidden', 'studio.error.verify_email');
  }
  throw new DomainError('forbidden', 'studio.error.account_restricted');
}

/** Locks the member's profile row for this transaction, creating it if an old account never had one. */
async function lockRow(tx: Executor, userId: string) {
  await tx.insert(userProfiles).values({ userId }).onConflictDoNothing({ target: userProfiles.userId });
  const [row] = await tx
    .select({ revision: userProfiles.identityRevision, draft: userProfiles.identityDraft, published: userProfiles.identityPublished })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
    .for('update');
  return row!;
}

function checkRevision(current: number, base: number): void {
  if (!Number.isInteger(base) || base !== current) {
    throw new DomainError('conflict', 'studio.error.conflict', { details: { revision: current } });
  }
}

export async function saveIdentityDraft(
  tx: Executor,
  params: { userId: string; input: unknown; baseRevision: number; now?: Date },
): Promise<{ revision: number; savedAt: Date }> {
  await requireStanding(tx, params.userId, 'draft');
  const config = parseIdentity(params.input);
  const row = await lockRow(tx, params.userId);
  checkRevision(row.revision, params.baseRevision);
  await checkPhotos(tx, params.userId, config.appearance);
  const savedAt = params.now ?? new Date();
  const revision = row.revision + 1;
  await tx
    .update(userProfiles)
    .set({ identityDraft: config, identityRevision: revision, identityDraftSavedAt: savedAt, updatedAt: savedAt })
    .where(eq(userProfiles.userId, params.userId));
  return { revision, savedAt };
}

/** Who-sees-what, written into the audit record of every publication. */
function visibilitySummary(config: IdentityConfig) {
  return {
    photo: config.privacy.avatar,
    cover: config.privacy.cover,
    modules: Object.fromEntries(config.layout.modules.map((m) => [m.id, m.visibility])),
  };
}

export async function publishIdentity(
  tx: Executor,
  params: { userId: string; input: unknown; baseRevision: number; audit?: { ipHash?: string | null; userAgentHash?: string | null }; now?: Date },
): Promise<{ revision: number; publishedAt: Date }> {
  await requireStanding(tx, params.userId, 'publish');
  const config = parseIdentity(params.input);
  const row = await lockRow(tx, params.userId);
  checkRevision(row.revision, params.baseRevision);
  await checkPhotos(tx, params.userId, config.appearance);
  const before = row.published ? readStoredIdentity(row.published) : defaultIdentity();
  const publishedAt = params.now ?? new Date();
  const revision = row.revision + 1;
  // The photo and the bio are mirrored onto the profile row, where the rest
  // of the site can show them cheaply — the photo only when it is public.
  const publicPhoto = config.privacy.avatar === 'public' ? config.appearance.avatar.media : null;
  await tx
    .update(userProfiles)
    .set({
      identityPublished: config,
      identityDraft: null,
      identityRevision: revision,
      identityPublishedAt: publishedAt,
      identityDraftSavedAt: null,
      bio: config.content.about || null,
      avatarMediaId: publicPhoto,
      updatedAt: publishedAt,
    })
    .where(eq(userProfiles.userId, params.userId));
  const was = visibilitySummary(before);
  const now = visibilitySummary(config);
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'identity.profile_published',
    subjectType: SUBJECT,
    subjectId: params.userId,
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: {
      visibility: now,
      // Only what changed about who can see what: the part of a publication that matters later.
      visibilityChanged: JSON.stringify(was) !== JSON.stringify(now),
      mode: config.layout.mode,
      photo: Boolean(config.appearance.avatar.media),
      background: config.appearance.background.kind,
      cover: config.appearance.cover.kind,
    },
  });
  await pruneIdentityPhotos(tx, params.userId, { now: publishedAt });
  return { revision, publishedAt };
}

/** Throws the draft away: the Studio goes back to what visitors see. */
export async function discardIdentityDraft(
  tx: Executor,
  params: { userId: string; baseRevision: number; now?: Date },
): Promise<{ revision: number }> {
  const row = await lockRow(tx, params.userId);
  checkRevision(row.revision, params.baseRevision);
  const revision = row.revision + 1;
  await tx
    .update(userProfiles)
    .set({ identityDraft: null, identityDraftSavedAt: null, identityRevision: revision, updatedAt: params.now ?? new Date() })
    .where(eq(userProfiles.userId, params.userId));
  await pruneIdentityPhotos(tx, params.userId, { now: params.now });
  return { revision };
}

// --- Favourites --------------------------------------------------------------------------

export async function setFavorite(tx: Executor, params: { userId: string; assetId: string; on: boolean }): Promise<string[]> {
  if (!identityAsset(params.assetId)) throw errors.validation('studio.error.asset');
  await lockRow(tx, params.userId);
  const [row] = await tx.select({ favorites: userProfiles.identityFavorites }).from(userProfiles).where(eq(userProfiles.userId, params.userId)).limit(1);
  const current = (row?.favorites ?? []).filter((id) => identityAsset(id) !== null);
  const next = params.on ? [params.assetId, ...current.filter((id) => id !== params.assetId)] : current.filter((id) => id !== params.assetId);
  if (next.length > R.maxFavorites) throw errors.validation('studio.error.favorites_full', { max: R.maxFavorites });
  await tx.update(userProfiles).set({ identityFavorites: next }).where(eq(userProfiles.userId, params.userId));
  return next;
}

// --- Saved looks -------------------------------------------------------------------------

export type IdentityPreset = { id: string; name: string; appearance: IdentityAppearance; updatedAt: Date };

const presetName = line(R.presetNameMaxLength, 'studio.error.preset_name').pipe(z.string().min(1, { message: 'studio.error.preset_name' }));

function cleanPresetName(name: unknown): string {
  const parsed = presetName.safeParse(typeof name === 'string' ? name : '');
  if (!parsed.success) throw errors.validation('studio.error.preset_name', { max: R.presetNameMaxLength });
  return parsed.data;
}

/** Only the look: a saved look never carries the member's words or who-sees-what. */
function parseAppearance(input: unknown): IdentityAppearance {
  const fallback = defaultIdentity();
  return parseIdentity({ ...fallback, appearance: input }).appearance;
}

export async function listPresets(executor: Executor, userId: string): Promise<IdentityPreset[]> {
  const rows = await executor
    .select({ id: identityPresets.id, name: identityPresets.name, appearance: identityPresets.appearance, updatedAt: identityPresets.updatedAt })
    .from(identityPresets)
    .where(eq(identityPresets.userId, userId))
    .orderBy(asc(identityPresets.createdAt));
  return rows.map((row) => ({ ...row, appearance: readStoredIdentity({ ...defaultIdentity(), appearance: row.appearance }).appearance }));
}

export async function savePreset(tx: Executor, params: { userId: string; name: unknown; appearance: unknown }): Promise<IdentityPreset> {
  const name = cleanPresetName(params.name);
  const appearance = parseAppearance(params.appearance);
  await checkPhotos(tx, params.userId, appearance);
  await lockRow(tx, params.userId);
  const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(identityPresets).where(eq(identityPresets.userId, params.userId));
  if ((count?.n ?? 0) >= R.maxPresets) throw errors.validation('studio.error.presets_full', { max: R.maxPresets });
  const [created] = await tx
    .insert(identityPresets)
    .values({ userId: params.userId, name, appearance })
    .onConflictDoNothing({ target: [identityPresets.userId, identityPresets.name] })
    .returning({ id: identityPresets.id, name: identityPresets.name, updatedAt: identityPresets.updatedAt });
  if (!created) throw errors.conflict('studio.error.preset_exists');
  return { ...created, appearance };
}

export async function renamePreset(tx: Executor, params: { userId: string; presetId: string; name: unknown }): Promise<void> {
  const name = cleanPresetName(params.name);
  const [clash] = await tx
    .select({ id: identityPresets.id })
    .from(identityPresets)
    .where(and(eq(identityPresets.userId, params.userId), eq(identityPresets.name, name)))
    .limit(1);
  if (clash && clash.id !== params.presetId) throw errors.conflict('studio.error.preset_exists');
  const updated = await tx
    .update(identityPresets)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(identityPresets.id, params.presetId), eq(identityPresets.userId, params.userId)))
    .returning({ id: identityPresets.id });
  if (updated.length === 0) throw errors.notFound('identity_preset');
}

export async function deletePreset(tx: Executor, params: { userId: string; presetId: string; now?: Date }): Promise<void> {
  const removed = await tx
    .delete(identityPresets)
    .where(and(eq(identityPresets.id, params.presetId), eq(identityPresets.userId, params.userId)))
    .returning({ id: identityPresets.id });
  if (removed.length === 0) throw errors.notFound('identity_preset');
  await pruneIdentityPhotos(tx, params.userId, { now: params.now });
}

// --- The member's own photos ---------------------------------------------------------------

/** Every photo id the member's draft, published profile and saved looks still use. */
async function photosInUse(executor: Executor, userId: string): Promise<Set<string>> {
  const [row] = await executor
    .select({ draft: userProfiles.identityDraft, published: userProfiles.identityPublished })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const presets = await executor.select({ appearance: identityPresets.appearance }).from(identityPresets).where(eq(identityPresets.userId, userId));
  const used = new Set<string>();
  for (const raw of [row?.draft, row?.published]) {
    if (raw) for (const photo of photosIn(readStoredIdentity(raw).appearance)) used.add(photo.id);
  }
  for (const preset of presets) {
    for (const photo of photosIn(readStoredIdentity({ ...defaultIdentity(), appearance: preset.appearance }).appearance)) used.add(photo.id);
  }
  return used;
}

/**
 * Marks the member's profile photos that nothing uses any more as removed —
 * after a grace period, so a photo another window has just uploaded survives.
 * The objects themselves go with the rows, as for every image.
 */
export async function pruneIdentityPhotos(tx: Executor, userId: string, options: { now?: Date } = {}): Promise<number> {
  const cutoff = new Date((options.now ?? new Date()).getTime() - PRUNE_GRACE_MINUTES * 60_000);
  const candidates = await tx
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.ownerUserId, userId), eq(media.status, 'active'), inArray(media.purpose, PURPOSES), lt(media.createdAt, cutoff)));
  if (candidates.length === 0) return 0;
  const used = await photosInUse(tx, userId);
  const unused = candidates.map((row) => row.id).filter((id) => !used.has(id));
  await markRemoved(tx, unused);
  return unused.length;
}

/** Whether the member may store one more profile photo, pruning first if that makes room. */
export async function roomForPhoto(tx: Executor, userId: string, now = new Date()): Promise<void> {
  await requireStanding(tx, userId, 'publish');
  const count = async () => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(media)
      .where(and(eq(media.ownerUserId, userId), eq(media.status, 'active'), inArray(media.purpose, PURPOSES)));
    return row?.n ?? 0;
  };
  if ((await count()) < R.maxOwnPhotos) return;
  await pruneIdentityPhotos(tx, userId, { now });
  if ((await count()) >= R.maxOwnPhotos) throw errors.validation('studio.error.photos_full', { max: R.maxOwnPhotos });
}

/**
 * Who may see one of a member's profile photos. The owner always; anyone
 * else only when the published profile uses it, and then as its owner chose:
 * everyone, or members who have signed in. A draft photo is the owner's
 * alone, however its address was learnt.
 */
export async function identityPhotoAccess(
  executor: Executor,
  params: { mediaId: string; viewerUserId: string | null },
): Promise<'owner' | 'public' | 'members' | null> {
  const [row] = await executor
    .select({ owner: media.ownerUserId, purpose: media.purpose, status: media.status })
    .from(media)
    .where(eq(media.id, params.mediaId))
    .limit(1);
  if (!row || row.status !== 'active' || !PURPOSES.includes(row.purpose)) return null;
  if (params.viewerUserId === row.owner) return 'owner';
  const config = await publishedIdentity(executor, row.owner);
  const used = photosIn(config.appearance).find((photo) => photo.id === params.mediaId);
  if (!used) return null;
  const visibility = used.slot === 'avatar' ? config.privacy.avatar : config.privacy.cover;
  if (visibility === 'public') return 'public';
  return params.viewerUserId ? 'members' : null;
}

// --- Moderation -------------------------------------------------------------------------------

/**
 * A moderator puts a profile back to how Yavaya draws it: the published look,
 * the draft and the member's words go; their photos are taken down. The
 * member's listings, trust and everything else are untouched. Audited with
 * the moderator's note.
 */
export async function resetIdentityByModerator(
  tx: Executor,
  params: { actor: AuthContext | null; userId: string; note: string; now?: Date },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'moderation.content.remove');
  const note = params.note.replace(HIDDEN, '').trim().slice(0, 500);
  if (note.length < 3) throw errors.validation('studio.error.moderation_note');
  await lockRow(tx, params.userId);
  const now = params.now ?? new Date();
  const [row] = await tx
    .select({ revision: userProfiles.identityRevision })
    .from(userProfiles)
    .where(eq(userProfiles.userId, params.userId))
    .limit(1);
  await tx
    .update(userProfiles)
    .set({
      identityPublished: null,
      identityDraft: null,
      identityDraftSavedAt: null,
      identityPublishedAt: null,
      identityRevision: (row?.revision ?? 0) + 1,
      bio: null,
      avatarMediaId: null,
      updatedAt: now,
    })
    .where(eq(userProfiles.userId, params.userId));
  await tx.delete(identityPresets).where(eq(identityPresets.userId, params.userId));
  const photos = await tx
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.ownerUserId, params.userId), eq(media.status, 'active'), inArray(media.purpose, PURPOSES)));
  await markRemoved(tx, photos.map((p) => p.id));
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: 'identity.profile_reset',
    subjectType: SUBJECT,
    subjectId: params.userId,
    metadata: { note, photosRemoved: photos.length },
  });
  // A member whose profile changed under them is told, and taken to the Studio.
  await notify(tx, [
    { userId: params.userId, category: 'moderation', type: 'identity.profile_reset', titleKey: 'notify.moderation.profile_reset', href: '/account/profile' },
  ]);
}
