import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { FX } from './effects';
import { color, depth as depthTokens, radius as radii, rgb01, spring } from '../design/tokens';
import { cue } from '../motion/cues';

type Depth = keyof typeof depthTokens;

/**
 * A holographic information panel (Chapter 04). The content is ordinary,
 * accessible React Native text and controls; only the glass and its edge light
 * are drawn by the GPU. The panel leans with the phone (parallax by depth) and
 * toward the finger when pressed. `focus` lights its edge in the accent.
 */
export function HoloPanel({ children, accent = color.signal, depth = 'panel', focus = false, tilt, onPress, style, radius = radii.panel, accessibilityLabel }: {
  children: ReactNode;
  accent?: string;
  depth?: Depth;
  focus?: boolean;
  tilt?: SharedValue<{ x: number; y: number }>;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  accessibilityLabel?: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const press = useSharedValue({ x: 0, y: 0, on: 0 });
  const clock = useClock();
  const d = depthTokens[depth];
  const acc = rgb01(accent);
  const uniforms = useDerivedValue(() => ({
    size: [size.w, size.h],
    radius,
    tilt: [(tilt?.value.x ?? 0) * d.parallax + press.value.x * 0.5, (tilt?.value.y ?? 0) * d.parallax + press.value.y * 0.5],
    accent: acc,
    intensity: 0.55 + d.edgeLight + press.value.on * 0.3,
    focus: focus ? 1 : 0,
    time: clock.value / 1000,
  }));
  const lean = useAnimatedStyle(() => {
    const tx = (tilt?.value.x ?? 0) * d.parallax;
    const ty = (tilt?.value.y ?? 0) * d.parallax;
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${tx * 4 + press.value.x * 5}deg` },
        { rotateX: `${-ty * 4 - press.value.y * 5}deg` },
        { scale: 1 - press.value.on * 0.015 },
      ],
    };
  });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const body = (
    <Animated.View style={[{ borderRadius: radius }, lean, style]} onLayout={onLayout}>
      {FX.edge && size.w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Fill>
            <Shader source={FX.edge} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color.glass, borderWidth: 1, borderColor: focus ? accent : color.hairline }]} />
      )}
      {children}
    </Animated.View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={(e) => {
        const nx = size.w ? (e.nativeEvent.locationX / size.w) * 2 - 1 : 0;
        const ny = size.h ? (e.nativeEvent.locationY / size.h) * 2 - 1 : 0;
        press.value = withSpring({ x: nx, y: ny, on: 1 }, spring.snappy);
      }}
      onPressOut={() => {
        press.value = withSpring({ x: 0, y: 0, on: 0 }, spring.smooth);
      }}
      onPress={() => {
        cue('tap');
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
}
