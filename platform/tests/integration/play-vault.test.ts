import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { vaultProducts } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { setLook } from '@/server/domains/platform/looks';
import { creditGems, ownedItems, playProgressOf } from '@/server/domains/play/progress';
import { buyVaultBundle, buyVaultProduct, editVaultProduct, returnVaultProduct, vaultCatalogue } from '@/server/domains/play/vault';
import { resetTransactionalData } from '../helpers/database';

// A different address each: registering many at once from one is rightly limited.
const context = () => ({ networkHash: null, addressHash: `vault-test-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'vitest' });

beforeEach(resetTransactionalData);
afterAll(async () => {
  await db().update(vaultProducts).set({ editionSize: 500 }).where(eq(vaultProducts.key, 'outfit_obsidiana'));
  await closeDb();
});

async function player(gems = 0) {
  const { userId } = await register(
    db(),
    { email: `vault-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Coleccionista', locale: 'es', acceptedTerms: true },
    context(),
  );
  if (gems) await db().transaction((tx) => creditGems(tx, userId, gems, `pay_${crypto.randomUUID()}`));
  return userId;
}

async function owner() {
  const userId = await player();
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  return { userId, status: 'active' };
}

async function collectibles(enabled: boolean) {
  const actor = await owner();
  await db().transaction((tx) => setLook(tx, { actor, key: 'vault_collectibles', enabled }));
}

const buy = (userId: string, key: string, acknowledged = false) => db().transaction((tx) => buyVaultProduct(tx, userId, key, acknowledged));

describe('The Vault', () => {
  it('sells a wearable edition for gems, numbered, and the look comes with it', async () => {
    const a = await player(2000);
    const b = await player(2000);
    expect(await ownedItems(db(), a)).not.toContain('top:legado_obsidiana');
    expect(await buy(a, 'outfit_obsidiana')).toEqual({ ok: true, edition: 1 });
    expect(await buy(b, 'outfit_obsidiana')).toEqual({ ok: true, edition: 2 });
    expect(await buy(a, 'outfit_obsidiana')).toEqual({ ok: false, reason: 'owned' });
    expect((await playProgressOf(db(), a)).gems).toBe(2000 - 499);
    expect(await ownedItems(db(), a)).toContain('top:legado_obsidiana');
    const catalogue = await vaultCatalogue(db(), 'es', a);
    expect(catalogue.products.find((p) => p.key === 'outfit_obsidiana')?.sold).toBe(2);
    expect(catalogue.owned).toEqual([expect.objectContaining({ product: 'outfit_obsidiana', edition: 1, price: 499 })]);
  });

  it('never sells more copies than the edition has, even all at once', async () => {
    const actor = await owner();
    const edit = await db().transaction(async (tx) => {
      const [p] = await tx.select().from(vaultProducts).where(eq(vaultProducts.key, 'outfit_obsidiana'));
      return editVaultProduct(tx, actor, 'outfit_obsidiana', { priceGems: p!.priceGems, status: 'available', onSale: true, editionSize: 3, mode: p!.mode, nameEs: p!.nameEs, nameEn: p!.nameEn, lineEs: p!.lineEs, lineEn: p!.lineEn, collectionKey: p!.collectionKey, lookItem: p!.lookItem });
    });
    expect(edit).toEqual({ ok: true });
    const buyers = await Promise.all(Array.from({ length: 6 }, () => player(1000)));
    const results = await Promise.all(buyers.map((u) => buy(u, 'outfit_obsidiana')));
    const sold = results.filter((r) => r.ok);
    expect(sold).toHaveLength(3);
    expect(sold.map((r) => (r.ok ? r.edition : 0)).sort()).toEqual([1, 2, 3]);
    expect(results.filter((r) => !r.ok)).toEqual(Array(3).fill({ ok: false, reason: 'sold_out' }));
    // Nobody refused was charged.
    const charged = await Promise.all(buyers.map(async (u) => (await playProgressOf(db(), u)).gems));
    expect(charged.filter((g) => g === 1000)).toHaveLength(3);
    // And an edition cannot be shrunk below what is sold.
    const shrink = await db().transaction(async (tx) => {
      const [p] = await tx.select().from(vaultProducts).where(eq(vaultProducts.key, 'outfit_obsidiana'));
      return editVaultProduct(tx, actor, 'outfit_obsidiana', { priceGems: p!.priceGems, status: 'available', onSale: true, editionSize: 2, mode: p!.mode, nameEs: p!.nameEs, nameEn: p!.nameEn, lineEs: p!.lineEs, lineEn: p!.lineEn, collectionKey: p!.collectionKey, lookItem: p!.lookItem });
    });
    expect(shrink).toEqual({ ok: false, reason: 'too_small' });
  });

  it('keeps pieces not usable yet off sale until the owner opens them, then only with the notice confirmed', async () => {
    const a = await player(5000);
    await collectibles(false);
    expect(await buy(a, 'crown_oro', true)).toEqual({ ok: false, reason: 'closed' });
    await collectibles(true);
    expect(await buy(a, 'crown_oro', false)).toEqual({ ok: false, reason: 'unacknowledged' });
    const bought = await buy(a, 'crown_oro', true);
    expect(bought.ok).toBe(true);
    // Owned, but nothing to wear yet.
    expect((await vaultCatalogue(db(), 'es', a)).owned.map((o) => o.product)).toContain('crown_oro');
    await collectibles(false);
  });

  it('gives back the gems for a piece not usable yet, and its number goes back on sale', async () => {
    const a = await player(5000);
    const b = await player(5000);
    await collectibles(true);
    const first = await buy(a, 'crown_oro', true);
    expect(first).toEqual({ ok: true, edition: 1 });
    const before = (await playProgressOf(db(), a)).gems;
    const back = await db().transaction((tx) => returnVaultProduct(tx, a, 'crown_oro'));
    expect(back.ok).toBe(true);
    expect((await playProgressOf(db(), a)).gems).toBe(5000);
    expect(before).toBeLessThan(5000);
    expect(await buy(b, 'crown_oro', true)).toEqual({ ok: true, edition: 1 });
    // A wearable piece is not returned this way.
    await buy(a, 'outfit_sombra');
    expect(await db().transaction((tx) => returnVaultProduct(tx, a, 'outfit_sombra'))).toEqual({ ok: false, reason: 'not_returnable' });
    await collectibles(false);
  });

  it('sells a whole collection for its bundle price, only to someone who owns none of it', async () => {
    const a = await player(5000);
    const b = await player(5000);
    await collectibles(true);
    expect(await db().transaction((tx) => buyVaultBundle(tx, a, 'legado_obsidiana', false))).toEqual({ ok: false, reason: 'unacknowledged' });
    expect(await db().transaction((tx) => buyVaultBundle(tx, a, 'legado_obsidiana', true))).toEqual({ ok: true });
    expect((await playProgressOf(db(), a)).gems).toBe(5000 - 1499);
    const owned = (await vaultCatalogue(db(), 'es', a)).owned;
    expect(owned.reduce((sum, o) => sum + o.price, 0)).toBe(1499);
    await buy(b, 'outfit_obsidiana');
    expect(await db().transaction((tx) => buyVaultBundle(tx, b, 'legado_obsidiana', true))).toEqual({ ok: false, reason: 'owned_some' });
    await collectibles(false);
  });

  it('prices every special piece above every ordinary exclusive look, and never gives one away', async () => {
    const { PLAY_RULES } = await import('@/config/business-rules');
    const catalogue = await vaultCatalogue(db(), 'es', null, { all: true });
    const cheapest = Math.min(...catalogue.products.map((p) => p.price));
    expect(cheapest).toBeGreaterThan(Math.max(...Object.values(PLAY_RULES.gems)));
    expect(catalogue.products.filter((p) => p.status === 'available').map((p) => p.key).sort()).toEqual(['outfit_obsidiana', 'outfit_sombra']);
  });
});
