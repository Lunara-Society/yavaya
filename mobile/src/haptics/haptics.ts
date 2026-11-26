import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { PATTERNS, type PatternName, type Pulse } from './patterns';

let enabled = true;
export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

const fire = (kind: Pulse['kind']): Promise<void> => {
  switch (kind) {
    case 'selection': return Haptics.selectionAsync();
    case 'success': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    case 'light': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'medium': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'heavy': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    case 'soft': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    case 'rigid': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  }
};

/** Plays a pattern; returns a cancel function so an interrupted animation cancels its pulses too. */
export function playHaptic(name: PatternName): () => void {
  if (!enabled || Platform.OS === 'web') return () => undefined;
  const timers = PATTERNS[name].map((p) => setTimeout(() => void fire(p.kind).catch(() => undefined), p.at));
  return () => timers.forEach(clearTimeout);
}
