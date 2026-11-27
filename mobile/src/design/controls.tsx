import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Icon, type IconName } from './icons';
import { T } from './Text';
import { radius, space, spring, touch, type as typeScale } from './tokens';
import { usePalette } from './palette';
import { cue } from '../motion/cues';

/**
 * The interactive control system (Chapter 03). Every control: ≥ 48 dp target,
 * a visible pressed state within one frame, a haptic acknowledgement, a screen
 * reader role and label, and light only where it carries meaning. Colours come
 * from the look's palette (Synapse unless the person chose Aether).
 */
const PRESS_SCALE = 0.03;
const PRESS_DIM = 0.12;
const BUTTON_DISABLED_OPACITY = 0.4;
/** A control that cannot act right now stays visible but dimmed, and says so to screen readers. */
const DISABLED_OPACITY = 0.35;
const ICON_CONTROL = 20;
const ICON_ROW = 22;
const ICON_CHEVRON = 18;
const ICON_BUTTON_SLOP = 8;
const CHIP_HEIGHT = 36;
const CHIP_MARGIN = 6;
const FIELD_EXTRA = 4;
const ROW_EXTRA = 8;
const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const TRACK_PADDING = 3;
const KNOB = 20;
/** Hex alpha suffixes for an accent's tint behind a primary button and a selected chip. */
const BUTTON_TINT = '1A';
const CHIP_TINT = '1F';

function usePress() {
  const s = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - s.value * PRESS_SCALE }], opacity: 1 - s.value * PRESS_DIM }));
  return { style, onPressIn: () => (s.value = withSpring(1, spring.snappy)), onPressOut: () => (s.value = withSpring(0, spring.smooth)) };
}

type ButtonKind = 'primary' | 'secondary' | 'quiet';

export function Button({ label, onPress, kind = 'primary', icon, accent, disabled, accessibilityHint }: {
  label: string; onPress: () => void; kind?: ButtonKind; icon?: IconName; accent?: string; disabled?: boolean; accessibilityHint?: string;
}) {
  const p = usePress();
  const palette = usePalette();
  const lead = accent ?? palette.metal;
  const edge: Record<ButtonKind, string> = { primary: lead, secondary: palette.hairlineStrong, quiet: 'transparent' };
  const fill: Record<ButtonKind, string> = { primary: palette.metalFill, secondary: palette.glass, quiet: 'transparent' };
  const ink = kind === 'primary' ? lead : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={p.onPressIn}
      onPressOut={p.onPressOut}
      onPress={() => {
        cue('tap');
        onPress();
      }}
    >
      <Animated.View
        style={[
          styles.button,
          { borderColor: edge[kind], backgroundColor: fill[kind] },
          accent && kind === 'primary' && { backgroundColor: `${accent}${BUTTON_TINT}` },
          disabled && { opacity: BUTTON_DISABLED_OPACITY },
          p.style,
        ]}
      >
        {icon ? <Icon name={icon} size={ICON_CONTROL} tint={ink} /> : null}
        <T variant="label" color={ink}>{label}</T>
      </Animated.View>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tint, size = touch.minTarget, lit = false, disabled = false }: { icon: IconName; label: string; onPress: () => void; tint?: string; size?: number; lit?: boolean; disabled?: boolean }) {
  const p = usePress();
  const palette = usePalette();
  const ink = tint ?? palette.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={ICON_BUTTON_SLOP} onPressIn={p.onPressIn} onPressOut={p.onPressOut} onPress={() => { cue('tap'); onPress(); }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: lit ? 1 : 0, borderColor: ink, opacity: disabled ? DISABLED_OPACITY : 1 }, p.style]}>
        <Icon name={icon} tint={ink} />
      </Animated.View>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, accent }: { label: string; selected?: boolean; onPress: () => void; accent?: string }) {
  const palette = usePalette();
  const lead = accent ?? palette.focus;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={() => { cue('tap'); onPress(); }}
      style={[styles.chip, { borderColor: selected ? lead : palette.hairline, backgroundColor: selected ? `${lead}${CHIP_TINT}` : 'transparent' }]}>
      <T variant="caption" color={selected ? lead : palette.textSecondary}>{label}</T>
    </Pressable>
  );
}

export function Field({ icon = 'search', ...props }: TextInputProps & { icon?: IconName }) {
  const [focused, setFocused] = useState(false);
  const palette = usePalette();
  return (
    <View style={[styles.field, { borderColor: focused ? palette.focus : palette.hairline, backgroundColor: palette.glass }]}>
      <Icon name={icon} size={ICON_CONTROL} tint={focused ? palette.focus : palette.textSecondary} />
      <TextInput
        placeholderTextColor={palette.textTertiary}
        selectionColor={palette.focus}
        style={[typeScale.body, { color: palette.text, flex: 1, paddingVertical: 0 }]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}

export function Toggle({ label, value, onChange, icon }: { label: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  const palette = usePalette();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => { cue('tap'); onChange(!value); }} style={styles.row}>
      {icon ? <Icon name={icon} size={ICON_CONTROL} tint={palette.textSecondary} /> : null}
      <T variant="body" style={{ flex: 1 }}>{label}</T>
      <View style={[styles.track, { backgroundColor: value ? palette.trackOn : palette.trackOff, borderColor: value ? palette.focus : palette.hairline }]}>
        <View style={[styles.knob, { backgroundColor: value ? palette.focus : palette.textTertiary, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function Row({ icon, title, detail, onPress, right }: { icon?: IconName | string; title: string; detail?: string; onPress?: () => void; right?: ReactNode }) {
  const palette = usePalette();
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={ICON_ROW} tint={palette.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="body">{title}</T>
        {detail ? <T variant="caption" tone="secondary">{detail}</T> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={ICON_CHEVRON} tint={palette.textTertiary} /> : null)}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => { cue('tap'); onPress(); }}>{body}</Pressable> : body;
}

export const styles = StyleSheet.create({
  button: { minHeight: touch.minTarget, paddingHorizontal: space[5], borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  chip: { minHeight: CHIP_HEIGHT, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', marginVertical: CHIP_MARGIN },
  field: { minHeight: touch.minTarget + FIELD_EXTRA, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] },
  row: { minHeight: touch.minTarget + ROW_EXTRA, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  track: { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: radius.pill, borderWidth: 1, padding: TRACK_PADDING, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: radius.pill },
});
