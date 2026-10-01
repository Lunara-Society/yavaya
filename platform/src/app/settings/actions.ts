'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { notificationPreferences, userProfiles } from '@/server/db/schema';
import { LOCATION_PRIVACY, type LocationPrecision } from '@/config/business-rules';
import { isLocale } from '@/i18n/config';
import {
  isLanguagePreference,
  isThemePreference,
  persistPreferencesToAccount,
  writeLanguagePreference,
  writeThemePreference,
} from '@/server/preferences';
import { currentSession } from '@/server/auth/context';
import { clearSessionCookie } from '@/server/auth/cookies';
import { revokeSession } from '@/server/auth/session';
import { recordAudit } from '@/server/domains/audit/service';

/**
 * Settings actions.
 *
 * All of these work without JavaScript: each control is a plain form whose
 * submit button carries the value. On a slow connection or a cheap phone the
 * settings still work, which matters more here than a snappier toggle.
 *
 * Anonymous visitors get cookie-scoped preferences. Signed-in members also get
 * them mirrored onto the account, so the choice follows them to another device.
 */

export async function setLanguageAction(formData: FormData): Promise<void> {
  const value = String(formData.get('language') ?? '');
  if (!isLanguagePreference(value)) return;

  await writeLanguagePreference(value);

  // `auto` is not a locale — it means "follow the device" — so there is
  // nothing stable to store on the account for it.
  if (isLocale(value)) {
    const session = await currentSession();
    if (session) await persistPreferencesToAccount(session.user.userId, { locale: value });
  }

  revalidatePath('/', 'layout');
}

export async function setThemeAction(formData: FormData): Promise<void> {
  const value = String(formData.get('theme') ?? '');
  if (!isThemePreference(value)) return;

  await writeThemePreference(value);

  const session = await currentSession();
  if (session) await persistPreferencesToAccount(session.user.userId, { theme: value });

  revalidatePath('/', 'layout');
}

/**
 * Turns one notification category/channel pair on or off.
 *
 * Signed-in only: there is nowhere to store this for an anonymous visitor, and
 * a control that silently forgets would be worse than one that asks you to
 * sign in.
 */
export async function setNotificationPreferenceAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const category = String(formData.get('category') ?? '');
  const channel = String(formData.get('channel') ?? '');
  const enabled = String(formData.get('enabled') ?? '') === 'true';

  const allowedCategories = ['account', 'orders', 'moderation', 'tokens', 'live_activity', 'marketing', 'community', 'mercadito', 'sanctuary'];
  const allowedChannels = ['in_app', 'push', 'email', 'sms'] as const;

  if (!allowedCategories.includes(category)) return;
  if (!(allowedChannels as readonly string[]).includes(channel)) return;

  await db()
    .insert(notificationPreferences)
    .values({
      userId: session.user.userId,
      category,
      channel: channel as (typeof allowedChannels)[number],
      enabled,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.category,
        notificationPreferences.channel,
      ],
      set: { enabled, updatedAt: new Date() },
    });

  revalidatePath('/settings');
}

/**
 * Sets how precisely this member's location may be shown to others.
 *
 * This is the only way precision changes. Granting the browser's location
 * permission never raises it — knowing where someone is does not entitle
 * Yavaya to tell everyone else.
 */
export async function setLocationPrecisionAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const value = String(formData.get('precision') ?? '');
  if (!(LOCATION_PRIVACY.levels as readonly string[]).includes(value)) return;
  const precision = value as LocationPrecision;

  await db().transaction(async (tx) => {
    await tx
      .insert(userProfiles)
      .values({ userId: session.user.userId, locationPrecision: precision })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { locationPrecision: precision, updatedAt: new Date() },
      });

    // A privacy change is worth being able to prove later, so it is audited —
    // recording the level chosen, never a coordinate.
    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: session.user.userId,
      action: 'identity.location_precision_changed',
      subjectType: 'user',
      subjectId: session.user.userId,
      metadata: { precision },
    });
  });

  revalidatePath('/settings');
}

export async function signOutAction(): Promise<void> {
  const session = await currentSession();
  if (session) {
    await db().transaction((tx) => revokeSession(tx, session.sessionId, 'user_signed_out'));
  }
  await clearSessionCookie();
  revalidatePath('/', 'layout');
  redirect('/');
}

/** Reads the signed-in member's notification preferences for display. */
export async function readNotificationPreferences(
  userId: string,
): Promise<Array<{ category: string; channel: string; enabled: boolean }>> {
  return db()
    .select({
      category: notificationPreferences.category,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

/** Reads the signed-in member's published location precision. */
export async function readLocationPrecision(userId: string): Promise<LocationPrecision> {
  const [row] = await db()
    .select({ precision: userProfiles.locationPrecision })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId)))
    .limit(1);
  return (row?.precision as LocationPrecision | undefined) ?? LOCATION_PRIVACY.defaultLevel;
}
