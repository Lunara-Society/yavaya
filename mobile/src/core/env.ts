import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The variant this binary was built as, and the server it belongs to. */
export type Variant = 'development' | 'preview' | 'production';

const extra = (Constants.expoConfig?.extra ?? {}) as { variant?: string; webUrl?: string };

/**
 * The web build exists only for development checks on localhost: it counts as
 * the development variant and reaches the server through the same-origin proxy
 * (tools/web-proxy.mjs), because browsers apply CORS and phones do not.
 */
const localWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const VARIANT: Variant = localWeb
  ? 'development'
  : extra.variant === 'development' || extra.variant === 'preview'
    ? extra.variant
    : 'production';

/** Base URL of the Yavaya server: staging for development builds, yavaya.lat otherwise. */
export const SERVER_URL: string = localWeb ? window.location.origin : extra.webUrl ?? 'https://yavaya.lat';

export const IS_DEV_VARIANT = VARIANT === 'development';
