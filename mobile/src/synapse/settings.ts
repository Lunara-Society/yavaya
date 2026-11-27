import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Synapse or Classic, remembered on the phone. Synapse is the redesign, so it
 * ships behind this switch and Classic (the Chapter 00 app) is one long press
 * away (docs/synapse/PROJECT_MEMORY.md, the owner's rules).
 */
export type Look = 'synapse' | 'aether' | 'classic';

const KEY = 'yavaya.look';
export const DEFAULT_LOOK: Look = 'synapse';

export async function readLook(): Promise<Look> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'classic' || value === 'synapse' || value === 'aether' ? value : DEFAULT_LOOK;
  } catch {
    // Storage unavailable: the default, rather than no app.
    return DEFAULT_LOOK;
  }
}

export async function saveLook(look: Look): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, look);
  } catch {
    // Not remembered this time; the choice still applies until the app closes.
  }
}
