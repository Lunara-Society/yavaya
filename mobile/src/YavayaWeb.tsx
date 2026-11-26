import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';
import { decide, isYavaya, openableUrl } from './links';
import { strings } from './strings';
import { coverScript, injectedScript, OPEN_ROXI, parseMessage, setSynapseScript, type LauncherRect, type RoxiState } from './synapse/bridge';
import { PresenceDock } from './synapse/PresenceDock';
import { Reconstruction, RECONSTRUCTION_AVAILABLE } from './synapse/Reconstruction';
import { readLook, saveLook, type Look } from './synapse/settings';

/**
 * The live yavaya.lat in a native frame (Chapter 00's bridge, docs/synapse/ARCHITECTURE.md),
 * with Synapse's first layer over it (pre-audit prototype P-01): Roxi forming from light while the page
 * loads beneath, then her Presence in place of her web button. Every working system —
 * accounts, the districts, Roxi's voice and tools, payments, Play — is still the website's
 * own; the app adds the back button, links that leave Yavaya opening in their own apps, the
 * microphone, camera and location the site asks for, and a real screen with no connection.
 * Classic (one long press on Roxi) is the Chapter 00 app exactly.
 */

const WEB_URL = (Constants.expoConfig?.extra?.webUrl as string | undefined) ?? 'https://yavaya.lat';
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
/** The splash never outlasts a slow first load by more than this. */
const SPLASH_LIMIT_MS = 8000;
const NO_ROXI: RoxiState = { available: false, open: false, visual: 'idle' };

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
  const [look, setLook] = useState<Look | null>(null);
  const [reconstructing, setReconstructing] = useState(true);
  const [roxi, setRoxi] = useState<RoxiState>(NO_ROXI);
  const [launcher, setLauncher] = useState<LauncherRect | null>(null);
  const dark = useColorScheme() !== 'light';
  const background = dark ? '#0B0A10' : '#F6EFE2';
  const text = strings();
  const reducedMotion = useReducedMotion();

  // What the reconstruction follows: the first page's real loading.
  const target = useSharedValue(0);
  const loaded = useSharedValue(false);
  const loadFailed = useSharedValue(false);
  const skip = useSharedValue(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await readLook();
      if (alive) setLook(saved);
    })();
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_LIMIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const synapse = look === 'synapse' && RECONSTRUCTION_AVAILABLE;
  const showReconstruction = synapse && reconstructing;

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

  const chooseLook = useCallback(
    (next: Look) => {
      setLook(next);
      setLauncher(null);
      web.current?.injectJavaScript(setSynapseScript(next === 'synapse'));
      void saveLook(next);
    },
    [],
  );

  const offerLook = useCallback(
    (current: Look) => {
      const toClassic = current === 'synapse';
      Alert.alert(text.lookTitle, toClassic ? text.lookToClassic : text.lookToSynapse, [
        { text: text.cancel, style: 'cancel' },
        { text: toClassic ? text.lookClassic : text.lookSynapse, onPress: () => chooseLook(toClassic ? 'classic' : 'synapse') },
      ]);
    },
    [chooseLook, text],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // Only Yavaya's own pages may speak to the app.
      if (!isYavaya(event.nativeEvent.url)) return;
      const message = parseMessage(event.nativeEvent.data);
      if (!message) return;
      if (message.type === 'roxi-state') setRoxi(message.state);
      else if (message.type === 'launcher') setLauncher(message.rect);
      else if (message.type === 'classic-menu' && look === 'classic') offerLook('classic');
    },
    [look, offerLook],
  );

  const retry = () => {
    setFailed(false);
    setGeneration((n) => n + 1);
  };

  const onFirstFrame = useCallback(() => SplashScreen.hide(), []);
  const onReconstructed = useCallback(() => setReconstructing(false), []);
  const onSkip = useCallback(() => {
    skip.value = true;
  }, [skip]);

  const showDock = synapse && !showReconstruction && launcher !== null && !roxi.open && !failed;

  // The web button hides only while the Presence is actually on screen over it (bridge.ts).
  useEffect(() => {
    web.current?.injectJavaScript(coverScript(showDock));
  }, [showDock]);

  // The settings are read before anything is shown, so the first screen is the right one; the splash covers it.
  if (!look) return <View style={[styles.root, { backgroundColor: '#0B0A10' }]} />;

  return (
    <View style={styles.root}>
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
          <View style={styles.root}>
            {/*
              `<object>`: the library's default type argument is `undefined`, which TypeScript 6 intersects
              with the props to `never`; any object type restores them unchanged.
            */}
            <WebView<object>
              key={generation}
              ref={web}
              source={{ uri: WEB_URL }}
              style={{ flex: 1, backgroundColor: background }}
              // The site can tell the app from a browser; nothing else about the user agent changes.
              applicationNameForUserAgent={`YavayaApp/${APP_VERSION}`}
              injectedJavaScriptBeforeContentLoaded={injectedScript(synapse)}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={onShouldStart}
              onNavigationStateChange={(state: WebViewNavigation) => {
                canGoBack.current = state.canGoBack;
              }}
              onLoadStart={() => setLauncher(null)}
              onLoadProgress={(event: WebViewProgressEvent) => {
                target.value = event.nativeEvent.progress;
              }}
              onLoadEnd={() => {
                loaded.value = true;
                if (!synapse) SplashScreen.hide();
              }}
              onError={() => {
                loadFailed.value = true;
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
            {showDock && launcher ? (
              <PresenceDock
                rect={launcher}
                visual={roxi.visual}
                name={text.roxiName}
                role={text.roxiRole}
                label={text.roxiOpen}
                reducedMotion={reducedMotion}
                onOpen={() => web.current?.injectJavaScript(OPEN_ROXI)}
                onLongPress={() => offerLook('synapse')}
              />
            ) : null}
          </View>
        )}
      </SafeAreaView>
      {showReconstruction ? (
        <>
          <StatusBar style="light" />
          <Reconstruction
            target={target}
            loaded={loaded}
            failed={loadFailed}
            skip={skip}
            reducedMotion={reducedMotion}
            onSkip={onSkip}
            hint={text.enterHint}
            label={text.loadingLabel}
            onFirstFrame={onFirstFrame}
            onDone={onReconstructed}
          />
        </>
      ) : null}
    </View>
  );
}

/** The offline screen's measures, in dp: large type and a 48 dp touch target, readable on a small phone. */
const PAGE_PADDING = 32;
const GAP = 14;
const BUTTON_TOP = 10;
const BUTTON_SIDE = 28;
const TITLE_SIZE = 24;
const BODY_SIZE = 17;
const BODY_LINE = 24;
const TOUCH_TARGET = 48;
const PILL = 999;

const styles = StyleSheet.create({
  root: { flex: 1 },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: PAGE_PADDING, gap: GAP },
  title: { fontSize: TITLE_SIZE, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: BODY_SIZE, lineHeight: BODY_LINE, textAlign: 'center' },
  button: { marginTop: BUTTON_TOP, minHeight: TOUCH_TARGET, paddingHorizontal: BUTTON_SIDE, borderRadius: PILL, backgroundColor: '#D8B25A', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: BODY_SIZE, fontWeight: '700', color: '#1D1714' },
});
