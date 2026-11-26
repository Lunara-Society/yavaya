import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { decide, openableUrl } from './links';
import { strings } from './strings';

/**
 * Chapter 00's bridge (docs/synapse/ARCHITECTURE.md): the live yavaya.lat in a
 * native frame, so every working system — accounts, the districts, Roxi's
 * voice, payments, Play — is the same one the website runs, with nothing
 * copied or mocked. The app adds what a native frame should: the back button,
 * links that leave Yavaya opening in their own apps, the microphone, camera and
 * location the site asks for, and a real screen when there is no connection.
 * Later chapters replace it screen by screen with the Synapse interface.
 */

const WEB_URL = (Constants.expoConfig?.extra?.webUrl as string | undefined) ?? 'https://yavaya.lat';
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
/** The splash never outlasts a slow first load by more than this. */
const SPLASH_LIMIT_MS = 8000;

/** Hands a link to the phone: WhatsApp, the dialer, the browser. A link no app can open is dropped quietly. */
async function openOutside(link: string): Promise<void> {
  const url = openableUrl(link);
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing on the phone handles it; staying on the page is the right outcome.
  }
}

export function YavayaWeb() {
  const web = useRef<WebView<object>>(null);
  const canGoBack = useRef(false);
  const [failed, setFailed] = useState(false);
  // A new key remounts the WebView: after a crash of its renderer, or a retry.
  const [generation, setGeneration] = useState(0);
  const dark = useColorScheme() !== 'light';
  const background = dark ? '#0B0A10' : '#F6EFE2';
  const text = strings();

  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_LIMIT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Android's back button goes back a page inside Yavaya before it leaves the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current || !web.current) return false;
      web.current.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const onShouldStart = useCallback((request: ShouldStartLoadRequest) => {
    const decision = decide(request.url, request.isTopFrame ?? true);
    if (decision === 'in-app') return true;
    if (decision === 'external') void openOutside(request.url);
    return false;
  }, []);

  const retry = () => {
    setFailed(false);
    setGeneration((n) => n + 1);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={['top', 'bottom']}>
      {failed ? (
        <View style={styles.offline} accessibilityRole="alert">
          <Text style={[styles.title, { color: dark ? '#F6EEDD' : '#1D1714' }]}>{text.offlineTitle}</Text>
          <Text style={[styles.body, { color: dark ? '#CFC4B4' : '#4A3F38' }]}>{text.offlineBody}</Text>
          <Pressable onPress={retry} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>{text.retry}</Text>
          </Pressable>
        </View>
      ) : (
        // `<object>`: the library's default type argument is `undefined`, which TypeScript 6 intersects
        // with the props to `never`; any object type restores them unchanged.
        <WebView<object>
          key={generation}
          ref={web}
          source={{ uri: WEB_URL }}
          style={{ flex: 1, backgroundColor: background }}
          // The site can tell the app from a browser; nothing else about the user agent changes.
          applicationNameForUserAgent={`YavayaApp/${APP_VERSION}`}
          onShouldStartLoadWithRequest={onShouldStart}
          onNavigationStateChange={(state: WebViewNavigation) => {
            canGoBack.current = state.canGoBack;
          }}
          onLoadEnd={() => SplashScreen.hide()}
          onError={() => {
            setFailed(true);
            SplashScreen.hide();
          }}
          onRenderProcessGone={() => setGeneration((n) => n + 1)}
          setSupportMultipleWindows={false}
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          geolocationEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          allowsBackForwardNavigationGestures
          overScrollMode="never"
          webviewDebuggingEnabled={__DEV__}
        />
      )}
    </SafeAreaView>
  );
}

/** The offline screen's measures, in dp: large type and a 48 dp touch target, readable on a small phone. */
const SPACE = { page: 32, gap: 14, buttonTop: 10, buttonSide: 28 } as const;
const TYPE = { title: 24, body: 17, bodyLine: 24 } as const;
const TOUCH_TARGET = 48;
const PILL = 999;

const styles = StyleSheet.create({
  root: { flex: 1 },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.page, gap: SPACE.gap },
  title: { fontSize: TYPE.title, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: TYPE.body, lineHeight: TYPE.bodyLine, textAlign: 'center' },
  button: { marginTop: SPACE.buttonTop, minHeight: TOUCH_TARGET, paddingHorizontal: SPACE.buttonSide, borderRadius: PILL, backgroundColor: '#D8B25A', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: TYPE.body, fontWeight: '700', color: '#1D1714' },
});
