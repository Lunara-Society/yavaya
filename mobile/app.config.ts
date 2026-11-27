import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withGradleProperties } from 'expo/config-plugins';

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

/**
 * Android builds that fit the build server (4 vCPUs, 16 GB on EAS's medium
 * class). Since WebRTC came in, the server ran out of memory twice: build
 * 91a52595 ("Gradle build daemon disappeared") and 258b7ac1 (no output after
 * five minutes in native compiles, canceled at the 45-minute limit).
 *
 * - Phones only: arm64-v8a (every recent phone) and armeabi-v7a (older ones).
 *   The x86 pair serves emulators, and each set adds the WebRTC libraries again.
 * - The Kotlin compiler runs as its own Java process and by default takes as
 *   much memory as Gradle (4 GB); 2 GB is enough for these modules.
 * - At most two Gradle tasks at once, so native compiles (each running several
 *   compilers itself) do not pile up beside both Java processes.
 */
const BUILD_PROPERTIES: Record<string, string> = {
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a',
  'kotlin.daemon.jvmargs': '-Xmx2g',
  'org.gradle.workers.max': '2',
};

function withBuildLimits(config: ExpoConfig): ExpoConfig {
  return withGradleProperties(config, (mod) => {
    const keys = Object.keys(BUILD_PROPERTIES);
    mod.modResults = mod.modResults.filter((item) => !(item.type === 'property' && keys.includes(item.key)));
    mod.modResults.push(...keys.map((key) => ({ type: 'property' as const, key, value: BUILD_PROPERTIES[key] ?? '' })));
    return mod;
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = variantOf(process.env.APP_VARIANT);
  const v = VARIANTS[variant];
  return withBuildLimits({
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
  } as ExpoConfig);
};
