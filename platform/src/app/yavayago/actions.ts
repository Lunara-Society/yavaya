'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  claimOrder,
  customerCancel,
  markDelivered,
  markPickedUp,
  menuItemInputSchema,
  orderInputSchema,
  placeOrder,
  releaseOrder,
  removeMenuItem,
  reviewDriver,
  reviewStore,
  setDriverOnline,
  setMenuItemAvailable,
  setStoreOpen,
  storeAnswer,
  storeCancel,
  storeMarkReady,
  updateMenuItem,
  type ReviewDecision,
  featureStore,
} from '@/server/domains/go/service';

/** YavayaGo's buttons. Every one re-checks on the server who may press it; the page only decides what to show. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const back = (path: string, key: string) => `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(key)}`;

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

async function signedIn(next: string) {
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/** Runs one step and comes back to the page, with the reason if it could not be done. */
async function step(path: string, run: (userId: string) => Promise<unknown>): Promise<never> {
  const session = await signedIn(path);
  try {
    await run(session.user.userId);
  } catch (error) {
    redirect(back(path, errorKey(error)));
  }
  revalidatePath(path);
  redirect(path);
}

// --- Customer ---------------------------------------------------------------------

export async function placeOrderAction(formData: FormData): Promise<void> {
  const storeId = field(formData, 'storeId');
  const storePath = UUID.test(storeId) ? `/yavayago/stores/${storeId}` : '/yavayago';
  const session = await signedIn(storePath);
  let lines: unknown = [];
  try {
    lines = JSON.parse(field(formData, 'lines'));
  } catch {
    redirect(back(storePath, 'go.error.empty_cart'));
  }
  const parsed = orderInputSchema.safeParse({
    storeId,
    lines,
    dropoffLatitude: Number.parseFloat(field(formData, 'dropoffLatitude')),
    dropoffLongitude: Number.parseFloat(field(formData, 'dropoffLongitude')),
    dropoffDirections: field(formData, 'directions'),
    whatsapp: field(formData, 'whatsapp'),
    payingWith: field(formData, 'payingWith'),
    note: field(formData, 'note'),
  });
  if (!parsed.success) redirect(back(storePath, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `go-order:${session.user.userId}`);
  if (!limit.allowed) redirect(back(storePath, 'go.error.rate_limited'));
  const context = await requestContext();
  const agent = await userAgentHash();
  let id: string;
  try {
    ({ id } = await db().transaction((tx) => placeOrder(tx, { customerUserId: session.user.userId, input: parsed.data, audit: { ipHash: context.addressHash, userAgentHash: agent } })));
  } catch (error) {
    redirect(back(storePath, errorKey(error)));
  }
  redirect(`/yavayago/orders/${id}?placed=1`);
}

export async function customerCancelAction(formData: FormData): Promise<void> {
  const orderId = field(formData, 'orderId');
  if (!UUID.test(orderId)) redirect('/yavayago/orders');
  await step(`/yavayago/orders/${orderId}`, (userId) => db().transaction((tx) => customerCancel(tx, { userId, orderId })));
}

// --- Store ---------------------------------------------------------------------------

const STORE_PATH = '/yavayago/store';

export async function storeOpenAction(formData: FormData): Promise<void> {
  await step(STORE_PATH, (userId) => db().transaction((tx) => setStoreOpen(tx, { userId, open: field(formData, 'open') === '1' })));
}

/** "Destacar": pays tokens to list the store first for a week. */
export async function storeFeatureAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login?next=/yavayago/store');
  const purchaseId = field(formData, 'purchaseId');
  if (!UUID.test(purchaseId)) redirect(STORE_PATH);
  let outcome = 'ok';
  try {
    await db().transaction((tx) => featureStore(tx, { userId: session.user.userId, purchaseId }));
  } catch (error) {
    if (!isDomainError(error)) throw error;
    outcome = error.code === 'insufficient_tokens' ? 'tokens' : 'failed';
  }
  revalidatePath('/yavayago', 'layout');
  redirect(`${STORE_PATH}?feature=${outcome}#destacar`);
}

export async function storeAnswerAction(formData: FormData): Promise<void> {
  const orderId = field(formData, 'orderId');
  if (!UUID.test(orderId)) redirect(STORE_PATH);
  const accept = field(formData, 'accept') === '1';
  await step(STORE_PATH, (userId) => db().transaction((tx) => storeAnswer(tx, { userId, orderId, accept, reason: accept ? null : 'store_declined' })));
}

export async function storeReadyAction(formData: FormData): Promise<void> {
  const orderId = field(formData, 'orderId');
  if (!UUID.test(orderId)) redirect(STORE_PATH);
  await step(STORE_PATH, (userId) => db().transaction((tx) => storeMarkReady(tx, { userId, orderId })));
}

export async function storeCancelAction(formData: FormData): Promise<void> {
  const orderId = field(formData, 'orderId');
  if (!UUID.test(orderId)) redirect(STORE_PATH);
  await step(STORE_PATH, (userId) => db().transaction((tx) => storeCancel(tx, { userId, orderId, reason: 'store_cancelled' })));
}

export async function menuItemUpdateAction(formData: FormData): Promise<void> {
  const itemId = field(formData, 'itemId');
  if (!UUID.test(itemId)) redirect(STORE_PATH);
  const parsed = menuItemInputSchema.safeParse({ section: field(formData, 'section'), name: field(formData, 'name'), description: field(formData, 'description'), price: field(formData, 'price') });
  if (!parsed.success) redirect(back(`${STORE_PATH}#menu`, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  await step(STORE_PATH, (userId) => db().transaction((tx) => updateMenuItem(tx, { userId, itemId, input: parsed.data })));
}

export async function menuItemAvailableAction(formData: FormData): Promise<void> {
  const itemId = field(formData, 'itemId');
  if (!UUID.test(itemId)) redirect(STORE_PATH);
  await step(STORE_PATH, (userId) => db().transaction((tx) => setMenuItemAvailable(tx, { userId, itemId, available: field(formData, 'available') === '1' })));
}

export async function menuItemRemoveAction(formData: FormData): Promise<void> {
  const itemId = field(formData, 'itemId');
  if (!UUID.test(itemId)) redirect(STORE_PATH);
  await step(STORE_PATH, (userId) => db().transaction((tx) => removeMenuItem(tx, { userId, itemId })));
}

// --- Driver ------------------------------------------------------------------------------

const DRIVER_PATH = '/yavayago/driver';

export async function driverOnlineAction(formData: FormData): Promise<void> {
  await step(DRIVER_PATH, (userId) => db().transaction((tx) => setDriverOnline(tx, { userId, online: field(formData, 'online') === '1' })));
}

async function orderStep(formData: FormData, run: (userId: string, orderId: string) => Promise<unknown>): Promise<void> {
  const orderId = field(formData, 'orderId');
  if (!UUID.test(orderId)) redirect(DRIVER_PATH);
  await step(DRIVER_PATH, (userId) => run(userId, orderId));
}

export async function claimAction(formData: FormData): Promise<void> {
  await orderStep(formData, (userId, orderId) => db().transaction((tx) => claimOrder(tx, { userId, orderId })));
}

export async function releaseAction(formData: FormData): Promise<void> {
  await orderStep(formData, (userId, orderId) => db().transaction((tx) => releaseOrder(tx, { userId, orderId })));
}

export async function pickedUpAction(formData: FormData): Promise<void> {
  await orderStep(formData, (userId, orderId) => db().transaction((tx) => markPickedUp(tx, { userId, orderId })));
}

export async function deliveredAction(formData: FormData): Promise<void> {
  await orderStep(formData, (userId, orderId) => db().transaction((tx) => markDelivered(tx, { userId, orderId })));
}

// --- Review -------------------------------------------------------------------------------

const ADMIN_PATH = '/admin/yavayago';
const DECISIONS: readonly ReviewDecision[] = ['approve', 'reject', 'suspend', 'reinstate'];

export async function reviewStoreAction(formData: FormData): Promise<void> {
  const session = await signedIn(ADMIN_PATH);
  const storeId = field(formData, 'storeId');
  const decision = field(formData, 'decision') as ReviewDecision;
  if (!UUID.test(storeId) || !DECISIONS.includes(decision)) redirect(ADMIN_PATH);
  const note = field(formData, 'note').trim() || null;
  try {
    await db().transaction((tx) => reviewStore(tx, { actor: { userId: session.user.userId, status: session.user.status }, storeId, decision, note }));
  } catch (error) {
    redirect(back(`${ADMIN_PATH}#stores`, errorKey(error)));
  }
  revalidatePath(ADMIN_PATH);
  redirect(`${ADMIN_PATH}?saved=1#stores`);
}

export async function reviewDriverAction(formData: FormData): Promise<void> {
  const session = await signedIn(ADMIN_PATH);
  const driverUserId = field(formData, 'driverUserId');
  const decision = field(formData, 'decision') as ReviewDecision;
  if (!UUID.test(driverUserId) || !DECISIONS.includes(decision)) redirect(ADMIN_PATH);
  const note = field(formData, 'note').trim() || null;
  try {
    await db().transaction((tx) =>
      reviewDriver(tx, { actor: { userId: session.user.userId, status: session.user.status }, driverUserId, decision, note, phoneConfirmed: formData.get('phoneConfirmed') === 'on' }),
    );
  } catch (error) {
    redirect(back(`${ADMIN_PATH}#drivers`, errorKey(error)));
  }
  revalidatePath(ADMIN_PATH);
  redirect(`${ADMIN_PATH}?saved=1#drivers`);
}

