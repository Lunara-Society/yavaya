import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  SensorType,
  type SharedValue,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cellSize, figureBox, heartOf, RECONSTRUCT_SKSL } from './reconstruct';
import { backdrop, START, step, type Timeline } from './timeline';

/**
 * Roxi forming from light while Yavaya loads underneath (reconstruct.ts draws
 * her, timeline.ts decides when). It is the app's loading screen: the WebView
 * loads beneath it the whole time, and a tap goes straight to the page.
 */

// Compiled once. If a phone's Skia refuses it, the app runs without the reconstruction (Classic's start).
const EFFECT = Skia.RuntimeEffect.Make(RECONSTRUCT_SKSL);
export const RECONSTRUCTION_AVAILABLE = EFFECT !== null;

const NIGHT = '#0B0A10';
const FIGURE = require('../../assets/roxi/roxi.webp');
const DEPTH = require('../../assets/roxi/roxi-depth.webp');

/** A frame this slow is the phone struggling (budget: 30 fps at worst). */
const SLOW_FRAME_MS = 34;
/** This many slow frames in a row and the inflowing light is switched off (the costliest part). */
const SLOW_FRAMES_TO_DEGRADE = 12;
/** Phone tilt (radians) that gives the full parallax, and that parallax in dp. */
const FULL_TILT_RAD = 0.35;
const MAX_PARALLAX_DP = 12;
const MS_PER_S = 1000;
const FALLBACK_FRAME_MS = 16;
/** The hint fades in once she is partly there, and never becomes fully opaque. */
const HINT_FROM = 0.15;
const HINT_GAIN = 3;
const HINT_MAX = 0.7;

export type ReconstructionInputs = {
  target: SharedValue<number>;
  loaded: SharedValue<boolean>;
  failed: SharedValue<boolean>;
  skip: SharedValue<boolean>;
};

type Props = ReconstructionInputs & {
  reducedMotion: boolean;
  /** Called on a tap: the page is wanted now. */
  onSkip: () => void;
  hint: string;
  label: string;
  onFirstFrame: () => void;
  onDone: () => void;
};

export function Reconstruction({ target, loaded, failed, skip, reducedMotion, onSkip, hint, label, onFirstFrame, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const figure = useImage(FIGURE);
  const depth = useImage(DEPTH);
  const box = useMemo(() => figureBox(width, height), [width, height]);
  const heart = heartOf(box);
  const cell = cellSize(1); // Skia draws in dp; the shader's cells are in the same units

  const timeline = useSharedValue<Timeline>(START);
  const time = useSharedValue(0);
  const slowFrames = useSharedValue(0);
  const motes = useSharedValue(reducedMotion ? 0 : 1);
  const finished = useSharedValue(false);
  const tilt = useSharedValue<[number, number]>([0, 0]);
  const tiltBase = useSharedValue<[number, number] | null>(null);
  const rotation = useAnimatedSensor(SensorType.ROTATION);

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame ?? FALLBACK_FRAME_MS;
    time.value += dt / MS_PER_S;
    slowFrames.value = dt > SLOW_FRAME_MS ? slowFrames.value + 1 : 0;
    if (slowFrames.value >= SLOW_FRAMES_TO_DEGRADE) motes.value = 0;
    if (!reducedMotion) {
      const { pitch, roll } = rotation.sensor.value;
      if (!tiltBase.value) tiltBase.value = [roll, pitch];
      const [r0, p0] = tiltBase.value;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v / FULL_TILT_RAD));
      tilt.value = [clamp(roll - r0) * MAX_PARALLAX_DP, clamp(pitch - p0) * MAX_PARALLAX_DP];
    }
    const next = step(
      timeline.value,
      { target: target.value, loaded: loaded.value, failed: failed.value, skip: skip.value, reducedMotion },
      dt,
    );
    timeline.value = next;
    if (next.phase === 'done' && !finished.value) {
      finished.value = true;
      scheduleOnRN(onDone);
    }
  });

  const uniforms = useDerivedValue(() => {
    const t = timeline.value;
    return {
      box: [box.x, box.y, box.width, box.height],
      heart: [heart.x, heart.y],
      cell,
      progress: reducedMotion ? 1 : t.shown,
      dissolve: reducedMotion ? 0 : t.dissolve,
      time: time.value,
      tilt: tilt.value,
      motes: motes.value,
    };
  });
  const veil = useDerivedValue(() => backdrop(timeline.value));
  // With reduced motion she fades in with the page's progress and out as it appears; no cells, no light.
  const figureOpacity = useDerivedValue(() => {
    const t = timeline.value;
    return reducedMotion ? t.shown * (1 - t.dissolve) : 1;
  });
  const hintStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    const shown = Math.min(HINT_MAX, Math.max(0, (t.shown - HINT_FROM) * HINT_GAIN));
    return { opacity: shown * (1 - t.dissolve) };
  });

  const ready = Boolean(EFFECT && figure && depth);
  useEffect(() => {
    if (ready) onFirstFrame();
  }, [ready, onFirstFrame]);
  useEffect(() => {
    if (!EFFECT) onDone();
  }, [onDone]);

  if (!EFFECT || !figure || !depth) return <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT }]} />;

  const enter = async () => {
    onSkip();
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // No vibration motor, or haptics off: the tap still works.
    }
  };

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={enter}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Fill color={NIGHT} opacity={veil} />
        <Fill opacity={figureOpacity}>
          <Shader source={EFFECT} uniforms={uniforms}>
            <ImageShader image={figure} fit="contain" rect={box} tx="decal" ty="decal" />
            <ImageShader image={depth} fit="contain" rect={box} tx="decal" ty="decal" />
          </Shader>
        </Fill>
      </Canvas>
      <Animated.Text style={[styles.hint, hintStyle]}>{hint}</Animated.Text>
    </Pressable>
  );
}

const HINT_BOTTOM = 36;
const HINT_SIZE = 16;
const HINT_TRACKING = 0.4;

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HINT_BOTTOM,
    textAlign: 'center',
    color: '#E9DFF7',
    fontSize: HINT_SIZE,
    letterSpacing: HINT_TRACKING,
  },
});
