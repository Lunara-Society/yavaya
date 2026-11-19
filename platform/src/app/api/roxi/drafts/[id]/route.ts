import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { sameOrigin } from '@/app/api/go/upload';
import { toClientError } from '@/server/errors';
import { discardStored } from '@/server/domains/media/service';
import { discardListingDraft, getListingDraft, roxiReviewOn, updateListingDraft } from '@/server/domains/roxi/drafts';
import { json, member } from '../../shared';
import { draftView } from '../view';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** One draft: read it (the review card), change it (the member's own edits on the card), or throw it away. Its owner only. */
export async function GET(_request: Request, { params }: Params) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false }, 401);
  if (limited) return json({ ok: false }, 429);
  if (!(await roxiReviewOn(db(), session.user.userId))) return json({ ok: false, error: 'off' }, 404);
  const draft = await getListingDraft(db(), { userId: session.user.userId, id: (await params).id });
  // Gone: published, discarded, expired, or never this member's. The card says so; it does not say which.
  if (!draft) return json({ ok: true, draft: null });
  const { t, locale } = await getTranslator();
  return json({ ok: true, draft: await draftView(db(), draft, t, locale) });
}

export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false }, 401);
  if (limited) return json({ ok: false }, 429);
  const userId = session.user.userId;
  if (!(await roxiReviewOn(db(), userId))) return json({ ok: false, error: 'off' }, 404);
  const body = (await request.json().catch(() => null)) as { fields?: unknown; removePhotos?: unknown } | null;
  const fields = body?.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? (body.fields as Record<string, unknown>) : undefined;
  const removePhotoIds = Array.isArray(body?.removePhotos) ? body.removePhotos.filter((id): id is string => typeof id === 'string').slice(0, 12) : undefined;
  try {
    const { id } = await params;
    const { draft, dropped } = await db().transaction((tx) => updateListingDraft(tx, { userId, id, fields, removePhotoIds }));
    await discardStored(dropped.map((storageKey) => ({ storageKey })));
    const { t, locale } = await getTranslator();
    return json({ ok: true, draft: await draftView(db(), draft, t, locale) });
  } catch (error) {
    const client = toClientError(error);
    return json({ ok: false, error: client.code }, client.code === 'not_found' ? 404 : 400);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session } = await member();
  if (!session) return json({ ok: false }, 401);
  try {
    const { id } = await params;
    const dropped = await db().transaction((tx) => discardListingDraft(tx, { userId: session.user.userId, id }));
    await discardStored(dropped.map((storageKey) => ({ storageKey })));
    return json({ ok: true });
  } catch (error) {
    const client = toClientError(error);
    return json({ ok: false, error: client.code }, client.code === 'not_found' ? 404 : 400);
  }
}
