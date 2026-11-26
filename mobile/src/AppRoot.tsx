import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfigProvider, useConfig } from './core/config';
import { KEYS, readJson, writeJson } from './core/store';
import { QualityProvider, useQuality } from './performance/Quality';
import { NavigationProvider, useNav } from './navigation/Navigator';
import type { Route } from './navigation/routes';
import { Environment, neutralAccent } from './render/Environment';
import { ToastProvider } from './render/SpatialToast';
import { useTilt } from './render/useTilt';
import { SceneHost } from './motion/SceneHost';
import { startup } from './motion/metrics';
import { initAudio, setAudioPrefs } from './audio/engine';
import { setHapticsEnabled } from './haptics/haptics';
import { color, districtAccent, rgb01 } from './design/tokens';
import { Home } from './screens/Home';
import { District } from './screens/District';
import { Search } from './screens/Search';
import { MapScreen } from './screens/MapScreen';
import { RoxiScreen } from './screens/RoxiScreen';
import { Settings } from './screens/Settings';
import { Lab } from './screens/Lab';
import { SampleListing, SampleProfile } from './screens/Sample';
import { Dock } from './screens/Dock';
import { Awakening } from './screens/Awakening';
import WebScreen from './screens/WebScreen';
import Classic from './screens/Classic';
import { AuthProvider } from './business/auth';
import { RoxiVoiceProvider } from './roxi/RoxiVoiceProvider';
import { RoxiIsland } from './roxi/RoxiIsland';

/**
 * The app's root (Chapter 02): providers in dependency order, then either the
 * Synapse shell or, when the flag or the person says so, Classic (the website
 * in a native frame, Chapter 00).
 */
export default function AppRoot() {
  // Only the six weights the design uses are bundled (each file required directly).
  const [fonts] = useFonts({
    Geist_300Light: require('@expo-google-fonts/geist/300Light/Geist_300Light.ttf'),
    Geist_400Regular: require('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
    Geist_500Medium: require('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'),
    Geist_600SemiBold: require('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
    GeistMono_400Regular: require('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf'),
    GeistMono_500Medium: require('@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf'),
  });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.void }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ConfigProvider>
          <QualityProvider>
            <AuthProvider>
              <Shell fonts={fonts} />
            </AuthProvider>
          </QualityProvider>
        </ConfigProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell({ fonts }: { fonts: boolean }) {
  const { flags, prefs, ready } = useConfig();
  useEffect(() => {
    void initAudio();
  }, []);
  useEffect(() => {
    setAudioPrefs(prefs.sound && flags.sound, prefs.volume);
    setHapticsEnabled(prefs.haptics && flags.haptics);
  }, [prefs, flags]);
  useEffect(() => {
    let last: string = AppState.currentState ?? 'active';
    const sub = AppState.addEventListener('change', (next) => {
      if (last.match(/background/) && next === 'active') {
        const t = performance.now();
        requestAnimationFrame(() => startup.warmResumes.push(performance.now() - t));
      }
      last = next;
    });
    return () => sub.remove();
  }, []);
  if (!ready || !fonts) return null;
  if (!flags.synapseShell || prefs.look === 'classic') return <Classic />;
  return (
    <NavigationProvider>
      <RoxiVoiceProvider>
        <ToastProvider>
          <Synapse />
        </ToastProvider>
      </RoxiVoiceProvider>
    </NavigationProvider>
  );
}

function accentOf(route: Route): [number, number, number] | null {
  if (route.name === 'district') return rgb01(districtAccent[route.id as keyof typeof districtAccent] ?? color.signal);
  if (route.name === 'listing') return rgb01(districtAccent[route.district as keyof typeof districtAccent] ?? color.signal);
  if (route.name === 'roxi') return rgb01(color.roxi);
  if (route.name === 'map') return rgb01(districtAccent.yavayago);
  return null;
}

function Synapse() {
  const { width, height } = useWindowDimensions();
  const { flags } = useConfig();
  const { budget } = useQuality();
  const nav = useNav();
  const tilt = useTilt(flags.parallax && budget.parallax);
  const accent = useSharedValue<[number, number, number]>(neutralAccent);
  const accentMix = useSharedValue(0);
  const [awaken, setAwaken] = useState(false);
  const firstFrame = useRef(false);

  useEffect(() => {
    if (!flags.awakening) return;
    readJson(KEYS.awakened, { done: false }).then((v) => setAwaken(!v.done));
  }, [flags.awakening]);

  useEffect(() => {
    const a = accentOf(nav.top);
    if (a) accent.value = a;
    accentMix.value = withTiming(a ? 1 : 0, { duration: 520 });
  }, [nav.top, accent, accentMix]);

  const onLayout = useCallback(() => {
    if (firstFrame.current) return;
    firstFrame.current = true;
    requestAnimationFrame(() => {
      startup.firstFrame = performance.now();
      startup.interactive = performance.now();
      void SplashScreen.hideAsync().catch(() => undefined);
      console.log(`[yavaya] startup js->first-frame ${Math.round(startup.firstFrame - startup.jsStart)}ms`);
    });
  }, []);

  const render = (route: Route) => {
    switch (route.name) {
      case 'home': return <Home tilt={tilt} />;
      case 'district': return <District id={route.id} tilt={tilt} />;
      case 'listing': return <SampleListing district={route.district} />;
      case 'profile': return <SampleProfile />;
      case 'search': return <Search q={route.q} />;
      case 'map': return <MapScreen iso={route.iso} />;
      case 'roxi': return <RoxiScreen tilt={tilt} />;
      case 'settings': return <Settings onReplayAwakening={() => setAwaken(true)} />;
      case 'lab': return <Lab section={route.section} tilt={tilt} />;
      case 'web': return <WebScreen path={route.path} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.void }} onLayout={onLayout}>
      <Environment width={width} height={height} accent={accent} accentMix={accentMix} tilt={tilt} dust={budget.dust / 400} />
      <SceneHost render={render} width={width} height={height} />
      {nav.top.name !== 'web' ? <Dock /> : null}
      <RoxiIsland />
      {awaken ? (
        <Awakening
          onDone={() => {
            setAwaken(false);
            void writeJson(KEYS.awakened, { done: true });
          }}
        />
      ) : null}
    </View>
  );
}
