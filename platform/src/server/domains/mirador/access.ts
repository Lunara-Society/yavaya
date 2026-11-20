import 'server-only';
import type { Executor } from '@/server/db/client';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookEnabled } from '@/server/domains/platform/looks';

/**
 * Whether this person may see Mirador: everyone once its switch is on; while
 * it is off, only someone who may change it, so the owner tries it before
 * anyone else (the same rule as Roxi's flagship). Checked by every page and
 * route, not only by the menu that links to it.
 */
export async function miradorOpen(executor: Executor, userId: string | null): Promise<boolean> {
  if (await lookEnabled(executor, 'mirador')) return true;
  return userId ? hasPermission(executor, userId, 'flags.manage') : false;
}
