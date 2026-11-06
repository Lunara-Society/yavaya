'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { serverEnv } from '@/config/env';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { createTranslator } from '@/i18n';
import { adminTryPlan, cancelPlan, resumePlan, startCreditPurchase, startPlanCheckout } from '@/server/domains/roxi/billing';
import { addApiConnection, addMcpConnection, refreshMcpTools, removeConnection } from '@/server/domains/roxi/connectors/service';
import { addItem, cleanBody, deleteAllItems, deleteItem, ITEM_KINDS, REPEATS, updateItem, type ItemKind, type Repeat } from '@/server/domains/roxi/items';
import { ENTRY_KINDS, recordEntry, voidEntry, type EntryKind } from '@/server/domains/roxi/business';
import { searchPlaces } from '@/server/domains/geography/places';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

/*
 * Roxi's pages: plans and credits (/roxi), connections (/roxi/connections)
 * and what she keeps (/roxi/memory). Every action checks the session on the
 * server and goes through the domain services; nothing is trusted from the form
 * but the member's own words.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedIn(next: string) {
  const session = await currentSession();
  if (!session) redirect(`/login?next=${next}`);
  return session;
}

/** A domain error goes back to the page as its message key; anything else as a generic failure. */
function failed(page: string, error: unknown): never {
  if (isDomainError(error) && error.expose) {
    const limit = typeof error.details.limit === 'number' ? `&limit=${error.details.limit}` : '';
    redirect(`${page}?error=${encodeURIComponent(error.messageKey)}${limit}`);
  }
  console.error(`roxi action failed (${page}):`, error instanceof Error ? error.message : error);
  redirect(`${page}?error=roxi.error.generic`);
}

// --- Plans and credits ------------------------------------------------------------

export async function subscribeAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi');
  const plan = String(formData.get('plan') ?? '');
  const attemptId = String(formData.get('attempt') ?? '');
  if ((plan !== 'pro' && plan !== 'max') || !UUID.test(attemptId)) redirect('/roxi');
  const limit = await consumeRateLimit(db(), RATE_LIMITS.paymentCheckout, `user:${session.user.userId}`);
  if (!limit.allowed) redirect('/roxi?error=payments.error.rate_limited');
  let destination: string;
  try {
    const t = createTranslator(session.user.locale === 'en' ? 'en' : 'es');
    ({ redirectUrl: destination } = await startPlanCheckout(db(), {
      userId: session.user.userId,
      plan,
      attemptId,
      appUrl: serverEnv().APP_URL,
      description: t(plan === 'pro' ? 'roxi.plans.checkout.pro' : 'roxi.plans.checkout.max'),
    }));
  } catch (error) {
    failed('/roxi', error);
  }
  redirect(destination);
}

export async function buyCreditsAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi');
  const pack = String(formData.get('pack') ?? '');
  const attemptId = String(formData.get('attempt') ?? '');
  if (!/^[a-z0-9_]{1,40}$/.test(pack) || !UUID.test(attemptId)) redirect('/roxi');
  const limit = await consumeRateLimit(db(), RATE_LIMITS.paymentCheckout, `user:${session.user.userId}`);
  if (!limit.allowed) redirect('/roxi?error=payments.error.rate_limited');
  let destination: string;
  try {
    const t = createTranslator(session.user.locale === 'en' ? 'en' : 'es');
    ({ redirectUrl: destination } = await startCreditPurchase(db(), {
      userId: session.user.userId,
      packKey: pack,
      attemptId,
      appUrl: serverEnv().APP_URL,
      description: t('roxi.plans.checkout.credits'),
    }));
  } catch (error) {
    failed('/roxi', error);
  }
  redirect(destination);
}

export async function cancelPlanAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi');
  if (formData.get('confirm') !== 'yes') redirect('/roxi?error=roxi.plans.error.confirm');
  try {
    await cancelPlan(db(), session.user.userId);
  } catch (error) {
    failed('/roxi', error);
  }
  redirect('/roxi?done=cancelled');
}

export async function resumePlanAction(): Promise<void> {
  const session = await signedIn('/roxi');
  try {
    await resumePlan(db(), session.user.userId);
  } catch (error) {
    failed('/roxi', error);
  }
  redirect('/roxi?done=resumed');
}

export async function adminTryPlanAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi');
  const plan = String(formData.get('plan') ?? '');
  if (plan !== 'pro' && plan !== 'max') redirect('/roxi');
  try {
    await adminTryPlan(db(), session.user.userId, plan);
  } catch (error) {
    failed('/roxi', error);
  }
  redirect('/roxi?done=trial');
}

// --- Connections ----------------------------------------------------------------

export async function addMcpAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/connections');
  const limit = await consumeRateLimit(db(), RATE_LIMITS.roxiLookup, `user:${session.user.userId}`);
  if (!limit.allowed) redirect('/roxi/connections?error=error.rate_limited');
  try {
    await addMcpConnection(db(), session.user.userId, {
      label: String(formData.get('label') ?? ''),
      url: String(formData.get('url') ?? ''),
      token: String(formData.get('token') ?? ''),
      headerName: String(formData.get('header') ?? ''),
    });
  } catch (error) {
    failed('/roxi/connections', error);
  }
  redirect('/roxi/connections?connected=mcp');
}

export async function addApiAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/connections');
  try {
    await addApiConnection(db(), session.user.userId, {
      label: String(formData.get('label') ?? ''),
      baseUrl: String(formData.get('url') ?? ''),
      secret: String(formData.get('secret') ?? ''),
      headerName: String(formData.get('header') ?? ''),
      prefix: String(formData.get('prefix') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    });
  } catch (error) {
    failed('/roxi/connections', error);
  }
  redirect('/roxi/connections?connected=api');
}

export async function removeConnectionAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/connections');
  try {
    await removeConnection(db(), session.user.userId, String(formData.get('id') ?? ''));
  } catch (error) {
    failed('/roxi/connections', error);
  }
  redirect('/roxi/connections?done=removed');
}

export async function refreshConnectionAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/connections');
  try {
    await refreshMcpTools(db(), session.user.userId, String(formData.get('id') ?? ''));
  } catch (error) {
    failed('/roxi/connections', error);
  }
  redirect('/roxi/connections?done=refreshed');
}

// --- What Roxi keeps ----------------------------------------------------------------

export async function addItemAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const kind = String(formData.get('kind') ?? '') as ItemKind;
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) redirect('/roxi/memory');
  const repeat = String(formData.get('repeat') ?? 'none');
  const due = String(formData.get('due') ?? '');
  // The browser sends its own offset with a reminder's time, so 8:00 means 8:00 where the member is.
  const offset = Number(formData.get('offset') ?? 0);
  const dueAt = due ? new Date(new Date(`${due}:00Z`).getTime() + (Number.isFinite(offset) ? offset : 0) * 60_000) : null;
  const target = Number(String(formData.get('target') ?? '').replace(',', '.'));
  try {
    await addItem(db(), session.user.userId, {
      kind,
      body: cleanBody({ title: formData.get('title'), detail: formData.get('detail'), target: Number.isFinite(target) && target > 0 ? target : undefined, progress: kind === 'goal' ? 0 : undefined }),
      dueAt,
      repeat: (REPEATS as readonly string[]).includes(repeat) ? (repeat as Repeat) : 'none',
      day: String(formData.get('day') ?? '') || null,
    });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  revalidatePath('/roxi/memory');
  redirect(`/roxi/memory?done=added#${kind}`);
}

export async function toggleItemAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  try {
    await updateItem(db(), session.user.userId, String(formData.get('id') ?? ''), { done: formData.get('done') === 'yes' });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  revalidatePath('/roxi/memory');
  redirect('/roxi/memory');
}

export async function progressItemAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const progress = Number(String(formData.get('progress') ?? '').replace(',', '.'));
  try {
    await updateItem(db(), session.user.userId, String(formData.get('id') ?? ''), { body: { progress: Number.isFinite(progress) && progress >= 0 ? progress : undefined } });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=saved#goal');
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  try {
    await deleteItem(db(), session.user.userId, String(formData.get('id') ?? ''));
  } catch (error) {
    failed('/roxi/memory', error);
  }
  revalidatePath('/roxi/memory');
  redirect('/roxi/memory?done=deleted');
}

export async function forgetAllAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  if (formData.get('confirm') !== 'yes') redirect('/roxi/memory?error=roxi.memory.error.confirm');
  await deleteAllItems(db(), session.user.userId);
  redirect('/roxi/memory?done=forgotten');
}

// --- The business ledger --------------------------------------------------------------

export async function recordBusinessAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/negocio');
  const kind = String(formData.get('kind') ?? '') as EntryKind;
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) redirect('/roxi/negocio');
  const cost = String(formData.get('cost') ?? '').trim();
  try {
    await recordEntry(db(), session.user.userId, {
      kind,
      amount: String(formData.get('amount') ?? ''),
      cost: kind === 'sale' && cost ? cost : undefined,
      currency: String(formData.get('currency') ?? ''),
      day: String(formData.get('day') ?? '') || new Date().toISOString().slice(0, 10),
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    failed('/roxi/negocio', error);
  }
  redirect('/roxi/negocio?done=saved');
}

export async function voidBusinessAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/negocio');
  try {
    await voidEntry(db(), session.user.userId, String(formData.get('id') ?? ''));
  } catch (error) {
    failed('/roxi/negocio', error);
  }
  redirect('/roxi/negocio');
}

// --- Watches, missions, capsules, milestones ----------------------------------------------

export async function addWatchAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const district = formData.get('district') === 'work' ? 'work' : 'mercadito';
  const queryText = String(formData.get('query') ?? '').trim();
  const max = Number(String(formData.get('max') ?? '').replace(',', '.'));
  const placeText = String(formData.get('place') ?? '').trim();
  const maxPrice = Number.isFinite(max) && max > 0 && district === 'mercadito' ? max : undefined;
  const currency = String(formData.get('currency') ?? '').trim().toUpperCase();
  // A price only compares within one currency: without a valid one the watch would never match, so say so.
  if (maxPrice !== undefined && !/^[A-Z]{3}$/.test(currency)) redirect('/roxi/memory?error=roxi.business.error.currency#watch');
  try {
    let placeCode: string | undefined;
    let placeName: string | undefined;
    if (placeText) {
      const [hit] = await searchPlaces(db(), placeText.slice(0, 80), { locale: session.user.locale ?? 'es', limit: 1 });
      if (!hit) redirect('/roxi/memory?error=roxi.memory.error.place#watch');
      placeCode = hit.code;
      placeName = hit.name;
    }
    await addItem(db(), session.user.userId, {
      kind: 'watch',
      body: cleanBody({ title: queryText || String(max), district, query: queryText, maxPrice, currency: maxPrice !== undefined ? currency : undefined, placeCode, placeName }),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=added#watch');
}

export async function addMissionAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const budget = Number(String(formData.get('budget') ?? '').replace(',', '.'));
  try {
    await addItem(db(), session.user.userId, {
      kind: 'mission',
      body: cleanBody({ title: formData.get('title'), target: Number.isFinite(budget) && budget > 0 ? budget : undefined, steps: String(formData.get('steps') ?? '').split('\n') }),
    });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=added#mission');
}

export async function stepAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  try {
    await updateItem(db(), session.user.userId, String(formData.get('id') ?? ''), { step: { index: Number(formData.get('index')), done: formData.get('done') === 'yes' } });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory#mission');
}

export async function snoozeAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  try {
    await updateItem(db(), session.user.userId, String(formData.get('id') ?? ''), { snoozeHours: Number(formData.get('hours')) || 24 });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=saved#reminder');
}

export async function addCapsuleAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const opens = String(formData.get('opens') ?? '');
  try {
    await addItem(db(), session.user.userId, {
      kind: 'capsule',
      body: cleanBody({ title: formData.get('title'), detail: formData.get('detail') }),
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(opens) ? new Date(`${opens}T14:00:00Z`) : null,
    });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=added#capsule');
}

export async function addMilestoneAction(formData: FormData): Promise<void> {
  const session = await signedIn('/roxi/memory');
  const when = String(formData.get('when') ?? '');
  try {
    await addItem(db(), session.user.userId, {
      kind: 'milestone',
      body: cleanBody({ title: formData.get('title'), source: 'member' }),
      day: /^\d{4}-\d{2}-\d{2}$/.test(when) ? when : String(formData.get('day') ?? '') || new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    failed('/roxi/memory', error);
  }
  redirect('/roxi/memory?done=added#camino');
}
