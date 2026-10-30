'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { errors, isDomainError, toClientError } from '@/server/errors';
import { formatYayId } from '@/server/domains/identity/yay-id';
import {
  deletePreset,
  discardIdentityDraft,
  listPresets,
  publishIdentity,
  renamePreset,
  saveIdentityDraft,
  savePreset,
  setFavorite,
  type IdentityPreset,
} from '@/server/domains/identity/studio';

/**
 * The Identity Studio's actions. Each one checks who is asking on the
 * server — the Studio's own page is never trusted to have done it — and
 * answers with a plain result the Studio can show: what was saved, or the
 * one thing that was wrong, in the member's language.
 *
 * Server Actions carry Next's own same-origin check, so another site cannot
 * submit them on a member's behalf.
 */

export type StudioResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string; revision?: number };

async function fail(error: unknown): Promise<{ ok: false; code: string; message: string; revision?: number }> {
  const { t } = await getTranslator();
  const client = toClientError(error);
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(client.details)) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
  }
  const revision = isDomainError(error) && typeof error.details.revision === 'number' ? error.details.revision : undefined;
  return { ok: false, code: client.code, message: t(client.messageKey as MessageKey, params), ...(revision !== undefined ? { revision } : {}) };
}

async function member() {
  const session = await currentSession();
  if (!session) throw errors.unauthenticated();
  return session.user;
}

export async function saveDraftAction(input: unknown, baseRevision: number): Promise<StudioResult<{ revision: number; savedAt: string }>> {
  try {
    const user = await member();
    const limit = await consumeRateLimit(db(), RATE_LIMITS.identityDraft, `user:${user.userId}`);
    if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);
    const result = await db().transaction((tx) => saveIdentityDraft(tx, { userId: user.userId, input, baseRevision }));
    return { ok: true, revision: result.revision, savedAt: result.savedAt.toISOString() };
  } catch (error) {
    return fail(error);
  }
}

export async function publishAction(input: unknown, baseRevision: number): Promise<StudioResult<{ revision: number; publishedAt: string }>> {
  try {
    const user = await member();
    const limit = await consumeRateLimit(db(), RATE_LIMITS.identityPublish, `user:${user.userId}`);
    if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);
    const context = await requestContext();
    const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
    const result = await db().transaction((tx) => publishIdentity(tx, { userId: user.userId, input, baseRevision, audit }));
    revalidatePath(`/members/${formatYayId(user.yayId)}`);
    return { ok: true, revision: result.revision, publishedAt: result.publishedAt.toISOString() };
  } catch (error) {
    return fail(error);
  }
}

export async function discardDraftAction(baseRevision: number): Promise<StudioResult<{ revision: number }>> {
  try {
    const user = await member();
    const result = await db().transaction((tx) => discardIdentityDraft(tx, { userId: user.userId, baseRevision }));
    return { ok: true, revision: result.revision };
  } catch (error) {
    return fail(error);
  }
}

export async function favoriteAction(assetId: string, on: boolean): Promise<StudioResult<{ favorites: string[] }>> {
  try {
    const user = await member();
    const favorites = await db().transaction((tx) => setFavorite(tx, { userId: user.userId, assetId: String(assetId), on: Boolean(on) }));
    return { ok: true, favorites };
  } catch (error) {
    return fail(error);
  }
}

type PresetView = Pick<IdentityPreset, 'id' | 'name' | 'appearance'>;
const view = (presets: IdentityPreset[]): PresetView[] => presets.map(({ id, name, appearance }) => ({ id, name, appearance }));

export async function savePresetAction(name: string, appearance: unknown): Promise<StudioResult<{ presets: PresetView[] }>> {
  try {
    const user = await member();
    await db().transaction((tx) => savePreset(tx, { userId: user.userId, name, appearance }));
    return { ok: true, presets: view(await listPresets(db(), user.userId)) };
  } catch (error) {
    return fail(error);
  }
}

export async function renamePresetAction(presetId: string, name: string): Promise<StudioResult<{ presets: PresetView[] }>> {
  try {
    const user = await member();
    await db().transaction((tx) => renamePreset(tx, { userId: user.userId, presetId: String(presetId), name }));
    return { ok: true, presets: view(await listPresets(db(), user.userId)) };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePresetAction(presetId: string): Promise<StudioResult<{ presets: PresetView[] }>> {
  try {
    const user = await member();
    await db().transaction((tx) => deletePreset(tx, { userId: user.userId, presetId: String(presetId) }));
    return { ok: true, presets: view(await listPresets(db(), user.userId)) };
  } catch (error) {
    return fail(error);
  }
}
