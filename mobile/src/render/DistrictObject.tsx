import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withDecay } from 'react-native-reanimated';
import { FX } from './effects';
import { rgb01 } from '../design/tokens';
import { useQuality } from '../performance/Quality';

/**
 * An interactive district object (Chapter 04): a real-time ray-marched
 * crystal lit in the district's accent. Drag to turn it (object inspection);
 * it keeps its momentum and slowly settles into its own rotation. Ray-march
 * steps follow the device tier.
 */
export function DistrictObject({ accent, size = 180, focus = 0, interactive = true }: { accent: string; size?: number; focus?: number; interactive?: boolean }) {
  const clock = useClock();
  const { tier, reducedMotion } = useQuality();
  const yaw = useSharedValue(0.6);
  const pitch = useSharedValue(0.35);
  const acc = rgb01(accent);
  const steps = tier === 'high' ? 72 : tier === 'mid' ? 48 : 32;
  const uniforms = useDerivedValue(() => ({
    size: [size, size],
    time: reducedMotion ? 0 : clock.value / 1000,
    rot: [yaw.value, pitch.value],
    accent: acc,
    focus,
    quality: steps,
    spin: reducedMotion ? 0 : 0.22,
  }));
  const pan = Gesture.Pan()
    .enabled(interactive)
    .onChange((e) => {
      yaw.value += e.changeX * 0.012;
      pitch.value = Math.max(-1.2, Math.min(1.2, pitch.value + e.changeY * 0.012));
    })
    .onEnd((e) => {
      yaw.value = withDecay({ velocity: e.velocityX * 0.012, deceleration: 0.995 });
    });
  if (!FX.object) return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: accent, opacity: 0.6 }} />;
  return (
    <GestureDetector gesture={pan}>
      <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Objeto del distrito; desliza para girarlo">
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={FX.object} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
