import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Mobile session storage. The server does not issue mobile tokens yet (the
 * mobile API is a later chapter); this is where the token will live: the
 * phone's keychain / keystore, never AsyncStorage. Until then the member signs
 * in inside the website screen, whose cookie session is unchanged.
 */
const KEY = 'yavaya.session.v1';

export async function readSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
