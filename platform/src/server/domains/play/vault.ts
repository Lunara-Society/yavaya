import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Executor, Transaction } from '@/server/db/client';
import { playProgress, playRewards, vaultCollections, vaultOwned, vaultProducts } from '@/server/db/schema';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { recordAudit } from '@/server/domains/audit/service';
import { lookEnabled } from '@/server/domains/platform/looks';
import { LOOK_OPTIONS, LOOK_PARTS, type LookPart } from '@/config/play-looks';
import { lockProgress } from './progress';

/**
 * The Vault (docs/PLAY.md, "The Vault"): premium looks and collectibles for
 * gems. Every product says honestly what it is now:
 *
 *   available    worn or used today;
 *   collectible  owned now, usable once its art for the character exists;
 *   future       owned now, usable when its game mode exists (no date promised).
 *
 * Products that cannot be used yet are sold only while the owner's switch
 * says so (`vault_collectibles`, off until the refund terms are approved),
 * and only to a buyer who has read and confirmed the disclosure. Until it
 * becomes usable, such a product can be returned for its gems at any time.
 *
 * Numbered editions are sold under a lock on the product's row: the count
 * and the next free number are read and taken in one transaction, so an
 * edition can never be oversold or a number given twice (the unique index
 * on product and number is the last guard).
 */

export const VAULT_STATUSES = ['available', 'collectible', 'future'] as const;
export type VaultStatus = (typeof VAULT_STATUSES)[number];
/** The game modes future products wait for (their words: `play.vault.mode.<mode>`). */
export const VAULT_MODES = ['companeros', 'carreras', 'vuelo', 'arena', 'perfil', 'plaza', 'efectos'] as const;

export type VaultProductView = {
  key: string;
  collection: string | null;
  category: string;
  name: string;
  line: string;
  image: string;
  price: number;
  status: VaultStatus;
  mode: string | null;
  lookItem: string | null;
  editionSize: number | null;
  /** Copies sold (counted from what players own), for a true remaining count. */
  sold: number;
  onSale: boolean;
};
export type VaultCollectionView = { key: string; name: string; line: string; bundle: number | null; onSale: boolean };
export type VaultOwnedView = { product: string; edition: number | null; price: number; via: string };

export async function vaultCatalogue(executor: Executor, locale: 'es' | 'en', userId: string | null, options: { all?: boolean } = {}) {
  const collections = await executor.select().from(vaultCollections).orderBy(asc(vaultCollections.sort));
  const products = await executor.select().from(vaultProducts).orderBy(asc(vaultProducts.sort));
  const sold = await executor.select({ key: vaultOwned.productKey, n: count() }).from(vaultOwned).groupBy(vaultOwned.productKey);
  const soldBy = new Map(sold.map((row) => [row.key, row.n]));
  const owned = userId ? await executor.select().from(vaultOwned).where(eq(vaultOwned.userId, userId)) : [];
  const es = locale === 'es';
  return {
    collections: collections.filter((c) => options.all || c.onSale).map((c): VaultCollectionView => ({ key: c.key, name: es ? c.nameEs : c.nameEn, line: es ? c.lineEs : c.lineEn, bundle: c.bundleGems, onSale: c.onSale })),
    products: products
      .filter((p) => options.all || p.onSale || owned.some((o) => o.productKey === p.key))
      .map(
        (p): VaultProductView => ({
          key: p.key,
          collection: p.collectionKey,
          category: p.category,
          name: es ? p.nameEs : p.nameEn,
          line: es ? p.lineEs : p.lineEn,
          image: `/play/vault/${p.image}`,
          price: p.priceGems,
          status: p.status as VaultStatus,
          mode: p.mode,
          lookItem: p.lookItem,
          editionSize: p.editionSize,
          sold: soldBy.get(p.key) ?? 0,
          onSale: p.onSale,
        }),
      ),
    owned: owned.map((o): VaultOwnedView => ({ product: o.productKey, edition: o.editionNumber, price: o.priceGems, via: o.via })),
  };
}

export type VaultRefusal = 'not_found' | 'not_sold' | 'owned' | 'owned_some' | 'sold_out' | 'closed' | 'unacknowledged' | 'gems' | 'not_returnable';

/** Takes the next free number of a numbered edition, under the product row's lock (taken by the caller). */
async function nextEdition(tx: Transaction, product: { key: string; editionSize: number | null }): Promise<number | null | 'sold_out'> {
  const taken = await tx.select({ n: vaultOwned.editionNumber }).from(vaultOwned).where(eq(vaultOwned.productKey, product.key));
  if (!product.editionSize) return null;
  if (taken.length >= product.editionSize) return 'sold_out';
  const used = new Set(taken.map((t) => t.n));
  for (let n = 1; n <= product.editionSize; n += 1) if (!used.has(n)) return n;
  return 'sold_out';
}

async function spendGems(tx: Transaction, userId: string, gems: number, ref: string): Promise<boolean> {
  const totals = await lockProgress(tx, userId);
  if (totals.gems < gems) return false;
  await tx.insert(playRewards).values({ userId, reason: 'vault', ref, gems: -gems });
  await tx.update(playProgress).set({ gems: totals.gems - gems, updatedAt: new Date() }).where(eq(playProgress.userId, userId));
  return true;
}

export async function buyVaultProduct(tx: Transaction, userId: string, key: string, acknowledged: boolean): Promise<{ ok: true; edition: number | null } | { ok: false; reason: VaultRefusal }> {
  const [product] = await tx.select().from(vaultProducts).where(eq(vaultProducts.key, key)).for('update');
  if (!product) return { ok: false, reason: 'not_found' };
  if (!product.onSale) return { ok: false, reason: 'not_sold' };
  if (product.status !== 'available') {
    if (!(await lookEnabled(tx, 'vault_collectibles'))) return { ok: false, reason: 'closed' };
    if (!acknowledged) return { ok: false, reason: 'unacknowledged' };
  }
  const [have] = await tx.select({ key: vaultOwned.productKey }).from(vaultOwned).where(and(eq(vaultOwned.userId, userId), eq(vaultOwned.productKey, key))).limit(1);
  if (have) return { ok: false, reason: 'owned' };
  const edition = await nextEdition(tx, product);
  if (edition === 'sold_out') return { ok: false, reason: 'sold_out' };
  if (!(await spendGems(tx, userId, product.priceGems, `${key}:${randomUUID()}`))) return { ok: false, reason: 'gems' };
  await tx.insert(vaultOwned).values({ userId, productKey: key, editionNumber: edition, priceGems: product.priceGems, via: 'item', acknowledged: product.status !== 'available' });
  return { ok: true, edition };
}

/** A whole collection at its bundle price, for a player who owns none of it yet. */
export async function buyVaultBundle(tx: Transaction, userId: string, collectionKey: string, acknowledged: boolean): Promise<{ ok: true } | { ok: false; reason: VaultRefusal }> {
  const [collection] = await tx.select().from(vaultCollections).where(eq(vaultCollections.key, collectionKey)).for('update');
  if (!collection || !collection.bundleGems) return { ok: false, reason: 'not_found' };
  if (!collection.onSale) return { ok: false, reason: 'not_sold' };
  const products = await tx.select().from(vaultProducts).where(and(eq(vaultProducts.collectionKey, collectionKey), eq(vaultProducts.onSale, true))).orderBy(asc(vaultProducts.key)).for('update');
  if (!products.length) return { ok: false, reason: 'not_found' };
  if (products.some((p) => p.status !== 'available')) {
    if (!(await lookEnabled(tx, 'vault_collectibles'))) return { ok: false, reason: 'closed' };
    if (!acknowledged) return { ok: false, reason: 'unacknowledged' };
  }
  const have = await tx.select({ key: vaultOwned.productKey }).from(vaultOwned).where(and(eq(vaultOwned.userId, userId), inArray(vaultOwned.productKey, products.map((p) => p.key))));
  if (have.length) return { ok: false, reason: 'owned_some' };
  const editions = new Map<string, number | null>();
  for (const p of products) {
    const n = await nextEdition(tx, p);
    if (n === 'sold_out') return { ok: false, reason: 'sold_out' };
    editions.set(p.key, n);
  }
  if (!(await spendGems(tx, userId, collection.bundleGems, `bundle:${collectionKey}:${randomUUID()}`))) return { ok: false, reason: 'gems' };
  // Each item carries its share of the bundle's price: what a return gives back.
  const full = products.reduce((sum, p) => sum + p.priceGems, 0);
  let left = collection.bundleGems;
  products.forEach((p, i) => {
    const share = i === products.length - 1 ? left : Math.floor((collection.bundleGems! * p.priceGems) / full);
    left -= share;
    p.priceGems = share;
  });
  await tx.insert(vaultOwned).values(products.map((p) => ({ userId, productKey: p.key, editionNumber: editions.get(p.key) ?? null, priceGems: p.priceGems, via: `bundle:${collectionKey}`, acknowledged: p.status !== 'available' })));
  return { ok: true };
}

/**
 * A product not usable yet, returned: its gems back, its number back in the
 * stock. Once a product becomes usable it can no longer be returned this way.
 */
export async function returnVaultProduct(tx: Transaction, userId: string, key: string): Promise<{ ok: true; gems: number } | { ok: false; reason: VaultRefusal }> {
  const [product] = await tx.select().from(vaultProducts).where(eq(vaultProducts.key, key)).for('update');
  if (!product) return { ok: false, reason: 'not_found' };
  if (product.status === 'available') return { ok: false, reason: 'not_returnable' };
  const [row] = await tx.delete(vaultOwned).where(and(eq(vaultOwned.userId, userId), eq(vaultOwned.productKey, key))).returning();
  if (!row) return { ok: false, reason: 'not_found' };
  const totals = await lockProgress(tx, userId);
  await tx.insert(playRewards).values({ userId, reason: 'vault_return', ref: `${key}:${randomUUID()}`, gems: row.priceGems });
  await tx.update(playProgress).set({ gems: totals.gems + row.priceGems, updatedAt: new Date() }).where(eq(playProgress.userId, userId));
  await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'play.vault_return', subjectType: 'vault_product', subjectId: key, metadata: { gems: row.priceGems, edition: row.editionNumber } });
  return { ok: true, gems: row.priceGems };
}

// --- Admin ---------------------------------------------------------------------------------------

export type ProductEdit = { priceGems: number; status: VaultStatus; onSale: boolean; editionSize: number | null; mode: string | null; nameEs: string; nameEn: string; lineEs: string; lineEn: string; collectionKey: string | null; lookItem: string | null };

function validLookItem(item: string | null): boolean {
  if (!item) return true;
  const [part, id] = item.split(':');
  // Only a look made for the Vault: a product must never sell what is free or won elsewhere.
  return (LOOK_PARTS as readonly string[]).includes(part ?? '') && LOOK_OPTIONS[part as LookPart].some((o) => o.id === id && o.unlock === 'vault');
}

/** Changes a product (flags.manage). A numbered edition cannot be made smaller than what is already sold. */
export async function editVaultProduct(tx: Transaction, actor: AuthContext | null, key: string, edit: ProductEdit, create = false): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'too_small' | 'exists' | 'not_found' }> {
  const who = await requirePermission(tx, actor, 'flags.manage');
  if (!/^[a-z0-9_]{2,40}$/.test(key) || !Number.isInteger(edit.priceGems) || edit.priceGems < 1 || edit.priceGems > 100000) return { ok: false, reason: 'invalid' };
  if (!(VAULT_STATUSES as readonly string[]).includes(edit.status)) return { ok: false, reason: 'invalid' };
  if (edit.mode && !(VAULT_MODES as readonly string[]).includes(edit.mode)) return { ok: false, reason: 'invalid' };
  if (edit.editionSize !== null && (!Number.isInteger(edit.editionSize) || edit.editionSize < 1)) return { ok: false, reason: 'invalid' };
  if (!edit.nameEs.trim() || !edit.nameEn.trim() || !validLookItem(edit.lookItem)) return { ok: false, reason: 'invalid' };
  // Only a product that unlocks a real look can be sold as wearable now.
  if (edit.status === 'available' && !edit.lookItem) return { ok: false, reason: 'invalid' };
  const [existing] = await tx.select().from(vaultProducts).where(eq(vaultProducts.key, key)).for('update');
  if (create && existing) return { ok: false, reason: 'exists' };
  if (!create && !existing) return { ok: false, reason: 'not_found' };
  if (edit.editionSize !== null) {
    const [sold] = await tx.select({ n: count() }).from(vaultOwned).where(eq(vaultOwned.productKey, key));
    if ((sold?.n ?? 0) > edit.editionSize) return { ok: false, reason: 'too_small' };
  }
  const values = { ...edit, updatedAt: new Date() };
  if (create) await tx.insert(vaultProducts).values({ key, category: 'item', image: `${key}.webp`, ...values });
  else await tx.update(vaultProducts).set(values).where(eq(vaultProducts.key, key));
  await recordAudit(tx, { actorType: 'admin', actorUserId: who.userId, action: create ? 'play.vault_product_create' : 'play.vault_product_edit', subjectType: 'vault_product', subjectId: key, metadata: { priceGems: edit.priceGems, status: edit.status, onSale: edit.onSale, editionSize: edit.editionSize, before: existing ? { priceGems: existing.priceGems, status: existing.status, onSale: existing.onSale, editionSize: existing.editionSize } : null } });
  return { ok: true };
}

export async function editVaultCollection(tx: Transaction, actor: AuthContext | null, key: string, edit: { bundleGems: number | null; onSale: boolean }): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'not_found' }> {
  const who = await requirePermission(tx, actor, 'flags.manage');
  if (edit.bundleGems !== null && (!Number.isInteger(edit.bundleGems) || edit.bundleGems < 1)) return { ok: false, reason: 'invalid' };
  const done = await tx.update(vaultCollections).set(edit).where(eq(vaultCollections.key, key)).returning({ key: vaultCollections.key });
  if (!done.length) return { ok: false, reason: 'not_found' };
  await recordAudit(tx, { actorType: 'admin', actorUserId: who.userId, action: 'play.vault_collection_edit', subjectType: 'vault_collection', subjectId: key, metadata: edit });
  return { ok: true };
}
