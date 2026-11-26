import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FLAG_DEFAULTS, mergeFlags, parseRemoteConfig, type Flags } from './flags';
import { IS_INTERNAL_VARIANT, SERVER_URL } from './env';
import { KEYS, readJson, writeJson } from './store';
import { getJson } from '../business/api';

/** Person-controlled preferences. Sound and haptics are never mandatory. */
export type Prefs = { sound: boolean; volume: number; haptics: boolean; look: 'synapse' | 'classic' };
export const PREF_DEFAULTS: Prefs = { sound: true, volume: 0.6, haptics: true, look: 'synapse' };

type ConfigState = { flags: Flags; prefs: Prefs; setPrefs: (next: Partial<Prefs>) => void; ready: boolean };

const ConfigContext = createContext<ConfigState | null>(null);

const BASE: Flags = { ...FLAG_DEFAULTS, lab: IS_INTERNAL_VARIANT };

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Flags>(BASE);
  const [prefs, setPrefsState] = useState<Prefs>(PREF_DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cached, stored] = await Promise.all([readJson<Partial<Flags>>(KEYS.remoteFlags, {}), readJson(KEYS.prefs, PREF_DEFAULTS)]);
      if (!alive) return;
      setFlags(mergeFlags(BASE, cached));
      setPrefsState(stored);
      setReady(true);
      // Fetch fresh overrides for the next launch; never block start-up on the network.
      const remote = parseRemoteConfig(await getJson(`${SERVER_URL}/api/mobile/v1/config`, 4000).catch(() => null));
      if (remote) await writeJson(KEYS.remoteFlags, remote.flags);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setPrefs = (next: Partial<Prefs>) =>
    setPrefsState((current) => {
      const merged = { ...current, ...next };
      void writeJson(KEYS.prefs, merged);
      return merged;
    });

  return <ConfigContext.Provider value={{ flags, prefs, setPrefs, ready }}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigState {
  const value = useContext(ConfigContext);
  if (!value) throw new Error('useConfig outside ConfigProvider');
  return value;
}
