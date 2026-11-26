import { Image, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { T } from '../design/Text';
import { color, radius, space } from '../design/tokens';
import { useNav } from '../navigation/Navigator';
import { useRoxi } from './voice-context';

/**
 * While Roxi talks and the member is on another screen (a page she opened, a
 * district), she stays present here: her face lit by her voice, a tap back to
 * her, and an end button. Never covers the dock.
 */
const FACE = require('../../assets/roxi/roxi-face.webp');
const FACE_SIZE = 40;
const ABOVE_DOCK = 92;
const GLOW_MIN = 0.25;
const GLOW_RANGE = 0.75;

export function RoxiIsland() {
  const roxi = useRoxi();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const glow = useAnimatedStyle(() => ({ opacity: GLOW_MIN + GLOW_RANGE * roxi.level.value }));
  if (roxi.phase !== 'live' || nav.top.name === 'roxi') return null;
  const bottom = insets.bottom + (nav.top.name === 'web' ? space[3] : ABOVE_DOCK);
  const last = [...roxi.lines].reverse().find((line) => line.who === 'roxi');
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space[4], right: space[4], bottom }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver con Roxi"
        onPress={() => nav.push({ name: 'roxi' })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[2], borderRadius: radius.pill, backgroundColor: 'rgba(20,16,36,0.92)', borderWidth: 1, borderColor: color.roxi }}
      >
        <View>
          <Animated.View style={[{ position: 'absolute', inset: -4, borderRadius: radius.pill, borderWidth: 2, borderColor: color.roxi }, glow]} />
          <Image source={FACE} style={{ width: FACE_SIZE, height: FACE_SIZE, borderRadius: FACE_SIZE / 2 }} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="micro" color={color.roxi}>Roxi te escucha</T>
          <T variant="caption" tone="secondary" numberOfLines={1}>{last?.text ?? 'Sigue hablando con naturalidad.'}</T>
        </View>
        <IconButton icon="close" label="Terminar con Roxi" onPress={roxi.end} tint={color.roxi} size={40} />
      </Pressable>
    </View>
  );
}
