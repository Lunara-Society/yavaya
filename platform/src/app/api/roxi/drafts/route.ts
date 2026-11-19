import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { MEDIA_RULES, MERCADITO_RULES } from '@/config/business-rules';
import { sameOrigin } from '@/app/api/go/upload';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { toClientError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { mediaStorageAvailability } from '@/server/domains/media/storage';
import { createListingDraft, getListingDraft, ROXI_DRAFT_PURPOSE, roxiReviewOn } from '@/server/domains/roxi/drafts';
import { json, member } from '../shared';
import { draftView } from './view';

export const dynamic = 'force-dynamic';

/**
 * The listing Roxi is drafting with the member (docs/roxi/FLAGSHIP.md).
 *
 * GET: the draft waiting, if any, so the panel can offer it again on any
 * device. POST: a new draft from what Roxi wrote and the photos the member
 * sent her, replacing the previous one. Nothing is published here; the
 * member does that from the form.
 */
export async function GET() {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false }, 401);
  if (limited) return json({ ok: false }, 429);
  if (!(await roxiReviewOn(db(), session.user.userId))) return json({ ok: false, error: 'off' }, 404);
  const draft = await getListingDraft(db(), { userId: session.user.userId });
  if (!draft) return json({ ok: true, draft: null });
  const { t, locale } = await getTranslator();
  return json({ ok: true, draft: await draftView(db(), draft, t, locale) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session } = await member();
  if (!session) return json({ ok: false }, 401);
  const userId = session.user.userId;
  if (!(await roxiReviewOn(db(), userId))) return json({ ok: false, error: 'off' }, 404);
  // Without storage there is nowhere to keep photos: the panel falls back to filling the form in this tab.
  if (!mediaStorageAvailability().available) return json({ ok: false, error: 'unavailable' }, 503);

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MERCADITO_RULES.maxPhotos * MEDIA_RULES.maxUploadBytes + 1024 * 1024) return json({ ok: false, error: 'too_large' }, 413);

  const limit = await consumeRateLimit(db(), RATE_LIMITS.roxiDraft, `user:${userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'too_many' }, 429);

  let form: FormData;
  let fields: Record<string, unknown>;
  try {
    form = await request.formData();
    const parsed = JSON.parse(String(form.get('fields') ?? '{}')) as unknown;
    fields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MERCADITO_RULES.maxPhotos || files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) {
    return json({ ok: false, error: 'too_large' }, 413);
  }

  const { t, locale } = await getTranslator();
  let stored: StoredImage[] = [];
  try {
    stored = await storeImages({
      ownerUserId: userId,
      purpose: ROXI_DRAFT_PURPOSE,
      files: await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))),
    });
    const continueId = String(form.get('continue') ?? '') || undefined;
    const { draft, dropped } = await db().transaction((tx) => createListingDraft(tx, { userId, fields, images: stored, continueId }));
    await discardStored(dropped.map((storageKey) => ({ storageKey })));
    return json({ ok: true, draft: await draftView(db(), draft, t, locale) });
  } catch (error) {
    await discardStored(stored);
    const client = toClientError(error);
    return json({ ok: false, error: client.code, message: t(client.messageKey as MessageKey) }, client.code === 'internal' ? 500 : 400);
  }
}
