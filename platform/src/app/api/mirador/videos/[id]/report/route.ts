import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { MIRADOR_REPORT_CATEGORIES, reportVideo, type MiradorReportCategory } from '@/server/domains/mirador/videos';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

/** A member reports a video: a moderation ticket, and the video hidden for review after enough reporters. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { category?: unknown; description?: unknown } | null;
  const category = (MIRADOR_REPORT_CATEGORIES as readonly string[]).includes(String(body?.category)) ? (String(body?.category) as MiradorReportCategory) : null;
  if (!category) return json({ ok: false, error: 'error.validation_failed' }, 400);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.slow_down' }, 429);
  try {
    const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 1000) || null : null;
    const result = await db().transaction(async (tx) => reportVideo(tx, { userId: who.userId!, videoId: (await params).id, category, description }));
    return json({ ok: true, ...result });
  } catch (error) {
    return refusal(error, 'mirador.report');
  }
}
