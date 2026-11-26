import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useNav, type Rect } from '../navigation/Navigator';
import { routeKey, type Route } from '../navigation/routes';
import { DURATIONS, transitionFor, type TransitionKind } from './specs';
import { recordTransition } from './metrics';
import { spring, touch } from '../design/tokens';
import { useQuality } from '../performance/Quality';
import { cue } from './cues';
import { SceneBoundary } from './SceneBoundary';

const KINDS: TransitionKind[] = ['spatial', 'return', 'swipe', 'focus', 'summon', 'dive', 'lateral', 'fade'];

type Scenes = { current: Route; previous: Route | null; kind: TransitionKind; origin: Rect | null; serial: number };

/**
 * The cinematic motion engine (Chapter 06). Places are scenes in one space:
 * moving deeper passes through the old scene and brings the new one up from
 * depth (from the touched object when there is one: a shared element);
 * returning reverses it; search, settings and the lab come into focus over the
 * dimmed scene; Roxi is summoned from the dock; the map is a camera dive.
 * Every run is measured. Swiping from the left edge scrubs the return with the
 * finger and can be abandoned midway. Reduced motion: 120 ms crossfades.
 */
export function SceneHost({ render: renderRoute, width, height }: { render: (route: Route) => ReactNode; width: number; height: number }) {
  const nav = useNav();
  const render = (route: Route) => <SceneBoundary key={routeKey(route)} onBack={() => (nav.state.stack.length > 1 ? nav.back() : nav.home())}>{renderRoute(route)}</SceneBoundary>;
  const { reducedMotion, reportFrame } = useQuality();
  const [scenes, setScenes] = useState<Scenes>({ current: nav.top, previous: null, kind: 'fade', origin: null, serial: 0 });
  const [peek, setPeek] = useState(false);
  const progress = useSharedValue(1);
  const kind = useSharedValue(KINDS.indexOf('fade'));
  const origin = useSharedValue<Rect | null>(null);
  const drag = useSharedValue(0);
  const recording = useSharedValue(0);
  const frames = useSharedValue<number[]>([]);
  const planned = useRef(0);
  const stopCue = useRef<() => void>(() => undefined);

  useFrameCallback((f) => {
    if (recording.value) frames.value = [...frames.value, f.timestamp];
  });

  useEffect(() => {
    if (nav.state.serial === scenes.serial) return;
    const fromGesture = nav.meta.current.fromGesture;
    const k = transitionFor(nav.state.previous, nav.top, nav.state.direction, reducedMotion, fromGesture !== null);
    const start = fromGesture ?? 0;
    planned.current = DURATIONS[k];
    setScenes({ current: nav.top, previous: nav.state.previous, kind: k, origin: nav.meta.current.origin, serial: nav.state.serial });
    setPeek(false);
    drag.value = 0;
    kind.value = KINDS.indexOf(k);
    origin.value = nav.meta.current.origin;
    stopCue.current();
    stopCue.current = cue(k === 'return' || k === 'swipe' ? 'back' : nav.top.name === 'district' ? 'districtOpen' : nav.top.name === 'roxi' ? 'roxi' : 'open');
    frames.value = [];
    recording.value = 1;
    progress.value = start;
    progress.value = withTiming(1, { duration: Math.max(60, DURATIONS[k] * (1 - start)), easing: Easing.bezier(0.2, 0, 0, 1) }, (done) => {
      recording.value = 0;
      if (done) runOnJS(finish)(frames.value);
    });
    nav.meta.current.fromGesture = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.state.serial]);

  function finish(times: number[]) {
    setScenes((s) => ({ ...s, previous: null }));
    times.slice(1).forEach((t, i) => reportFrame(t - times[i]));
    recordTransition(KINDS[kind.value], scenes.current.name === nav.top.name ? nav.top.name : nav.top.name, planned.current, times, nav.meta.current.tapAt);
  }

  const incoming = useAnimatedStyle(() => {
    const p = progress.value;
    const k = KINDS[kind.value];
    const o = origin.value;
    const d = drag.value;
    if (d > 0) return { opacity: 1, transform: [{ translateX: d * width }, { scale: 1 - d * 0.04 }], borderRadius: d * 28 };
    switch (k) {
      case 'spatial':
        if (o) {
          const sx = interpolate(p, [0, 1], [o.width / width, 1]);
          return {
            opacity: interpolate(p, [0, 0.25, 1], [0, 1, 1]),
            borderRadius: interpolate(p, [0, 1], [24, 0]),
            transform: [
              { translateX: interpolate(p, [0, 1], [o.x + o.width / 2 - width / 2, 0]) },
              { translateY: interpolate(p, [0, 1], [o.y + o.height / 2 - height / 2, 0]) },
              { scale: sx },
            ],
          };
        }
        return { opacity: p, transform: [{ scale: interpolate(p, [0, 1], [0.92, 1]) }] };
      case 'return': return { opacity: interpolate(p, [0, 1], [0.4, 1]), transform: [{ scale: interpolate(p, [0, 1], [1.05, 1]) }] };
      case 'swipe': return { opacity: interpolate(p, [0, 1], [0.5, 1]), transform: [{ scale: interpolate(p, [0, 1], [0.95, 1]) }] };
      case 'focus': return { opacity: p, transform: [{ translateY: interpolate(p, [0, 1], [-24, 0]) }] };
      case 'summon': return { opacity: p, transform: [{ translateY: interpolate(p, [0, 1], [height * 0.18, 0]) }, { scale: interpolate(p, [0, 1], [0.8, 1]) }] };
      case 'dive': return { opacity: p, transform: [{ scale: interpolate(p, [0, 1], [1.22, 1]) }] };
      case 'lateral': return { opacity: p, transform: [{ translateX: interpolate(p, [0, 1], [16, 0]) }] };
      default: return { opacity: p, transform: [] };
    }
  });

  const outgoing = useAnimatedStyle(() => {
    const p = progress.value;
    switch (KINDS[kind.value]) {
      case 'spatial': return { opacity: 1 - p, transform: [{ scale: interpolate(p, [0, 1], [1, 1.07]) }] };
      case 'return': return { opacity: 1 - p, transform: [{ scale: interpolate(p, [0, 1], [1, 0.9]) }] };
      case 'swipe': return { opacity: interpolate(p, [0, 1], [1, 0.2]), transform: [{ translateX: interpolate(p, [0, 1], [0, width]) }], borderRadius: 28 };
      case 'focus': case 'summon': return { opacity: interpolate(p, [0, 1], [1, 0.0]), transform: [{ scale: interpolate(p, [0, 1], [1, 0.96]) }] };
      case 'dive': return { opacity: 1 - p, transform: [{ scale: interpolate(p, [0, 1], [1, 0.9]) }] };
      case 'lateral': return { opacity: 1 - p, transform: [{ translateX: interpolate(p, [0, 1], [0, -16]) }] };
      default: return { opacity: 1 - p };
    }
  });

  const under = useAnimatedStyle(() => ({ opacity: 0.5 + drag.value * 0.5, transform: [{ scale: 0.95 + drag.value * 0.05 }] }));

  const canGoBack = nav.state.stack.length > 1;
  const parent = canGoBack ? nav.state.stack[nav.state.stack.length - 2] : null;
  const swipe = Gesture.Pan()
    .enabled(canGoBack && !reducedMotion)
    .activeOffsetX(12)
    .failOffsetY([-14, 14])
    .onBegin(() => runOnJS(setPeek)(true))
    .onChange((e) => {
      drag.value = Math.max(0, Math.min(1, e.translationX / width));
    })
    .onEnd((e) => {
      const commit = drag.value > 0.33 || e.velocityX > 800;
      if (commit) {
        runOnJS(commitBack)(drag.value);
      } else {
        drag.value = withSpring(0, spring.smooth, () => runOnJS(setPeek)(false));
      }
    });

  function commitBack(fraction: number) {
    nav.meta.current.fromGesture = fraction;
    nav.back();
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {peek && parent && !scenes.previous ? (
        <Animated.View key={`under:${routeKey(parent)}`} style={[StyleSheet.absoluteFill, under]} pointerEvents="none">
          {render(parent)}
        </Animated.View>
      ) : null}
      {scenes.previous ? (
        <Animated.View key={`out:${routeKey(scenes.previous)}:${scenes.serial}`} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, outgoing]} pointerEvents="none">
          {render(scenes.previous)}
        </Animated.View>
      ) : null}
      <Animated.View key={`in:${routeKey(scenes.current)}`} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, incoming]}>
        {render(scenes.current)}
      </Animated.View>
      {canGoBack ? (
        <GestureDetector gesture={swipe}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: touch.edgeGesture }} accessible={false} />
        </GestureDetector>
      ) : null}
    </View>
  );
}
