'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { signInPath } from '@/server/auth/sign-in-path';
import { editVaultCollection, editVaultProduct, type ProductEdit, type VaultStatus } from '@/server/domains/play/vault';

/*
 * The Vault's admin forms (docs/PLAY.md, "The Vault"). Authority is checked
 * inside the domain functions (flags.manage), in the same transaction as the
 * change and its audit record — never inferred from having seen the form.
 */

const text = (form: FormData, name: string, max = 200) => String(form.get(name) ?? '').trim().slice(0, max);
const whole = (form: FormData, name: string) => {
  const raw = text(form, name, 12);
  return raw === '' ? null : Number(raw);
};

function readProduct(form: FormData): ProductEdit {
  return {
    priceGems: whole(form, 'priceGems') ?? 0,
    status: text(form, 'status', 20) as VaultStatus,
    onSale: form.get('onSale') === 'on',
    editionSize: whole(form, 'editionSize'),
    mode: text(form, 'mode', 20) || null,
    nameEs: text(form, 'nameEs', 80),
    nameEn: text(form, 'nameEn', 80),
    lineEs: text(form, 'lineEs'),
    lineEn: text(form, 'lineEn'),
    collectionKey: text(form, 'collectionKey', 40) || null,
    lookItem: text(form, 'lookItem', 60) || null,
  };
}

async function actor() {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  return { userId: session.user.userId, status: session.user.status };
}

function done(result: { ok: true } | { ok: false; reason: string }, key: string): never {
  revalidatePath('/admin/vault');
  revalidatePath('/play');
  redirect(result.ok ? `/admin/vault?saved=${encodeURIComponent(key)}#${key}` : `/admin/vault?error=${result.reason}&key=${encodeURIComponent(key)}#${key}`);
}

export async function saveVaultProductAction(form: FormData): Promise<void> {
  const who = await actor();
  const key = text(form, 'key', 40);
  const result = await db().transaction((tx) => editVaultProduct(tx, who, key, readProduct(form)));
  done(result, key);
}

export async function createVaultProductAction(form: FormData): Promise<void> {
  const who = await actor();
  const key = text(form, 'key', 40);
  const result = await db().transaction((tx) => editVaultProduct(tx, who, key, readProduct(form), true));
  done(result, key);
}

export async function saveVaultCollectionAction(form: FormData): Promise<void> {
  const who = await actor();
  const key = text(form, 'key', 40);
  const result = await db().transaction((tx) => editVaultCollection(tx, who, key, { bundleGems: whole(form, 'bundleGems'), onSale: form.get('onSale') === 'on' }));
  done(result, key);
}
