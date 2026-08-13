import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { featureFlags, systemSettings } from '@/server/db/schema';
import { recordAudit } from '@/server/domains/audit/service';

/**
 * Runtime settings and feature flags.
 *
 * Business rules ship as defaults in `config/business-rules.ts` and are
 * mirrored into `system_settings` at seed time. Reads go through here so an
 * operator can change a rule without a deploy; the config module remains the
 * source of the *default*, never of the live value.
 *
 * Values are cached briefly per process — long enough to keep hot paths cheap,
 * short enough that a change takes effect without a restart.
 */

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export async function getSetting<T>(
  executor: Executor,
  key: string,
  fallback: T,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const [row] = await executor
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);

  const value = (row?.value ?? fallback) as T;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Changing a business rule is a privileged, audited action. */
export async function setSetting(
  tx: Executor,
  params: { key: string; value: unknown; adminUserId: string; description?: string },
): Promise<void> {
  const [previous] = await tx
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, params.key))
    .limit(1);

  await tx
    .insert(systemSettings)
    .values({
      key: params.key,
      value: params.value as never,
      description: params.description ?? '',
      updatedBy: params.adminUserId,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: params.value as never, updatedBy: params.adminUserId, updatedAt: new Date() },
    });

  cache.delete(params.key);

  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: params.adminUserId,
    action: 'platform.setting_changed',
    subjectType: 'system_setting',
    subjectId: params.key,
    metadata: { from: previous?.value ?? null, to: params.value },
  });
}

export async function isFlagEnabled(
  executor: Executor,
  key: string,
  fallback = false,
): Promise<boolean> {
  const cacheKey = `flag:${key}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as boolean;

  const [row] = await executor
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  const enabled = row?.enabled ?? fallback;
  cache.set(cacheKey, { value: enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return enabled;
}

export async function setFlag(
  tx: Executor,
  params: { key: string; enabled: boolean; adminUserId: string },
): Promise<void> {
  await tx
    .insert(featureFlags)
    .values({ key: params.key, enabled: params.enabled, updatedBy: params.adminUserId })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled: params.enabled, updatedBy: params.adminUserId, updatedAt: new Date() },
    });

  cache.delete(`flag:${params.key}`);

  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: params.adminUserId,
    action: 'platform.flag_changed',
    subjectType: 'feature_flag',
    subjectId: params.key,
    metadata: { enabled: params.enabled },
  });
}

/** Test/ops helper. */
export function clearSettingsCache(): void {
  cache.clear();
}
