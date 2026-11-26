import { Canvas, Fill, Shader, useImage } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FX } from '../render/effects';
import { ReconstructCanvas } from '../render/Reconstruct';
import { RoxiHologram } from '../render/RoxiHologram';
import { T } from '../design/Text';
import { color, rgb01, space } from '../design/tokens';
import { cue } from '../motion/cues';
import { useQuality } from '../performance/Quality';

/**
 * The optional first-launch awakening (Chapter 08), 5 s at most:
 *   0.0 s darkness and a low resonance · 0.35 s points of light · 1.0 s spatial
 *   structures · 2.0 s the Guardian reconstructs · 2.7 s it dissolves into the
 *   environment · 3.3 s Roxi forms · 4.3 s home appears and is live.
 * "Saltar" works from the first frame. It plays once; low-end and reduced-motion
 * phones get a 1.2 s fade instead. Sign-in and every function sit underneath and
 * are never waiting for it.
 */
const TOTAL = 5000;
/** Roxi forms as her hologram from 3.1 s, whole by 4.5 s, as the home appears behind her. */
const ROXI_FROM_MS = 3100;
const ROXI_FORM_MS = 1400;
const ROXI_HEIGHT = 0.58;
const ROXI_TOP = 0.16;
const clamp01 = (v: number) => {
  'worklet';
  return Math.max(0, Math.min(1, v));
};

export function Awakening({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { tier, reducedMotion } = useQuality();
  const light = reducedMotion || tier === 'low';
  const guardian = useImage(require('../../assets/splash-icon.png'));
  const roxi = useImage(require('../../assets/roxi/roxi.webp'));
  const t = useSharedValue(0);
  const veil = useSharedValue(1);
  const stopCue = useRef<() => void>(() => undefined);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    if (light) {
      veil.value = withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 300 }, (ok) => ok && runOnJS(finish)()));
      return;
    }
    if (!guardian || !roxi) return;
    stopCue.current = cue('awaken');
    const g = setTimeout(() => cue('guardian'), 2000);
    const r = setTimeout(() => cue('roxi'), 3400);
    t.value = withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }, (ok) => ok && runOnJS(finish)());
    veil.value = withSequence(withTiming(1, { duration: 4300 }), withTiming(0, { duration: 700 }));
    return () => {
      clearTimeout(g);
      clearTimeout(r);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light, guardian, roxi]);

  const skip = () => {
    stopCue.current();
    cancelAnimation(t);
    veil.value = withTiming(0, { duration: 180 }, (ok) => ok && runOnJS(finish)());
  };

  const acc = rgb01(color.metal);
  const field = useDerivedValue(() => ({
    size: [width, height],
    time: t.value / 1000,
    particles: clamp01((t.value - 350) / 1050) * (1 - clamp01((t.value - 3800) / 700)),
    structures: clamp01((t.value - 1000) / 1000) * (1 - clamp01((t.value - 3600) / 900)),
    accent: acc,
  }));
  const gIn = useDerivedValue(() => (t.value < 2700 ? clamp01((t.value - 2000) / 700) : 0));
  const gOut = useDerivedValue(() => (t.value >= 2700 ? 1 - clamp01((t.value - 2700) / 600) : 0));
  const rIn = useDerivedValue(() => clamp01((t.value - ROXI_FROM_MS) / ROXI_FORM_MS));
  const roxiLevel = useSharedValue(0);
  const roxiState = useSharedValue(0);
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const g = Math.min(width, height) * 0.46;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.void }, veilStyle]} pointerEvents="box-none">
      {light ? (
        <View style={styles.centre}><Image source={require('../../assets/splash-icon.png')} style={{ width: g, height: g, opacity: 0.9 }} /></View>
      ) : (
        <>
          {FX.awaken ? (
            <Canvas style={StyleSheet.absoluteFill}>
              <Fill><Shader source={FX.awaken} uniforms={field} /></Fill>
            </Canvas>
          ) : null}
          <View style={styles.centre} pointerEvents="none">
            <ReconstructCanvas image={guardian} progress={gIn} technique="light" accent={color.metal} width={g} height={g} fit="contain" />
          </View>
          <View style={styles.centre} pointerEvents="none">
            <ReconstructCanvas image={guardian} progress={gOut} technique="molecular" accent={color.metal} width={g} height={g} fit="contain" />
          </View>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <RoxiHologram width={width} height={height} figureHeight={height * ROXI_HEIGHT} top={height * ROXI_TOP} level={roxiLevel} state={roxiState} form={rIn} />
          </View>
        </>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Saltar la introducción" onPress={skip} hitSlop={12}
        style={{ position: 'absolute', top: insets.top + space[2], right: space[4], minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="label" tone="secondary">Saltar</T>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } });
