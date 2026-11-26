import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { Icon } from '../design/icons';
import { T } from '../design/Text';
import { color, font, radius, space } from '../design/tokens';
import { HoloPanel } from '../render/HoloPanel';
import { RoxiHologram } from '../render/RoxiHologram';
import { useNav } from '../navigation/Navigator';
import { useQuality } from '../performance/Quality';
import { useAuth } from '../business/auth';
import { useRoxi } from '../roxi/voice-context';
import { AccountPanel } from './Account';

/**
 * Roxi, present: her hologram standing in the space, her live state in light
 * (listening, thinking, speaking, driven by her real voice), the conversation
 * as it happens, and one control under the thumb. Talking to her is the same
 * Roxi as on the website (her agent, memory and tools); pages she opens appear
 * inside the app while she keeps talking.
 */
const FORM_MS = 1700;
const FORM_DELAY_MS = 150;
const FIGURE_SHARE = 0.56;
const HEADER = 64;
const DOCK_SPACE = 92;
const ORB = 84;
const ORB_GROW = 0.16;
const VISIBLE_LINES = 4;
/** Her arrival curve: quick to begin, long to settle. */
const ARRIVE = Easing.bezier(0.2, 0, 0, 1);
/** Older lines fade: the newest is fully lit, the oldest at the floor. */
const LINE_FLOOR = 0.45;
const LINE_RANGE = 1 - LINE_FLOOR;
const RESULT_WIDTH = 0.62;
const INPUT_SIZE = 16;
const ORB_RING = 2;
const ORB_GLOW = { opacity: 0.9, radius: 18, elevation: 12 };
const ORB_ICON = 34;
const LINE_COLOR: Record<'roxi' | 'you' | 'note', string> = { roxi: color.text, you: color.textSecondary, note: color.metal };

const STATUS: Record<string, string> = { idle: 'Lista para hablar', starting: 'Conectando…', live: 'En conversación', unsupported: 'Solo en la app instalada' };

export function RoxiScreen({ tilt }: { tilt?: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const auth = useAuth();
  const roxi = useRoxi();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { reducedMotion } = useQuality();
  const form = useSharedValue(reducedMotion ? 1 : 0);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!reducedMotion) form.value = withDelay(FORM_DELAY_MS, withTiming(1, { duration: FORM_MS, easing: ARRIVE }));
  }, [form, reducedMotion]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + roxi.level.value * ORB_GROW }] }));
  const live = roxi.phase === 'live';
  const figureHeight = height * FIGURE_SHARE;
  const lines = roxi.lines.slice(-VISIBLE_LINES);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <RoxiHologram width={width} height={height} figureHeight={figureHeight} top={insets.top + HEADER} level={roxi.level} state={roxi.state} form={form} tilt={tilt} />
      </View>

      <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: HEADER }}>
        {nav.state.stack.length > 1 ? <IconButton icon="back" label="Volver" onPress={() => nav.back()} /> : null}
        <View style={{ flex: 1 }}>
          <T variant="micro" color={color.roxi}>Presencia</T>
          <T variant="title" accessibilityRole="header">Roxi</T>
          <T variant="caption" color={live ? color.roxi : color.textSecondary} accessibilityLiveRegion="polite">{STATUS[roxi.phase]}</T>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: space[4], paddingBottom: insets.bottom + DOCK_SPACE, gap: space[3] }}>
        {lines.length > 0 ? (
          <HoloPanel depth="overlay" accent={color.roxi} style={{ padding: space[3], gap: space[2] }}>
            {lines.map((line, i) => (
              <T
                key={line.id}
                variant={line.who === 'roxi' ? 'body' : 'caption'}
                color={LINE_COLOR[line.who]}
                style={{ opacity: LINE_FLOOR + (LINE_RANGE * (i + 1)) / lines.length }}
              >
                {line.who === 'you' ? `Tú: ${line.text}` : line.text}
              </T>
            ))}
          </HoloPanel>
        ) : null}

        {roxi.results.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            {roxi.results.map((card) => (
              <HoloPanel key={card.url} lite depth="panel" accent={color.roxi} onPress={() => nav.push({ name: 'web', path: card.url })} accessibilityLabel={card.title} style={{ padding: space[3], width: width * RESULT_WIDTH, gap: space[1] }}>
                <T variant="label" numberOfLines={1}>{card.title}</T>
                <T variant="caption" tone="secondary" numberOfLines={2}>{card.detail}</T>
              </HoloPanel>
            ))}
          </ScrollView>
        ) : null}

        {roxi.note ? <T variant="caption" color={color.caution} style={{ textAlign: 'center' }}>{roxi.note}</T> : null}

        {auth.status === 'signed_out' ? (
          <AccountPanel reason="Entra a tu cuenta para hablar con Roxi: ella ve lo mismo que tú y nada más." />
        ) : (
          <>
            {writing && live ? (
              <HoloPanel depth="overlay" accent={color.roxi} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space[3] }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Escríbele a Roxi"
                  placeholderTextColor={color.textTertiary}
                  style={{ flex: 1, color: color.text, fontFamily: font.regular, fontSize: INPUT_SIZE, paddingVertical: space[3] }}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    roxi.say(draft);
                    setDraft('');
                  }}
                />
                <IconButton icon="send" label="Enviar" onPress={() => { roxi.say(draft); setDraft(''); }} tint={color.roxi} />
              </HoloPanel>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] }}>
              <IconButton
                icon={roxi.muted ? 'micOff' : 'mic'}
                label={roxi.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
                onPress={() => roxi.setMuted(!roxi.muted)}
                tint={roxi.muted ? color.caution : color.textSecondary}
                disabled={!live}
              />
              <Animated.View style={orbStyle}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={live ? 'Terminar la conversación' : 'Hablar con Roxi'}
                  onPress={() => (live ? roxi.end() : void roxi.start())}
                  disabled={roxi.phase === 'starting' || roxi.phase === 'unsupported'}
                  style={{
                    width: ORB,
                    height: ORB,
                    borderRadius: ORB / ORB_RING,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: live ? 'rgba(185,163,255,0.22)' : 'rgba(185,163,255,0.10)',
                    borderWidth: ORB_RING,
                    borderColor: color.roxi,
                    shadowColor: color.roxi,
                    shadowOpacity: ORB_GLOW.opacity,
                    shadowRadius: ORB_GLOW.radius,
                    elevation: ORB_GLOW.elevation,
                  }}
                >
                  <Icon name={live ? 'close' : 'roxi'} size={ORB_ICON} tint={color.roxi} />
                </Pressable>
              </Animated.View>
              <IconButton icon="keyboard" label="Escribirle" onPress={() => setWriting((w) => !w)} tint={writing ? color.roxi : color.textSecondary} disabled={!live} />
            </View>
            <T variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              {live ? 'Habla con naturalidad. Ella prepara; tú decides y publicas.' : 'Toca para hablar. Nunca publica ni paga por ti.'}
            </T>
          </>
        )}
      </View>
    </View>
  );
}
