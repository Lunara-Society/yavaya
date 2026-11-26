import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { LauncherRect, RoxiVisual } from './bridge';

/**
 * Roxi's Presence in the app: her face where her button is on the web, in the
 * same place and size (bridge.ts measures it), lit by what she is actually
 * doing. The light is the honest part: it moves only while she listens,
 * speaks or works, so it doubles as the sign that the microphone is open, and
 * when she is idle nothing animates (no GPU kept awake for decoration).
 */

const FACE = require('../../assets/roxi/roxi-face.webp');

type Ring = { colour: string; pulseMs: number };

/** Breath lengths: listening calm, speaking quicker, working slow; 0 is still. */
const STILL = 0;
const LISTEN_MS = 1200;
const SPEAK_MS = 620;
const THINK_MS = 1600;

/** Colours from the site's Roxi palette (site.css --rx-*) and the Halo's violet. */
const RINGS: Record<RoxiVisual, Ring> = {
  idle: { colour: '#D4AF37', pulseMs: STILL },
  listening: { colour: '#9D61FF', pulseMs: LISTEN_MS },
  speaking: { colour: '#F3DC8A', pulseMs: SPEAK_MS },
  thinking: { colour: '#B48CFF', pulseMs: THINK_MS },
  awaiting: { colour: '#F3DC8A', pulseMs: STILL },
  error: { colour: '#E36B85', pulseMs: STILL },
};

/** The web button's orb sits 7 px in from its left edge and is 46 px across (site.css .roxi-launch). */
const ORB_INSET = 7;
const ORB_SIZE = 46;
const RING_WIDTH = 2;
const PULSE_SCALE = 1.14;
const ENTER_FROM = 0.6;
const ENTER_SPRING = { damping: 14, stiffness: 140 } as const;
const SETTLE_MS = 200;
/** At the widest point of a breath the ring has faded to this much of itself. */
const RING_FADE = 0.6;
const HALVES = 2;
/** withRepeat counts -1 as "until cancelled". */
const FOREVER = -1;
/** The face fills the ring with a ring-width gap all round. */
const FACE_SIZE = ORB_SIZE - RING_WIDTH * 3;
const SHADOW = { opacity: 0.45, radius: 20, offsetY: 10, elevation: 12 } as const;
const PILL = 999;
const LABEL_GAP = 12;
const NAME_SIZE = 16;
const ROLE_SIZE = 13;

type Props = {
  rect: LauncherRect;
  visual: RoxiVisual;
  name: string;
  role: string;
  label: string;
  reducedMotion: boolean;
  onOpen: () => void;
  onLongPress: () => void;
};

async function tap(style: Haptics.ImpactFeedbackStyle): Promise<void> {
  try {
    await Haptics.impactAsync(style);
  } catch {
    // Haptics unavailable or switched off.
  }
}

export function PresenceDock({ rect, visual, name, role, label, reducedMotion, onOpen, onLongPress }: Props) {
  const ring = RINGS[visual];
  const pulse = useSharedValue(1);
  const appear = useSharedValue(reducedMotion ? 1 : ENTER_FROM);

  useEffect(() => {
    appear.value = reducedMotion ? 1 : withSpring(1, ENTER_SPRING);
  }, [appear, reducedMotion]);

  useEffect(() => {
    cancelAnimation(pulse);
    if (!ring.pulseMs || reducedMotion) {
      pulse.value = withTiming(1, { duration: SETTLE_MS });
      return;
    }
    const half = ring.pulseMs / HALVES;
    const ease = Easing.inOut(Easing.sin);
    pulse.value = withRepeat(
      withSequence(withTiming(PULSE_SCALE, { duration: half, easing: ease }), withTiming(1, { duration: half, easing: ease })),
      FOREVER,
    );
  }, [pulse, ring.pulseMs, reducedMotion]);

  const pillStyle = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ scale: appear.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 1 - ((pulse.value - 1) / (PULSE_SCALE - 1)) * RING_FADE,
  }));

  return (
    <Animated.View
      style={[styles.pill, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }, pillStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.press}
        onPress={async () => {
          await tap(Haptics.ImpactFeedbackStyle.Light);
          onOpen();
        }}
        onLongPress={async () => {
          await tap(Haptics.ImpactFeedbackStyle.Medium);
          onLongPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.orb}>
          <Animated.View style={[styles.ring, { borderColor: ring.colour }, ringStyle]} />
          <Image source={FACE} style={styles.face} accessibilityIgnoresInvertColors />
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {role}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    borderRadius: PILL,
    backgroundColor: 'rgba(10, 14, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(243, 220, 138, 0.45)',
    shadowColor: '#000',
    shadowOpacity: SHADOW.opacity,
    shadowRadius: SHADOW.radius,
    shadowOffset: { width: 0, height: SHADOW.offsetY },
    elevation: SHADOW.elevation,
  },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: ORB_INSET - 1 },
  orb: { width: ORB_SIZE, height: ORB_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: ORB_SIZE, height: ORB_SIZE, borderRadius: PILL, borderWidth: RING_WIDTH },
  face: { width: FACE_SIZE, height: FACE_SIZE, borderRadius: PILL },
  text: { marginLeft: LABEL_GAP, flexShrink: 1 },
  name: { color: '#F8F6F1', fontSize: NAME_SIZE, fontWeight: '700' },
  role: { color: 'rgba(248, 246, 241, 0.74)', fontSize: ROLE_SIZE },
});
