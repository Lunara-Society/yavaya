import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { FX } from './effects';
import { depth as depthTokens, radius as radii, rgb01, spring } from '../design/tokens';
import { usePalette } from '../design/palette';
import type { Palette } from '../design/palettes';
import { cue } from '../motion/cues';

type Depth = keyof typeof depthTokens;
type Press = { x: number; y: number; on: number };
type Size = { w: number; h: number };

/** Synapse glass: base edge light, and how much a press adds. */
const EDGE_BASE = 0.55;
const EDGE_PRESS = 0.3;
const PRESS_LEAN = 0.5;
const MS_PER_S = 1000;
/** How far a panel leans: with the phone (Synapse only) and toward the finger. */
const TILT_DEG = 4;
const PRESS_DEG = 5;
/** Aether is restrained: a smaller lean toward the finger, none with the phone. */
const AETHER_PRESS_DEG = 2;
const PERSPECTIVE = 900;
const PRESS_SINK = 0.015;
/** How much a district accent tints an Aether edge at rest. */
const AETHER_ACCENT_TINT = 0.5;
/** Hex alpha suffixes for lite edges: Synapse, then Aether (quieter). */
const LITE_EDGE = '55';
const LITE_TOP = '99';
const AETHER_LITE_EDGE = '40';
const AETHER_LITE_TOP = '80';

/**
 * A holographic information panel (Chapter 04). The content is ordinary,
 * accessible React Native text and controls; only the glass and its edge light
 * are drawn by the GPU. In Synapse the panel leans with the phone (parallax by
 * depth) and toward the finger; in Aether (AX-04) it is obsidian glass with a
 * champagne hairline, still unless touched. `focus` lights its edge.
 */
export function HoloPanel({ children, accent, depth = 'panel', focus = false, tilt, onPress, style, radius = radii.panel, accessibilityLabel, lite = false }: {
  children: ReactNode;
  accent?: string;
  depth?: Depth;
  focus?: boolean;
  tilt?: SharedValue<{ x: number; y: number }>;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  accessibilityLabel?: string;
  /**
   * Glass without a GPU canvas: the same body and edge, drawn by plain views.
   * For grids and lists, where dozens of canvases would cost memory on a
   * modest phone (and browsers allow only 16 at once).
   */
  lite?: boolean;
}) {
  const palette = usePalette();
  const aether = palette.look === 'aether';
  const lead = accent ?? palette.focus;
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const press = useSharedValue<Press>({ x: 0, y: 0, on: 0 });
  const d = depthTokens[depth];
  const lean = useAnimatedStyle(() => {
    const follow = aether ? 0 : 1;
    const tx = (tilt?.value.x ?? 0) * d.parallax * follow;
    const ty = (tilt?.value.y ?? 0) * d.parallax * follow;
    const pressDeg = aether ? AETHER_PRESS_DEG : PRESS_DEG;
    return {
      transform: [
        { perspective: PERSPECTIVE },
        { rotateY: `${tx * TILT_DEG + press.value.x * pressDeg}deg` },
        { rotateX: `${-ty * TILT_DEG - press.value.y * pressDeg}deg` },
        { scale: 1 - press.value.on * PRESS_SINK },
      ],
    };
  });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const shader = aether ? FX.aetherGlass : FX.edge;
  const drawn = !lite && shader !== null && size.w > 0;
  const liteEdges = liteEdgeColours({ aether, focus, lite, tinted: accent !== undefined, lead, palette });
  const glass = aether ? (
    <AetherGlass size={size} radius={radius} accent={lead} tinted={accent !== undefined} focus={focus} press={press} />
  ) : (
    <SynapseGlass size={size} radius={radius} accent={lead} focus={focus} press={press} tilt={tilt} parallax={d.parallax} edgeLight={d.edgeLight} />
  );
  const body = (
    <Animated.View style={[{ borderRadius: radius }, lean, style]} onLayout={onLayout}>
      {drawn ? glass : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: palette.glass, borderWidth: 1, borderColor: liteEdges.border, borderTopColor: liteEdges.top }]} />
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
        press.value = withSpring({ x: toUnit(e.nativeEvent.locationX, size.w), y: toUnit(e.nativeEvent.locationY, size.h), on: 1 }, spring.snappy);
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

/** Maps a touch position along a side (0 to total) to -1..1; 0 before the panel has a size. */
const UNIT_SPAN = 2;
function toUnit(at: number, total: number): number {
  return total ? (at / total) * UNIT_SPAN - 1 : 0;
}

/**
 * Edges of a panel drawn with plain views. A focused edge is the accent;
 * otherwise a quiet hairline, tinted by the accent in Synapse lite panels and
 * in Aether where a district accent was given.
 */
function liteEdgeColours({ aether, focus, lite, tinted, lead, palette }: {
  aether: boolean; focus: boolean; lite: boolean; tinted: boolean; lead: string; palette: Palette;
}): { border: string; top: string } {
  if (focus) return { border: lead, top: lead };
  const accentEdge = aether ? tinted : lite;
  if (!accentEdge) return { border: palette.hairline, top: palette.hairlineStrong };
  return aether
    ? { border: `${lead}${AETHER_LITE_EDGE}`, top: `${lead}${AETHER_LITE_TOP}` }
    : { border: `${lead}${LITE_EDGE}`, top: `${lead}${LITE_TOP}` };
}

/** Synapse glass (Chapter 04): edge light that leans with the phone and breathes with time. */
function SynapseGlass({ size, radius, accent, focus, press, tilt, parallax, edgeLight }: {
  size: Size; radius: number; accent: string; focus: boolean; press: SharedValue<Press>;
  tilt?: SharedValue<{ x: number; y: number }>; parallax: number; edgeLight: number;
}) {
  const clock = useClock();
  const acc = rgb01(accent);
  const uniforms = useDerivedValue(() => ({
    size: [size.w, size.h],
    radius,
    tilt: [(tilt?.value.x ?? 0) * parallax + press.value.x * PRESS_LEAN, (tilt?.value.y ?? 0) * parallax + press.value.y * PRESS_LEAN],
    accent: acc,
    intensity: EDGE_BASE + edgeLight + press.value.on * EDGE_PRESS,
    focus: focus ? 1 : 0,
    time: clock.value / MS_PER_S,
  }));
  if (!FX.edge) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={FX.edge} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

/** Aether glass (AX-04): no clock, so it draws only when touched or focused. */
function AetherGlass({ size, radius, accent, tinted, focus, press }: {
  size: Size; radius: number; accent: string; tinted: boolean; focus: boolean; press: SharedValue<Press>;
}) {
  const acc = rgb01(accent);
  const uniforms = useDerivedValue(() => ({
    size: [size.w, size.h],
    radius,
    accent: acc,
    tint: tinted ? AETHER_ACCENT_TINT : 0,
    focus: focus ? 1 : 0,
    press: [press.value.x, press.value.y, press.value.on],
  }));
  if (!FX.aetherGlass) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={FX.aetherGlass} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
