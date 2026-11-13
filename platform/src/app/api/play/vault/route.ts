import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { buyVaultBundle, buyVaultProduct, vaultCatalogue } from '@/server/domains/play/vault';
import { playProgressOf } from '@/server/domains/play/progress';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

const KEY = /^[a-z0-9_]{1,60}$/;

/**
 * Buys one product of the Vault, or a whole collection, for gems (docs/PLAY.md,
 * "The Vault"). `acknowledged` is the buyer's confirmation of the disclosure;
 * the server asks for it again for anything not usable yet, whatever the
 * page showed.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { product?: unknown; collection?: unknown; acknowledged?: unknown } | null;
  const product = typeof body?.product === 'string' && KEY.test(body.product) ? body.product : null;
  const collection = typeof body?.collection === 'string' && KEY.test(body.collection) ? body.collection : null;
  if (!product === !collection) return NextResponse.json({ error: 'input' }, { status: 400 });
  const acknowledged = body?.acknowledged === true;
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playShop, `play:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const result = await db().transaction((tx) => (product ? buyVaultProduct(tx, userId, product, acknowledged) : buyVaultBundle(tx, userId, collection!, acknowledged)));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
  const gems = (await playProgressOf(db(), userId)).gems;
  const owned = (await vaultCatalogue(db(), 'es', userId)).owned;
  return NextResponse.json({ ok: true, edition: 'edition' in result ? result.edition : null, gems, owned });
}
