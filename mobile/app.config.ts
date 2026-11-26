import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One codebase, three isolated app variants. Development installs beside the
 * store app (its own package and bundle id) and talks to the staging server;
 * preview and production talk to yavaya.lat. Chosen by APP_VARIANT, which each
 * EAS build profile sets (eas.json).
 */
type Variant = 'development' | 'preview' | 'production';

const VARIANTS: Record<Variant, { name: string; android: string; ios: string; scheme: string; webUrl: string }> = {
  development: {
    name: 'Yavaya Dev',
    android: 'yavaya.lat.dev',
    ios: 'lat.yavaya.dev',
    scheme: 'yavaya-dev',
    webUrl: 'https://yavaya-web-staging.up.railway.app',
  },
  preview: { name: 'Yavaya', android: 'yavaya.lat', ios: 'lat.yavaya', scheme: 'yavaya', webUrl: 'https://yavaya.lat' },
  production: { name: 'Yavaya', android: 'yavaya.lat', ios: 'lat.yavaya', scheme: 'yavaya', webUrl: 'https://yavaya.lat' },
};

const PROJECT_ID = '9e779c70-bbec-48c5-ac71-ca8a45debf66';

function variantOf(value: string | undefined): Variant {
  return value === 'development' || value === 'preview' ? value : 'production';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = variantOf(process.env.APP_VARIANT);
  const v = VARIANTS[variant];
  return {
    ...config,
    name: v.name,
    slug: 'yavaya',
    scheme: v.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: v.ios,
      supportsTablet: true,
      infoPlist: {
        // Voice stays in the foreground: talking to Roxi ends when the app leaves the screen.
        UIBackgroundModes: [],
        NSMicrophoneUsageDescription: 'Yavaya usa el micrófono cuando hablas con Roxi o dictas un texto.',
      },
    },
    android: { ...config.android, package: v.android },
    // Rollback: an EAS Update can be republished or rolled back per channel; the
    // runtime version follows the native fingerprint, so a JS update never lands
    // on a binary it was not built for.
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${PROJECT_ID}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
    web: { bundler: 'metro', output: 'single', backgroundColor: '#000000' },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-notifications', { color: '#C9B48A' }],
      // Roxi's voice: ElevenLabs over WebRTC (LiveKit), echo cancellation included.
      '@livekit/react-native-expo-plugin',
      '@config-plugins/react-native-webrtc',
    ],
    extra: { ...config.extra, variant, webUrl: v.webUrl, eas: { projectId: PROJECT_ID } },
  } as ExpoConfig;
};
