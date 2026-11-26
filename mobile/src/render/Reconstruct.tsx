import { Canvas, Fill, ImageShader, Shader, useClock, type SkImage, makeImageFromView } from '@shopify/react-native-skia';
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { FX } from './effects';
import { PRESETS, remainingMs, techniqueId, type Preset, type TechniqueKey } from './techniques';
import { rgb01 } from '../design/tokens';
import { useQuality } from '../performance/Quality';
import { cue } from '../motion/cues';

/** A reconstruction canvas over an image: progress 0 = absent, 1 = whole. */
export function ReconstructCanvas({ image, progress, technique, accent, origin = [0.5, 0.5], width, height, fit = 'cover' }: {
  image: SkImage | null;
  progress: SharedValue<number>;
  technique: TechniqueKey;
  accent: string;
  origin?: [number, number];
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
}) {
  const clock = useClock();
  const { budget } = useQuality();
  const acc = rgb01(accent);
  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    progress: progress.value,
    technique: techniqueId(technique),
    time: clock.value / 1000,
    cell: budget.cell,
    origin,
    accent: acc,
    layers: budget.lightLayers / 2,
  }));
  if (!FX.recon || !image) return null;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Fill>
        <Shader source={FX.recon} uniforms={uniforms}>
          <ImageShader image={image} fit={fit} rect={{ x: 0, y: 0, width, height }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}

export type ReconstructHandle = {
  /** Plays toward whole ('in') or absent ('out') from wherever it is now: interruptible and reversible. */
  play: (direction: 'in' | 'out', preset?: Preset, technique?: TechniqueKey) => void;
  progress: SharedValue<number>;
};

/**
 * Reconstructs live interface content (Chapter 05). The children are
 * snapshotted by Skia, reconstructed or dissolved by the GPU, and the live,
 * touchable children are shown the moment the effect completes. Controls are
 * never blocked: the live view is interactive underneath for its whole run,
 * and reduced motion turns every run into a 120 ms fade.
 */
export const ReconstructView = forwardRef<ReconstructHandle, { children: ReactNode; technique: TechniqueKey; accent: string; initial?: 0 | 1; origin?: [number, number] }>(
  function ReconstructView({ children, technique: defaultTechnique, accent, initial = 1, origin }, ref) {
    const live = useRef<React.ComponentRef<typeof View>>(null);
    const [snapshot, setSnapshot] = useState<SkImage | null>(null);
    const [technique, setTechnique] = useState<TechniqueKey>(defaultTechnique);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const progress = useSharedValue<number>(initial);
    const running = useSharedValue(0);
    const { reducedMotion } = useQuality();
    const stopCue = useRef<() => void>(() => undefined);

    const finish = () => setSnapshot(null);

    useImperativeHandle(ref, () => ({
      progress,
      play: async (direction, preset = 'district', tech) => {
        if (tech) setTechnique(tech);
        const to = direction === 'in' ? 1 : 0;
        cancelAnimation(progress);
        stopCue.current();
        if (reducedMotion || Platform.OS === 'web' || !FX.recon) {
          progress.value = withTiming(to, { duration: 120 });
          return;
        }
        try {
          const img = await makeImageFromView(live as never);
          setSnapshot(img);
        } catch {
          progress.value = withTiming(to, { duration: 120 });
          return;
        }
        stopCue.current = cue(direction === 'in' ? 'reconstruct' : 'dissolve');
        running.value = 1;
        progress.value = withTiming(to, { duration: remainingMs(progress.value, to, PRESETS[preset]), easing: Easing.bezier(0.2, 0, 0, 1) }, (done) => {
          if (done) {
            running.value = 0;
            runOnJS(finish)();
          }
        });
      },
    }));

    const liveStyle = useAnimatedStyle(() => ({ opacity: running.value ? 0 : Platform.OS === 'web' || reducedMotion ? progress.value : progress.value > 0.5 ? 1 : 0 }));
    return (
      <View onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Animated.View ref={live as never} collapsable={false} style={liveStyle}>
          {children}
        </Animated.View>
        {snapshot && size.w > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ReconstructCanvas image={snapshot} progress={progress} technique={technique} accent={accent} origin={origin} width={size.w} height={size.h} fit="contain" />
          </View>
        ) : null}
      </View>
    );
  },
);
