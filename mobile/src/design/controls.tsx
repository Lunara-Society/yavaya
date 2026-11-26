import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Icon, type IconName } from './icons';
import { T } from './Text';
import { color, radius, space, spring, touch, type as typeScale } from './tokens';
import { cue } from '../motion/cues';

/**
 * The interactive control system (Chapter 03). Every control: ≥ 48 dp target,
 * a visible pressed state within one frame, a haptic acknowledgement, a screen
 * reader role and label, and light only where it carries meaning.
 */
function usePress() {
  const s = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - s.value * 0.03 }], opacity: 1 - s.value * 0.12 }));
  return { style, onPressIn: () => (s.value = withSpring(1, spring.snappy)), onPressOut: () => (s.value = withSpring(0, spring.smooth)) };
}

export function Button({ label, onPress, kind = 'primary', icon, accent, disabled, accessibilityHint }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'quiet'; icon?: IconName; accent?: string; disabled?: boolean; accessibilityHint?: string;
}) {
  const p = usePress();
  const edge = kind === 'primary' ? accent ?? color.metal : kind === 'secondary' ? color.hairlineStrong : 'transparent';
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
          { borderColor: edge, backgroundColor: kind === 'primary' ? 'rgba(201,169,110,0.10)' : kind === 'secondary' ? color.glass : 'transparent' },
          accent && kind === 'primary' && { backgroundColor: `${accent}1A` },
          disabled && { opacity: 0.4 },
          p.style,
        ]}
      >
        {icon ? <Icon name={icon} size={20} tint={kind === 'primary' ? accent ?? color.metal : color.text} /> : null}
        <T variant="label" color={kind === 'primary' ? accent ?? color.metal : color.text}>{label}</T>
      </Animated.View>
    </Pressable>
  );
}

/** A control that cannot act right now stays visible but dimmed, and says so to screen readers. */
const DISABLED_OPACITY = 0.35;

export function IconButton({ icon, label, onPress, tint = color.text, size = 48, lit = false, disabled = false }: { icon: IconName; label: string; onPress: () => void; tint?: string; size?: number; lit?: boolean; disabled?: boolean }) {
  const p = usePress();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={8} onPressIn={p.onPressIn} onPressOut={p.onPressOut} onPress={() => { cue('tap'); onPress(); }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: lit ? 1 : 0, borderColor: tint, opacity: disabled ? DISABLED_OPACITY : 1 }, p.style]}>
        <Icon name={icon} tint={tint} />
      </Animated.View>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, accent = color.signal }: { label: string; selected?: boolean; onPress: () => void; accent?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={() => { cue('tap'); onPress(); }}
      style={[styles.chip, { borderColor: selected ? accent : color.hairline, backgroundColor: selected ? `${accent}1F` : 'transparent' }]}>
      <T variant="caption" color={selected ? accent : color.textSecondary}>{label}</T>
    </Pressable>
  );
}

export function Field({ icon = 'search', ...props }: TextInputProps & { icon?: IconName }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { borderColor: focused ? color.signal : color.hairline }]}>
      <Icon name={icon} size={20} tint={focused ? color.signal : color.textSecondary} />
      <TextInput
        placeholderTextColor={color.textTertiary}
        selectionColor={color.signal}
        style={[typeScale.body, { color: color.text, flex: 1, paddingVertical: 0 }]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}

export function Toggle({ label, value, onChange, icon }: { label: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => { cue('tap'); onChange(!value); }} style={styles.row}>
      {icon ? <Icon name={icon} size={20} tint={color.textSecondary} /> : null}
      <T variant="body" style={{ flex: 1 }}>{label}</T>
      <View style={[styles.track, { backgroundColor: value ? 'rgba(156,201,255,0.28)' : 'rgba(255,255,255,0.08)', borderColor: value ? color.signal : color.hairline }]}>
        <View style={[styles.knob, { backgroundColor: value ? color.signal : color.textTertiary, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function Row({ icon, title, detail, onPress, right }: { icon?: IconName | string; title: string; detail?: string; onPress?: () => void; right?: ReactNode }) {
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={22} tint={color.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="body">{title}</T>
        {detail ? <T variant="caption" tone="secondary">{detail}</T> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} tint={color.textTertiary} /> : null)}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => { cue('tap'); onPress(); }}>{body}</Pressable> : body;
}

export const styles = StyleSheet.create({
  button: { minHeight: touch.minTarget, paddingHorizontal: space[5], borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  chip: { minHeight: 36, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', marginVertical: 6 },
  field: { minHeight: touch.minTarget + 4, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.glass },
  row: { minHeight: touch.minTarget + 8, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  track: { width: 46, height: 28, borderRadius: 14, borderWidth: 1, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10 },
});
