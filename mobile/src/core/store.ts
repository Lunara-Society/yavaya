import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small persisted preferences. A storage failure never breaks the app: it falls back to defaults. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* preferences are best-effort */
  }
}

export const KEYS = {
  remoteFlags: 'yavaya.flags.remote.v1',
  prefs: 'yavaya.prefs.v1',
  awakened: 'yavaya.awakened.v1',
  look: 'yavaya.look',
} as const;
