import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { FX } from './effects';
import { color, rgb01 } from '../design/tokens';

/**
 * The continuous environment behind every screen: one canvas, never
 * re-created on navigation, so the app reads as one space. The current
 * district tints the key light; tilt shifts it (parallax at environment depth).
 */
export function Environment({ width, height, accent, accentMix, tilt, dust, level }: {
  width: number;
  height: number;
  accent: SharedValue<[number, number, number]>;
  accentMix: SharedValue<number>;
  tilt: SharedValue<{ x: number; y: number }>;
  dust: number;
  level?: SharedValue<number>;
}) {
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    time: clock.value / 1000,
    accent: accent.value,
    accentMix: accentMix.value,
    tilt: [tilt.value.x * 0.15, tilt.value.y * 0.15],
    dust,
    level: level ? level.value : 1,
  }));
  if (!FX.atmosphere) return <View style={[StyleSheet.absoluteFill, { backgroundColor: color.void }]} />;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={FX.atmosphere} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

export const neutralAccent = rgb01(color.signal);
