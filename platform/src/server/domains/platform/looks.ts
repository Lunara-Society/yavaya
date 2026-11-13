import type { Executor } from '@/server/db/client';
import { SITE_LOOK_RULES } from '@/config/business-rules';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { isFlagEnabled, setFlag } from './settings';

/**
 * The site's looks: design changes the owner can undo without a deploy.
 *
 * Each look is a feature flag, read on every request of the pages it changes
 * (with the settings module's short cache), so turning one off in
 * Admin → Diseño del sitio brings the previous design back within a minute.
 * Until someone touches a switch, the default in SITE_LOOK_RULES applies.
 *
 * Changing one needs `flags.manage` (administrators), checked here, on the
 * server, inside the transaction that writes the flag and its audit record.
 */
export const LOOK_KEYS = ['home', 'worlds', 'guardian', 'logo', 'depth', 'play', 'trials', 'vault_collectibles'] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

const FLAG: Record<LookKey, string> = {
  home: 'look.first_light_home',
  worlds: 'look.district_worlds',
  guardian: 'look.guardian_2',
  logo: 'look.logo_2',
  depth: 'look.district_depth',
  // Not a look, but the same kind of switch: whether Yavaya Play (/play) is open to the public.
  play: 'play.open',
  // Whether the Pruebas de Maestría in Yavaya Play are open to players (docs/PLAY.md).
  trials: 'play.trials',
  // Whether the Vault sells collectibles not usable yet (docs/PLAY.md, "The Vault"): off until the owner approves their refund terms.
  vault_collectibles: 'play.vault_collectibles',
};

export function isLookKey(value: string): value is LookKey {
  return (LOOK_KEYS as readonly string[]).includes(value);
}

export async function lookEnabled(executor: Executor, key: LookKey): Promise<boolean> {
  return isFlagEnabled(executor, FLAG[key], SITE_LOOK_RULES[key]);
}

export async function allLooks(executor: Executor): Promise<Record<LookKey, boolean>> {
  const values = await Promise.all(LOOK_KEYS.map((key) => lookEnabled(executor, key)));
  return Object.fromEntries(LOOK_KEYS.map((key, i) => [key, values[i]])) as Record<LookKey, boolean>;
}

export async function setLook(tx: Executor, params: { actor: AuthContext | null; key: LookKey; enabled: boolean }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'flags.manage');
  await setFlag(tx, { key: FLAG[params.key], enabled: params.enabled, adminUserId: actor.userId });
}
